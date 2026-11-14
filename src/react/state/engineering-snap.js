import {moveEngineeringItem} from './engineering-scheme.js';
const pos=i=>({x:i.x,y:i.y,z:Number(i.height)||0});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function compatiblePorts(a,b,items){
 if(!a||!b||a.kind!=='connection-port'||b.kind!=='connection-port'||a.floor!==b.floor||a.layer!==b.layer||a.wallRef!==b.wallRef||a.id===b.id||!a.connectionMedium||a.connectionMedium!==b.connectionMedium||a.linkedApplianceId&&a.linkedApplianceId===b.linkedApplianceId)return false;
 const adapter=[a,b].some(port=>/adapter|reducer/.test(items.find(i=>i.id===port.linkedApplianceId)?.kind||''));
 if(!adapter&&a.connectionMaterial&&b.connectionMaterial&&a.connectionMaterial!=='mixed'&&b.connectionMaterial!=='mixed'&&a.connectionMaterial!==b.connectionMaterial)return false;
 if(!adapter&&Number(a.connectionDiameterMm)>0&&Number(b.connectionDiameterMm)>0&&Number(a.connectionDiameterMm)!==Number(b.connectionDiameterMm))return false;
 if(!adapter&&a.connectionThread&&b.connectionThread&&a.connectionThread!==b.connectionThread)return false;
 if(a.connectionGender&&b.connectionGender&&a.connectionGender===b.connectionGender)return false;
 if(Number.isFinite(a.connectorU)&&Number.isFinite(b.connectorU)&&a.connectorU*b.connectorU+a.connectorV*b.connectorV>-.75)return false;
 return true;
}
export function normalizedPortConnections(value,items){
 const byId=new Map(items.map(i=>[i.id,i])),occupied=new Set(),result=[];
 for(const c of Array.isArray(value)?value:[]){const a=byId.get(c?.fromId),b=byId.get(c?.toId);
  if(!compatiblePorts(a,b,items)||occupied.has(a.id)||occupied.has(b.id)||distance(pos(a),pos(b))>.015)continue;
  occupied.add(a.id);occupied.add(b.id);result.push({fromId:a.id,toId:b.id});
 }return result;
}
export function wallConnectionSnap(items,id,patch,wall,tolerance=.10,connections=[]){
 const item=items.find(i=>i.id===id);if(!item||!wall)return null;
 const own=items.filter(p=>p.id===id&&p.kind==='connection-port'||p.linkedApplianceId===id&&p.followsAppliance&&p.kind==='connection-port');
 const ids=new Set([id,...items.filter(i=>i.linkedApplianceId===id).map(i=>i.id)]),delta={x:patch.x-item.x,y:patch.y-item.y,z:(patch.height??item.height??0)-(item.height||0)};
 const occupied=new Set(connections.flatMap(c=>[c.fromId,c.toId]));
 let best=null;
 for(const a of own){if(a.floor!==item.floor)continue;const moved={x:a.x+delta.x,y:a.y+delta.y,z:(a.height||0)+delta.z};for(const b of items){
  if(ids.has(b.id)||occupied.has(b.id)||b.floor!==item.floor||b.wallRef!==wall.ref||!compatiblePorts(a,b,items))continue;
  const d=distance(moved,pos(b));if(d>tolerance||best&&d>=best.distance)continue;
  const next={...patch,x:patch.x+b.x-moved.x,y:patch.y+b.y-moved.y,height:(patch.height??item.height??0)+(b.height||0)-moved.z};
  const station=((next.x-wall.a.x)*(wall.b.x-wall.a.x)+(next.y-wall.a.y)*(wall.b.y-wall.a.y))/wall.length;
  if(station<0||station>wall.length||next.height<0)continue;
  best={fromId:a.id,toId:b.id,patch:next,distance:d};
 }}return best;
}
export function moveAndJoinWallItem(data,id,patch,wall){
 const moving=new Set([id,...data.items.filter(i=>i.linkedApplianceId===id&&i.followsAppliance).map(i=>i.id)]);
 data.portConnections=(data.portConnections||[]).filter(c=>!moving.has(c.fromId)&&!moving.has(c.toId));
 const snap=wallConnectionSnap(data.items,id,patch,wall,.10,data.portConnections);moveEngineeringItem(data,id,snap?.patch||patch);
 if(snap){matchOutletSpecifications(data,snap.fromId,snap.toId);data.portConnections.push({fromId:snap.fromId,toId:snap.toId});}
 data.portConnections=normalizedPortConnections(data.portConnections,data.items);return snap;
}
export function rotateWallItem(data,id,wall){
 const item=data.items.find(i=>i.id===id);if(!item||!wall)return;
 const ux=(wall.b.x-wall.a.x)/wall.length,uy=(wall.b.y-wall.a.y)/wall.length;
 for(const port of data.items.filter(p=>p.linkedApplianceId===id&&p.followsAppliance)){
  const s=(port.x-item.x)*ux+(port.y-item.y)*uy,z=(port.height||0)-(item.height||0),n=(port.x-item.x)*wall.normal.x+(port.y-item.y)*wall.normal.y;
  if(Number.isFinite(port.connectorU)){const u=port.connectorU;port.connectorU=port.connectorV;port.connectorV=-u;}
  port.x=item.x+ux*z+wall.normal.x*n;port.y=item.y+uy*z+wall.normal.y*n;port.height=(item.height||0)-s;
 }
 item.rotation=((item.rotation||0)+90)%360;data.portConnections=normalizedPortConnections(data.portConnections,data.items);
}

export function rotatePlanItem(data,id){
 const item=data.items.find(i=>i.id===id);if(!item)return;
 for(const port of data.items.filter(p=>p.linkedApplianceId===id&&p.followsAppliance)){
  const dx=port.x-item.x,dy=port.y-item.y;port.x=item.x-dy;port.y=item.y+dx;
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
