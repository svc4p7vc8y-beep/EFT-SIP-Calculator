import { houseContourPoints, roomPoints } from '../planner/geometry.js';
import { bearingEdges } from './bearing-walls.js';
import { roofDrawingData } from './roof-drawings.js';
import { sourceIdentity } from '../state/production-identities.js';

export const ASSEMBLY_TYPES={purlin:'Прогон',post:'Стойка опоры',beam:'Несущая балка',rafter:'Дополнительное стропило',brace:'Подкос',tie:'Затяжка',foundation:'Опора фундамента'};
export const productionMark=id=>id&&typeof id==='object'?(id.displayMark||productionMark(id.id)):String(id).replace(/-P(\d+)/g,'-П$1').replace(/-upperFirst/g,'-ВЕРХ-1').replace(/-upperSecond/g,'-ВЕРХ-2').replace(/-lowerFirst/g,'-НИЗ-1').replace(/-lowerSecond/g,'-НИЗ-2').replace(/-inner/g,'-ВНУТР').replace(/-С(\d+)-(left|right)-[\d.]+$/,(_,index,side)=>`-СТП${index}-${side==='left'?'Л':'П'}`);
export const productionFamily=family=>({'pps':'ППС','mineral-wool':'Минвата','csp-pps':'ЦСП / ППС'}[family]||family);
const mm=value=>Math.round(Number(value)*1000);
const finite=value=>value!=='' && value!=null && Number.isFinite(Number(value));
const pointDistance=(p,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
};

export function gableFrameMembers(surface,settings) {
  const ring=surface.geometry[0]?.[0]||[],members=[];
  const add=(a,b,name)=>{const length=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));if(length<1)return;
    members.push({id:`${surface.id}-К${members.length+1}`,a,b,material:name,profile:settings.gableFrameProfile,
      length,cutLength:length+2*Number(settings.endAllowanceMm||0),source:'Каркас фронтона',surface:surface.name,surfaceId:surface.id,panels:[],role:'frame',processing:'Углы торцов и узлы по проекту'});};
  for(let i=0;i<ring.length-1;i++)add(ring[i],ring[i+1],'Обвязка фронтона');
  const anchors=[...new Set(ring.map(p=>p[0]))].sort((a,b)=>a-b),positions=new Set(anchors);
  for(let i=0;i<anchors.length-1;i++){const count=Math.ceil((anchors[i+1]-anchors[i])/settings.frameStepMm);for(let j=1;j<count;j++)positions.add(anchors[i]+(anchors[i+1]-anchors[i])*j/count);}
  for(const x of [...positions].sort((a,b)=>a-b)){
    if(ring.some((a,i)=>i<ring.length-1&&Math.abs(a[0]-x)<.01&&Math.abs(ring[i+1][0]-x)<.01))continue;
    const levels=[];
    for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];if(Math.abs(a[0]-b[0])>.001 && x>=Math.min(a[0],b[0])-.001&&x<=Math.max(a[0],b[0])+.001)levels.push({y:a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]),slope:(b[1]-a[1])/(b[0]-a[0])});}
    if(levels.length){levels.sort((a,b)=>a.y-b.y);const boardThickness=Number(settings.gableFrameProfile.split('×')[0]),top=levels.at(-1);
      const a=[x,levels[0].y+boardThickness],b=[x,top.y-boardThickness*Math.hypot(1,top.slope)];
      if(b[1]>a[1])add(a,b,'Стойка фронтона');}
  }
  return members;
}

