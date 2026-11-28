// Mobile 7.9.5 interaction model, adapted to the current SVG/layer editor.
// Camera gestures never write project geometry or add undo history entries.
export const PLAN_VIEW = {width:1100,height:760};
export function adaptivePlanView(width,height,mobile) {
  return mobile&&width>0&&height>0?{width:1100,height:1100*height/width}:PLAN_VIEW;
}
export function svgClientPoint(point,matrix) {
  const {a=1,b=0,c=0,d=1,e=0,f=0}=matrix||{},det=a*d-b*c;
  if(!Number.isFinite(det)||Math.abs(det)<1e-12)return {...point};
  return {x:(d*(point.x-e)-c*(point.y-f))/det,y:(a*(point.y-f)-b*(point.x-e))/det};
}
export function svgPan(start,dx,dy,matrix) {
  const origin=svgClientPoint({x:0,y:0},matrix),delta=svgClientPoint({x:dx,y:dy},matrix);
  return {x:start.x+delta.x-origin.x,y:start.y+delta.y-origin.y};
}
export function beginPlanPinch(points,zoom,pan,matrix,view,rotation=0) {
  const [a,b]=points;
  return {rotation,angle:Math.atan2(b.y-a.y,b.x-a.x),distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom,pan:{...pan},matrix:matrix?{a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d,e:matrix.e,f:matrix.f}:null,center:svgClientPoint({x:(a.x+b.x)/2,y:(a.y+b.y)/2},matrix),viewCenter:{x:view.width/2,y:view.height/2}};
}
export function movePlanPinch(start,points) {
  const [a,b]=points,distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
  const zoom=Math.max(35,Math.min(2000,Math.round(start.zoom*distance/start.distance))),ratio=zoom/start.zoom;
  const center=svgClientPoint({x:(a.x+b.x)/2,y:(a.y+b.y)/2},start.matrix),v=start.viewCenter;
  const delta=Math.atan2(b.y-a.y,b.x-a.x)-(start.angle||0),rotation=(start.rotation||0)+Math.atan2(Math.sin(delta),Math.cos(delta))*180/Math.PI;
  const rotate=(p,angle)=>{const r=angle*Math.PI/180;return {x:p.x*Math.cos(r)-p.y*Math.sin(r),y:p.x*Math.sin(r)+p.y*Math.cos(r)};};
  const anchor=rotate({x:start.center.x-v.x,y:start.center.y-v.y},-(start.rotation||0)),target=rotate({x:center.x-v.x,y:center.y-v.y},-rotation);
  return {zoom,rotation,pan:{x:target.x-ratio*(anchor.x-start.pan.x),y:target.y-ratio*(anchor.y-start.pan.y)}};
}
export function edgeMenuSwipe(start,end) {
  return !!start&&start.x<=24&&end.x-start.x>=55&&Math.abs(end.y-start.y)<Math.abs(end.x-start.x)*.65;
}
