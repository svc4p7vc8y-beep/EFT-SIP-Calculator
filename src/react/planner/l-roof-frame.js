const EPS = 1e-7;
const value = (plane, p) => plane[0]*p.x + plane[1]*p.y + plane[2];
const subtract = (a,b) => a.map((v,i) => v-b[i]);
function clip(poly, plane) {
  const result = [];
  poly.forEach((a,i) => {
    const b = poly[(i+1)%poly.length], da = value(plane,a), db = value(plane,b);
    if (da <= EPS) result.push(a);
    if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
      const t = da/(da-db);
      result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
    }
  });
  return result;
}
const area = poly => Math.abs(poly.reduce((s,a,i) => {const b=poly[(i+1)%poly.length];return s+a.x*b.y-a.y*b.x;},0))/2;

// Equal-pitch plan diagram for a six-corner orthogonal L footprint.
// No load-bearing design or purchasing quantities are inferred from this diagram.
export function lRoofFrame(points, shape='gable', step=0.6, lathStep=0.35) {
  if (!['gable','hip'].includes(shape)) return null;
  const clean = points.filter((b,i) => {
    const a=points[(i+points.length-1)%points.length],c=points[(i+1)%points.length];
    return Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))>EPS;
  });
  if (clean.length!==6 || clean.some((a,i) => {const b=clean[(i+1)%6];return Math.abs(a.x-b.x)>EPS && Math.abs(a.y-b.y)>EPS;})) return null;
  const minX=Math.min(...clean.map(p=>p.x)),maxX=Math.max(...clean.map(p=>p.x));
  const minY=Math.min(...clean.map(p=>p.y)),maxY=Math.max(...clean.map(p=>p.y));
  const corner=clean.find(p=>p.x>minX+EPS&&p.x<maxX-EPS&&p.y>minY+EPS&&p.y<maxY-EPS);
  if (!corner) return null;
  const missing = [[maxX,maxY],[minX,maxY],[maxX,minY],[minX,minY]].find(([x,y])=>!clean.some(p=>Math.abs(p.x-x)<EPS&&Math.abs(p.y-y)<EPS));
  if (!missing) return null;
  const sx=missing[0]===maxX?1:-1,sy=missing[1]===maxY?1:-1;
  const ox=sx===1?minX:maxX,oy=sy===1?minY:maxY;
  const restore=p=>({x:ox+sx*p.x,y:oy+sy*p.y});
  const W=maxX-minX,H=maxY-minY,B=(corner.x-ox)*sx,A=(corner.y-oy)*sy;
  const outer=[[1,0,0],[0,1,0],...(shape==='hip'?[[-1,0,W],[0,-1,H]]:[])];
  const inner=[[-1,0,B],[0,-1,A]];
  const rectangles=[[{x:0,y:0},{x:W,y:0},{x:W,y:A},{x:0,y:A}],[{x:0,y:A},{x:B,y:A},{x:B,y:H},{x:0,y:H}]];
  const height=p=>Math.min(...outer.map(q=>value(q,p)),Math.max(...inner.map(q=>value(q,p))));
  const inside=p=>p.x>EPS&&p.y>EPS&&p.x<W-EPS&&p.y<H-EPS&&(p.x<B-EPS||p.y<A-EPS);
  const patches=[];
  for(let k=0;k<2;k++) {
    const planes=[...outer,inner[k]];
    for(const rect of rectangles) for(const plane of planes) {
      let poly=clip(rect,subtract(inner[1-k],inner[k]));
      for(const other of planes) poly=clip(poly,subtract(plane,other));
      if(poly.length>2&&area(poly)>EPS) patches.push({poly,plane});
    }
  }
  const rafters=[],laths=[],creases=[],seen=new Set();
  const spacing=Math.max(.3,Math.min(1.2,Number(step)||.6));
  for(const {poly,plane} of patches) {
    for (const isLath of [false,true]) {
    const horizontal=isLath ? plane[0]===0 : plane[0]!==0;
    const interval=isLath ? Math.max(.1,Number(lathStep)||.35) : spacing;
    const axis=horizontal?'y':'x',cross=horizontal?'x':'y';
    const lo=Math.min(...poly.map(p=>p[axis])),hi=Math.max(...poly.map(p=>p[axis]));
    for(let v=Math.ceil((lo+EPS)/interval)*interval;v<hi-EPS;v+=interval) {
      const hits=[];
      poly.forEach((a,i)=>{const b=poly[(i+1)%poly.length];if((a[axis]<=v&&b[axis]>v)||(b[axis]<=v&&a[axis]>v)){const t=(v-a[axis])/(b[axis]-a[axis]);hits.push({[axis]:v,[cross]:a[cross]+t*(b[cross]-a[cross])});}});
      if(hits.length===2) (isLath ? laths : rafters).push(hits.map(restore));
    }
    }
    poly.forEach((a,i)=>{
      const b=poly[(i+1)%poly.length],length=Math.hypot(b.x-a.x,b.y-a.y);
      if(length<EPS)return;
      const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},delta=Math.min(.0001,length/100);
      const nx=-(b.y-a.y)/length*delta,ny=(b.x-a.x)/length*delta;
      const left={x:mid.x+nx,y:mid.y+ny},right={x:mid.x-nx,y:mid.y-ny};
      if(!inside(left)||!inside(right))return;
      const bend=height(left)+height(right)-2*height(mid);
      if(Math.abs(bend)<delta*.01)return;
      const pair=[a,b].map(restore);
      const key=pair.map(p=>`${p.x.toFixed(6)},${p.y.toFixed(6)}`).sort().join('|');
      if(seen.has(key))return;
      seen.add(key);
      creases.push({points:pair,kind:bend>0?'valley':Math.abs(a.x-b.x)<EPS||Math.abs(a.y-b.y)<EPS?'ridge':'hip'});
    });
  }
  return { rafters, laths, creases, surfaces:patches.map(({poly})=>poly.map(restore)) };
}
