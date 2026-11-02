import {allOpeningSegments,lineEndpoints,roundCoord} from './geometry.js';
import {gapEndpoints} from './gap-endpoints.js';

export function resizeWallGap(plan,gap,index,point,tolerance=.12) {
  const vertical=gap.orientation==='v',axis=vertical?'y':'x',fixed=vertical?'x':'y';
  const segments=allOpeningSegments(plan);
  const spans=segments.filter(s=>s.axis===(vertical?'v':'h')&&Math.abs(s.fixed-gap[fixed])<.015&&(typeof gap.outer!=='boolean'||s.outer===gap.outer)).sort((a,b)=>a.start-b.start);
  const runs=[];
  for(const span of spans){const last=runs.at(-1);if(last&&span.start<=last.end+.001)last.end=Math.max(last.end,span.end);else runs.push({start:span.start,end:span.end});}
  const run=runs.find(s=>gap[axis]>=s.start-.001&&gap[axis]<=s.end+.001);
  if(!run)return {...gap};
  const anchor=gapEndpoints(gap)[index===0?1:0][axis];
  const nodes=[run.start,run.end];
  for(const segment of segments){
    for(const node of lineEndpoints(segment))if(Math.abs(node[fixed]-gap[fixed])<.015)nodes.push(node[axis]);
    if(segment.axis!==(vertical?'v':'h')&&gap[fixed]>=segment.start-.001&&gap[fixed]<=segment.end+.001)nodes.push(segment.fixed);
  }
  for(const wall of plan.walls||[])for(const node of [{x:wall.x1,y:wall.y1},{x:wall.x2,y:wall.y2}])if(Math.abs(node[fixed]-gap[fixed])<.015)nodes.push(node[axis]);
  let along=Number(point[axis]);
  const snap=nodes.filter(n=>Math.abs(n-along)<=tolerance).sort((a,b)=>Math.abs(a-along)-Math.abs(b-along))[0];
  if(snap!=null)along=snap;
  along=index===0?Math.max(run.start,Math.min(anchor-.01,along)):Math.min(run.end,Math.max(anchor+.01,along));
  const low=index===0?along:anchor,high=index===0?anchor:along;
  return {...gap,[axis]:roundCoord((low+high)/2,4),width:roundCoord(high-low,4)};
}
