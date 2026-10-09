import clipping from 'polygon-clipping';
import { houseContourPoints, partitionRuns, partitionDepth, roomPoints, roomWallSegments, lineEndpoints, boundsOf } from './geometry.js';
import { bearingForSegment } from '../calculations/bearing-walls.js';

const shape=points=>[points.map(p=>[p.x,p.y])];
const area=multi=>multi.reduce((s,poly)=>s+poly.reduce((v,ring,i)=>v+(i?-1:1)*Math.abs(ring.reduce((n,p,k)=>{const q=ring[(k+1)%ring.length];return n+p[0]*q[1]-q[0]*p[1];},0))/2,0),0);
function band(a,b,half){const l=Math.hypot(b.x-a.x,b.y-a.y);if(!l)return null;const dx=-(b.y-a.y)/l*half,dy=(b.x-a.x)/l*half;return shape([{x:a.x+dx,y:a.y+dy},{x:b.x+dx,y:b.y+dy},{x:b.x-dx,y:b.y-dy},{x:a.x-dx,y:a.y-dy}]);}

export function localWallSettings(plan,a,b){
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);
  return (plan.walls||[]).filter(w=>w.include!==false).filter(w=>{
    const x=w.x2-w.x1,y=w.y2-w.y1,l=Math.hypot(x,y),t=((mid.x-w.x1)*x+(mid.y-w.y1)*y)/(l*l||1);
    return l>0&&t>=0&&t<=1&&Math.abs(x*(mid.y-w.y1)-y*(mid.x-w.x1))/l<.001&&Math.abs(x*dy-y*dx)/(l*L||1)<.001;
  }).sort((x,y)=>String(x.id).localeCompare(String(y.id)))[0];
}
export const wallDepth=partitionDepth;

export function addRoomWalls(plan,room,idFactory){
  for(const segment of roomWallSegments({...plan,layoutMode:'rooms',rooms:[room]})){
    const [a,b]=lineEndpoints(segment),dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);if(!L)continue;
    let intervals=[[0,L]];
    for(const w of plan.walls||[]){
      if(w.include===false)continue;
      const points=[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
      if(points.some(p=>Math.abs(dx*(p.y-a.y)-dy*(p.x-a.x))/L>.001))continue;
      const coords=points.map(p=>((p.x-a.x)*dx+(p.y-a.y)*dy)/L),lo=Math.min(...coords),hi=Math.max(...coords);
      intervals=intervals.flatMap(([start,end])=>hi<=start+.001||lo>=end-.001?[[start,end]]:[[start,Math.min(end,lo)],[Math.max(start,hi),end]].filter(([x,y])=>y-x>.001));
    }
    for(const [start,end] of intervals)(plan.walls||=[]).push({id:idFactory(),x1:a.x+dx*start/L,y1:a.y+dy*start/L,x2:a.x+dx*end/L,y2:a.y+dy*end/L,include:true});
  }
}

// Explicit, undoable conversion only. Never invoked by legacy normalization.
export function convertToWallLayout(plan,idFactory){
  if((plan.rooms||[]).some(r=>r.extension))throw new Error('Сначала выделите пристройки в отдельный контур. Автоматическое преобразование отменено.');
  const before=structuredClone(plan),runs=partitionRuns(plan,true);
  plan.roomLayoutBackup={rooms:before.rooms,walls:before.walls};
  plan.walls=runs.map(([a,b])=>{const local=localWallSettings(before,a,b),bearing=bearingForSegment(before,a,b);return {...local,id:local?.id||idFactory(),x1:a.x,y1:a.y,x2:b.x,y2:b.y,include:true,bearing:!!bearing,bearingProfile:bearing?.profile||'',frameProfile:local?.frameProfile||''};});
  plan.layoutMode='walls';
  plan.partitionJunctions='butt';
  for(const key of ['openings','wallGaps'])for(const o of plan[key]||[]){
    if(o.outer===true)continue;
    const matches=plan.walls.filter(w=>{const dx=w.x2-w.x1,dy=w.y2-w.y1,l=Math.hypot(dx,dy),t=((o.x-w.x1)*dx+(o.y-w.y1)*dy)/(l*l||1);return l>0&&t>=0&&t<=1&&Math.abs(dx*(o.y-w.y1)-dy*(o.x-w.x1))/l<.015;});
    if(matches.length===1)o.wallRef=`wall:${matches[0].id}`;
  }
  rebuildWallRooms(plan,idFactory);
}

export function rebuildWallRooms(plan,idFactory){
  if(plan.layoutMode!=='walls')return;
  const contour=houseContourPoints(plan),t=Number(plan.wallThickness)||.174;
  const bands=[...contour.map((a,i)=>band(a,contour[(i+1)%contour.length],t)),...partitionRuns(plan).map(([a,b])=>band(a,b,wallDepth(plan,a,b)/2))].filter(Boolean);
  const free=clipping.difference(shape(contour),clipping.union(...bands));
  if(free.some(poly=>poly.length!==1)){plan.wallLayoutIssue='Есть незамкнутые перегородки или внутренние острова. Замкните стены для автоматического определения комнат.';return;}
  delete plan.wallLayoutIssue;
  const old=plan.rooms||[],used=new Set();
  plan.rooms=free.filter(poly=>area([poly])>.001).map(poly=>{
    const points=poly[0].slice(0,-1).map(([x,y])=>({x,y}));
    const candidates=old.filter(r=>!used.has(r.id)).map(r=>({r,overlap:area(clipping.intersection(shape(roomPoints(r)),[poly]))})).sort((a,b)=>b.overlap-a.overlap||String(a.r.id).localeCompare(String(b.r.id)));
    const match=candidates[0]?.overlap>.001?candidates[0].r:null;if(match)used.add(match.id);
    return {...match,id:match?.id||idFactory(),name:match?.name||'Комната',points,...boundsOf(points),bearing:false,bearingWalls:{}};
  });
}
