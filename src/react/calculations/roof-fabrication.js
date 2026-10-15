import {roofWorld,roofHeight,roofAt,roofEdgeSignature} from './roof-project.js';
import {houseContourPoints} from '../planner/geometry.js';
import {clearGapPositions} from './clear-gap-framing.js';
import {roofMemberGeometry,roofRafterDetail} from './roof-rafter-detail.js';
export function roofLineIntervals(polygon,x){
 const hits=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];if((a[0]<=x&&b[0]>x)||(b[0]<=x&&a[0]>x))hits.push(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));}
 hits.sort((a,b)=>a-b);return Array.from({length:Math.floor(hits.length/2)},(_,i)=>[hits[2*i],hits[2*i+1]]);
}
// Exact fabrication from the common planes. No capacity or new estimate norms.
export function roofFabrication(model,project,calculation,settings){
 const rafters=[],members=[],laths=[],counterLaths=[],roofTimbers=[],issues=[],section=String(calculation.roof.rafterStructure?.section||'').replace('x','×');
 const append=(item,material,list)=>{if(item.worldA&&item.worldB)Object.assign(item,roofMemberGeometry(item.worldA,item.worldB,item.profile));list.push(item);members.push({...item,surfaceId:item.faceId,nodeRef:model.faces.find(f=>f.id===item.faceId)?.nodeRef||'',material,source:'Единая геометрия кровли',surface:'Кровля',panels:[],cutLength:item.length+2*Number(settings.endAllowanceMm||0),processing:'Геометрические торцы; опорные врезки, пролёты и крепёж по рабочему узлу'});};
 if(calculation.roof.rafterStructure?.system==='truss'){issues.push('Фермы: геометрия скатов не является раскроем фермы. Внесите пояса, решётку и рабочие узлы проектными элементами.');return {rafters,members,laths,counterLaths,roofTimbers,issues};}
 if(!/^\d+×\d+$/.test(section)){issues.push('Стропила: проектное сечение отсутствует.');return {rafters,members,laths,counterLaths,roofTimbers,issues};}
 const width=Number(section.split('×')[0]),gap=Number(settings.rafterClearGapMm)||Math.max(100,Number(calculation.roof.rafterStructure?.step||.6)*1000);
 for(const f of model.faces.filter(f=>!f.warm)){
  if(f.structureHorizontal){issues.push(`${f.name}: разуклонка не наклоняет стропила; несущую схему задайте вручную.`);continue;}
  const xs=f.polygon.map(p=>p[0]),lo=Math.min(...xs),hi=Math.max(...xs);if(hi-lo<width)continue;
  const positions=clearGapPositions(lo+width/2,hi-width/2,width,gap);
  if(positions.length>500||members.length>10000){issues.push(`${f.name}: превышен лимит деталей кровли, проверьте шаг.`);continue;}
  for(const x of positions)for(const [a,b]of roofLineIntervals(f.polygon,x)){
   if(b-a<width)continue;const A=roofWorld(f,[x,a]),B=roofWorld(f,[x,b]),id=`${f.id}-СТ${rafters.length+1}`,item={id,name:f.name,faceId:f.id,a:A.slice(0,2),b:B.slice(0,2),worldA:A,worldB:B,length:Math.ceil(Math.hypot(...A.map((n,i)=>B[i]-n))),profile:section,normal:f.normal,...roofRafterDetail(model,A,B,section)};append(item,'Стропило',rafters);
  }
  if(calculation.roof.includeCovering){
   const ys=f.polygon.map(p=>p[1]),v0=Math.min(...ys),v1=Math.max(...ys),step=Number(calculation.roof.lathStep||.35)*1000;
   const count=Math.ceil((v1-v0)/step),transposed=f.polygon.map(([x,y])=>[y,x]);
   for(let j=0;j<=count;j++){const y=j===count?v1-.01:v0+.01+j*(v1-v0)/count;for(const [a,b]of roofLineIntervals(transposed,y)){
    let from=a;while(from<b-.01){const max=Number(settings.stockLengthMm)-2*Number(settings.endAllowanceMm||0),anchors=positions.filter(x=>x>from+.01&&x<=from+max),to=b-from<=max?b:anchors.at(-1);if(to==null){issues.push(`${f.name}: нет стропила для стыка обрешётки.`);break;}
     const A=roofWorld(f,[from,y]),B=roofWorld(f,[to,y]),id=`${f.id}-ОБ${laths.length+1}`;append({id,name:f.name,faceId:f.id,normal:f.normal,a:A.slice(0,2),b:B.slice(0,2),worldA:A,worldB:B,length:Math.ceil(to-from),profile:'25×100',flat:true},'Обрешётка',laths);from=to;
    }
   }}
   if(/^\d+×\d+$/.test(settings.counterLathProfile))for(const r of rafters.filter(r=>r.faceId===f.id))append({...r,id:`${f.id}-КО${counterLaths.length+1}`,profile:settings.counterLathProfile},'Контробрешётка',counterLaths);
   else issues.push(`${f.name}: проектное сечение контробрешётки не задано.`);
  }
 }
 // Preserve the existing mauerlat layout and section; only assign exact heights.
 for(const [i,pair]of (calculation.roof.mauerlatLength>0?(calculation.roof.mauerlatLayout==='perimeter'?modelWallEdges(project):modelWallEdges(project).filter(([a,b])=>assemblyAxisParallel(a,b,calculation.roof.ridgeAxis))):[]).entries()){
  const [a,b]=pair,A=model.faces.find(f=>f.group==='main'&&pointOnFace(f,a)),B=model.faces.find(f=>f.group==='main'&&pointOnFace(f,b));
  if(!A||!B){issues.push('Мауэрлат: границы стены не привязаны к скатам.');continue;}
  const p=[...a,roofHeight(A,...a)],q=[...b,roofHeight(B,...b)];append({id:`КР-М${i+1}`,faceId:A.id,name:'Мауэрлат',a,b,worldA:p,worldB:q,length:Math.ceil(Math.hypot(...q.map((n,j)=>n-p[j]))),profile:'100×150'},'Мауэрлат',roofTimbers);
 }
 for(const edge of model.edges.filter(e=>['ridge','hip','valley'].includes(e.kind))){const profile=settings.roofDesign.edgeProfiles?.[edge.id],cold=edge.faces.some(id=>model.faces.find(f=>f.id===id)?.warm===false);
  if(edge.kind==='ridge'&&settings.roofFrameConfig?.replaceRidge&&settings.roofSupports.some(s=>s.autoLayout==='roof-support-frame'&&s.type==='purlin'))continue;
  const saved=settings.roofDesign.edgeGeometry?.[edge.id];if(saved&&saved!==roofEdgeSignature(edge)){issues.push(`${edge.id}: геометрия ребра изменилась; повторно задайте проектное сечение и узел.`);continue;}
  if(!cold)continue;if(!/^\d+×\d+$/.test(profile||'')){issues.push(`${edge.id}: задайте проектное сечение ${edge.kind==='ridge'?'конька':edge.kind==='valley'?'ендовы':'накосного элемента'}.`);continue;}
  append({id:`КР-${edge.id}`,faceId:edge.faces[0],name:edge.kind==='ridge'?'Конёк':edge.kind==='valley'?'Ендова':'Накосное стропило',roofMemberKind:edge.kind,a:edge.a.slice(0,2),b:edge.b.slice(0,2),worldA:edge.a,worldB:edge.b,length:Math.ceil(edge.length),profile},'Элемент ребра кровли',roofTimbers);
 }
 return {rafters,members,laths,counterLaths,roofTimbers,issues};
}
function modelWallEdges(project){const plan=project.upperFloors?.at(-1)||project.plan;return houseContourPoints(plan).map(p=>[p.x*1000,p.y*1000]).map((a,i,list)=>[a,list[(i+1)%list.length]]);}
function assemblyAxisParallel(a,b,axis){return Math.abs(a[axis==='x'?1:0]-b[axis==='x'?1:0])<1;}
function pointOnFace(f,p){return roofAt({faces:[f]},...p).length>0;}
