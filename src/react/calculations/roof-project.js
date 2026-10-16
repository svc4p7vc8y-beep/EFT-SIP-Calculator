import {houseContourPoints} from '../planner/geometry.js';
import {productionLevels} from './production-levels.js';
import {lRoofFrame} from '../planner/l-roof-frame.js';
import {platformRoofFrame} from '../planner/platform-roof-frame.js';
import {normalizeTerracePlatform} from '../../calculations/terrace-model.js';
import clipping from 'polygon-clipping';
import {hipRoofFromContour} from './hip-roof-geometry.js';
import { roofBaseElevation } from './roof-wall-plate.js';

export const roofDot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>a.map(x=>x/Math.hypot(...a));
const polygonArea=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
export function roofFacet(id,name,vertices,extra={}){
 if(!Array.isArray(vertices)||vertices.length>200||!vertices.every(p=>Array.isArray(p)&&p.length===3&&p.every(x=>Number.isFinite(x)&&Math.abs(x)<=100000)))throw new Error(`${name}: вершины XYZ должны быть конечными, в пределах ±100000 мм (до 200 вершин).`);
 const clean=vertices.filter((p,i)=>i===0||Math.hypot(...sub(p,vertices[i-1]))>.001);
 if(clean.length>3&&Math.hypot(...sub(clean[0],clean.at(-1)))<.001)clean.pop();
 if(clean.length<3||!clean.every(p=>p.length===3&&p.every(Number.isFinite)))throw new Error(`${name}: нужны минимум три конечные вершины XYZ.`);
 const origin=clean[0];let u=unit(sub(clean[1],origin)),normal;
 for(let i=2;i<clean.length;i++){const n=cross(u,sub(clean[i],origin));if(Math.hypot(...n)>.01){normal=unit(n);break;}}
 if(!normal)throw new Error(`${name}: вырожденный скат.`);
 if(normal[2]<0)normal=normal.map(x=>-x);
 if(normal[2]<.001)throw new Error(`${name}: вертикальная поверхность не является кровельным скатом.`);
 if(Math.hypot(normal[0],normal[1])>.000001)u=unit([-normal[1],normal[0],0]);
 if(u[Math.abs(u[0])>=Math.abs(u[1])?0:1]<0)u=u.map(x=>-x);
 if(clean.some(p=>Math.abs(roofDot(sub(p,origin),normal))>1))throw new Error(`${name}: вершины не лежат в одной плоскости (допуск 1 мм).`);
 const v=unit(cross(normal,u)),polygon=clean.map(p=>[roofDot(sub(p,origin),u),roofDot(sub(p,origin),v)]);
 const area=polygonArea(polygon)/1e6,projectedArea=polygonArea(clean.map(p=>p.slice(0,2)))/1e6;
 const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const onSegment=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(length*length);return t>=-.000001&&t<=1.000001&&Math.abs(orient(a,b,p))/length<.001;};
 for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],c=polygon[(i+2)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],nextX=c[0]-b[0],nextY=c[1]-b[1];if(Math.abs(orient(a,b,c))/Math.hypot(dx,dy)<.001&&dx*nextX+dy*nextY<0)throw new Error(`${name}: самопересечение границы ската.`);}
 for(let i=0;i<polygon.length;i++)for(let j=i+2;j<polygon.length;j++){if(i===0&&j===polygon.length-1)continue;const a=polygon[i],b=polygon[(i+1)%polygon.length],c=polygon[j],d=polygon[(j+1)%polygon.length];if(orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0||onSegment(c,a,b)||onSegment(d,a,b)||onSegment(a,c,d)||onSegment(b,c,d))throw new Error(`${name}: самопересечение границы ската.`);}
 if(area<.000001)throw new Error(`${name}: нулевая площадь.`);
 return {id,name,vertices:clean,origin,u,v,normal,polygon,area,projectedArea,slopePercent:100*Math.hypot(normal[0],normal[1])/normal[2],angle:Math.acos(Math.min(1,normal[2]))*180/Math.PI,...extra};
}
export const roofWorld=(f,p)=>f.origin.map((x,i)=>x+f.u[i]*p[0]+f.v[i]*p[1]);
export const roofLocal=(f,p)=>[roofDot(sub(p,f.origin),f.u),roofDot(sub(p,f.origin),f.v)];
export const roofHeight=(f,x,y)=>f.origin[2]-(f.normal[0]*(x-f.origin[0])+f.normal[1]*(y-f.origin[1]))/f.normal[2];
export const roofEdgeSignature=e=>JSON.stringify([e.a,e.b].map(p=>p.map(x=>Math.round(x))).sort((a,b)=>a.join(',').localeCompare(b.join(','))));
const inside=(p,poly)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<.001)return true;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
export function roofAt(model,x,y){return model.faces.filter(f=>inside([x,y],f.vertices.map(p=>p.slice(0,2)))).map(f=>({face:f,z:roofHeight(f,x,y)}));}

