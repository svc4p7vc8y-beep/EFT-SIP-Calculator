import clipping from 'polygon-clipping';
import {boundsOf,houseContourPoints,roundCoord,roomPoints} from './geometry.js';

const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0))/2;

function onEdge(point,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  if(length<.1)return false;
  const t=((point.x-a.x)*dx+(point.y-a.y)*dy)/(length*length);
  const distance=Math.abs(dx*(point.y-a.y)-dy*(point.x-a.x))/length;
  return t>=-.001&&t<=1.001&&distance<=.12?{x:roundCoord(a.x+t*dx),y:roundCoord(a.y+t*dy)}:null;
}

// The user draws only the new outside walls; the existing house edge closes
// the addition. The result is a single exterior footprint for calculations.
export function attachedHouseContour(plan,openPoints){
  if(!Array.isArray(openPoints)||openPoints.length<4)return {error:'Поставьте начало и конец на стене дома и хотя бы два наружных угла пристройки.'};
  const base=houseContourPoints(plan),first=openPoints[0],last=openPoints.at(-1);
  const edge=base.findIndex((a,i)=>onEdge(first,a,base[(i+1)%base.length])&&onEdge(last,a,base[(i+1)%base.length]));
  if(edge<0)return {error:'Оба конца пристройки должны попасть на одну наружную стену дома.'};
  const path=[onEdge(first,base[edge],base[(edge+1)%base.length]),...openPoints.slice(1,-1),onEdge(last,base[edge],base[(edge+1)%base.length])];
  if(Math.hypot(path.at(-1).x-path[0].x,path.at(-1).y-path[0].y)<.1)return {error:'Разнесите точки примыкания минимум на 100 мм.'};
  if(area(path)<.25)return {error:'Площадь пристройки должна быть не менее 0,25 м².'};
  const ring=points=>[...points.map(p=>[p.x,p.y]),[points[0].x,points[0].y]];
  let union;
  try{union=clipping.union([ring(base)],[ring(path)]);}catch{return {error:'Контур пристройки пересекает сам себя или стену дома.'};}
  if(union.length!==1||union[0].length!==1)return {error:'Пристройка должна образовать один контур без внутренних разрывов.'};
  const points=union[0][0].slice(0,-1).map(([x,y])=>({x:roundCoord(x),y:roundCoord(y)}));
  if(area(points)-area(base)<.25)return {error:'Наружная цепочка должна выходить за пределы дома минимум на 0,25 м².'};
  const bounds=boundsOf(points),shift={x:roundCoord(-bounds.x),y:roundCoord(-bounds.y)};
  return {points:points.map(p=>({x:roundCoord(p.x+shift.x),y:roundCoord(p.y+shift.y)})),shift,addedArea:roundCoord(area(points)-area(base))};
}

export function shiftPlanContents(plan,{x=0,y=0}){
  if(!x&&!y)return;
  const point=p=>{p.x=roundCoord(Number(p.x||0)+x);p.y=roundCoord(Number(p.y||0)+y);};
  for(const room of plan.rooms||[]){room.points=roomPoints(room).map(p=>({x:roundCoord(p.x+x),y:roundCoord(p.y+y)}));Object.assign(room,boundsOf(room.points));if(room.labelX!=null)room.labelX=roundCoord(room.labelX+x);if(room.labelY!=null)room.labelY=roundCoord(room.labelY+y);}
  for(const row of ['platforms','piles','excludedPiles','openings','wallGaps','floorOpenings'])for(const item of plan[row]||[])point(item);
  if(plan.floorOpening)point(plan.floorOpening);
  for(const row of ['walls','pileRows','bindingLines','dimensions'])for(const item of plan[row]||[]){item.x1=roundCoord(Number(item.x1||0)+x);item.y1=roundCoord(Number(item.y1||0)+y);item.x2=roundCoord(Number(item.x2||0)+x);item.y2=roundCoord(Number(item.y2||0)+y);}
  for(const item of plan.annotations||[]){point(item);if(item.targetX!=null)item.targetX=roundCoord(item.targetX+x);if(item.targetY!=null)item.targetY=roundCoord(item.targetY+y);}
}
