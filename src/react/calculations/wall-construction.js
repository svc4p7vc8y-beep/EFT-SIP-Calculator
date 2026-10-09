import { boundsOf, houseContourPoints } from '../planner/geometry.js';
import { exteriorHeight } from '../../calculations/floor-height.js';

// External house contour is never edited. Assembly lengths use a consistent
// clockwise butt corner: horizontal runs through, vertical runs between them.
// Non-orthogonal junctions must be detailed, not shortened by a guessed thickness.
export function exteriorWallConstruction(plan, sip={}, roof={}, topFloor=true, enabled=true) {
  const points=houseContourPoints(plan),bounds=boundsOf(points),thickness=Number(sip.wallThickness)/1000||Number(plan.wallThickness)||.174;
  const structural=enabled&&topFloor&&roof.shape==='flat'&&roof.flatSlopeMode==='structural';
  const slope=structural?Math.min(20,Math.max(0,Number(roof.flatSlopePercent)||0))/100:0;
  const direction=roof.flatSlopeDirection||'back',base=exteriorHeight(plan);
  const riseAt=p=>slope*(direction==='left'?p.x-bounds.x:direction==='right'?bounds.x+bounds.w-p.x:direction==='front'?p.y-bounds.y:bounds.y+bounds.h-p.y);
  return points.map((a,i)=>{
    const b=points[(i+1)%points.length],prev=points[(i+points.length-1)%points.length],next=points[(i+2)%points.length];
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),vertical=Math.abs(dx)<.001,horizontal=Math.abs(dy)<.001;
    const cross1=(a.x-prev.x)*dy-(a.y-prev.y)*dx,cross2=dx*(next.y-b.y)-dy*(next.x-b.x);
    const signedArea=points.reduce((s,p,j)=>s+p.x*points[(j+1)%points.length].y-p.y*points[(j+1)%points.length].x,0);
    // At a re-entrant corner the butting wall extends into the inner band.
    // Positive trim is a convex butt; negative trim is the concave extension.
    const trimStart=vertical&&Math.abs(prev.y-a.y)<.001&&Math.abs(cross1)>1e-8?Math.sign(cross1*signedArea)*thickness:0;
    const trimEnd=vertical&&Math.abs(next.y-b.y)<.001&&Math.abs(cross2)>1e-8?Math.sign(cross2*signedArea)*thickness:0;
    const start={x:a.x+dx*(trimStart/(length||1)),y:a.y+dy*(trimStart/(length||1))};
    const end={x:b.x-dx*(trimEnd/(length||1)),y:b.y-dy*(trimEnd/(length||1))};
    return {index:i,a,b,start,end,externalLength:length,length:length-trimStart-trimEnd,trimStart,trimEnd,
      heightStart:base+riseAt(start),heightEnd:base+riseAt(end),baseHeight:base,
      needsCornerDetail:!vertical&&!horizontal,thickness};
  });
}

export function wallTrimLength(walls,panelWidth=1.25,panelLength=2.5) {
  const onGrid=(n,step)=>Math.abs(n/step-Math.round(n/step))<1e-6;
  return walls.reduce((sum,w)=>{
    const delta=w.heightEnd-w.heightStart;
    const end=onGrid(w.length,panelWidth)?0:w.heightEnd;
    const top=Math.abs(delta)>.0001?Math.hypot(w.length,delta):onGrid(w.heightStart,panelLength)?0:w.length;
    return sum+end+top;
  },0);
}
