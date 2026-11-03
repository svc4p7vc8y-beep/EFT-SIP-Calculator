import {roomBearingEdges,bearingWallKey} from '../calculations/bearing-walls.js';
export function selectableBearingEdges(plan) {
 const map=new Map();
 for(const room of plan.rooms||[])if(room.include!==false)for(const edge of roomBearingEdges(room))if(!map.has(edge.key))map.set(edge.key,{...edge,name:room.name||'Комната'});
 for(const wall of plan.walls||[])if(wall.include!==false){const a={x:wall.x1,y:wall.y1},b={x:wall.x2,y:wall.y2},key=bearingWallKey(a,b);map.set(key,{a,b,key,bearing:!!wall.bearing,profile:wall.bearingProfile||'',name:wall.name||'Перегородка'});}
 return [...map.values()];
}
export function collinearBearingKeys(edges,key) {
 const edge=edges.find(e=>e.key===key);if(!edge)return [];
 const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,L=Math.hypot(dx,dy);
 return edges.filter(e=>[e.a,e.b].every(p=>Math.abs(dx*(p.y-edge.a.y)-dy*(p.x-edge.a.x))/(L||1)<.015)).map(e=>e.key);
}
export function assignBearingEdges(plan,keys,enabled,profile) {
 const chosen=new Set(keys);
 for(const room of plan.rooms||[])for(const edge of roomBearingEdges(room))if(chosen.has(edge.key)){room.bearingWalls={...room.bearingWalls,[edge.key]:{enabled,profile}};}
 for(const wall of plan.walls||[])if(chosen.has(bearingWallKey({x:wall.x1,y:wall.y1},{x:wall.x2,y:wall.y2}))){wall.bearing=enabled;wall.bearingProfile=profile;if(!enabled)wall.frameProfile=profile;}
 return plan;
}
export function assignPartitionProfiles(plan,keys,profile) {
 const chosen=new Set(keys);
 for(const room of plan.rooms||[])for(const edge of roomBearingEdges(room))if(chosen.has(edge.key)){
  const current=room.bearingWalls?.[edge.key]||{};
  room.bearingWalls={...room.bearingWalls,[edge.key]:{...current,enabled:current.enabled??room.bearing===true,profile}};
 }
 for(const wall of plan.walls||[])if(chosen.has(bearingWallKey({x:wall.x1,y:wall.y1},{x:wall.x2,y:wall.y2}))){wall.frameProfile=profile;if(wall.bearing)wall.bearingProfile=profile;}
 return plan;
}

export function assignSipThickness(plan, keys, thickness) {
 const chosen=new Set(keys),value=[124,174,224].includes(Number(thickness))?Number(thickness):null;
 for(const room of plan.rooms||[])for(const edge of roomBearingEdges(room))if(chosen.has(edge.key)){
  room.bearingWalls={...room.bearingWalls,[edge.key]:{...room.bearingWalls?.[edge.key],sipThickness:value}};
 }
 for(const wall of plan.walls||[])if(chosen.has(bearingWallKey({x:wall.x1,y:wall.y1},{x:wall.x2,y:wall.y2})))wall.sipThickness=value;
 return plan;
}
