import { productionScene } from './production-scene.js';

const add=(a,b)=>a.map((v,i)=>v+b[i]);
const scale=(a,s)=>a.map(v=>v*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>scale(a,1/(Math.hypot(...a)||1));
// Orthographic views of the same productionScene used by WebGL. No stock,
// inferred fasteners or geometry are added by this drawing adapter.
export function productionView(report,project,{yaw=35,layers,frame=false,floor,surfaceIds}={}) {
  const scene=productionScene(report,project),faces=[];
  const floorSurfaces=new Set(report.surfaces.filter(s=>s.floor===floor).map(s=>s.id));
  const floorIds=new Set([...report.parts,...report.members].filter(p=>floorSurfaces.has(p.surfaceId)).map(p=>p.id));
  const surfaceSet=new Set(surfaceIds||[]),surfaceParts=new Set([...report.parts,...report.members].filter(p=>surfaceSet.has(p.surfaceId)).map(p=>p.id));
  const wanted=layer=>!layers||layers.includes(layer);
  const face=(rings,item,color)=>faces.push({rings,id:item.id,layer:item.layer,color});
  for(const item of scene.panels){
    if(!wanted(item.layer)||frame&&!item.timber)continue;
    if(floor&&!floorIds.has(item.id))continue;
    if(surfaceIds&&!surfaceParts.has(item.id))continue;
    const p=item.placement,t=item.thickness/2;
    const world=(x,y,z)=>add(add(add(p.origin,scale(p.u,x)),scale(p.v,y)),scale(p.normal,z));
    const rings=z=>item.shape.map(r=>r.map(([x,y])=>world(x,y,z)));
    const color=item.timber?'#caac7c':item.layer==='roof'?'#b5c5d0':'#dce7ce';
    face(rings(t),item,color);face(rings(-t),item,color);
    for(const ring of item.shape)for(let i=0;i<ring.length;i++){
      const [a,b]=[ring[i],ring[(i+1)%ring.length]];if(a[0]===b[0]&&a[1]===b[1])continue;face([[world(...a,-t),world(...b,-t),world(...b,t),world(...a,t)]],item,item.timber?'#b9925e':'#b8cba5');
    }
  }
  for(const item of scene.beams){
    if(surfaceIds)continue;
    if(!wanted(item.layer))continue;
    const [w,d]=String(item.profile).split(/[×xх]/).map(Number);if(!(w>0&&d>0))continue;
    const axis=unit(item.b.map((v,i)=>v-item.a[i])),side=unit(cross(axis,Math.abs(axis[2])>.95?[0,1,0]:[0,0,1])),normal=unit(cross(axis,side));
    const vertices=[item.a,item.b].flatMap(p=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>add(add(p,scale(side,u*w/2)),scale(normal,v*d/2))));
    for(const indices of [[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])face([indices.map(i=>vertices[i])],item,'#c8a675');
  }
  const angle=yaw*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const projectPoint=([x,y,z])=>[(x*c-y*s)*.866,(x*s+y*c)*.48-z];
  const depth=([x,y,z])=>x*s+y*c+z*.48;
  const projected=faces.map(f=>({...f,rings:f.rings.map(r=>r.map(projectPoint)),depth:f.rings[0].reduce((sum,p)=>sum+depth(p),0)/f.rings[0].length})).sort((a,b)=>a.depth-b.depth);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const f of projected)for(const ring of f.rings)for(const [x,y]of ring){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  const x=projected.length?minX:0,y=projected.length?minY:0,w=projected.length?maxX-x:1,h=projected.length?maxY-y:1,pad=Math.max(w,h)*.04;
  return {faces:projected,viewBox:[x-pad,y-pad,w+2*pad,h+2*pad],missing:scene.missing};
}
