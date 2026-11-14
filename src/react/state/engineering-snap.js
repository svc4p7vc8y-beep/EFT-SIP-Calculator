import {engineeringMoveIds,saveOutletPosition} from './engineering-move-group.js';
import {moveEngineeringItem} from './engineering-scheme.js';
import {INLINE_FITTING_KINDS} from '../data/pipe-components.js';
import {engineeringElevationCenter} from './engineering-symbol-size.js';
import {refreshDeviceOutlets} from './placement-connections.js';
const pos=i=>({x:i.x,y:i.y,z:Number(i.height)||0});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const projectedPortDistance=(a,b,wall)=>{const ux=(wall.b.x-wall.a.x)/wall.length,uy=(wall.b.y-wall.a.y)/wall.length;return Math.abs((a.x-b.x)*wall.normal.x+(a.y-b.y)*wall.normal.y)>.5?Infinity:Math.hypot((a.x-b.x)*ux+(a.y-b.y)*uy,a.z-b.z);};
export function compatiblePorts(a,b,items){
 if(!a||!b||a.kind!=='connection-port'||b.kind!=='connection-port'||a.floor!==b.floor||a.layer!==b.layer||a.wallRef!==b.wallRef||a.id===b.id||!a.connectionMedium||a.connectionMedium!==b.connectionMedium||a.linkedApplianceId&&a.linkedApplianceId===b.linkedApplianceId)return false;
 const adapter=[a,b].some(port=>/adapter|reducer/.test(items.find(i=>i.id===port.linkedApplianceId)?.kind||''));
 if(!adapter&&a.connectionMaterial&&b.connectionMaterial&&a.connectionMaterial!=='mixed'&&b.connectionMaterial!=='mixed'&&a.connectionMaterial!==b.connectionMaterial)return false;
 if(!adapter&&Number(a.connectionDiameterMm)>0&&Number(b.connectionDiameterMm)>0&&Number(a.connectionDiameterMm)!==Number(b.connectionDiameterMm))return false;
 if(!adapter&&a.connectionThread&&b.connectionThread&&a.connectionThread!==b.connectionThread)return false;
 if(a.connectionGender&&b.connectionGender&&a.connectionGender===b.connectionGender)return false;
 // The endpoint is the attachment datum. Its drawn direction is adjustable on
 // appliances and must not prevent coincident compatible outlets from joining.
 return true;
}
export function normalizedPortConnections(value,items){
 const byId=new Map(items.map(i=>[i.id,i])),occupied=new Set(),result=[];
 for(const c of Array.isArray(value)?value:[]){const a=byId.get(c?.fromId),b=byId.get(c?.toId);
  if(!compatiblePorts(a,b,items)||occupied.has(a.id)||occupied.has(b.id)||distance(pos(a),pos(b))>.015)continue;
  occupied.add(a.id);occupied.add(b.id);result.push({fromId:a.id,toId:b.id});
 }return result;
}
export function wallConnectionSnap(items,id,patch,wall,tolerance=.10,connections=[],movingIds){
 const item=items.find(i=>i.id===id);if(!item||!wall)return null;
 const own=items.filter(p=>p.kind==='connection-port'&&(movingIds?movingIds.has(p.id):p.id===id||p.linkedApplianceId===id&&p.followsAppliance));
 const ids=movingIds||new Set([id,...items.filter(i=>i.linkedApplianceId===id).map(i=>i.id)]),delta={x:patch.x-item.x,y:patch.y-item.y,z:(patch.height??item.height??0)-(item.height||0)};
 const occupied=new Set(connections.flatMap(c=>[c.fromId,c.toId]));
 let best=null;
 for(const a of own){if(a.floor!==item.floor||occupied.has(a.id)&&connections.some(c=>(c.fromId===a.id||c.toId===a.id)&&ids.has(c.fromId)&&ids.has(c.toId)))continue;const moved={x:a.x+delta.x,y:a.y+delta.y,z:(a.height||0)+delta.z};for(const b of items){
  if(ids.has(b.id)||occupied.has(b.id)||b.floor!==item.floor||b.wallRef!==wall.ref||!compatiblePorts(a,b,items))continue;
  const d=projectedPortDistance(moved,pos(b),wall);if(d>tolerance||best&&d>=best.distance)continue;
  const next={...patch,x:patch.x+b.x-moved.x,y:patch.y+b.y-moved.y,height:(patch.height??item.height??0)+(b.height||0)-moved.z};
  const station=((next.x-wall.a.x)*(wall.b.x-wall.a.x)+(next.y-wall.a.y)*(wall.b.y-wall.a.y))/wall.length;
  if(station<0||station>wall.length||next.height<0)continue;
  best={fromId:a.id,toId:b.id,patch:next,distance:d};
 }}return best;
}
export function nearbyWallPorts(items,id,patch,wall,tolerance=.16,connections=[]){
 const item=items.find(i=>i.id===id);if(!item||!wall)return [];
 const moving=engineeringMoveIds(items,connections,id),delta={x:patch.x-item.x,y:patch.y-item.y,z:(patch.height??item.height??0)-(item.height||0)};
 const own=items.filter(p=>p.kind==='connection-port'&&moving.has(p.id)),near=new Set();
 for(const a of own)for(const b of items){if(b.kind!=='connection-port'||moving.has(b.id)||b.floor!==a.floor||b.wallRef!==wall.ref)continue;
  if(projectedPortDistance({x:a.x+delta.x,y:a.y+delta.y,z:(a.height||0)+delta.z},pos(b),wall)<=tolerance){near.add(a.id);near.add(b.id);}}
 return [...near];
}
export function moveAndJoinWallItem(data,id,patch,wall){
 const item=data.items.find(i=>i.id===id);if(!item)return null;
 if(item.kind==='connection-port'&&INLINE_FITTING_KINDS.has(data.items.find(i=>i.id===item.linkedApplianceId)?.kind))return null;
 if(INLINE_FITTING_KINDS.has(item.kind))refreshDeviceOutlets(data.items,item.id,wall);
 const moving=engineeringMoveIds(data.items,data.portConnections,id);
 data.portConnections=(data.portConnections||[]).filter(c=>moving.has(c.fromId)===moving.has(c.toId));
 const external=data.portConnections.filter(c=>!moving.has(c.fromId)&&!moving.has(c.toId));
 const snap=wallConnectionSnap(data.items,id,patch,wall,.10,data.portConnections,moving),next=snap?.patch||patch;
 const delta={x:next.x-item.x,y:next.y-item.y,z:(next.height??item.height??0)-(item.height||0)};
 for(const member of data.items.filter(i=>moving.has(i.id))){member.x+=delta.x;member.y+=delta.y;member.height=(member.height||0)+delta.z;member.heightKnown=true;if(next.wallRef)member.wallRef=next.wallRef;}
 Object.assign(item,next);
 if(item.kind==='connection-port')saveOutletPosition(data.items,item,wall);
 if(snap){if(item.kind!=='connection-port')item.wallClearanceMm=Math.round(((item.x-wall.a.x)*wall.normal.x+(item.y-wall.a.y)*wall.normal.y)*1000);matchOutletSpecifications(data,snap.fromId,snap.toId);data.portConnections.push({fromId:snap.fromId,toId:snap.toId});}
 data.portConnections=normalizedPortConnections(data.portConnections,data.items);return snap;
}
export function rotateWallItem(data,id,wall){
 const item=data.items.find(i=>i.id===id);if(!item||!wall)return;
 if(item.kind==='connection-port'){
  const owner=data.items.find(i=>i.id===item.linkedApplianceId);if(!owner||INLINE_FITTING_KINDS.has(owner.kind))return;
  const u=item.connectorU||0,v=item.connectorV||0;item.connectorU=v;item.connectorV=-u;
  const angle=-(owner.rotation||0)*Math.PI/180,localU=item.connectorU*Math.cos(angle)+item.connectorV*Math.sin(angle),localV=-item.connectorU*Math.sin(angle)+item.connectorV*Math.cos(angle),side=Math.abs(localU)>Math.abs(localV)?localU<0?'left':'right':localV>0?'top':'bottom';
  item.connectorPlanX=(wall.b.x-wall.a.x)/wall.length*item.connectorU;item.connectorPlanY=(wall.b.y-wall.a.y)/wall.length*item.connectorU;
  const index=item.portIndex??Number(item.id.split('-').at(-1));owner.portLayout={...owner.portLayout,[index]:{...owner.portLayout?.[index],side}};data.portConnections=normalizedPortConnections(data.portConnections,data.items);return;
 }
 const ux=(wall.b.x-wall.a.x)/wall.length,uy=(wall.b.y-wall.a.y)/wall.length;
 for(const port of data.items.filter(p=>p.linkedApplianceId===id&&p.followsAppliance)){
  const s=(port.x-item.x)*ux+(port.y-item.y)*uy,z=(port.height||0)-engineeringElevationCenter(item),n=(port.x-item.x)*wall.normal.x+(port.y-item.y)*wall.normal.y;
  if(Number.isFinite(port.connectorU)){const u=port.connectorU;port.connectorU=port.connectorV;port.connectorV=-u;}
  port.connectorPlanX=ux*(port.connectorU||0);port.connectorPlanY=uy*(port.connectorU||0);
  port.x=item.x+ux*z+wall.normal.x*n;port.y=item.y+uy*z+wall.normal.y*n;port.height=engineeringElevationCenter(item)-s;
 }
 item.rotation=((item.rotation||0)+90)%360;data.portConnections=normalizedPortConnections(data.portConnections,data.items);
}

