import {INLINE_FITTING_KINDS} from '../data/pipe-components.js';
import {engineeringSymbolSize,engineeringElevationCenter} from './engineering-symbol-size.js';

// A device carries its directly attached fittings, stopping at another appliance.
// A fitting can still be detached and moved by itself.
export function engineeringMoveIds(items,connections,id){
 const root=items.find(i=>i.id===id),ids=new Set([id]);if(!root)return ids;
 const children=owner=>items.filter(i=>i.linkedApplianceId===owner&&i.followsAppliance).forEach(i=>ids.add(i.id));
 children(id);
 if(!INLINE_FITTING_KINDS.has(root.kind)){
  let changed=true;while(changed){changed=false;for(const c of connections||[]){
   const other=ids.has(c.fromId)?c.toId:ids.has(c.toId)?c.fromId:null;
   if(!other||ids.has(other))continue;
   const port=items.find(i=>i.id===other),owner=items.find(i=>i.id===port?.linkedApplianceId);
   if(owner&&INLINE_FITTING_KINDS.has(owner.kind)&&!ids.has(owner.id)){ids.add(owner.id);children(owner.id);changed=true;}
  }}
 }
 return ids;
}
export function translatedEngineeringItems(items,ids,delta){
 return items.map(i=>ids.has(i.id)?{...i,x:i.x+delta.x,y:i.y+delta.y,height:(i.height||0)+delta.z}:i);
}
export function saveOutletPosition(items,port,wall){
 const owner=items.find(i=>i.id===port.linkedApplianceId);if(!owner||!wall||INLINE_FITTING_KINDS.has(owner.kind))return false;
 const size=engineeringSymbolSize(owner),ux=(wall.b.x-wall.a.x)/wall.length,uy=(wall.b.y-wall.a.y)/wall.length;
 const along=(port.x-owner.x)*ux+(port.y-owner.y)*uy,up=(port.height||0)-engineeringElevationCenter(owner),angle=(owner.rotation||0)*Math.PI/180;
 const u=along*Math.cos(angle)-up*Math.sin(angle),v=along*Math.sin(angle)+up*Math.cos(angle);
 const index=port.portIndex??Number(port.id.split('-').at(-1));
 owner.portLayout={...owner.portLayout,[index]:{...owner.portLayout?.[index],x:.5+u/(size.width/100),y:.5-v/(size.height/100)}};
 port.followsAppliance=true;
}
export function engineeringGroupIds(items,connections,roots){
 return new Set(roots.flatMap(id=>[...engineeringMoveIds(items,connections,id)]));
}
