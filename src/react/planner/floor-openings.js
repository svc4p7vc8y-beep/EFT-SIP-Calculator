import clipping from 'polygon-clipping';
import { stairOpeningPolygon } from './stair-steps.js';

export function normalizeFloorOpenings(source) {
  const ids=new Set();
  return source.filter(o=>o&&typeof o==='object'&&!Array.isArray(o)).slice(0,100).map((o,i)=>{
    const base=String(o.id||`stair-${i+1}`);let id=base,n=1;while(ids.has(id))id=`${base}-${n++}`;ids.add(id);
    return {...o,id,x:o.x??0,y:o.y??0};
  });
}

// An explicit empty list means all openings were removed. Legacy remains readable.
export function floorOpenings(plan) {
  if(Array.isArray(plan?.floorOpenings))return plan.floorOpenings.filter(o=>o&&typeof o==='object'&&o.include!==false);
  const o=plan?.floorOpening;
  return o&&(Number(o.width)>0||Number(o.length)>0)?[{...o,id:o.id||'floor-opening'}]:[];
}
export function replaceFloorOpening(plan,opening) {
  const list=Array.isArray(plan?.floorOpenings)?plan.floorOpenings.filter(o=>o&&typeof o==='object'):floorOpenings(plan),id=opening.id||'floor-opening';
  const exists=list.some(o=>o.id===id),valid=Number(opening.width)>0||Number(opening.length)>0;
  plan.floorOpenings=list.flatMap(o=>o.id===id?(valid?[{...opening,id}]:[]):[o]);
  if(valid&&!exists)plan.floorOpenings.push({...opening,id});
  plan.floorOpening=plan.floorOpenings[0]?{...plan.floorOpenings[0]}:{x:0,y:0,width:0,length:0,direction:'right'};
}
export function floorOpeningSummary(plan,contour) {
  const list=floorOpenings(plan),rects=list.filter(o=>['width','length'].every(k=>Number.isFinite(Number(o[k]))&&Number(o[k])>0)&&['x','y'].every(k=>Number.isFinite(Number(o[k]??0)))).map(o=>{const ring=stairOpeningPolygon(o);return [[...ring,ring[0]]];});
  let geometry=rects.length?clipping.union(...rects):[];
  if(contour?.length&&geometry.length)geometry=clipping.intersection(geometry,[contour.map(p=>Array.isArray(p)?p:[p.x,p.y])]);
  let area=0,perimeter=0;
  for(const polygon of geometry)polygon.forEach((ring,i)=>{let cross=0;for(let j=0;j<ring.length-1;j++){const a=ring[j],b=ring[j+1];cross+=a[0]*b[1]-b[0]*a[1];perimeter+=Math.hypot(b[0]-a[0],b[1]-a[1]);}area+=(i?-1:1)*Math.abs(cross)/2;});
  return {list,geometry,area,perimeter};
}
