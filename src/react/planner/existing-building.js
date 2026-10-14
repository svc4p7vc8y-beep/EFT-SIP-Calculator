import clipping from 'polygon-clipping';
import {boundsOf,roundCoord} from './geometry.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
const ring=points=>[...points.map(p=>[p.x,p.y]),[points[0].x,points[0].y]];
const polygonArea=polygons=>polygons.reduce((sum,polygon)=>sum+polygon.reduce((part,points,i)=>part+(i?-1:1)*Math.abs(points.reduce((s,p,j)=>{const q=points[(j+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2,0),0);
const shifted=(p,shift)=>({x:roundCoord(p.x+shift.x),y:roundCoord(p.y+shift.y)});

function pointOnEdge(point,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
  if(length2<.01)return null;
  const t=((point.x-a.x)*dx+(point.y-a.y)*dy)/length2;
  const foot={x:a.x+t*dx,y:a.y+t*dy};
  if(t<-.001||t>1.001||distance(point,foot)>.12)return null;
  return {x:roundCoord(foot.x),y:roundCoord(foot.y)};
}

function simple(points){
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  if(points.some((point,index)=>distance(point,points[(index+1)%points.length])<.001))return false;
  for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){
    if(i===0&&j===points.length-1)continue;
    const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
    if(cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8)return false;
  }
  return true;
}

export function referenceBuildingContour(points){
  if(!Array.isArray(points)||points.length<3||points.some(p=>!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y))))return {error:'Нарисуйте замкнутый контур существующего здания.'};
  const rounded=points.map(p=>({x:roundCoord(Number(p.x)),y:roundCoord(Number(p.y))}));
  if(!simple(rounded)||area(rounded)<.25)return {error:'Контур существующего здания должен быть простым и иметь площадь не менее 0,25 м².'};
  const bounds=boundsOf(rounded),shift={x:roundCoord(-bounds.x),y:roundCoord(-bounds.y)};
  return {building:{id:'existing-1',points:rounded.map(p=>shifted(p,shift)),wallHeightMm:null,baseZMm:null,referenceOnly:true},shift};
}

// The new building closes against two adjacent host walls. The host footprint
// remains a reference and never enters the calculated floor or roof polygon.
export function newHouseAtExistingCorner(plan,openPoints){
  const host=plan.existingBuilding?.points;
  if(!Array.isArray(host)||host.length<3)return {error:'Сначала нарисуйте контур существующего здания.'};
  if(!Array.isArray(openPoints)||openPoints.length<4)return {error:'Начните на одной стене, обойдите наружные углы нового дома и закончите на соседней стене существующего здания.'};
  const first=openPoints[0],last=openPoints.at(-1),matches=[];
  for(let i=0;i<host.length;i++){
    const j=(i+1)%host.length,k=(i+host.length-1)%host.length;
    for(const [a,b,corner] of [[i,j,host[j]],[i,k,host[i]]]){
      const start=pointOnEdge(first,host[a],host[(a+1)%host.length]),end=pointOnEdge(last,host[b],host[(b+1)%host.length]);
      if(start&&end&&distance(start,corner)>=.1&&distance(end,corner)>=.1)matches.push({start,end,corner,firstEdge:a,lastEdge:b});
    }
  }
  if(matches.length!==1)return {error:'Точки примыкания должны лежать на двух соседних наружных стенах и отступать от их общего угла минимум на 100 мм.'};
  const {start,end,corner,firstEdge,lastEdge}=matches[0];
  const points=[start,...openPoints.slice(1,-1).map(p=>({x:roundCoord(Number(p.x)),y:roundCoord(Number(p.y))})),end,{...corner}];
  if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))||!simple(points)||area(points)<.25)return {error:'Наружный контур нового дома пересекает себя или имеет площадь меньше 0,25 м².'};
  let overlap=0;
  try{overlap=polygonArea(clipping.intersection([ring(host)],[ring(points)]));}catch{return {error:'Контур нового дома геометрически некорректен.'};}
  if(overlap>.001)return {error:'Новый дом пересекает внутреннюю площадь существующего. Исправьте наружные углы.'};
  const bounds=boundsOf(points),shift={x:roundCoord(-bounds.x),y:roundCoord(-bounds.y)};
  const sharedEdges=[[end,corner],[corner,start]].map(([a,b])=>({a:shifted(a,shift),b:shifted(b,shift)}));
  return {points:points.map(p=>shifted(p,shift)),existingBuilding:{...plan.existingBuilding,points:host.map(p=>shifted(p,shift))},attachment:{id:'joint-1',existingBuildingId:plan.existingBuilding.id,hostEdgeIndices:[firstEdge,lastEdge],sharedEdges,corner:shifted(corner,shift),wallMode:'existing',roofMode:'independent',nodeRef:''},shift,addedArea:roundCoord(area(points)),sharedLength:roundCoord(distance(start,corner)+distance(end,corner))};
}

export function existingWallEdge(plan,a,b){
  return (plan.attachment?.wallMode==='existing'?plan.attachment.sharedEdges||[]:[]).some(edge=>distance(edge.a,a)<.002&&distance(edge.b,b)<.002||distance(edge.a,b)<.002&&distance(edge.b,a)<.002);
}

export function existingWallLength(plan){
  const points=plan.house?.points||[];
  return plan.attachment?.wallMode==='existing'&&points.length>=3?points.reduce((sum,a,i)=>{
    const b=points[(i+1)%points.length];
    return sum+(existingWallEdge(plan,a,b)?distance(a,b):0);
  },0):0;
}
