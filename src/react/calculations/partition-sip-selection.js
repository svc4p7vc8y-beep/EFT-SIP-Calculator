import { partitionRuns, partitionDepth } from '../planner/geometry.js';
import { splitAtBearingEdges } from './bearing-walls.js';

export function sipPartitionShares(plan, fallback) {
  const totals=new Map();
  const raw=partitionRuns(plan);
  for(const [a,b] of splitAtBearingEdges(plan,raw,raw.flat())) {
    const selected=Math.round(partitionDepth(plan,a,b)*1000);
    const thickness=[124,174,224].includes(selected)&&[.124,.174,.224].includes(Number(plan.partitionThickness))?selected:Number(fallback);
    totals.set(thickness,(totals.get(thickness)||0)+Math.hypot(b.x-a.x,b.y-a.y));
  }
  const total=[...totals.values()].reduce((sum,n)=>sum+n,0);
  return total?[...totals].map(([thickness,length])=>({thickness,share:length/total})):[{thickness:Number(fallback),share:1}];
}
