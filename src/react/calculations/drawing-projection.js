import {dot,unit} from './building-mesh.js';
import {depthPlane,visibleProjectionFaces} from './drawing-visibility.js';
import clipping from 'polygon-clipping';
export const VIEW_DIRECTIONS={north:{title:'Фасад · сверху плана (−Y)',u:[1,0,0],v:[0,0,1],normal:[0,-1,0]},south:{title:'Фасад · снизу плана (+Y)',u:[-1,0,0],v:[0,0,1],normal:[0,1,0]},west:{title:'Фасад · слева плана (−X)',u:[0,-1,0],v:[0,0,1],normal:[-1,0,0]},east:{title:'Фасад · справа плана (+X)',u:[0,1,0],v:[0,0,1],normal:[1,0,0]},plan:{title:'План · сверху',u:[1,0,0],v:[0,-1,0],normal:[0,0,1]}};
const area=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-p[1]*q[0];},0)/2);
export function clipFaceDepth(face,view,depth){
 const signed=p=>dot(p.map((v,i)=>v-(view.origin?.[i]||0)),view.normal);
 const clip=(ring,bound,direction)=>{const out=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],da=direction*(signed(a)-bound),db=direction*(signed(b)-bound);if(da>=0)out.push(a);if(da*db<0){const t=da/(da-db);out.push(a.map((v,j)=>v+(b[j]-v)*t));}}return out;};
 const rings=face.map(r=>clip(clip(r,0,1),depth,-1));
 return rings[0]?.length>=3?rings.filter(r=>r.length>=3):[];
}
export function projectPoint(point,view){const p=point.map((v,i)=>v-(view.origin?.[i]||0));return [dot(p,view.u),-dot(p,view.v)];}
// A plane section of the actual closed prism. All opening-ring edges participate.
// No dimension is inferred from the printed image.
export function meshSection(faces,view,tolerance=.01){
 const segments=new Map(),key=p=>p.map(v=>Math.round(v/tolerance)).join(':'),signed=p=>dot(p.map((v,i)=>v-(view.origin?.[i]||0)),view.normal);
 const add=(a,b)=>{const ka=key(a),kb=key(b);if(ka!==kb)segments.set([ka,kb].sort().join('|'),{a,b,ka,kb});};
 for(const face of faces)for(const ring of face){
  const hits=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],da=signed(a),db=signed(b);
   if(Math.abs(da)<tolerance&&Math.abs(db)<tolerance){add(projectPoint(a,view),projectPoint(b,view));continue;}
   if(Math.abs(da)<tolerance)hits.push(projectPoint(a,view));
   if(da*db<0&&Math.abs(da)>=tolerance&&Math.abs(db)>=tolerance){const t=da/(da-db);hits.push(projectPoint(a.map((v,j)=>v+(b[j]-v)*t),view));}
  }
  const unique=[...new Map(hits.map(p=>[key(p),p])).values()];
  // Each planar face has collinear intersections, sorted along their principal direction.
  if(unique.length>=2){const a=unique[0],b=unique[1],dx=b[0]-a[0],dy=b[1]-a[1];unique.sort((p,q)=>(p[0]-q[0])*dx+(p[1]-q[1])*dy);for(let i=1;i<unique.length;i+=2)add(unique[i-1],unique[i]);}
 }
 const remaining=new Map(segments),rings=[];
 while(remaining.size){const [id,first]=remaining.entries().next().value;remaining.delete(id);const ring=[first.a,first.b];let current=first.kb;
  for(let i=0;i<=segments.size;i++){if(current===first.ka)break;const next=[...remaining].find(([,s])=>s.ka===current||s.kb===current);if(!next)break;remaining.delete(next[0]);const s=next[1],forward=s.ka===current;ring.push(forward?s.b:s.a);current=forward?s.kb:s.ka;}
  if(current===first.ka&&ring.length>=4&&area(ring)>tolerance*tolerance)rings.push(ring);
 }
 // XOR retains nested voids and separates a through-opening into two solids.
 return rings.length?clipping.xor(...rings.map(r=>[[r]])).flat():[];
}
export function drawingProjection(model,{direction='north',section,floor,cutHeightMm=1200,layers}={}){
 let view=VIEW_DIRECTIONS[direction]||VIEW_DIRECTIONS.north;
 const cut=!!section||direction==='plan';
 if(section){const dx=section.b[0]-section.a[0],dy=section.b[1]-section.a[1],u=unit([dx,dy,0]);view={title:`Разрез ${section.name}`,origin:[...section.a,0],u,v:[0,0,1],normal:[-u[1],u[0],0]};}
 if(direction==='plan'){const base=model.floorLevels.find(l=>l.floor===floor)?.elevationMm||0;view={...view,title:`План · этаж ${floor} · сечение +${cutHeightMm} мм`,origin:[0,0,base+cutHeightMm]};}
 const faces=[],issues=[],projectionIds=new Set();
 for(const object of model.objects){
  if(layers&&!layers.includes(object.layer)||floor&&object.floor&&object.floor!==floor)continue;
  // Architectural hip elevations show the roof envelope. The framing remains
  // available in 3D, roof drawings and structural sections, where its many
  // intersecting solids do not corrupt facade visibility clipping.
  if(!cut&&model.roofShape==='hip'&&['rafters','roofTimbers','laths','counterLaths'].includes(object.layer))continue;
  if(cut){try{const rings=meshSection(object.faces,view);if(rings.length){faces.push({id:object.id,sourceId:object.sourceId,hostId:object.hostId,mark:object.mark,status:object.status,rings,cut:true,depth:Infinity,layer:object.layer});projectionIds.add(object.id);}}catch(error){issues.push({code:'AR_VIEWS',message:`${view.title}, ${object.mark}: сечение не построено (${error.message})`,path:'Документация: диагностика геометрии'});}}
  for(const originalFace of object.faces){
   let face=originalFace;
   if(cut){const depth=section?.depthMm||0;if(depth===0)continue;face=clipFaceDepth(face,view,depth);if(!face.length)continue;}
   const rings=face.map(r=>r.map(p=>projectPoint(p,view)));if(!rings.length||area(rings[0])<.001)continue;
   const depth=face[0].reduce((s,p)=>s+dot(p,view.normal),0)/face[0].length;
   const depths=face.map(r=>r.map(p=>(section?-1:1)*dot(p,view.normal)));
   faces.push({id:object.id,sourceId:object.sourceId,hostId:object.hostId,mark:object.mark,status:object.status,rings,cut:false,depth:section?-depth:depth,depthPlane:depthPlane(rings,depths),layer:object.layer});projectionIds.add(object.id);
  }
 }
 faces.sort((a,b)=>a.depth-b.depth);
 if(!faces.length)issues.push({code:'AR_VIEWS',message:`${view.title}: секущая плоскость не пересекает модель`,path:'Документация: положение разреза'});
 const bounds=[[Infinity,-Infinity],[Infinity,-Infinity]];for(const f of faces)for(const ring of f.rings)for(const p of ring)for(let i=0;i<2;i++){bounds[i][0]=Math.min(bounds[i][0],p[i]);bounds[i][1]=Math.max(bounds[i][1],p[i]);}
 if(!faces.length)bounds.forEach(b=>{b[0]=0;b[1]=1;});
 const width=bounds[0][1]-bounds[0][0],height=bounds[1][1]-bounds[1][0],pad=Math.max(width,height,1000)*.16;
 let visible;
 try{visible=visibleProjectionFaces(faces);}catch(error){visible=faces;issues.push({code:'AR_VIEWS',message:`${view.title}: геометрическое скрытие не завершено (${error.message}); показан только контрольный вид`,path:'Документация: диагностика геометрии'});}
 const annotationBounds=bounds.map(b=>[...b]);
 if(direction==='plan')for(const s of model.settings.sections)for(const p of [s.a,s.b])if(p.length===2&&p.every(Number.isFinite))for(let i=0;i<2;i++){annotationBounds[i][0]=Math.min(annotationBounds[i][0],p[i]);annotationBounds[i][1]=Math.max(annotationBounds[i][1],p[i]);}
 return {title:view.title,view,faces:visible,issues,objectIds:[...projectionIds],bounds,viewBox:[annotationBounds[0][0]-pad,annotationBounds[1][0]-pad,annotationBounds[0][1]-annotationBounds[0][0]+2*pad,annotationBounds[1][1]-annotationBounds[1][0]+2*pad],units:'мм',direction,cut,sectionId:section?.id||null};
}
export function architecturalViews(model){
 const elevations=Object.keys(VIEW_DIRECTIONS).filter(k=>k!=='plan').map(direction=>drawingProjection(model,{direction}));
 const sections=model.settings.sections.filter(s=>s.a.length===2&&s.b.length===2&&[...s.a,...s.b,s.depthMm].every(v=>v!==''&&Number.isFinite(v))&&Math.hypot(...s.a.map((v,i)=>s.b[i]-v))>1).map(section=>drawingProjection(model,{section}));
 const plans=model.floorLevels.map(level=>drawingProjection(model,{direction:'plan',floor:level.floor,cutHeightMm:model.settings.planCutHeightMm??1200}));
 return {elevations,sections,plans,issues:[...elevations,...sections,...plans].flatMap(v=>v.issues)};
}
