import {roofAt,roofHeight} from './roof-project.js';

// Intersect the saved maximum partition height with the existing roof planes.
// This is geometry, not a choice of section, connection or load capacity.
export function atticPartitionProfile(model,a,b,baseZ,maxHeight){
 const underside=(face,x,y)=>roofHeight(face,x,y)-(face.warm?Number(face.thickness||0)/(2*face.normal[2]):0);
 const dx=b[0]-a[0],dy=b[1]-a[1],W=Math.round(Math.hypot(dx,dy)),cuts=new Set([0,1]);
 if(!W)return null;
 const faces=model.faces.filter(f=>f.group==='main');
 for(const face of faces){
  for(let i=0;i<face.vertices.length;i++){
   const c=face.vertices[i],d=face.vertices[(i+1)%face.vertices.length],ex=d[0]-c[0],ey=d[1]-c[1],den=dx*ey-dy*ex;
   if(Math.abs(den)<1e-8)continue;
   const t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/den,u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/den;
   if(t>0&&t<1&&u>=0&&u<=1)cuts.add(t);
  }
  const z0=underside(face,...a)-baseZ,z1=underside(face,...b)-baseZ,t=(maxHeight-z0)/(z1-z0);
  if(Number.isFinite(t)&&t>0&&t<1)cuts.add(t);
 }
 const ts=[...cuts].sort((x,y)=>x-y),points=[];
 for(let i=1;i<ts.length;i++){
  if(ts[i]-ts[i-1]<1e-8)continue;
  const t=(ts[i]+ts[i-1])/2,hits=roofAt(model,a[0]+dx*t,a[1]+dy*t).filter(h=>h.face.group==='main').sort((x,y)=>y.z-x.z);
  if(!hits.length)return null;
  for(const u of [ts[i-1],ts[i]]){const point=[u*W,Math.max(0,Math.min(maxHeight,underside(hits[0].face,a[0]+dx*u,a[1]+dy*u)-baseZ))];if(points.length&&Math.abs(points.at(-1)[0]-point[0])<.001){if(Math.abs(points.at(-1)[1]-point[1])>1)return null;}else points.push(point);}
 }
 return points.length>=2?points:null;
}
export function profileHeight(profile,x){
 for(let i=1;i<profile.length;i++){const [a,b]=[profile[i-1],profile[i]];if(x>=a[0]-.001&&x<=b[0]+.001)return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]||1);}
 return x<profile[0][0]?profile[0][1]:profile.at(-1)[1];
}
