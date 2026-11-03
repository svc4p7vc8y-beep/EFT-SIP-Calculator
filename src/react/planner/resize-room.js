import {boundsOf,houseContourPoints,roomPoints,roundCoord} from './geometry.js';
import {bearingWallKey} from '../calculations/bearing-walls.js';

export function resizeRoomFromExterior(plan,room,axis,value){
 const points=roomPoints(room),old=boundsOf(points),house=boundsOf(houseContourPoints(plan));
 const tolerance=Math.max(.02,Number(plan.wallThickness)||.174);
 const anchorX=Math.abs(old.x+old.w-house.x2)<=tolerance&&Math.abs(old.x-house.x)>tolerance?old.x+old.w:old.x;
 const anchorY=Math.abs(old.y+old.h-house.y2)<=tolerance&&Math.abs(old.y-house.y)>tolerance?old.y+old.h:old.y;
 const sx=axis==='w'?Math.max(.5,value)/Math.max(.1,old.w):1,sy=axis==='h'?Math.max(.5,value)/Math.max(.1,old.h):1;
 room.points=points.map(point=>({x:roundCoord(anchorX+(point.x-anchorX)*sx),y:roundCoord(anchorY+(point.y-anchorY)*sy)}));
 if(room.bearingWalls){const next={};points.forEach((a,i)=>{const saved=room.bearingWalls[bearingWallKey(a,points[(i+1)%points.length])];if(saved)next[bearingWallKey(room.points[i],room.points[(i+1)%points.length])]=saved;});room.bearingWalls=next;}
 Object.assign(room,boundsOf(room.points));
 return room;
}
