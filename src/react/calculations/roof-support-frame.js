import { generateRoofSupportLayout } from './auto-roof-supports.js';
import { clearGapPositions } from './clear-gap-framing.js';
import { productionLevels } from './production-levels.js';
import {roofAt} from './roof-project.js';
export const FRAME_LAYOUT='roof-support-frame';
export function roofFrameSource(project,assembly,settings){
 return JSON.stringify([assembly.bounds,assembly.axis,assembly.roofShape,assembly.roofDrawing?.model?assembly.roofModel.faces.map(f=>f.vertices):assembly.roofDrawing?.sections.map(s=>[s.a,s.b,s.profile]),productionLevels(project,assembly.floors.length).roofBase,project.settings.sip.ceilingThickness,settings.stockLengthMm,settings.endAllowanceMm]);
}
// A geometric support wall, not an engineered truss. Heights use the existing roof sections.
export function roofSupportFrame(project,report,config={}) {
 const profile=config.profile==='50×100'?'50×100':'50×150',variant=config.variant||'double',gap=Number(config.gapMm)||590;
 const roofBase=report.assembly.roofDrawing?.model?report.assembly.roofModel.roofBase:productionLevels(project,report.assembly.floors.length).roofBase;
 const baseZ=config.baseZ===''||config.baseZ==null?roofBase+Number(project.settings.sip.ceilingThickness)/2:Number(config.baseZ);
 const template=generateRoofSupportLayout(project,report,{variant,baseZ,purlinProfile:profile,postProfile:profile,postCount:2});
 const fail=message=>({items:[],errors:[message],warnings:[],counts:{frames:0,posts:0},baseZ});
 if(!(Number.isFinite(gap)&&gap>=100&&gap<=1200))return fail('Просвет опорного каркаса: 100–1200 мм.');
 if(template.errors.length)return {...template,counts:{frames:0,posts:0}};
 if(!report.assembly.roofDrawing?.sections.length)return fail('Каркас под стропилами требует стропильной кровли. Для SIP-крыши используйте проектные прогоны.');
 const items=[],d=report.assembly.roofDrawing;
 for(const [i,beam]of template.items.filter(s=>s.type==='purlin').entries()){
  const face=d.model?roofAt(d.model,beam.x1+.01,beam.y1+.01)[0]?.face:null;
  const sec=d.model&&face?{profile:report.assembly.rafters.find(r=>r.faceId===face.id)?.profile||'',a:[0,0],b:[1,Math.hypot(face.normal[0],face.normal[1])/face.normal[2]]}:d.sections.find(s=>{if(!s.a)return false;const x=(d.across===0?beam.x1:beam.y1)-d.origin[d.across];return x>=Math.min(s.a[0],s.b[0])-.1&&x<=Math.max(s.a[0],s.b[0])+.1;});
  if(!sec||!/^\d+×\d+$/.test(sec.profile)||sec.profile.split('×').some(n=>!(Number(n)>0)))return fail('Каркас находится вне плоскости стропил либо проектное сечение не задано.');
  const depth=Number(sec.profile.split(/[×xх]/)[1]),slope=Math.abs((sec.b[1]-sec.a[1])/(sec.b[0]-sec.a[0])),cos=1/Math.sqrt(1+slope*slope);
  // Lowest underside across the width of the flat chord: no invented rafter notch.
  const top=beam.z1-depth/(2*cos)-Number(profile.split('×')[1])/2*slope;
  const upperZ=top-25,lowerZ=baseZ+25,start=baseZ+50,end=top-50;
  if(!(end>start))return fail('Между потолком и стропилами недостаточно высоты для двух поясов и стоек.');
  const L=Math.hypot(beam.x2-beam.x1,beam.y2-beam.y1),ux=(beam.x2-beam.x1)/L,uy=(beam.y2-beam.y1)/L,id=`frame-${i+1}`;
  const material=(project.priceMat||[]).find(r=>{const dims=r.name.replace(/[×хx*]/g,'×').match(/(\d+)\s*×\s*(\d+)/);return ['м3','м³'].includes(r.unit)&&dims&&`${dims[1]}×${dims[2]}`===profile;});
  const shared={profile,autoLayout:FRAME_LAYOUT,frameGroup:id,frameClearGapMm:gap,nodeRef:'',estimateCatalogId:material?.id||'',estimateEnabled:!!material};
  const posts=clearGapPositions(25,L-25,50,gap).map((x,j)=>({ ...shared,id:`${id}-s${j+1}`,type:'post',normal:[-uy,ux,0],name:`Каркас ${i+1} · стойка ${j+1}`,x1:beam.x1+ux*x,y1:beam.y1+uy*x,x2:beam.x1+ux*x,y2:beam.y1+uy*x,z1:start,z2:end,upperSupport:`${id}-top`,startSupport:`${id}-bottom`,endSupport:'',foundationRef:''}));
  const maximum=Number(report.settings.stockLengthMm)-2*Number(report.settings.endAllowanceMm||0),breaks=[0];
  while(breaks.at(-1)<L-.01){const from=breaks.at(-1),candidates=posts.map(p=>(p.x1-beam.x1)*ux+(p.y1-beam.y1)*uy).filter(x=>x>from+.1&&x-from<=maximum);const end=L-from<=maximum?L:candidates.at(-1);if(end==null)return fail('Нет стойки для стыка пояса в пределах длины заготовки.');breaks.push(end);}
  const chords=[];
  for(let j=0;j<breaks.length-1;j++)for(const [suffix,z,type,title]of [['bottom',lowerZ,'beam','нижний пояс'],['top',upperZ,'purlin','верхний пояс']]){
    const from=breaks[j],to=breaks[j+1],under=posts.filter(p=>{const x=(p.x1-beam.x1)*ux+(p.y1-beam.y1)*uy;return x>=from-.01&&x<=to+.01;});
    const piece={...shared,id:`${id}-${suffix}${j||''}`,type,name:`Каркас ${i+1} · ${title} · участок ${j+1}`,flat:true,x1:beam.x1+ux*from,y1:beam.y1+uy*from,x2:beam.x1+ux*to,y2:beam.y1+uy*to,z1:z,z2:z,startSupport:suffix==='top'?under[0]?.id||'':'',endSupport:suffix==='top'?under.at(-1)?.id||'':'',foundationRef:''};
    chords.push(piece);for(const post of under)post[suffix==='top'?'upperSupport':'startSupport']=piece.id;
  }
  items.push(...chords,...posts);
 }
 if(items.length>200)return fail('Более 200 деталей каркаса: уменьшите число линий опор или разделите проект.');
 return {items,errors:[],warnings:['Опирание нижнего пояса, устойчивость каркаса, крепёж и несущая способность потолка требуют рабочего узла. Врубки не назначены автоматически. Стыки поясов размещены на стойках; соединение проверить по проекту.'],counts:{frames:new Set(items.map(s=>s.frameGroup)).size,posts:items.filter(s=>s.type==='post').length},baseZ};
}
