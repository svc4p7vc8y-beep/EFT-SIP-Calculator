import clipping from 'polygon-clipping';
// Apply the existing SIP seam and edge-board rule to the actual net gable outline (metres).
export function sipGableTimber(shapes,panelWidth,panelLength,reservePercent=5,stockLength=6){
 const area=shape=>shape.reduce((s,p)=>s+p.reduce((v,r,j)=>v+(j?-1:1)*Math.abs(r.reduce((n,a,i)=>{const b=r[(i+1)%r.length];return n+a[0]*b[1]-a[1]*b[0];},0))/2,0),0);
 if(!(panelWidth>0)||!(panelLength>0))return {jointNet:0,edgeNet:0,jointLength:0,edgeLength:0};
 let seams=0,edges=0;
 for(const shape of shapes){
  if(!shape.length)continue;const pts=shape.flat(2),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const layout=(dx,dy)=>{let length=0;const e=.000001;
   for(let x=x0+dx;x<x1-e;x+=dx)length+=area(clipping.intersection(shape,[[[x-e/2,y0],[x+e/2,y0],[x+e/2,y1],[x-e/2,y1],[x-e/2,y0]]]))/e;
   for(let y=y0+dy;y<y1-e;y+=dy)length+=area(clipping.intersection(shape,[[[x0,y-e/2],[x1,y-e/2],[x1,y+e/2],[x0,y+e/2],[x0,y-e/2]]]))/e;
   return length;
  };
  seams+=Math.min(layout(panelWidth,panelLength),layout(panelLength,panelWidth));
  edges+=shape.reduce((n,p)=>n+p.reduce((v,r)=>v+r.reduce((s,a,i)=>{const b=r[(i+1)%r.length];return s+Math.hypot(b[0]-a[0],b[1]-a[1]);},0),0),0);
 }
 const reserve=1+Math.max(0,Number(reservePercent)||0)/100,stock=Math.max(.5,Number(stockLength)||6);
 return {jointNet:seams,edgeNet:edges,jointLength:Math.ceil(Math.max(0,seams*reserve-1e-7)/stock)*stock,edgeLength:Math.ceil(Math.max(0,edges*reserve-1e-7)/stock)*stock};
}
