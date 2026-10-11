import {beamFrame} from './beam-frame.js';
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const scale=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=a=>scale(a,1/(Math.hypot(...a)||1));
export function panelMesh(item){
 const p=item.placement,t=item.thickness/2;
 const world=(x,y,z)=>add(add(add(p.origin,scale(p.u,x)),scale(p.v,y)),scale(p.normal,z));
 const faces=[item.shape.map(r=>r.map(([x,y])=>world(x,y,t))),item.shape.map(r=>r.map(([x,y])=>world(x,y,-t)))];
 for(const ring of item.shape)for(let i=0;i<ring.length;i++){
  const [a,b]=[ring[i],ring[(i+1)%ring.length]];
  if(Math.hypot(a[0]-b[0],a[1]-b[1])<.001)continue;
  faces.push([[world(...a,-t),world(...b,-t),world(...b,t),world(...a,t)]]);
 }
 return faces;
}
export function beamMesh(item){
 const profile=String(item.profile).split(/[×xх]/).map(Number),[w,d]=item.flat?[profile[1],profile[0]]:profile;
 const frame=beamFrame(item.a,item.b,item.normal);if(!frame||!(w>0&&d>0))return [];
 const center=item.a.map((v,i)=>(v+item.b[i])/2),outline=item.endCutOutline||[[-frame.length/2,-d/2],[frame.length/2,-d/2],[frame.length/2,d/2],[-frame.length/2,d/2]];
 const world=(x,y,z)=>add(add(add(center,scale(frame.across,x)),scale(frame.along,y)),scale(frame.depth,z));
 const vertices=[-w/2,w/2].map(x=>outline.map(([y,z])=>world(x,y,z))),faces=[[vertices[0]],[vertices[1]]];
 for(let i=0;i<outline.length;i++){const j=(i+1)%outline.length;faces.push([[vertices[0][i],vertices[0][j],vertices[1][j],vertices[1][i]]]);}
 return faces;
}
