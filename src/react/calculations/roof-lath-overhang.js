import {roofWorld} from './roof-project.js';
import {roofLineIntervals} from './roof-fabrication.js';
import {roofMemberGeometry} from './roof-rafter-detail.js';
import {roofLathRows} from './roof-lathing.js';
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
export const LATH_OVERHANG_FIELDS=[['lathOverhangFrontM','Вынос обрешётки · передний торец'],['lathOverhangBackM','Вынос обрешётки · задний торец']];
export function lathOverhangMm(roof){return LATH_OVERHANG_FIELDS.map(([key])=>Math.max(0,Math.min(2,Number(roof[key])||0))*1000);}
export function roofCoverExtension(model,roof,axis='x',stepMm=350){
 const amounts=lathOverhangMm(roof),index=axis==='y'?1:0,main=model.faces.filter(f=>f.group==='main');
 if(!amounts.some(Boolean)||!main.length)return {faces:model.faces,extraAreaM2:0,extraLathM:0,issues:[]};
 if(roof.shape==='flat'&&(roof.flatCoverSystem==='bitumen'||['flashing','closed','open'].includes(roof.flatParapetMode)))return {faces:model.faces,extraAreaM2:0,extraLathM:0,issues:['Вынос обрешётки: для рулонной кровли и парапета задайте отдельный рабочий узел основания; автоматическое удлинение не применено.']};
 const coords=main.flatMap(f=>f.vertices.map(p=>p[index])),min=Math.min(...coords),max=Math.max(...coords),issues=[];let extraAreaM2=0,extraLathM=0;
 const faces=model.faces.map(f=>{if(f.group!=='main')return f;
  const aligned=Math.abs(Math.abs(f.u[index])-1)<1e-6&&Math.abs(f.v[index])<1e-6&&f.polygon.every((p,i)=>{const q=f.polygon[(i+1)%f.polygon.length];return Math.abs(p[0]-q[0])<.01||Math.abs(p[1]-q[1])<.01;});
  if(f.manual||!aligned){issues.push(`${f.name}: боковой вынос обрешётки требует отдельного контура покрытия для проектного или косого ската.`);return f;}
  const polygon=f.polygon.map(p=>{const x=roofWorld(f,p)[index],delta=Math.abs(x-min)<.01?-amounts[0]:Math.abs(x-max)<.01?amounts[1]:0;return [p[0]+delta/f.u[index],p[1]];});
  const before=area(f.polygon),after=area(polygon);extraAreaM2+=(after-before)/1e6;
  const ys=f.polygon.map(p=>p[1]),lo=Math.min(...ys),hi=Math.max(...ys);
  for(const row of roofLathRows(hi-lo,stepMm)){const y=lo+row,span=p=>roofLineIntervals(p.map(([x,v])=>[v,x]),y).reduce((s,[a,b])=>s+b-a,0);extraLathM+=(span(polygon)-span(f.polygon))/1000;}
  return {...f,polygon,vertices:polygon.map(p=>roofWorld(f,p)),area:after/1e6,lathOverhang:true};
 });return {faces,extraAreaM2,extraLathM,issues};
}
export function applyLathOverhang(assembly,project,settings){
 const roof=project.settings.roof,amounts=lathOverhangMm(roof);if(!amounts.some(Boolean))return;
 const extension=roofCoverExtension(assembly.roofModel,roof,assembly.axis,Number(roof.lathStep||.35)*1000);
 assembly.roofCoverModel={...assembly.roofModel,faces:extension.faces};assembly.issues.push(...extension.issues);
 if(!extension.faces.some(f=>f.lathOverhang))return;
 assembly.roofCoverPoints=extension.faces.filter(f=>f.group==='main').flatMap(f=>f.vertices.map(p=>p.slice(0,2)));
 const index=assembly.axis==='y'?1:0,main=assembly.roofModel.faces.filter(f=>f.group==='main'),coords=main.flatMap(f=>f.vertices.map(p=>p[index])),lo=Math.min(...coords),hi=Math.max(...coords),groups=new Map(),kept=[];
 for(const item of assembly.laths){const f=assembly.roofModel.faces.find(f=>f.id===item.faceId),A=item.worldA||item.a,B=item.worldB||item.b;
  if(f&&f.group!=='main'||item.referenceOnly||f&&!extension.faces.find(c=>c.id===f.id)?.lathOverhang||Math.abs(A[1-index]-B[1-index])>.1){kept.push(item);continue;}
  const key=`${item.faceId||item.name}:${Math.round(A[1-index]*1000)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);
 }
 const removed=new Set(),added=[];
 for(const items of groups.values()){
  items.sort((a,b)=>Math.min((a.worldA||a.a)[index],(a.worldB||a.b)[index])-Math.min((b.worldA||b.a)[index],(b.worldB||b.b)[index]));
  const runs=[];for(const item of items){const A=item.worldA||item.a,B=item.worldB||item.b,from=Math.min(A[index],B[index]),to=Math.max(A[index],B[index]),last=runs.at(-1);if(last&&from<=last.to+.1){last.to=Math.max(last.to,to);last.items.push(item);}else runs.push({from,to,items:[item]});}
  for(const run of runs){const base=run.items[0],A=base.worldA||base.a,B=base.worldB||base.b,at=x=>A.map((n,k)=>n+(B[k]-n)*(x-A[index])/(B[index]-A[index]));let from=run.from-(Math.abs(run.from-lo)<1?amounts[0]:0),end=run.to+(Math.abs(run.to-hi)<1?amounts[1]:0),part=0;
   const members=run.items.map(item=>assembly.members.find(m=>m.id===item.id));run.items.forEach(item=>removed.add(item.id));
   const warm=assembly.roofModel.faces.find(f=>f.id===base.faceId)?.warm,anchors=(warm?assembly.counterLaths:assembly.rafters).filter(r=>base.faceId?r.faceId===base.faceId:r.name===base.name).map(r=>(r.worldA||r.a)[index]).sort((a,b)=>a-b),max=Number(settings.stockLengthMm)-2*Number(settings.endAllowanceMm||0);
   while(from<end-.01){const stop=end-from<=max?end:anchors.filter(x=>x>from+.01&&x<=from+max).at(-1)??(warm&&from+max>run.from&&from+max<=run.to?from+max:undefined),to=stop??end;
    if(stop==null)assembly.issues.push(`${base.name}: для выноса обрешётки нет опоры стыка в пределах заготовки; задайте проектный узел.`);
    const a=at(from),b=at(to),length=Math.ceil(Math.hypot(...a.map((n,k)=>b[k]-n))),id=run.items[part]?.id||`${base.id}:overhang:${part+1}`,item={...base,id,a:a.slice(0,2),b:b.slice(0,2),length};
    if(base.worldA)Object.assign(item,{worldA:a,worldB:b},roofMemberGeometry(a,b,base.profile));
    kept.push(item);added.push({...members[part]||members[0],...item,cutLength:length+2*Number(settings.endAllowanceMm||0)});from=to;part++;
   }
  }
 }
 assembly.laths=kept;assembly.members=assembly.members.filter(m=>!removed.has(m.id)).concat(added);
}
