import {pointInPolygon} from '../planner/geometry.js';

// Place a mark on actual panel material, never in a stair/window cutout.
export function panelLabelPoint(part) {
  const fallback=[part.x+part.width/2,part.y+part.height/2],rings=part.shape||[];
  const inside=p=>rings.length&&pointInPolygon({x:p[0],y:p[1]},rings[0].map(([x,y])=>({x,y})))&&!rings.slice(1).some(r=>pointInPolygon({x:p[0],y:p[1]},r.map(([x,y])=>({x,y}))));
  if(inside(fallback)||!rings.length)return fallback;
  const levels=[...new Set(rings.flat().map(p=>p[1]))].sort((a,b)=>a-b);
  let best=fallback,score=-Infinity;
  for(let k=1;k<levels.length;k++){
    const y=(levels[k-1]+levels[k])/2,xs=[];
    for(const ring of rings)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
    xs.sort((a,b)=>a-b);
    for(let i=1;i<xs.length;i++){const p=[(xs[i-1]+xs[i])/2,y],s=Math.min(xs[i]-xs[i-1],levels[k]-levels[k-1]);if(s>score&&inside(p)){score=s;best=p;}}
  }
  return best;
}
