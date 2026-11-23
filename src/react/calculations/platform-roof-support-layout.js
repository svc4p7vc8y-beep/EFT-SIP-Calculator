import {mauerlatProfile} from './roof-wall-plate.js';
import {roofAt,roofHeight} from './roof-project.js';
import {houseContourPoints} from '../planner/geometry.js';
import {normalizeTerracePlatform} from '../../calculations/terrace-model.js';

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
// Polygon containment can exclude its boundary. A bearing on the house/roof
// seam still belongs to the adjacent facet, within geometry tolerance only.
const onFacetEdge=(point,face)=>face.vertices.some((a,i)=>{
 const b=face.vertices[(i+1)%face.vertices.length],dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
 const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(length2||1)));
 return distance(point,[a[0]+dx*t,a[1]+dy*t])<.1;
});
// Geometric bearing layout only; capacity and connection design remain project data.
export function platformRoofSupportLayout(project,platform,result,model,spacing=3){
 platform=normalizeTerracePlatform(platform);
 const x=Number(platform.x)*1000,y=Number(platform.y)*1000,w=Number(platform.w)*1000,h=Number(platform.h)*1000;
 const faces=(model?.faces||[]).filter(f=>f.group===(platform.roof.mode==='shared'?'main':`terrace:${platform.id}`));
 if(!faces.length)return {posts:[],ties:[]};
 const contour=houseContourPoints(project.plan).map(p=>[p.x*1000,p.y*1000]);
 const onHouse=p=>contour.some((a,i)=>{const b=contour[(i+1)%contour.length],dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy,t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(l2||1);return t>=0&&t<=1&&distance(p,[a[0]+dx*t,a[1]+dy*t])<5;});
 const section=String(result.postSection||'150x100').replace('x','×'),depth=Number(section.split('×')[1])||100;
 const roofDepth=Number(String(project.settings.roof.rafterSection||'50x150').split(/[×xх]/)[1])||150;
 const base=Number(platform.postBaseZMm??platform.deckHeightMm)||0,posts=[],ties=[],overrides=platform.roofSupportOverrides||{};
 const at=p=>{const bearingFaces=onHouse(p)&&platform.roof.shape==='continuation'?[...faces,...(model?.faces||[]).filter(face=>face.group==='main')]:faces;const inside=roofAt({faces:bearingFaces},...p),hits=[...inside,...bearingFaces.filter(face=>!inside.some(hit=>hit.face===face)&&onFacetEdge(p,face)).map(face=>({face,z:roofHeight(face,...p)}))];const hit=hits.sort((a,b)=>a.z-b.z)[0];return hit?hit.z-(hit.face.warm?Number(hit.face.thickness)||174:roofDepth)/(2*hit.face.normal[2]):null;};
 const add=(id,pos,runId,manual={})=>{
  const v={...manual,...overrides[id]};if(v.exclude)return null;
  const point=[Number(v.xMm??pos[0]),Number(v.yMm??pos[1])],roof=at(point);
  const bottom=Number(v.baseZMm??base),top=Number(v.topZMm??(roof==null?NaN:roof-(runId?depth:0)));
  if(![...point,bottom,top].every(Number.isFinite)||top<=bottom)return null;
  const old=posts.find(p=>distance(p.a,point)<5);if(old)return old;
  const post={id,a:[...point,bottom],b:[...point,top],profile:section,layer:'platforms',referenceOnly:true,platformId:platform.id,runId,anchorMode:v.anchorMode||platform.postAnchorMode||'auto'};posts.push(post);return post;
 };
 const edges=[['top',[x,y],[x+w,y]],['right',[x+w,y],[x+w,y+h]],['bottom',[x+w,y+h],[x,y+h]],['left',[x,y+h],[x,y]]];
 for(const [side,a,b]of edges){
  const mid=a.map((v,i)=>(v+b[i])/2);if(onHouse(mid)){
   const hit=roofAt({faces},...mid)[0],L=distance(a,b),plate=mauerlatProfile(project.settings.roof);if(!hit||platform.roof.mode==='shared'||hit.face.warm)continue;
   const n=hit.face.normal,slope=Math.hypot(n[0],n[1]);if(slope>.001&&Math.abs(n[0]*(b[0]-a[0])+n[1]*(b[1]-a[1]))/(L*slope)>.02)continue;
   const stock=Math.max(1000,(Number(project.settings.productionCutting?.stockLengthMm)||6000)-2*(Number(project.settings.productionCutting?.endAllowanceMm)||0)),count=Math.ceil(L/stock);
   for(let i=0;i<count;i++){const from=a.map((v,k)=>v+(b[k]-v)*i/count),to=a.map((v,k)=>v+(b[k]-v)*(i+1)/count),za=at(from),zb=at(to);if(za==null||zb==null)continue;
    ties.push({id:`platform:${platform.id}:ledger:${side}:${i}`,a:[...from,za-plate.heightMm/2],b:[...to,zb-plate.heightMm/2],profile:plate.profile,heightMm:plate.heightMm,flat:true,material:plate.catalogName,wallLedger:true,layer:'platforms',referenceOnly:true,name:'Мауэрлат террасы у стены',platformId:platform.id});
   }continue;
  }
  const hit=roofAt({faces},...mid)[0],L=distance(a,b);if(!hit||L<10)continue;
  const n=hit.face.normal,slope=Math.hypot(n[0],n[1]);
  if(slope>.001&&Math.abs(n[0]*(b[0]-a[0])+n[1]*(b[1]-a[1]))/(L*slope)>.02)continue;
  if(slope<=.001&&side!==result.side)continue;
  const count=Math.min(200,Math.max(1,Math.ceil(L/(Math.max(.5,Number(spacing)||3)*1000)))),run=[];
  for(let i=0;i<=count;i++){
   const pos=a.map((v,k)=>v+(b[k]-v)*i/count);if(onHouse(pos))continue;
   const p=add(`platform:${platform.id}:post:${side}:${i}`,pos,side);if(p)run.push(p);
  }
  for(const manual of platform.roofPosts||[])if(manual.runId===side){const p=add(manual.id,[manual.xMm,manual.yMm],side,manual);if(p&&!run.includes(p))run.push(p);}
  // House walls can support the end of the beam without an extra foundation post.
  const wallNode=p=>{const z=at(p);return onHouse(p)&&z!==null?[{b:[...p,z-depth]}]:[];};
  const nodes=[...wallNode(a),...run.sort((p,q)=>distance(a,p.a)-distance(a,q.a)),...wallNode(b)];
  for(let i=1;i<nodes.length;i++)if(distance(nodes[i-1].b,nodes[i].b)>5)ties.push({id:`platform:${platform.id}:tie:${side}:${i}`,a:nodes[i-1].b.map((v,k)=>k===2?v+depth/2:v),b:nodes[i].b.map((v,k)=>k===2?v+depth/2:v),profile:section,layer:'platforms',referenceOnly:true,name:'Балка опирания стропил террасы',platformId:platform.id});
 }
 for(const manual of platform.roofPosts||[])if(!manual.runId)add(manual.id,[manual.xMm,manual.yMm],null,manual);
 return {posts,ties};
}

export function editPlatformPost(project,platformId,id,patch){
 const p=project.plan.platforms.find(p=>p.id===platformId);if(!p)return project;
 p.roofSupportOverrides={...p.roofSupportOverrides,[id]:{...(p.roofSupportOverrides?.[id]||{}),...patch}};
 return project;
}

export function platformPostAnchor(post,foundation){
 if(['pile','base','none'].includes(post.anchorMode))return post.anchorMode;
 return foundation?.points?.some(p=>Math.hypot((Array.isArray(p)?p[0]:p.x)*1000-post.a[0],(Array.isArray(p)?p[1]:p.y)*1000-post.a[1])<=100)?'pile':'base';
}
