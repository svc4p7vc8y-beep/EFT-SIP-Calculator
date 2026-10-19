import {roofWorld,roofLocal,roofHeight,roofEdgeSignature} from './roof-project.js';
import {houseContourPoints} from '../planner/geometry.js';
import {withSipGableRafters} from './gable-rafter-stations.js';
import {clearGapPositions} from './clear-gap-framing.js';
import {roofMemberGeometry,roofRafterDetail} from './roof-rafter-detail.js';
import { mauerlatProfile, mauerlatWallRuns, ceilingTopElevation } from './roof-wall-plate.js';
import { roofLathRows } from './roof-lathing.js';
export function roofLineIntervals(polygon,x){
 const hits=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];if((a[0]<=x&&b[0]>x)||(b[0]<=x&&a[0]>x))hits.push(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));}
 hits.sort((a,b)=>a-b);return Array.from({length:Math.floor(hits.length/2)},(_,i)=>[hits[2*i],hits[2*i+1]]);
}
// Exact fabrication from the common planes. No capacity or new estimate norms.
export function roofFabrication(model,project,calculation,settings,{includeWallPlate=true}={}){
 const rafters=[],members=[],laths=[],counterLaths=[],roofTimbers=[],issues=[],section=String(calculation.roof.rafterStructure?.section||'').replace('x','×');
 const append=(item,material,list)=>{if(item.worldA&&item.worldB)Object.assign(item,roofMemberGeometry(item.worldA,item.worldB,item.profile));list.push(item);members.push({...item,surfaceId:item.faceId,nodeRef:model.faces.find(f=>f.id===item.faceId)?.nodeRef||'',material,source:'Единая геометрия кровли',surface:'Кровля',panels:[],cutLength:item.length+2*Number(settings.endAllowanceMm||0),processing:'Геометрические торцы; опорные врезки, пролёты и крепёж по рабочему узлу'});};
 // The wall plate has its own geometry even when the rafter scheme is a truss
 // or its member section is still missing.
 const plate=mauerlatProfile(project.settings.roof),layout=mauerlatWallRuns(project,{...project.settings.roof,shape:calculation.roof.mainRoofShape},calculation.roof.ridgeAxis);
 const ceiling=ceilingTopElevation(project,calculation,(project.upperFloors?.length||0)+1);
 if(includeWallPlate&&layout.issue)issues.push(layout.issue);
 if(includeWallPlate&&calculation.roof.mauerlatLength>0&&!ceiling.hasCeiling)issues.push('Мауэрлат: потолок отсутствует в расчёте; опора показана на верхе стены. Проверьте рабочий узел.');
 for(const [i,[a,b]]of (includeWallPlate&&calculation.roof.mauerlatLength>0?layout.runs:[]).entries()){
  const z=ceiling.topZ+plate.heightMm/2;
  append({id:`КР-М${i+1}`,name:'Мауэрлат',a,b,worldA:[...a,z],worldB:[...b,z],length:Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])),profile:plate.profile,flat:true,normal:[0,0,1],plateTopZ:ceiling.topZ+plate.heightMm},'Мауэрлат',roofTimbers);
 }
 if(calculation.roof.rafterStructure?.system==='truss'){issues.push('Фермы: геометрия скатов не является раскроем фермы. Внесите пояса, решётку и рабочие узлы проектными элементами.');return {rafters,members,laths,counterLaths,roofTimbers,issues};}
 if(!/^\d+×\d+$/.test(section)){issues.push('Стропила: проектное сечение отсутствует.');return {rafters,members,laths,counterLaths,roofTimbers,issues};}
 const width=Number(section.split('×')[0]),gap=Number(settings.rafterClearGapMm)||Math.max(100,Number(calculation.roof.rafterStructure?.step||.6)*1000);
 for(const f of model.faces.filter(f=>!f.warm)){
  if(f.structureHorizontal){issues.push(`${f.name}: разуклонка не наклоняет стропила; несущую схему задайте вручную.`);continue;}
  const xs=f.polygon.map(p=>p[0]),lo=Math.min(...xs),hi=Math.max(...xs);if(hi-lo<width)continue;
  let positions=clearGapPositions(lo+width/2,hi-width/2,width,gap);
  if(f.group==='main'&&calculation.roof.mainRoofShape==='gable'&&!settings.roofDesign?.manualFaces?.length){
   const axis=calculation.roof.ridgeAxis==='y'?1:0,contour=houseContourPoints(project.upperFloors?.at(-1)||project.plan);
   const min=Math.min(...contour.map(p=>(axis?p.y:p.x)*1000)),max=Math.max(...contour.map(p=>(axis?p.y:p.x)*1000));
   const worldStations=positions.map(x=>roofWorld(f,[x,0])[axis]-min);
   positions=withSipGableRafters(project,worldStations,max-min,width).map(station=>{
    const point=[...f.origin];point[axis]=min+station;point[2]=roofHeight(f,point[0],point[1]);
    return roofLocal(f,point)[0];
   }).sort((a,b)=>a-b);
  }
  const faceRafters=[];
  if(positions.length>500||members.length>10000){issues.push(`${f.name}: превышен лимит деталей кровли, проверьте шаг.`);continue;}
  for(const x of positions)for(const [a,b]of roofLineIntervals(f.polygon,Math.max(lo+.001,Math.min(hi-.001,x)))){
   if(b-a<width)continue;const A=roofWorld(f,[x,a]),B=roofWorld(f,[x,b]),id=`${f.id}-СТ${rafters.length+1}`,item={id,name:f.name,faceId:f.id,a:A.slice(0,2),b:B.slice(0,2),worldA:A,worldB:B,length:Math.ceil(Math.hypot(...A.map((n,i)=>B[i]-n))),profile:section,normal:f.normal,...roofRafterDetail(model,A,B,section)};append(item,'Стропило',rafters);
   faceRafters.push({x,a,b});
  }
  if(calculation.roof.includeCovering||f.group?.startsWith('terrace:')){
   const ys=f.polygon.map(p=>p[1]),v0=Math.min(...ys),v1=Math.max(...ys),step=Number(calculation.roof.lathStep||.35)*1000;
   const transposed=f.polygon.map(([x,y])=>[y,x]);
   for(const row of roofLathRows(v1-v0,step)){const y=v0+row;for(const [a,b]of roofLineIntervals(transposed,y)){
    const supports=faceRafters.filter(r=>y>=r.a-.01&&y<=r.b+.01&&r.x>=a-.01&&r.x<=b+.01).map(r=>r.x).sort((a,b)=>a-b);
    if(supports.length<2)continue;
    let from=supports[0],end=supports.at(-1);while(from<end-.01){const max=Number(settings.stockLengthMm)-2*Number(settings.endAllowanceMm||0),anchors=supports.filter(x=>x>from+.01&&x<=from+max),to=end-from<=max?end:anchors.at(-1);if(to==null){issues.push(`${f.name}: нет стропила для стыка обрешётки.`);break;}
     const A=roofWorld(f,[from,y]),B=roofWorld(f,[to,y]),id=`${f.id}-ОБ${laths.length+1}`;append({id,name:f.name,faceId:f.id,normal:f.normal,a:A.slice(0,2),b:B.slice(0,2),worldA:A,worldB:B,length:Math.ceil(to-from),profile:'25×100',flat:true},'Обрешётка',laths);from=to;
    }
   }}
   if(/^\d+×\d+$/.test(settings.counterLathProfile))for(const r of rafters.filter(r=>r.faceId===f.id))append({...r,id:`${f.id}-КО${counterLaths.length+1}`,profile:settings.counterLathProfile},'Контробрешётка',counterLaths);
   else issues.push(`${f.name}: проектное сечение контробрешётки не задано.`);
  }
 }
 const autoHipProfile=calculation.roof.mainRoofShape==='hip'&&(!settings.roofDesign.enabled||settings.roofDesign.hipGeometry?.mode==='contour')?section:'';
 for(const edge of model.edges.filter(e=>['ridge','hip','valley'].includes(e.kind))){const savedProfile=settings.roofDesign.edgeProfiles?.[edge.id],profile=savedProfile||autoHipProfile,cold=edge.faces.some(id=>model.faces.find(f=>f.id===id)?.warm===false);
  if(edge.kind==='ridge'&&settings.roofFrameConfig?.replaceRidge&&settings.roofSupports.some(s=>s.autoLayout==='roof-support-frame'&&s.type==='purlin'))continue;
  const saved=settings.roofDesign.edgeGeometry?.[edge.id];if(savedProfile&&saved&&saved!==roofEdgeSignature(edge)){issues.push(`${edge.id}: геометрия ребра изменилась; повторно задайте проектное сечение и узел.`);continue;}
  if(!cold)continue;if(!/^\d+×\d+$/.test(profile||'')){issues.push(`${edge.id}: задайте проектное сечение ${edge.kind==='ridge'?'конька':edge.kind==='valley'?'ендовы':'накосного элемента'}.`);continue;}
  append({id:`КР-${edge.id}`,faceId:edge.faces[0],name:edge.kind==='ridge'?'Конёк':edge.kind==='valley'?'Ендова':'Накосное стропило',roofMemberKind:edge.kind,profileSource:savedProfile?'project-override':'rafter-section-proposal',a:edge.a.slice(0,2),b:edge.b.slice(0,2),worldA:edge.a,worldB:edge.b,length:Math.ceil(edge.length),profile},'Элемент ребра кровли',roofTimbers);
 }
 const mauerlats=roofTimbers.filter(item=>item.name==='Мауэрлат'),unresolvedBearings=[];
 for(const item of includeWallPlate?[...rafters,...roofTimbers.filter(member=>member.roofMemberKind==='hip')]:[]){
  const candidates=mauerlats.flatMap(mauerlat=>{
   const hit=planIntersection(item.worldA,item.worldB,mauerlat.worldA,mauerlat.worldB);
   if(!hit)return [];
   const point=item.worldA.map((value,index)=>value+(item.worldB[index]-value)*hit.t);
   const depth=Number(String(item.profile).split(/[×xх]/)[1])||0,normalZ=item.normal?.[2]||1;
   const notchMm=mauerlat.plateTopZ-(point[2]-depth*normalZ/2),cutDepthMm=notchMm/normalZ;
   return notchMm>=-5&&cutDepthMm<=50?[{mauerlatId:mauerlat.id,point:[point[0],point[1],mauerlat.plateTopZ],notchMm:Math.max(0,cutDepthMm)}]:[];
  }).sort((a,b)=>a.point[2]-b.point[2]||a.mauerlatId.localeCompare(b.mauerlatId));
  if(candidates.length){item.bearingPoint=candidates[0].point;item.bearingMauerlatId=candidates[0].mauerlatId;item.bearingStatus='geometry-only';item.bearingNotchMm=candidates[0].notchMm;
   const member=members.find(member=>member.id===item.id);if(member)Object.assign(member,{bearingPoint:item.bearingPoint,bearingMauerlatId:item.bearingMauerlatId,bearingStatus:item.bearingStatus,bearingNotchMm:item.bearingNotchMm});
  }else{item.bearingStatus='unresolved';const member=members.find(member=>member.id===item.id);if(member)member.bearingStatus='unresolved';unresolvedBearings.push(item.id);}
 }
 if(unresolvedBearings.length)issues.push(`Опирание на мауэрлат не подтверждено для ${unresolvedBearings.length} элементов (${unresolvedBearings.slice(0,5).join(', ')}${unresolvedBearings.length>5?', …':''}): нет пересечения, есть зазор или врезка превышает 50 мм.`);
 if(!includeWallPlate&&rafters.length)issues.push('Кровля террасы/крыльца: опирание стропил на стену и наружный прогон показано геометрически; сечения опор и узлы требуется подтвердить проектом.');
 return {rafters,members,laths,counterLaths,roofTimbers,issues};
}
export function planIntersection(a,b,c,d){
 const vx=b[0]-a[0],vy=b[1]-a[1],wx=d[0]-c[0],wy=d[1]-c[1],den=vx*wy-vy*wx;
 if(Math.abs(den)<1e-9)return null;
 const dx=c[0]-a[0],dy=c[1]-a[1],t=(dx*wy-dy*wx)/den,u=(dx*vy-dy*vx)/den;
 return t>=-1e-6&&t<=1+1e-6&&u>=-1e-6&&u<=1+1e-6?{t:Math.max(0,Math.min(1,t)),u:Math.max(0,Math.min(1,u))}:null;
}
