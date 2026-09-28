import clipping from 'polygon-clipping';
import { houseContourPoints, roomPoints, unifiedWallSegments, lineEndpoints } from '../planner/geometry.js';
import { polygonArea } from '../../calculations/plan-metrics.js';

const shape=points=>[points.map(p=>[p.x,p.y])];
const area=multi=>multi.reduce((sum,poly)=>sum+poly.reduce((s,ring,i)=>s+(i?-1:1)*polygonArea(ring.map(([x,y])=>({x,y}))),0),0);
function band(a,b,half) {
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  if(length<1e-8)return null;
  const x=-(b.y-a.y)/length*half,y=(b.x-a.x)/length*half;
  return shape([{x:a.x+x,y:a.y+y},{x:b.x+x,y:b.y+y},{x:b.x-x,y:b.y-y},{x:a.x-x,y:a.y-y}]);
}

// Read-only geometry report: never substitutes the structural SIP floor area.
export function calculateClearAreas(plan) {
  const contour=houseContourPoints(plan);
  const rooms=plan.rooms||[];
  const unsupported=plan.house?.contourDefined===false || rooms.some(r=>r.extension)
    || contour.some((a,i)=>{const b=contour[(i+1)%contour.length];return Math.abs(a.x-b.x)>1e-7&&Math.abs(a.y-b.y)>1e-7;});
  if(unsupported)return {rooms:{},clearArea:null,reason:'Площадь в свету для пристройки или наклонного наружного контура требует отдельных развёрток.'};
  try {
    const wall=Math.max(0,Number(plan.wallThickness)||.174);
    const partition=Math.max(0,Number(plan.partitionThickness)||.1);
    const outer=contour.map((a,i)=>band(a,contour[(i+1)%contour.length],wall)).filter(Boolean);
    const inner=[...unifiedWallSegments(plan).map(lineEndpoints),...(plan.walls||[]).map(w=>[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}])]
      .map(([a,b])=>band(a,b,partition/2)).filter(Boolean);
    const house=shape(contour);
    let occupied=clipping.union(...outer,...inner);
    const passages=[...(plan.wallGaps||[]),...(plan.openings||[]).filter(o=>o.type==='door')].map(o=>{
      const half=Math.max(0,Number(o.width)||0)/2;
      const a=o.orientation==='v'?{x:o.x,y:o.y-half}:{x:o.x-half,y:o.y};
      const b=o.orientation==='v'?{x:o.x,y:o.y+half}:{x:o.x+half,y:o.y};
      return band(a,b,Math.max(wall,partition));
    }).filter(Boolean);
    if(passages.length)occupied=clipping.difference(occupied,clipping.union(...passages));
    const free=clipping.difference(house,occupied);
    const result={};
    for(const room of rooms)result[room.id]={contourArea:polygonArea(roomPoints(room)),clearArea:area(clipping.intersection(shape(roomPoints(room)),free))};
    const included=rooms.filter(r=>r.include!==false).map(r=>shape(roomPoints(r)));
    return {rooms:result,clearArea:area(free),roomsClearArea:included.length?area(clipping.intersection(clipping.union(...included),free)):0,reason:null};
  } catch {return {rooms:{},clearArea:null,reason:'Контур требует проверки: площадь в свету не рассчитана.'};}
}
