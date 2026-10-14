import {roofAt,roofWorld} from './roof-project.js';
import {roofLineIntervals} from './roof-fabrication.js';
import {roofGeometrySignature} from './roof-detailing.js';

// Editable geometry only. No truss capacity, connector, fastener or stock is inferred.
export function roofTrussTemplate(project,report,config){
  const a=report.assembly,model=a.roofModel,main=model.faces.filter(f=>f.group==='main');
  const fail=message=>({items:[],errors:[message],warnings:[],counts:{purlins:0,posts:0,trusses:0}});
  if(!main.length)return fail('Нет корректных XYZ-скатов для размещения эскиза ферм.');
  const profile=String(config.purlinProfile||'');
  if(!/^\d+×\d+$/.test(profile))return fail('Для эскиза фермы укажите положительное сечение поясов.');
  if(!Number.isFinite(Number(config.trussDepthMm))||Number(config.trussDepthMm)<100||Number(config.trussDepthMm)>3000)return fail('Глубина эскиза плоской фермы: 100–3000 мм. Это геометрия, не расчёт.');
  if(a.roofShape!=='gable'||main.length!==2||a.floors.at(-1)?.contour.length!==4){const proposal=facetTrussTemplate(model,config,{groups:config.includePlatforms?'all':'main'});return a.rafterSystem==='truss'?proposal:{...proposal,warnings:[...proposal.warnings,'Расчётная модель этой формы не использует систему «ферма». Эскиз не меняет смету; согласуйте схему с конструктором.']};}
  const along=a.axis==='x'?0:1,across=1-along,b=a.bounds,length=along===0?b.width:b.height,span=across===0?b.width:b.height,origin=[b.x,b.y];
  const step=Number(project.settings.productionCutting?.rafterClearGapMm)||Number(project.settings.roof.rafterStep||.6)*1000;
  if(!(step>=100&&step<=3000))return fail('Проверьте проектный шаг ферм.');
  const count=Math.ceil(length/step)+1;
  if(count*9>200)return fail('Более 200 элементов ферм. Увеличьте шаг или задайте схему вручную.');
  const items=[],at=(t,s)=>{const xy=[0,0];xy[along]=origin[along]+t;xy[across]=origin[across]+s;const hits=roofAt({faces:main},...xy);return [...xy,hits.length?Math.max(...hits.map(h=>h.z)):NaN];};
  for(let i=0;i<count;i++){
    const t=length*i/(count-1),left=at(t,0),right=at(t,span),ridge=at(t,span/2);
    if([left,right,ridge].some(p=>!p.every(Number.isFinite)))return fail('Не удалось привязать ферму к двум скатам и коньку.');
    const bottomZ=Math.min(left[2],right[2]),bottom=[...ridge.slice(0,2),bottomZ];
    const leftQuarter=at(t,span/4),rightQuarter=at(t,span*3/4);
    const id=`roof-truss-${i+1}`,segments=[
      ['rafter','верхний пояс 1',left,leftQuarter,'L','LQ'],['rafter','верхний пояс 2',leftQuarter,ridge,'LQ','R'],
      ['rafter','верхний пояс 3',ridge,rightQuarter,'R','RQ'],['rafter','верхний пояс 4',rightQuarter,right,'RQ','E'],
      ['tie','нижний пояс 1',left,bottom,'L','B'],['tie','нижний пояс 2',bottom,right,'B','E'],
      ['brace','решётка 1',leftQuarter,bottom,'LQ','B'],['brace','центральная стойка',ridge,bottom,'R','B'],
      ['brace','решётка 2',rightQuarter,bottom,'RQ','B']
    ];
    for(const [j,[type,name,p,q,nodeStart,nodeEnd]] of segments.entries())items.push({id:`${id}-${j+1}`,type,name:`Ферма ${i+1} · ${name}`,profile,nodeRef:'',trussId:id,trussRole:type==='rafter'?'upperChord':type==='tie'?'lowerChord':'web',nodeStart,nodeEnd,x1:Math.round(p[0]),y1:Math.round(p[1]),z1:Math.round(p[2]),x2:Math.round(q[0]),y2:Math.round(q[1]),z2:Math.round(q[2]),startSupport:'',endSupport:'',foundationRef:'',faceId:main[j===2||j===3||j===5||j===8?1:0].id,autoLayout:'roof-purlins',trussTemplate:true,referenceOnly:true,estimateEnabled:false});
  }
  const extra=config.includePlatforms===false||!model.faces.some(face=>face.group!=='main')?null:facetTrussTemplate(model,config,{groups:'platforms'});
  if(extra?.errors.length)return extra;
  const all=[...items,...(extra?.items||[])];
  if(all.length>200)return fail('Более 200 элементов ферм. Увеличьте шаг или задайте схему вручную.');
  for(const item of all)item.roofSourceKey=roofGeometrySignature(model);
  return {items:all,errors:[],warnings:['Фермы показаны справочно: положение поясов и решётки не является расчётом. Узлы, сечения, устойчивость, опирание и крепёж задаёт конструктор. В смету эскиз не включён.',...(extra?.warnings||[])],counts:{purlins:0,posts:0,trusses:count+(extra?.counts.trusses||0)}};
}

