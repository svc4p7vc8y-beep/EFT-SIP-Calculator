import {projectToWallFace} from './placement-walls.js';
import {CONNECTION_PORTS} from './placement-connections.js';
import {INLINE_FITTING_KINDS} from '../data/pipe-components.js';

export function engineeringWallItems(wall,walls,items,visible={}){
 return items.filter(i=>visible[i.layer]!==false).map(item=>({item,p:projectToWallFace(wall,item)})).filter(({item,p})=>{
  if(!p)return false;
  const owner=item.kind==='connection-port'?items.find(i=>i.id===item.linkedApplianceId):item;
  const reach=Math.max(.13,(owner?.depth||item.depth||0)/2+.15);
  if(item.wallRef)return item.wallRef===wall.ref;
  const closest=walls.map(face=>({face,p:projectToWallFace(face,item)})).filter(v=>v.p&&(item.x-v.p.foot.x)*v.face.normal.x+(item.y-v.p.foot.y)*v.face.normal.y>=-.01).sort((a,b)=>a.p.distance-b.p.distance)[0];
  return closest?.face.ref===wall.ref&&p.distance<reach;
 });
}
export function engineeringPlanRotation(item,wall){
 return wall&&item.displayPlane==='wall'&&CONNECTION_PORTS[item.kind]&&!INLINE_FITTING_KINDS.has(item.kind)?Math.atan2(wall.b.y-wall.a.y,wall.b.x-wall.a.x)*180/Math.PI:Number(item.rotation)||0;
}
