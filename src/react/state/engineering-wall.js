import { INLINE_FITTING_KINDS } from '../data/pipe-components.js';
import { projectToWallFace } from './placement-walls.js';
import { resolvedNetworkRoutes } from './placement-networks.js';

const at = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t });
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
export function wallRouteParts(route, wall) {
  const ux=(wall.b.x-wall.a.x)/wall.length, uy=(wall.b.y-wall.a.y)/wall.length;
  const coordinates = p => ({ s:(p.x-wall.a.x)*ux+(p.y-wall.a.y)*uy, n:-(p.x-wall.a.x)*uy+(p.y-wall.a.y)*ux });
  const parts=[]; const tolerance=Math.max(.08,(route.clearanceMm||0)/1000+.04);
  for(let index=0;index<route.points.length-1;index++){
    const a=route.points[index],b=route.points[index+1],ca=coordinates(a),cb=coordinates(b);
    let low=0,high=1;
    for(const [start,end,min,max]of[[ca.s,cb.s,0,wall.length],[ca.n,cb.n,-tolerance,tolerance]]){
      const delta=end-start;
      if(Math.abs(delta)<1e-8){if(start<min-1e-6||start>max+1e-6){high=-1;break;}}
      else{const limits=[(min-start)/delta,(max-start)/delta].sort((x,y)=>x-y);low=Math.max(low,limits[0]);high=Math.min(high,limits[1]);}
    }
    if(high<=low||high<0||low>1)continue;
    const first=at(a,b,Math.max(0,low)),last=at(a,b,Math.min(1,high));
    if(distance(first,last)<.005||Math.hypot(coordinates(first).s-coordinates(last).s,(first.z||0)-(last.z||0))<.005)continue;
    parts.push({route,index,a:first,b:last,start:coordinates(first).s,end:coordinates(last).s});
  }
  return parts;
}

export function wallContinuations(routes, wall, walls) {
  const result=[];
  routes.forEach((route,routeIndex)=>route.points.slice(1,-1).forEach((point,offset)=>{
    const index=offset+1, here=projectToWallFace(wall,point);
    const tolerance=Math.max(.12,(route.clearanceMm||0)/1000+.08);
    if(!here||here.distance>tolerance)return;
    const next=walls.filter(w=>w.ref!==wall.ref).map(w=>({wall:w,p:projectToWallFace(w,point)})).filter(e=>e.p.distance<tolerance && Math.abs((w=>((w.b.x-w.a.x)*(wall.b.x-wall.a.x)+(w.b.y-w.a.y)*(wall.b.y-wall.a.y))/(w.length*wall.length))(e.wall))<.98);
    if(!next.length)return;
    result.push({ id:`${route.id}:${index}`, code:`П${routeIndex+1}.${index}`, point, station:here.station, route, index, nextWall:next[0].wall });
  }));
  return result;
}

export function nearestRoutePoint(route, point) {
 let best=null;
 route.points.slice(1).forEach((b,index)=>{const a=route.points[index],v={x:b.x-a.x,y:b.y-a.y,z:(b.z||0)-(a.z||0)},len=v.x*v.x+v.y*v.y+v.z*v.z;
 const t=Math.max(0,Math.min(1,((point.x-a.x)*v.x+(point.y-a.y)*v.y+((point.z||0)-(a.z||0))*v.z)/(len||1)));
 const p=at(a,b,t),d=distance(p,point);if(!best||d<best.distance)best={point:p,index,distance:d};});return best;
}

// Insert one physical node, preserving the pipe profile, length and manual accessories.
export function insertPipeElement(data, system, route, preset, point, createId, wallRef='') {
 const original=data.networks[system]?.find(r=>r.id===route.id);if(!original)return null;
 const hit=nearestRoutePoint(route,point);if(!hit||distance(hit.point,route.points[0])<.025||distance(hit.point,route.points.at(-1))<.025)return null;
 const id=createId(),secondId=createId(), originalTo=route.toId;
 const node={id,kind:preset.id,label:preset.label,floor:route.floor,layer:system,x:hit.point.x,y:hit.point.y,height:hit.point.z||0,
 width:preset.width||.14,depth:preset.depth||.12,heightKnown:true,rotation:0,wallRef,displayPlane:'wall',surface:'interior',connectionMedium:route.medium,
 connectionMaterial:preset.connectionMaterial||'',connectionDiameterMm:preset.connectionDiameterMm||(preset.connectionMaterial==='pp'?route.diameterMm:null),inlinePipe:true,inlineChainId:route.chainId||route.id};
 data.items.push(node);
 const firstPoints=[...route.points.slice(0,hit.index+1),hit.point],lastPoints=[hit.point,...route.points.slice(hit.index+1)];
 const shared={...original,auto:false,routing:'orthogonal',chainId:route.chainId||route.id,plane:'wall'};
 Object.assign(original,shared,{toId:id,points:firstPoints});
 data.networks[system].push({...shared,id:secondId,fromId:id,toId:originalTo,points:lastPoints,accessories:[]});
 return node;
}

export function removeInlineElement(data, id, plan) {
 const item=data.items.find(i=>i.id===id);if(!item||(!item.inlinePipe&&!INLINE_FITTING_KINDS.has(item.kind)))return {ok:false,reason:'not-inline'};
 const routes=resolvedNetworkRoutes(data,item.layer,item.floor,plan),connected=routes.filter(r=>r.fromId===id||r.toId===id);
 if(connected.length<2){data.items=data.items.filter(i=>i.id!==id);data.networks[item.layer]=data.networks[item.layer].filter(r=>r.fromId!==id&&r.toId!==id);return {ok:true};}
 if(connected.length!==2)return {ok:false,reason:'У узла есть ответвления. Сначала удалите лишние линии.'};
 const incoming=connected.find(r=>r.toId===id),outgoing=connected.find(r=>r.fromId===id);
 if(!incoming||!outgoing)return {ok:false,reason:'Направления участков различаются. Соедините их вручную.'};
 for(const key of ['medium','material','diameterMm','slopePermille','fastener','fastenerSpacingM','bendFitting'])if((incoming[key]??'')!==(outgoing[key]??''))return {ok:false,reason:'Участки имеют разные материалы или параметры. Сначала согласуйте их свойства.'};
 const keep=data.networks[item.layer].find(r=>r.id===incoming.id);
 const points=[...incoming.points,...outgoing.points.slice(1)];
 Object.assign(keep,{toId:outgoing.toId,points,auto:false,routing:'orthogonal',accessories:[...(incoming.accessories||[]),...(outgoing.accessories||[])]});
 data.networks[item.layer]=data.networks[item.layer].filter(r=>r.id!==outgoing.id);data.items=data.items.filter(i=>i.id!==id);
 return {ok:true};
}