// Project positions only. No loads, member capacity or foundation bearing are inferred.
export function calculateAssemblyPlan(project,calculation,settings) {
  const roof=calculation.roof||{},g=roof.geometry||{};
  const plans=calculation.metrics?.floorPlans?.map(item=>item.plan)||[project.plan];
  const floors=plans.map((plan,index)=>({floor:index+1,contour:houseContourPoints(plan).map(p=>[mm(p.x),mm(p.y)]),bearing:bearingEdges(plan).map(e=>({a:[mm(e.a.x),mm(e.a.y)],b:[mm(e.b.x),mm(e.b.y)],profile:e.profile})),
    openings:(plan.openings||[]).filter(o=>o.include!==false).map((o,i)=>({name:`${o.type==='window'?'Окно':'Дверь'} ${i+1}`,x:mm(o.x),y:mm(o.y),width:mm(o.width),orientation:o.orientation,type:o.type})),
    rooms:(plan.rooms||[]).filter(r=>r.include!==false).map((r,i)=>({name:r.name||`Комната ${i+1}`,bearing:r.bearing===true,points:roomPoints(r).map(p=>[mm(p.x),mm(p.y)])}))}));
  const contour=floors.at(-1).contour,axis=roof.ridgeAxis||'x';
  const xs=contour.map(p=>p[0]),ys=contour.map(p=>p[1]);
  const bounds={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
  const axisLength=axis==='x'?bounds.width:bounds.height,span=axis==='x'?bounds.height:bounds.width;
  const eave=Math.max(0,mm(g.roofSpan||span/1000)-span)/2,gable=Math.max(0,mm(g.roofLength||axisLength/1000)-axisLength)/2;
  const at=(along,across)=>axis==='x'?[bounds.x+along,bounds.y+across]:[bounds.x+across,bounds.y+along];
  const rafters=[],members=[],issues=[];
  const binding=[];
  issues.push(...(calculation.foundation?.bindingIssues||[]));
  if(project.services.foundation){for(const [index,line] of (calculation.foundation?.bindingLines||project.plan.bindingLines||[]).filter(l=>l.include!==false).entries()){
    const a=[mm(line.x1),mm(line.y1)],b=[mm(line.x2),mm(line.y2)],length=Math.round(Math.hypot(b[0]-a[0],b[1]-a[1]));
    if(!length)continue;const profile=calculation.foundation?.bindingProfile||'50×150',layers=calculation.foundation?.bindingLayers||3;
    binding.push({id:`ОБ-${index+1}`,a,b,length,profile,layers});
    for(let layer=1;layer<=layers;layer++)members.push({id:`ОБ-${index+1}-${layer}`,material:layers===1?'Брус обвязки':'Доска пакета обвязки',profile,length,cutLength:length+2*Number(settings.endAllowanceMm||0),surface:'Обвязка',source:'Линии обвязки плана',panels:[],processing:'Стыки на опорах и соединения по проекту'});
  }}
  const simple=['gable','flat','tiered'].includes(roof.mainRoofShape);
  const rectangular=contour.length===4 && contour.every((a,i)=>{const b=contour[(i+1)%contour.length];return a[0]===b[0]||a[1]===b[1];});
  const frame=roof.rafterStructure||{};
  const count=Number(frame.pairCount)||0;
  if(project.services.roof && roof.coldSlopeArea>0 && simple && rectangular && frame.system!=='truss' && count<=500){
    const runs=roof.mainRoofShape==='flat'?[{a:-eave,b:span+eave,length:g.slopeLength,name:'Односкатная'}]:roof.mainRoofShape==='tiered'?
      [{a:-eave,b:mm(g.upperSpan)+mm(g.jointOverhang||0),length:g.upperSlopeLength,name:'Верхний уровень',level:'upper'}, {a:mm(g.upperSpan),b:span+eave,length:g.lowerSlopeLength,name:'Нижний уровень',level:'lower'}]:
      [{a:-eave,b:span/2,length:g.slopeLength,name:'Первый скат'},{a:span+eave,b:span/2,length:g.slopeLength,name:'Второй скат'}];
    const upperFirst=project.settings.roof?.tiered?.upperSide!=='second';
    const warmLevel=project.settings.roof?.tiered?.warmLevel||'upper';
    let index=0;
    for(let i=0;i<count;i++)for(const run of runs){
      if(roof.mainRoofShape==='tiered' && roof.warmSlopeArea>0 && (warmLevel==='both'||warmLevel===run.level))continue;
      const a=roof.mainRoofShape==='tiered'&&!upperFirst?span-run.a:run.a,b=roof.mainRoofShape==='tiered'&&!upperFirst?span-run.b:run.b;
      const along=count>1?axisLength*i/(count-1):axisLength/2;
      const id=`КР-СТ${++index}`,length=roof.mainRoofShape==='gable'&&settings.rafterGeometry!=='estimate'
        ?Math.ceil(Math.hypot(span/2,mm(project.settings.roof.ridgeHeight))*(span/2+eave)/(span/2||1)):mm(run.length);
      const item={id,a:at(along,a),b:at(along,b),length,name:run.name,profile:String(frame.section||'').replace('x','×')};
      rafters.push(item);
      members.push({id,material:'Стропило',profile:item.profile,length,cutLength:length+2*Number(settings.endAllowanceMm||0),source:'Геометрия кровли',surface:'Кровля',panels:[],processing:'Углы и опорные врубки по рабочему узлу'});
    }
  } else if(project.services.roof && roof.coldSlopeArea>0)issues.push('Стропила сложной кровли или фермы: внесите детали по рабочему проекту.');
  const roofTimbers=[];
  const addRoofMember=(id,material,profile,length,a,b)=>{members.push({id,material,profile,length,cutLength:length+2*Number(settings.endAllowanceMm||0),source:'Геометрия кровли',surface:'Кровля',panels:[],processing:'Соединение длинных элементов и опорные узлы по проекту'});if(a&&b)roofTimbers.push({id,material,profile,length,a,b});};
  if(project.services.roof && rectangular && roof.mauerlatLength>0){
    const runs=roof.mauerlatLayout==='perimeter'?contour.map((a,i)=>[a,contour[(i+1)%contour.length]]):[[at(0,0),at(axisLength,0)],[at(0,span),at(axisLength,span)]];
    if(roof.mainRoofShape==='tiered'){const junction=project.settings.roof?.tiered?.upperSide==='second'?span-mm(g.upperSpan):mm(g.upperSpan);runs.push([at(-gable,junction),at(axisLength+gable,junction)]);}
    runs.forEach(([a,b],i)=>addRoofMember(`КР-М${i+1}`,'Мауэрлат','100×150',Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])),a,b));
  }
  if(project.services.roof && roof.layeredRidgeLength>0)for(let i=1;i<=2;i++)addRoofMember(`КР-КН${i}`,'Коньковая доска · ряд','100×50',mm(roof.layeredRidgeLength),...(roof.mainRoofShape==='gable'&&rectangular?[at(-gable,span/2),at(-gable+mm(roof.layeredRidgeLength),span/2)]:[]));
  const laths=[],counterLaths=[];
  if(project.services.roof&&roof.includeCovering&&rafters.length){
    for(const name of [...new Set(rafters.map(r=>r.name))]){
      const run=rafters.filter(r=>r.name===name),sample=run[0],rowCount=Math.ceil(sample.length/mm(roof.lathStep||.35));
      const alongIndex=axis==='x'?0:1,acrossIndex=1-alongIndex;
      const anchors=[-gable,...run.map(r=>r.a[alongIndex]-(axis==='x'?bounds.x:bounds.y)),axisLength+gable].sort((a,b)=>a-b);
      const spans=[];let start=anchors[0];
      while(start<anchors.at(-1)-.1){const choices=anchors.filter(x=>x>start+.1&&x-start<=settings.stockLengthMm-2*Number(settings.endAllowanceMm||0));const end=choices.at(-1)||anchors.find(x=>x>start+.1);spans.push([start,end]);start=end;}
      for(let row=0;row<=rowCount;row++)for(const [from,to]of spans){const t=row/rowCount,across=sample.a[acrossIndex]+(sample.b[acrossIndex]-sample.a[acrossIndex])*t-(axis==='x'?bounds.y:bounds.x),a=at(from,across),b=at(to,across),id=`КР-ОБ${laths.length+1}`,length=Math.round(to-from);
        const item={id,a,b,length,profile:'25×100',name,slopeY:Math.round(sample.length*t)};laths.push(item);members.push({...item,material:'Обрешётка',cutLength:length+2*Number(settings.endAllowanceMm||0),source:'Шаг обрешётки текущей кровли',surface:'Кровля',panels:[],processing:'Стыки на стропилах; первый ряд и крепление уточнить по покрытию'});
      }
    }
    if(/^\d+×\d+$/.test(settings.counterLathProfile)&&settings.counterLathProfile.split('×').every(v=>Number(v)>0))for(const r of rafters){const item={...r,id:`КР-КО${counterLaths.length+1}`,profile:settings.counterLathProfile};counterLaths.push(item);members.push({...item,material:'Контробрешётка',cutLength:r.length+2*Number(settings.endAllowanceMm||0),source:'Проектное сечение',surface:'Кровля',panels:[],processing:'Вентиляционный зазор и крепление по проекту'});}
    else issues.push('Контробрешётка: укажите проектное сечение в исходных данных раскроя. Материалы не добавлены автоматически.');
  }
  const supports=[],ids=new Set();
  for(const [i,item] of settings.roofSupports.entries()){
    const mark=`ОП-${i+1}`;
    if(ids.has(item.id)){issues.push(`${mark}: повторяется идентификатор опоры.`);continue;}ids.add(item.id);
    if(!['x1','y1','z1','x2','y2','z2'].every(key=>finite(item[key])&&Math.abs(Number(item[key]))<=100000)){
      issues.push(`${mark}: заполните координаты и отметки высоты в мм.`);continue;
    }
    const a=[Number(item.x1),Number(item.y1),Number(item.z1)],b=[Number(item.x2),Number(item.y2),Number(item.z2)];
    const length=Math.ceil(Math.hypot(...a.map((value,j)=>b[j]-value)));
    if(item.type!=='foundation' && (!length || !/^\d+(?:[×хx]\d+)+$/.test(item.profile) || item.profile.split(/[×хx]/).some(value=>!(Number(value)>0)))){issues.push(`${mark}: задайте длину геометрией и положительное сечение в формате 100×150.`);continue;}
    if(item.type==='post' && (Math.hypot(a[0]-b[0],a[1]-b[1])>.01 || b[2]<=a[2])){issues.push(`${mark}: вертикальная стойка должна иметь одинаковые X/Y сверху и снизу, отметка верха — выше низа.`);continue;}
    const support={...item,...(item.hasStableSourceId===false?{}:sourceIdentity('roof-support',item.id)),mark,a,b,length,name:item.name||`${ASSEMBLY_TYPES[item.type]} ${i+1}`};
    supports.push(support);
    if(item.type!=='foundation'&&!item.referenceOnly){
      if(!item.nodeRef.trim())issues.push(`${mark}: укажите рабочий узел.`);
      members.push({id:mark,...(item.hasStableSourceId===false?{}:sourceIdentity('roof-support',item.id)),material:ASSEMBLY_TYPES[item.type],profile:item.profile.replace(/[xх]/g,'×'),length,cutLength:length+2*Number(settings.endAllowanceMm||0),source:'Проектная опора',surface:support.name,panels:[],nodeRef:item.nodeRef,processing:'По рабочему узлу'});
    }
  }
  const byId=new Map(supports.map(s=>[s.id,s]));
  for(const post of supports.filter(s=>s.type==='post'&&s.upperSupport)){
    const upper=byId.get(post.upperSupport);
    if(!upper||upper.referenceOnly||!['purlin','beam'].includes(upper.type)){issues.push(`${post.mark}: верхний прогон не найден или не является несущим элементом.`);continue;}
    const dx=upper.b[0]-upper.a[0],dy=upper.b[1]-upper.a[1],t=Math.max(0,Math.min(1,((post.b[0]-upper.a[0])*dx+(post.b[1]-upper.a[1])*dy)/(dx*dx+dy*dy||1)));
    const z=upper.a[2]+t*(upper.b[2]-upper.a[2]);
    if(pointDistance(post.b,upper.a,upper.b)>50||Math.abs(post.b[2]-z)>50){issues.push(`${post.mark}: верх стойки не совпадает с ${upper.mark}.`);upper.connectionValid=false;}
  }
  const pathCache=new Map();
  const trace=(id,visited=new Set())=>{
    const item=byId.get(id);
    if(!item)return {complete:false,text:'опора не задана'};
    if(item.referenceOnly)return {complete:false,text:`${item.mark}: справочная линия, не несущая опора`};
    if(visited.has(id))return {complete:false,text:`${item.mark}: цикл опор`};
    if(pathCache.has(id))return pathCache.get(id);
    if(item.type==='foundation')return {complete:!!item.foundationRef.trim(),text:`${item.mark} ${item.foundationRef||'фундамент не указан'}`};
    const next=new Set([...visited,id]);
    const refs=item.type==='post'?[item.startSupport]:[item.startSupport,item.endSupport,...supports.filter(s=>s.type==='post'&&s.upperSupport===item.id&&!s.referenceOnly).map(s=>s.id)];
    const paths=refs.map(ref=>trace(ref,next));
    const path={complete:item.connectionValid!==false && paths.every(p=>p.complete),text:`${item.mark} → ${paths.map(p=>p.text.slice(0,1000)).join(' / ')}`.slice(0,2200)};
    pathCache.set(id,path);return path;
  };
  for(const item of supports){
    const refs=item.type==='foundation'?[]:item.type==='post'?[[item.startSupport,item.a]]:[[item.startSupport,item.a],[item.endSupport,item.b]];
    for(const [id,p] of refs){const target=byId.get(id);if(target){
      const dx=target.b[0]-target.a[0],dy=target.b[1]-target.a[1];
      const t=Math.max(0,Math.min(1,((p[0]-target.a[0])*dx+(p[1]-target.a[1])*dy)/(dx*dx+dy*dy||1)));
      const z=target.type==='post'?Math.max(target.a[2],target.b[2]):target.a[2]+t*(target.b[2]-target.a[2]);
      if(pointDistance(p,target.a,target.b)>50 || Math.abs(p[2]-z)>50){item.connectionValid=false;issues.push(`${item.mark}: опирание на ${target.mark} не совпадает в плане или по высоте (расстояние более 50 мм).`);}
    }}
  }
  supports.forEach(item=>{item.loadPath=trace(item.id);if(!item.referenceOnly&&!item.loadPath.complete)issues.push(`${item.mark}: путь нагрузки до фундамента не заполнен, содержит цикл или несовпадающее опирание.`);});
  const roofOutline=rectangular?[at(-gable,-eave),at(axisLength+gable,-eave),at(axisLength+gable,span+eave),at(-gable,span+eave)]:contour;
  const assembly={floors,bounds,axis,roofOutline,ridge:roof.mainRoofShape==='gable'?[at(0,span/2),at(axisLength,span/2)]:[],rafters,roofTimbers,laths,counterLaths,supports,members,issues,binding,foundationType:project.settings.piles?.pileType||'screw',blockDimensions:project.settings.piles?.blockDimensions,piles:(calculation.foundation?.points||[]).map(p=>[mm(p.x),mm(p.y)])};
  assembly.roofDrawing=roofDrawingData(assembly,roof,project.settings.roof,settings.rafterGeometry);
  issues.push(...assembly.roofDrawing.warnings);
  assembly.roofShape=roof.mainRoofShape;
  assembly.roofGeometry=g;
  assembly.rafterSystem=frame.system;
  return assembly;
}

