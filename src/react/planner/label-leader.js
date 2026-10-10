import { pointInPolygon } from './geometry.js';
// Label coordinates do not alter construction geometry. Choose an actual
// interior target, including concave rooms and U-shaped stair footprints.
export function labelLeader(label,ring){
  const points=ring.map(p=>Array.isArray(p)?{x:p[0],y:p[1]}:p);
  if(pointInPolygon(label,points))return null;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys),w=Math.max(...xs)-left,h=Math.max(...ys)-top;
  const candidates=[{x:left+w/2,y:top+h/2},...Array.from({length:100},(_,i)=>({x:left+w*((i%10)+.5)/10,y:top+h*(Math.floor(i/10)+.5)/10}))];
  const target=candidates.find(p=>pointInPolygon(p,points));if(!target)return null;
  const dx=target.x-label.x,dy=target.y-label.y,l=Math.hypot(dx,dy)||1,s=Math.min(w,h)*.06;
  return {target,head:[target,{x:target.x-dx/l*s-dy/l*s*.5,y:target.y-dy/l*s+dx/l*s*.5},{x:target.x-dx/l*s+dy/l*s*.5,y:target.y-dy/l*s-dx/l*s*.5}]};
}
