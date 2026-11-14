import clipping from 'polygon-clipping';

// Opening coordinates are metres, relative to the bottom left of the opening.
// Existing rectangular projects retain their original geometry.
export function openingPolygon(opening, scale=1, x=0, y=0) {
  const w=Number(opening.width)||0,h=Number(opening.height)||0;
  const points=(opening.facadeId||opening.productShape)&&Array.isArray(opening.outline)&&opening.outline.length>=3
    ? opening.outline : [[0,0],[w,0],[w,h],[0,h]];
  if(points.length>32||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(Number(v))&&Math.abs(Number(v))<=100000)))return [];
  return [points.map(([a,b])=>[x+Number(a)*scale,y+Number(b)*scale])];
}
export function shapeArea(shape) {
  return shape.reduce((sum,poly)=>sum+poly.reduce((total,ring,index)=>total+(index?-1:1)*Math.abs(ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2,0),0);
}
export function openingShapeArea(opening, bottom=-1000, top=1000) {
  const sill=Number(opening.sillHeight)||0,shape=openingPolygon(opening,1,0,sill);
  if(!shape.length||!(Number(opening.width)>0)||!(Number(opening.height)>0))return 0;
  return shapeArea(clipping.intersection(shape,[[[-1000,bottom],[1000,bottom],[1000,top],[-1000,top]] ]));
}