// Unique straight cuts on each blank map plus shaped cuts; not a CNC/toolpath forecast.
export function calculateCutOperations(report) {
  const lines=[];
  const halfKerf=Number(report.settings.kerfMm||0)/2;
  const add=(scope,a,b)=>{if(Math.hypot(a[0]-b[0],a[1]-b[1])>.01)lines.push({scope,a,b});};
  for(const sheet of report.panelStock.sheets)for(const p of sheet.parts){
    const x=p.x,y=p.y,right=x+p.width,top=y+p.height;
    if(x>.01)add(sheet.id,[x-halfKerf,y],[x-halfKerf,top]);if(y>.01)add(sheet.id,[x,y-halfKerf],[right,y-halfKerf]);
    if(right<sheet.width-.01)add(sheet.id,[right+halfKerf,y],[right+halfKerf,top]);if(top<sheet.height-.01)add(sheet.id,[x,top+halfKerf],[right,top+halfKerf]);
  }
  const groups=new Map();
  for(const line of lines){const vertical=Math.abs(line.a[0]-line.b[0])<.01,key=`${line.scope}:${vertical?'В':'Г'}:${(vertical?line.a[0]:line.a[1]).toFixed(3)}`;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(vertical?[line.a[1],line.b[1]]:[line.a[0],line.b[0]]);}
  let panelCuts=0,panelLength=0;
  for(const spans of groups.values()){spans.forEach(s=>s.sort((a,b)=>a-b));spans.sort((a,b)=>a[0]-b[0]);let start=null,end=null;
    for(const [a,b]of spans){if(start==null){start=a;end=b;}else if(a<=end+.01)end=Math.max(end,b);else{panelCuts++;panelLength+=end-start;start=a;end=b;}}
    if(start!=null){panelCuts++;panelLength+=end-start;}}
  let shapedCuts=0,shapedLength=0;
  for(const p of report.parts)for(const ring of p.shape)for(let i=0;i<ring.length-1;i++){
    const a=ring[i],b=ring[i+1];
    const border=(Math.abs(a[0]-p.x)<.01&&Math.abs(b[0]-p.x)<.01)||(Math.abs(a[0]-p.x-p.width)<.01&&Math.abs(b[0]-p.x-p.width)<.01)||(Math.abs(a[1]-p.y)<.01&&Math.abs(b[1]-p.y)<.01)||(Math.abs(a[1]-p.y-p.height)<.01&&Math.abs(b[1]-p.y-p.height)<.01);
    if(!border){shapedCuts++;shapedLength+=Math.hypot(a[0]-b[0],a[1]-b[1]);}
  }
  let timberCuts=0;
  for(const bar of report.timberStock.bars){const cuts=new Set();if(bar.parts[0]?.start>.01)cuts.add(0);for(const p of bar.parts){if(p.start+p.length<report.settings.stockLengthMm-.01)cuts.add((p.start+p.length).toFixed(3));}timberCuts+=cuts.size;}
  return {panelCuts:panelCuts+shapedCuts,panelCutLengthM:(panelLength+shapedLength)/1000,shapedCuts,timberCuts,
    fullPanels:report.parts.filter(p=>Math.abs((p.blankWidth??p.width)-report.panelWidth)<.01&&Math.abs((p.blankHeight??p.height)-report.panelLength)<.01&&Math.abs(p.area-report.panelWidth*report.panelLength)<1).length};
}
