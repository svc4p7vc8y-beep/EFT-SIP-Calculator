import clipping from 'polygon-clipping';
const box=rings=>{const b=[Infinity,Infinity,-Infinity,-Infinity];for(const r of rings)for(const p of r){b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);}return b;};
export function depthPlane(rings,depths){
 const points=rings[0],zs=depths[0];
 for(let i=1;i<points.length-1;i++){const a=points[0],b=points[i],c=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],ex=c[0]-a[0],ey=c[1]-a[1],den=dx*ey-dy*ex;if(Math.abs(den)<1e-5)continue;const u=((zs[i]-zs[0])*ey-(zs[i+1]-zs[0])*dy)/den,v=(dx*(zs[i+1]-zs[0])-ex*(zs[i]-zs[0]))/den;return [u,v,zs[0]-u*a[0]-v*a[1]];}
 return null;
}
const height=(p,q)=>p[0]*q[0]+p[1]*q[1]+p[2];
function positiveHalfPlane(bounds,plane){
 let ring=[[bounds[0]-1,bounds[1]-1],[bounds[2]+1,bounds[1]-1],[bounds[2]+1,bounds[3]+1],[bounds[0]-1,bounds[3]+1]],out=[];
 for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],da=height(plane,a),db=height(plane,b);if(da>0)out.push(a);if(da*db<0){const t=da/(da-db);out.push(a.map((v,j)=>v+(b[j]-v)*t));}}
 if(out.length<3)return [];out.push([...out[0]]);return [[out]];
}
// Depth is evaluated at every overlap, not by a face's average distance.
// This correctly hides oblique faces crossing in an orthographic view.
export function visibleProjectionFaces(faces){
 const rounded=rings=>rings.map(r=>r.map(p=>p.map(v=>Math.round(v*10000)/10000)));
 const data=faces.map(f=>({...f,rings:rounded(f.rings),box:box(f.rings)})),result=[];
 for(let i=0;i<data.length;i++){
  const f=data[i];if(f.cut||!f.depthPlane){result.push(f);continue;}
  let geometry=[f.rings];
  for(let j=0;j<data.length&&geometry.length;j++){
   const other=data[j];if(i===j||other.cut||!other.depthPlane||other.status==='blocked'||f.box[2]<=other.box[0]||other.box[2]<=f.box[0]||f.box[3]<=other.box[1]||other.box[3]<=f.box[1])continue;
   const delta=other.depthPlane.map((v,k)=>v-f.depthPlane[k]);delta[2]-=.01; // Coplanar faces retain their shared edges.
   const values=[[f.box[0],f.box[1]],[f.box[2],f.box[1]],[f.box[2],f.box[3]],[f.box[0],f.box[3]]].map(p=>height(delta,p));
   if(Math.max(...values)<=0)continue;
   const covering=Math.min(...values)>0?[other.rings]:clipping.intersection([other.rings],positiveHalfPlane(f.box,delta));
   if(covering.length)geometry=clipping.difference(geometry,covering).map(rounded);
  }
  for(const rings of geometry)result.push({...f,rings});
 }
 return result;
}