// Geometric adapter. Prices, strength, fasteners and saved plan are never changed here.
export function roofProject(project,calculation,assembly){
 const settings=project.settings.roof,design=project.settings.productionCutting?.roofDesign||{},g=calculation.roof.geometry||{},faces=[],issues=[];
 const issue=(code,message,target='')=>issues.push({code,message,target});
 const defaultBase=productionLevels(project,assembly.floors.length).roofBase,b=assembly.bounds,axis=assembly.axis==='x'?0:1,span=axis===0?b.height:b.width,L=axis===0?b.width:b.height;
 const shape=calculation.roof.mainRoofShape;
 const roofBase=roofBaseElevation(project,calculation,assembly.floors.length,span,shape);
 const at=(a,c,z)=>axis===0?[b.x+a,b.y+c,roofBase+z]:[b.x+c,b.y+a,roofBase+z];
 const warm=settings.type==='sip',e=Number(g.eaveOverhang||0)*1000,t=Number(g.gableOverhang||0)*1000,h=Number(settings.ridgeHeight||0)*1000;
 const add=(id,name,points,extra={})=>{try{if(!id||faces.some(f=>f.id===id))throw new Error(`${name}: пустая или повторная марка ската ${id}.`);const override=design.faceOverrides?.[id]||{};faces.push(roofFacet(id,name,points,{group:'main',warm,thickness:Number(project.settings.sip.ceilingThickness),...extra,...override}));}catch(error){issue('ROOF_FACE',error.message,id);}};
 const contour=assembly.floors.at(-1).contour,rectangle=contour.length===4&&contour.every((p,i)=>p[0]===contour[(i+1)%4][0]||p[1]===contour[(i+1)%4][1]);
 if(project.services.roof){
 if(design.manualFaces?.length){for(const f of design.manualFaces)add(f.id,f.name,f.vertices,{group:f.group||'main',warm:f.warm===true,thickness:Number(f.thickness)||Number(project.settings.sip.ceilingThickness),manual:true,nodeRef:f.nodeRef||''});}
 else if(rectangle&&shape==='gable'){
  const slope=h/(span/2||1),z=-e*slope;
  add('КР-С1','Первый скат',[at(-t,-e,z),at(L+t,-e,z),at(L+t,span/2,h),at(-t,span/2,h)]);
  add('КР-С2','Второй скат',[at(L+t,span+e,z),at(-t,span+e,z),at(-t,span/2,h),at(L+t,span/2,h)]);
 }else if(rectangle&&shape==='flat'){
  const a=at(-t,-e,0),c=at(L+t,span+e,0),structural=calculation.roof.flatSlopeMode==='structural',tapered=calculation.roof.flatSlopeMode==='tapered',slope=Number(settings.flatSlopePercent||0)/100;
  const negative=['back','right'].includes(calculation.roof.flatSlopeDirection),z=y=>structural||tapered?(negative?span-y:y)*slope:0;
  add('КР-С1','Односкатная поверхность',[at(-t,-e,z(-e)),at(L+t,-e,z(-e)),at(L+t,span+e,z(span+e)),at(-t,span+e,z(span+e))],{structureHorizontal:tapered});
  if(tapered)issue('ROOF_TAPER','Разуклонка: несущая поверхность горизонтальна; задайте материал, толщины и водоприёмники.');
  if(!structural&&!tapered)issue('ROOF_DRAIN','Старый режим без уклона: водоотвод не подтверждён.');
 }else if(rectangle&&shape==='tiered'){
  const q=settings.tiered||{},U=Number(g.upperSpan)*1000,lo=Number(g.lowerSpan)*1000,J=Number(g.jointOverhang||0)*1000;
  const lowerJoint=q.lowerSlopeDirection==='towardJunction'?0:Number(g.lowerRise)*1000,upperJoint=lowerJoint+Number(g.stepHeight)*1000;
  for(const [id,name,start,end,rise,run,joint,negative] of [['КР-В','Верхний уровень',-e,U+J,g.upperRise,U,upperJoint,q.upperSlopeDirection!=='awayJunction'],['КР-Н','Нижний уровень',U,span+e,g.lowerRise,lo,lowerJoint,q.lowerSlopeDirection!=='towardJunction']]){
   const z=x=>joint+(x-U)*(negative?-1:1)*Number(rise)*1000/(run||1),pos=x=>q.upperSide==='second'?span-x:x;
   add(id,name,[at(-t,pos(start),z(start)),at(L+t,pos(start),z(start)),at(L+t,pos(end),z(end)),at(-t,pos(end),z(end))],{warm:settings.type==='sip'||settings.type==='combo'&&((q.warmLevel||'upper')==='both'||(id==='КР-В'?'upper':'lower')===(q.warmLevel||'upper')),junction:true});
  }
  issue('ROOF_JUNCTION','Перепад уровней: узел водозащиты и передачи нагрузки требует подтверждения.');
 }else if(shape==='hip'&&design.hipGeometry?.mode==='contour'){
  try{
   const result=hipRoofFromContour(contour,{angleDeg:design.hipGeometry.angleDeg,edgeAngles:design.hipGeometry.edgeAngles,overhangMm:e,roofBase,eaveZ:design.hipGeometry.eaveZ});
   result.facets.forEach((facet,i)=>add(`КР-К-${facet.edgeKey.replaceAll(',', '_').replace('|', '-')}`,`Вальма · скат ${i+1}`,facet.vertices,{hipEdgeKey:facet.edgeKey}));
   if(result.wallAlignmentReview)issue('ROOF_WALL_ALIGNMENT','Разные уклоны и общий карниз: отметки опирания по стенам требуют отдельной проверки.');
  }catch(error){issue('ROOF_HIP_GEOMETRY',error.message,'main');}
 }else if(rectangle&&shape==='hip'){
  // Match the existing equal-pitch hip convention; long roof axis is the long wall.
  const along=b.width>=b.height?0:1,A=along===0?b.width:b.height,S=along===0?b.height:b.width,slope=h/(S/2||1),zE=-e*slope;
  const P=(a,c,z)=>along===0?[b.x+a,b.y+c,roofBase+z]:[b.x+c,b.y+a,roofBase+z],r1=(S/2),r2=A-S/2;
  add('КР-С1','Вальма · продольный скат 1',[P(-e,-e,zE),P(A+e,-e,zE),P(r2,S/2,h),P(r1,S/2,h)]);
  add('КР-С2','Вальма · продольный скат 2',[P(A+e,S+e,zE),P(-e,S+e,zE),P(r1,S/2,h),P(r2,S/2,h)]);
  add('КР-В1','Торцевая вальма 1',[P(-e,S+e,zE),P(-e,-e,zE),P(r1,S/2,h)]);
  add('КР-В2','Торцевая вальма 2',[P(A+e,-e,zE),P(A+e,S+e,zE),P(r2,S/2,h)]);
 }else{
  const points=houseContourPoints(project.upperFloors?.at(-1)||project.plan),frame=lRoofFrame(points,shape,Number(calculation.roof.rafterStructure?.module)||.64);
  if(frame){
   // Existing equal-pitch L model now exposes its own height; no second skeleton formula.
   const max=frame.maxHeight||1,slope=h/(max*1000);
   frame.facets.forEach((f,i)=>add(`КР-Г${i+1}`,`Г-образная крыша · скат ${i+1}`,f.vertices.map(p=>[p.x*1000,p.y*1000,roofBase+p.z*1000*slope])));
   if(e||t)issue('ROOF_L_EAVES','Г-образная крыша: модель по контуру стен; свесы задайте проектными скатами XYZ.');
  }else issue('ROOF_FORM','Для этой формы задайте проектные скаты XYZ. Условный прямоугольник не заменяет реальный контур.');
 }
 }
 if(!design.manualFaces?.length)for(const {platform,result} of calculation.roof.terraceRoofs||[]){
  const p=normalizeTerracePlatform(platform),f=platformRoofFrame(p,project.plan.house,Number(calculation.roof.rafterStructure?.module)||.64,settings);if(!f)continue;
  const {x1,y1,x2,y2}=f.bounds,group=`terrace:${p.id}`,base=Number(p.roof.highHeight)*1000,low=Number(p.roof.lowHeight)*1000;
  const mainHeight=(x,y)=>{const candidates=faces.filter(s=>s.group==='main'&&inside([x,y],s.vertices.map(p=>p.slice(0,2))));return candidates.length?roofHeight(candidates[0],x,y):null;};
  const z=(x,y)=>{if(p.roof.shape==='continuation'){
    // Extend the actual adjacent main plane, not an unrelated shed angle.
    const cx=Math.max(b.x+.01,Math.min(b.x+b.width-.01,x)),cy=Math.max(b.y+.01,Math.min(b.y+b.height-.01,y)),face=faces.find(s=>s.group==='main'&&inside([cx,cy],s.vertices.map(p=>p.slice(0,2))));
    return face?roofHeight(face,x,y):null;
   }
   if(f.ridge){const R=f.ridge[0],vertical=Math.abs(f.ridge[0].x-f.ridge[1].x)<.0001,dist=Math.abs((vertical?x/1000:y/1000)-(vertical?R.x:R.y)),half=vertical?(x2-x1)/2:(y2-y1)/2;return low+Number(p.roof.ridgeHeight)*1000*(1-dist/(half||1));}
   const side=result.side,a=['top','bottom'].includes(side)?y/1000:x/1000,start=side==='top'?y2:side==='left'?x2:side==='bottom'?y1:x1,end=side==='top'?y1:side==='left'?x1:side==='bottom'?y2:x2;
   return base+(low-base)*(a-start)/(end-start||1);
  };
  const polygons=f.ridge?(Math.abs(f.ridge[0].x-f.ridge[1].x)<.0001?[[[x1,y1],[f.ridge[0].x,y1],[f.ridge[1].x,y2],[x1,y2]],[[f.ridge[0].x,y1],[x2,y1],[x2,y2],[f.ridge[1].x,y2]]]:[[[x1,y1],[x2,y1],[x2,f.ridge[1].y],[x1,f.ridge[0].y]],[[x1,f.ridge[0].y],[x2,f.ridge[1].y],[x2,y2],[x1,y2]]]):[[[x1,y1],[x2,y1],[x2,y2],[x1,y2]]];
  polygons.forEach((poly,i)=>{const xyz=poly.map(([x,y])=>[x*1000,y*1000,z(x*1000,y*1000)]);if(xyz.some(p=>p[2]==null))issue('ROOF_ATTACHMENT','Продолжение пристройки не привязано к плоскости основной кровли.',group);else add(`КП-${p.id}-${i+1}`,`${p.name||'Пристройка'} · скат ${i+1}`,xyz,{group,warm:p.roof.mode==='warm',attachment:p.roof.shape==='continuation'});});
 }
 // A continuation shares the same plane, not a second panel over the main eave.
 for(const f of [...faces].filter(f=>f.attachment)){
  const main=faces.filter(m=>m.group==='main'&&f.vertices.every(p=>Math.abs(roofHeight(m,p[0],p[1])-p[2])<1));if(!main.length)continue;
  try{const ring=x=>[[...x.vertices.map(p=>p.slice(0,2)),x.vertices[0].slice(0,2)]],diff=clipping.difference(ring(f),...main.map(ring));
   const replacement=diff.map((poly,i)=>{if(poly.length>1)throw new Error('внутренние вырезы продолжения требуют проектного ската');return roofFacet(diff.length===1?f.id:`${f.id}-${i+1}`,f.name,poly[0].map(([x,y])=>[x,y,roofHeight(f,x,y)]),{group:f.group,warm:f.warm,thickness:f.thickness,attachment:true,nodeRef:f.nodeRef});});faces.splice(faces.indexOf(f),1,...replacement);
  }catch(error){issue('ROOF_ATTACHMENT',`${f.name}: ${error.message}`,f.id);}
 }
 const edges=[],seen=new Map(),vertices=faces.flatMap(f=>f.vertices);
 for(const f of faces)f.vertices.forEach((start,i)=>{const end=f.vertices[(i+1)%f.vertices.length],delta=sub(end,start),length2=roofDot(delta,delta),cuts=[0,1];for(const v of vertices){const t=roofDot(sub(v,start),delta)/length2;if(t>.000001&&t<.999999&&Math.hypot(...sub(v,start.map((x,j)=>x+t*delta[j])))<.1)cuts.push(t);}const ts=[...new Set(cuts.map(t=>Math.round(t*1e9)/1e9))].sort((a,b)=>a-b);
  for(let j=0;j<ts.length-1;j++){const a=start.map((x,k)=>x+ts[j]*delta[k]),b=start.map((x,k)=>x+ts[j+1]*delta[k]),key=[a,b].map(p=>p.map(x=>Math.round(x*10)/10).join(',')).sort().join('|');if(seen.has(key)){const edge=seen.get(key);if(!edge.faces.includes(f.id))edge.faces.push(f.id);continue;}const item={id:`РК${edges.length+1}`,a,b,faces:[f.id],length:Math.hypot(...sub(b,a)),kind:'edge'};seen.set(key,item);edges.push(item);}
 });
 for(const edge of edges){if(edge.faces.length===2){const fs=edge.faces.map(id=>faces.find(f=>f.id===id)),mid=edge.a.map((x,i)=>(x+edge.b[i])/2),run=Math.hypot(edge.b[0]-edge.a[0],edge.b[1]-edge.a[1])||1,n=[-(edge.b[1]-edge.a[1])/run,(edge.b[0]-edge.a[0])/run],z=fs.map(f=>{const center=f.vertices.reduce((v,p)=>v.map((x,i)=>x+p[i]/f.vertices.length),[0,0,0]),sign=(center[0]-mid[0])*n[0]+(center[1]-mid[1])*n[1]>=0?1:-1;return roofHeight(f,mid[0]+n[0]*sign,mid[1]+n[1]*sign);});edge.kind=z.every(x=>x<mid[2]-.0001)?(Math.abs(edge.a[2]-edge.b[2])<1?'ridge':'hip'):z.every(x=>x>mid[2]+.0001)?'valley':'joint';}else{edge.kind=Math.abs(edge.a[2]-edge.b[2])<1?'eave':'verge';}if(edge.faces.length>2)issue('ROOF_TOPOLOGY',`${edge.id}: более двух скатов на одном ребре.`,edge.id);}
 const area=faces.reduce((s,f)=>s+f.area,0),projection=faces.reduce((s,f)=>s+f.projectedArea,0),expected=Number(g.totalSlopeArea)||0;
 const groupAreas={};for(const group of new Set(faces.map(f=>f.group))){const list=faces.filter(f=>f.group===group),polys=list.map(f=>[ [...f.vertices.map(p=>p.slice(0,2)),f.vertices[0].slice(0,2)] ]);try{const union=clipping.union(...polys),unionArea=union.reduce((s,p)=>s+polygonArea(p[0])-p.slice(1).reduce((t,r)=>t+polygonArea(r),0),0)/1e6;groupAreas[group]=unionArea;if(list.reduce((s,f)=>s+f.projectedArea,0)-unionArea>.01&&!list.some(f=>f.junction))issue('ROOF_OVERLAP',`${group}: скаты перекрываются в плане. Проверьте границы.`,group);}catch{issue('ROOF_TOPOLOGY',`${group}: неверная топология скатов.`,group);}}
 const mainArea=faces.filter(f=>f.group==='main').reduce((s,f)=>s+f.area,0),estimateMain=Number(g.totalSlopeArea)||0;
 const main=faces.filter(f=>f.group==='main');if(project.services.roof&&main.length){try{const union=clipping.union(...main.map(f=>[[...f.vertices.map(p=>p.slice(0,2)),f.vertices[0].slice(0,2)]])),hole=clipping.difference([[...contour,contour[0]]],union),missingArea=hole.reduce((s,p)=>s+polygonArea(p[0])-p.slice(1).reduce((v,r)=>v+polygonArea(r),0),0)/1e6;if(missingArea>.01)issue('ROOF_GAP',`Кровля не закрывает ${missingArea.toFixed(2)} м² контура стен.`, 'main');}catch{issue('ROOF_TOPOLOGY','Не удалось сверить покрытие контура стен.');}}
 const warmArea=main.filter(f=>f.warm).reduce((s,f)=>s+(f.structureHorizontal?f.projectedArea:f.area),0),estimateWarm=Number(calculation.roof.mainWarmSlopeArea??calculation.roof.warmSlopeArea)||0;
 if(Math.abs(warmArea-estimateWarm)>.05)issue('ROOF_WARM_AREA',`Тёплая кровля: геометрия ${warmArea.toFixed(2)} м²; смета ${estimateWarm.toFixed(2)} м². Проверьте границу и состав.`, 'main');
 if(Math.abs(mainArea-estimateMain)>.05)issue('ROOF_AREA',`Площадь главной крыши: геометрия ${mainArea.toFixed(2)} м²; сметная геометрия ${estimateMain.toFixed(2)} м². Смета не заменена.`, 'main');
 if(settings.type==='combo'&&shape!=='tiered'&&!faces.some(f=>design.faceOverrides?.[f.id]?.warm!=null)&&!design.manualFaces?.length)issue('ROOF_WARM_BOUNDARY','Для комбинированной крыши назначьте тёплые скаты либо задайте точные границы отдельными скатами XYZ.');
 if(design.manualFaces?.length||Math.abs(roofBase-defaultBase)>1)issue('ROOF_WALL_ALIGNMENT','Проектные скаты/отметка основания не изменяют автоматически наружные стены и фронтоны. Согласуйте контуры стен, опор и узлы примыкания по текущей ревизии.');
 return {version:1,units:'мм',datum:'Z = верх пола первого этажа',roofBase,faces,edges,issues,area,projection,warmArea,mainArea,estimateArea:expected,groupAreas};
}