function facetTrussTemplate(model,config,{groups='all'}={}){
  const items=[],warnings=[];let trusses=0;
  for(const face of model.faces){
    if(groups==='platforms'&&face.group==='main'||groups==='main'&&face.group!=='main')continue;
    const xs=face.polygon.map(p=>p[0]),min=Math.min(...xs),max=Math.max(...xs);
    if(max-min<250){warnings.push(`${face.id}: скат слишком узок для шаблона фермы.`);continue;}
    for(const [row,fraction] of [.15,.5,.85].entries()){
      const u=min+(max-min)*fraction;
      for(const [part,[v1,v2]] of roofLineIntervals(face.polygon,u).entries()){
        if(v2-v1<500)continue;
        const A=roofWorld(face,[u,v1]),B=roofWorld(face,[u,v2]),bottomZ=Math.min(A[2],B[2])-(Math.abs(A[2]-B[2])<1?Number(config.trussDepthMm):0),C=[A[0],A[1],bottomZ],D=[B[0],B[1],bottomZ],middle=A.map((n,i)=>(n+B[i])/2),bottomMiddle=C.map((n,i)=>(n+D[i])/2),id=`roof-truss-${face.id}-${row+1}-${part+1}`;
        const segments=[['rafter','верхний пояс 1',A,middle,'TL','TM'],['rafter','верхний пояс 2',middle,B,'TM','TR'],['tie','нижний пояс 1',C,bottomMiddle,'BL','BM'],['tie','нижний пояс 2',bottomMiddle,D,'BM','BR'],['brace','решётка 1',C,middle,'BL','TM'],['brace','решётка 2',D,middle,'BR','TM'],['brace','стойка',bottomMiddle,middle,'BM','TM']];
        let j=0;for(const [type,name,p,q,nodeStart,nodeEnd]of segments){if(Math.hypot(...p.map((n,k)=>q[k]-n))<1)continue;items.push({id:`${id}-${++j}`,type,name:`${face.id} · ферма ${row+1} · ${name}`,profile:config.purlinProfile,nodeRef:'',trussId:id,trussRole:type==='rafter'?'upperChord':type==='tie'?'lowerChord':'web',nodeStart,nodeEnd,x1:Math.round(p[0]),y1:Math.round(p[1]),z1:Math.round(p[2]),x2:Math.round(q[0]),y2:Math.round(q[1]),z2:Math.round(q[2]),startSupport:'',endSupport:'',foundationRef:'',faceId:face.id,autoLayout:'roof-purlins',trussTemplate:true,referenceOnly:true,estimateEnabled:false});}
        trusses++;
      }
    }
  }
  if(!items.length)return {items:[],errors:['Не удалось разместить эскизы ферм на выбранных скатах.'],warnings,counts:{purlins:0,posts:0,trusses:0}};
  if(items.length>200)return {items:[],errors:['Более 200 элементов ферм. Уменьшите число скатов или задайте проектную схему вручную.'],warnings,counts:{purlins:0,posts:0,trusses:0}};
  for(const item of items)item.roofSourceKey=roofGeometrySignature(model);
  warnings.push('Фермы на отдельных скатах — только эскиз. Общие узлы, поперечная устойчивость, фактические опоры и допустимый пролёт не определены.');
  return {items,errors:[],warnings,counts:{purlins:0,posts:0,trusses}};
}
