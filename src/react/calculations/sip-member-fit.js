// SIP splines terminate at the inner faces of end boards. No structural splices
// or notch depths are inferred. Coordinates and clean length are adjusted together.
export function fitSipSpline(segment,boundaries,faceWidth) {
  const a=[...segment.a],b=[...segment.b],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(!(length>0&&faceWidth>0))return {...segment};
  const contact=p=>boundaries.reduce((depth,e)=>{
    const ex=e.b[0]-e.a[0],ey=e.b[1]-e.a[1],l=Math.hypot(ex,ey);
    const sine=Math.abs(dx*ey-dy*ex)/(length*l||1);
    if(!l||sine<.1)return depth;
    const t=((p[0]-e.a[0])*ex+(p[1]-e.a[1])*ey)/(l*l);
    return t>=-.001&&t<=1.001&&Math.abs(ex*(p[1]-e.a[1])-ey*(p[0]-e.a[0]))/l<1?Math.max(depth,(e.faceWidth||faceWidth)/sine):depth;
  },0);
  const start=contact(a),end=contact(b);
  if(start+end>=length)return {...segment,fitInvalid:true};
  return {...segment,a:a.map((n,i)=>n+[dx,dy][i]*start/length),b:b.map((n,i)=>n-[dx,dy][i]*end/length),length:Math.ceil(length-start-end-.001),axisLength:segment.length,endBoardTrimMm:[start,end]};
}

const inRing=(p,ring)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
export function fitSipEndBoard(segment,geometry,faceWidth,boundaries) {
  const dx=segment.b[0]-segment.a[0],dy=segment.b[1]-segment.a[1],l=Math.hypot(dx,dy);
  if(!l)return segment;
  const mid=segment.a.map((n,i)=>(n+segment.b[i])/2),normal=[-dy/l,dx/l];
  const inside=p=>geometry.some(poly=>inRing(p,poly[0])&&!poly.slice(1).some(r=>inRing(p,r)));
  const sign=inside(mid.map((n,i)=>n+normal[i]*faceWidth/2))?1:-1;
  // Horizontal plates pass through; vertical edge boards butt to their faces.
  const fitted=Math.abs(dx)<.01?fitSipSpline(segment,boundaries,faceWidth):segment;
  const shift=p=>p.map((n,i)=>n+normal[i]*sign*faceWidth/2);
  return {...fitted,a:shift(fitted.a),b:shift(fitted.b),axisA:segment.a,axisB:segment.b,faceWidth};
}
