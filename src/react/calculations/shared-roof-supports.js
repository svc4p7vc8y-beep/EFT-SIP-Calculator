import {roofProject,roofAt} from './roof-project.js';
import {houseContourPoints} from '../planner/geometry.js';
import {isAxisAlignedRectangleContour} from './roof-contour.js';

export function mainRoofModel(project,roof,metrics) {
 const plans=metrics.floorPlans.map(item=>item.plan),contour=houseContourPoints(plans.at(-1)).map(p=>[p.x*1000,p.y*1000]);
 const xs=contour.map(p=>p[0]),ys=contour.map(p=>p[1]);
 return roofProject(project,{roof,metrics},{axis:roof.ridgeAxis,floors:plans.map(()=>({contour})),bounds:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}});
}
export function sharedTerracePosts(platform,result,model,spacing=3) {
 if(!model?.faces?.length)return [];
 const {x,y,w,h}=platform,deck=Number(platform.deckHeightMm)||0,side=result.side;
 const horizontal=['top','bottom'].includes(side),length=horizontal?w:h,n=Math.min(500,Math.max(2,Math.ceil(length/Math.max(.5,spacing))+1));
 return Array.from({length:n},(_,i)=>{
  const t=i/(n-1),pos=(side==='left'?[x,y+h*t]:side==='right'?[x+w,y+h*t]:side==='top'?[x+w*t,y]:[x+w*t,y+h]).map(v=>v*1000);
  const hits=roofAt({faces:model.faces.filter(f=>f.group==='main')},...pos);
  if(!hits.length)return null;
  const z=Math.min(...hits.map(hit=>hit.z));
  return z>deck?{id:`platform:${platform.id}:post:${i+1}`,a:[...pos,deck],b:[...pos,z],profile:result.postSection.replace('x','×'),layer:'platforms',referenceOnly:true}:null;
 }).filter(Boolean);
}
// Shared rectangular envelope: clip its end profile to the actual wall segment.
export function sharedGableProfile(roof,a,b,riseMm) {
 const points=roof.footprint?.included?.length&&roof.footprint.points;
 if(roof.mainRoofShape!=='gable'||!points||!isAxisAlignedRectangleContour(points.map(p=>[p.x*1000,p.y*1000])))return null;
 const axis=roof.ridgeAxis==='y'?'y':'x',cross=axis==='x'?'y':'x',low=Math.min(...points.map(p=>p[axis])),high=Math.max(...points.map(p=>p[axis]));
 if(Math.abs(a[axis]-b[axis])>.001)return null;
 const side=Math.abs(a[axis]-low)<.002?0:Math.abs(a[axis]-high)<.002?1:-1;
 if(side<0)return null;
 const min=Math.min(...points.map(p=>p[cross])),max=Math.max(...points.map(p=>p[cross])),mid=(min+max)/2,length=Math.hypot(b.x-a.x,b.y-a.y)*1000;
 const at=v=>Math.max(0,riseMm*(1-Math.abs(v-mid)/((max-min)/2||1)));
 const top=[[0,at(a[cross])]],t=(mid-a[cross])/(b[cross]-a[cross]);
 if(t>0&&t<1)top.push([t*length,riseMm]);top.push([length,at(b[cross])]);
 const polygon=[[0,0],...top,[length,0],[0,0]],area=Math.abs(polygon.reduce((s,p,i)=>{const q=polygon[(i+1)%polygon.length];return s+p[0]*q[1]-p[1]*q[0];},0))/2/1e6;
 return area>.00001?{side,polygon,area}:null;
}
