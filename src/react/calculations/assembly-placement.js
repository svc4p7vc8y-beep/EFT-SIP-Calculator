// Geometric projection only; never chooses a load-bearing section or capacity.
export function projectOnSupport(support,x,y) {
  const [a,b]=[support.a,support.b],dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));
  return {x:Math.round(a[0]+t*dx),y:Math.round(a[1]+t*dy),z:Math.round(a[2]+t*(b[2]-a[2])),t};
}