export function rotatePlanItem(data,id){
 const item=data.items.find(i=>i.id===id);if(!item)return;
 if(item.kind==='connection-port'){
  const owner=data.items.find(i=>i.id===item.linkedApplianceId);if(!owner||INLINE_FITTING_KINDS.has(owner.kind))return;
  const dx=item.x-owner.x,dy=item.y-owner.y,l=Math.hypot(dx,dy)||1,x=Number.isFinite(item.connectorPlanX)?item.connectorPlanX:dx/l,y=Number.isFinite(item.connectorPlanY)?item.connectorPlanY:dy/l;
  item.connectorPlanX=-y;item.connectorPlanY=x;const index=item.portIndex??Number(item.id.split('-').at(-1));owner.portLayout={...owner.portLayout,[index]:{...owner.portLayout?.[index],planRotation:((owner.portLayout?.[index]?.planRotation||0)+90)%360}};return;
 }
 for(const port of data.items.filter(p=>p.linkedApplianceId===id&&p.followsAppliance)){
  const dx=port.x-item.x,dy=port.y-item.y;port.x=item.x-dy;port.y=item.y+dx;
  if(Number.isFinite(port.connectorPlanX)){const x=port.connectorPlanX;port.connectorPlanX=-port.connectorPlanY;port.connectorPlanY=x;}
 }
 item.rotation=((item.rotation||0)+90)%360;data.portConnections=normalizedPortConnections(data.portConnections,data.items);
}

// Copy only unspecified values, never replace a project's explicit connector specification.
export function matchOutletSpecifications(data,fromId,toId){
 const a=data.items.find(i=>i.id===fromId),b=data.items.find(i=>i.id===toId);if(!a||!b)return;
 for(const [port,other] of [[a,b],[b,a]]){
  const owner=data.items.find(i=>i.id===port.linkedApplianceId),patch={};
  for(const [field,key] of [['connectionThread','thread'],['connectionDiameterMm','diameterMm'],['connectionMaterial','material']])if(!port[field]&&other[field]&&other[field]!=='mixed'){port[field]=other[field];patch[key]=other[field];}
  if(!port.connectionGender&&other.connectionGender){port.connectionGender=other.connectionGender==='male'?'female':'male';patch.gender=port.connectionGender;}
  if(owner&&Object.keys(patch).length){const index=port.portIndex??Number(port.id.split('-').at(-1));owner.portLayout={...owner.portLayout,[index]:{...owner.portLayout?.[index],...patch}};}
 }
}
