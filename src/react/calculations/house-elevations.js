import {beamFrame} from './beam-frame.js';

export const FACADE_SIDES=[['front','Спереди'],['back','Сзади'],['left','Слева'],['right','Справа']];
export function facadePoint(point,side){
 const [x,y,z]=point;
 return side==='back'?[-x,z,y]:side==='left'?[-y,z,-x]:side==='right'?[y,z,x]:[x,z,-y];
}
const area=ring=>Math.abs(ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
const color=item=>item.visualColor||(item.windowGlass?'#dceff3':item.windowFrame?'#38616c':item.layer==='windows'?'#38616c':item.layer==='doors'?'#af8860':item.timber?'#d6bc89':['roofSurface','roof','platformRoof','sheetCover','flatOsb'].includes(item.layer)?'#e1e5df':'#f5f0df');
// Orthographic drawing of the same physical scene as 3D. No estimate or geometry mutation.
export function projectHouseFacade(scene,side='front'){
 const faces=[];
 const add=(id,rings,fill,layer)=>{
  const projected=rings.map(r=>r.map(p=>facadePoint(p,side)));
  if(!projected[0]?.length||area(projected[0])<.01)return;
  const points=projected.flat();
  faces.push({id,rings:projected.map(r=>r.map(p=>p.slice(0,2))),depth:points.reduce((sum,p)=>sum+p[2],0)/points.length,fill,layer});
 };
 for(const item of [...scene.panels,...(scene.previews||[])]){
  if(!item.placement||!item.shape?.length)continue;
  const {origin,u,v,normal=[0,0,1]}=item.placement,half=(Number(item.thickness)||1)/2;
  const world=([x,y],offset)=>origin.map((n,i)=>n+u[i]*x+v[i]*y+normal[i]*offset);
  for(const sign of [-1,1])add(`${item.id}:${sign}`,item.shape.map(r=>r.map(p=>world(p,sign*half))),color(item),item.layer);
  for(const [ri,ring]of item.shape.entries())for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length];
   add(`${item.id}:edge:${ri}:${i}`,[[world(a,-half),world(b,-half),world(b,half),world(a,half)]],color(item),item.layer);
  }
 }
 for(const item of scene.beams){
  const frame=item.a&&item.b&&beamFrame(item.a,item.b,item.normal);if(!frame)continue;
  const profile=String(item.profile||'50×150').split(/[x×х]/).map(Number);
  const width=profile[0]||50,depth=profile[1]||150;
  const a=item.flat?frame.depth:frame.across,d=item.flat?frame.across:frame.depth;
  if(item.endCutOutline?.length>=3){
   const mid=item.a.map((n,i)=>(n+item.b[i])/2),rings=[-1,1].map(sign=>item.endCutOutline.map(([along,deep])=>mid.map((n,i)=>n+a[i]*sign*width/2+frame.along[i]*along+d[i]*deep)));
   rings.forEach((ring,i)=>add(`${item.id}:cap:${i}`,[ring],'#d6bc89',item.layer));
   rings[0].forEach((p,i)=>{const j=(i+1)%rings[0].length;add(`${item.id}:cut:${i}`,[[p,rings[0][j],rings[1][j],rings[1][i]]],'#d6bc89',item.layer);});
  }else{
   const corners=[item.a,item.b].flatMap(p=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([s,t])=>p.map((n,i)=>n+a[i]*s*width/2+d[i]*t*depth/2)));
   for(const [i,indices]of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].entries())add(`${item.id}:face:${i}`,[indices.map(j=>corners[j])],'#d6bc89',item.layer);
  }
 }
 faces.sort((a,b)=>a.depth-b.depth);
 const points=faces.flatMap(face=>face.rings.flat());
 const bounds=points.length?points.reduce((b,p)=>({minX:Math.min(b.minX,p[0]),maxX:Math.max(b.maxX,p[0]),minZ:Math.min(b.minZ,p[1]),maxZ:Math.max(b.maxZ,p[1])}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity}):{minX:0,maxX:1000,minZ:0,maxZ:1000};
 // Deduplicate snap nodes without rounding the actual facade geometry.
 const snapPoints=[...new Map(points.map(p=>[p.map(n=>Math.round(n*10)).join(':'),p])).values()];
 return {faces,bounds,snapPoints};
}
export function facadeDimensionValue(dimension){
 const [a,b]=[dimension.a,dimension.b];
 return dimension.axis==='horizontal'?Math.abs(b[0]-a[0]):dimension.axis==='vertical'?Math.abs(b[1]-a[1]):Math.hypot(b[0]-a[0],b[1]-a[1]);
}
