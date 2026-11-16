export function openingMiniMarkers(plan,box){
 const span=Math.max(box.w,box.h,.5)*100,radius=span*.032,markers=[];
 for(const [index,opening] of (plan.openings||[]).filter(o=>o.type==='window'||o.type==='door').entries()){
  const x=Number(opening.x)*100,y=Number(opening.y)*100;if(!Number.isFinite(x)||!Number.isFinite(y))continue;
  const angle=(Number.isFinite(Number(opening.angle))?Number(opening.angle):opening.orientation==='v'?90:0)*Math.PI/180;
  let nx=-Math.sin(angle),ny=Math.cos(angle);
  if(nx*(x-(box.x+box.w/2)*100)+ny*(y-(box.y+box.h/2)*100)<0){nx=-nx;ny=-ny;}
  let mx=x,my=y,step=0;
  while(markers.some(m=>Math.hypot(m.mx-mx,m.my-my)<radius*2.5)&&step<100){step++;mx=x+nx*radius*2.8*step;my=y+ny*radius*2.8*step;}
  markers.push({opening,index,x,y,mx,my,radius,displaced:step>0});
 }
 return markers;
}
