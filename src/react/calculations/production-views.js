import { productionScene } from './production-scene.js';
import {panelMesh,beamMesh} from './building-mesh.js';

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
    const color=item.timber?'#caac7c':item.layer==='roof'?'#b5c5d0':'#dce7ce';
    for(const rings of panelMesh(item))face(rings,item,color);
  }
  for(const item of scene.beams){
    if(surfaceIds||!wanted(item.layer))continue;
    for(const rings of beamMesh(item))face(rings,item,'#c8a675');
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
