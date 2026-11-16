import {RAILING_LABOR_DEFAULT} from '../data/railing-rates.js';
import {normalizeRailings} from '../../calculations/railing-model.js';
export {normalizeRailings} from '../../calculations/railing-model.js';
import {calculateTerraceRoof} from '../../calculations/terrace-model.js';
import {reinforcementBoardCount} from './partition-construction.js';

const length=(a,b)=>Math.hypot(...a.map((v,i)=>b[i]-v));
const round=n=>Math.round(n*1000)/1000;
export function platformRoofPostPlan(platform,result){
 if(result?.sharedPosts)return result.sharedPosts;
 const n=Math.min(500,Number(result?.postCount)||0),side=result?.side,profile=(result?.postSection||'150x100').replace('x','×');
 return Array.from({length:n},(_,i)=>{const t=i/(n-1||1),q=side==='left'?[platform.x,platform.y+platform.h*t]:side==='right'?[platform.x+platform.w,platform.y+platform.h*t]:side==='top'?[platform.x+platform.w*t,platform.y]:[platform.x+platform.w*t,platform.y+platform.h];return {id:`platform:${platform.id}:post:${i+1}`,a:[q[0]*1000,q[1]*1000,Number(platform.deckHeightMm)||0],profile};});
}
export function railingFloorZ(platform,point){
 const deck=Number(platform.deckHeightMm)||0,side=platform.stairSide||'bottom',run=Number(platform.steps||0)*Number(platform.tread||.3);
 if(!run)return deck;
 const distance=Math.max(0,side==='top'?-point[1]:side==='left'?-point[0]:side==='right'?point[0]-platform.w:point[1]-platform.h);
 return deck-Math.min(1,distance/run)*Number(platform.steps||0)*Number(platform.riser||.18)*1000;
}
export function railingLayout(platform,roofPosts=[],postProfile='150×100'){
 const members=[],runs=[],posts=new Map(),issues=[],seen=new Set(),cfg=platform.railingSettings||{};
 const height=Number(cfg.heightMm??950),bottom=Number(cfg.bottomGapMm??100),maxSpan=Number(cfg.maxSpanMm??1500),roofProfile=(roofPosts[0]?.profile||cfg.postProfile||postProfile).replace('x','×'),dims=roofProfile.split(/[×xх]/).map(Number);
 if(!(height>=600&&height<=2000&&bottom>=0&&height-45-bottom>=450&&maxSpan>=300&&maxSpan<=1500&&dims.length===2&&dims.every(n=>n>0)))return {members,runs,posts:[],issues:['Проверьте высоту ограждения, нижний зазор и пролёт ригелей (не более 1500 мм).']};
 const world=p=>[round((platform.x+p[0])*1000),round((platform.y+p[1])*1000),railingFloorZ(platform,p)];
 const key=p=>p.map(v=>round(v)).join(':'),same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<5;
 const addPost=(q,existing=false,sourceId)=>{const id=key(q);if(!posts.has(id)){const post={id:`railing:${platform.id}:post:${id}`,name:'Стойка ограждения',kind:'post',a:q,b:[q[0],q[1],q[2]+height-45],profile:roofProfile,materialProfile:roofProfile,existing,sourceId};posts.set(id,post);if(!existing)members.push(post);}return posts.get(id);};
 for(const run of normalizeRailings(platform.railings).filter(r=>r.enabled)){
  const a=world(run.a),b=world(run.b),L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(L<100)continue;
  const duplicate=[key(a),key(b)].sort().join('|');if(seen.has(duplicate))continue;seen.add(duplicate);
  const ux=(b[0]-a[0])/L,uy=(b[1]-a[1])/L,postWidth=Math.abs(ux)*dims[0]+Math.abs(uy)*dims[1],at=t=>a.map((v,i)=>v+(b[i]-v)*t);
  const anchors=[{t:0,post:roofPosts.find(p=>same(p.a,a))},{t:1,post:roofPosts.find(p=>same(p.a,b))}];
  for(const post of roofPosts){const t=((post.a[0]-a[0])*ux+(post.a[1]-a[1])*uy)/L;if(t>.001&&t<.999&&Math.abs((post.a[0]-a[0])*uy-(post.a[1]-a[1])*ux)<5)anchors.push({t,post});}
  anchors.sort((x,y)=>x.t-y.t);for(let i=anchors.length-1;i>0;i--)if((anchors[i].t-anchors[i-1].t)*L<5)anchors.splice(i,1);const runMembers=[];
  const add=(kind,c,d,profile,materialProfile=profile)=>{const m={id:`railing:${platform.id}:${run.id}:${kind}:${runMembers.length}`,name:kind==='handrail'?'Поручень ограждения 45×90':'Ригель ограждения 25×150',kind,a:c,b:d,profile,materialProfile};members.push(m);runMembers.push(m);};
  for(let i=1;i<anchors.length;i++){
   const first=anchors[i-1],last=anchors[i],distance=(last.t-first.t)*L,n=Math.max(1,Math.ceil(distance/(maxSpan+postWidth))),points=Array.from({length:n+1},(_,j)=>at(first.t+(last.t-first.t)*j/n));
   if(distance<=postWidth+1){issues.push('Участок ограждения короче сечения столба. Измените концы участка.');continue;}
   points.forEach((q,j)=>{const old=j===0?first.post:j===n?last.post:null;addPost(q,!!old,old?.id);});
   const start=points[0],end=points.at(-1),trim=(q,sign)=>[q[0]+ux*postWidth/2*sign,q[1]+uy*postWidth/2*sign,q[2]+(b[2]-a[2])/L*postWidth/2*sign];
   const ca=trim(start,1),cb=trim(end,-1);if(distance>postWidth)add('handrail',[ca[0],ca[1],ca[2]+height-22.5],[cb[0],cb[1],cb[2]+height-22.5],'90×45','45×90');
   for(let j=1;j<points.length;j++){const pa=trim(points[j-1],1),pb=trim(points[j],-1);if(length(pa,pb)<=0)continue;
    for(let row=0;row<3;row++){const z=bottom+75+row*(height-45-bottom-150)/2;add('rail',[pa[0],pa[1],pa[2]+z],[pb[0],pb[1],pb[2]+z],'25×150');}
   }
  }
  runs.push({...run,a,b,lengthMm:length(a,b),members:runMembers});
 }
 return {members:members.map(m=>({...m,length:Math.ceil(length(m.a,m.b)),cutLength:Math.ceil(length(m.a,m.b)),layer:'platforms',structuralStatus:'unverified',material:m.kind==='post'?'Стойка ограждения · сечение опоры крыши':'Доска сухая строганая',referenceOnly:false})),runs,posts:[...posts.values()],issues};
}
export function projectPlatformPosts(project,platform,result){
 const manual=(project.settings.productionCutting.roofSupports||[]).filter(s=>s.type==='post'&&!s.referenceOnly&&s.x1>=platform.x*1000-10&&s.x1<=(platform.x+platform.w)*1000+10&&s.y1>=platform.y*1000-10&&s.y1<=(platform.y+platform.h)*1000+10).map(s=>({id:s.id,a:[s.x1,s.y1,s.z1],profile:s.profile}));
 return [...platformRoofPostPlan(platform,result),...manual];
}
export function projectRailingLayouts(project,roof={}){
 if(!project.services.terrace)return [];
 return (project.plan.platforms||[]).filter(p=>p.include!==false).map(p=>{const result=roof.terraceRoofs?.find(r=>r.platform.id===p.id)?.result||calculateTerraceRoof(p,project.plan.house,{wallPanelThickness:project.settings.sip.wallThickness,postSpacing:project.settings.roof.postSpacing||3});return {platform:p,roofPosts:projectPlatformPosts(project,p,result),...railingLayout(p,projectPlatformPosts(project,p,result),result.postSection)};});
}
export function railingEstimateLines(project,roof={}){
 const layouts=projectRailingLayouts(project,roof),members=layouts.flatMap(l=>l.members),rows=[],stock=Number(project.settings.productionCutting.stockLengthMm)||6000,kerf=Number(project.settings.productionCutting.kerfMm)||0;
 const groups=new Map();for(const member of members){const k=member.materialProfile;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(member);}
 for(const [profile,parts] of groups){const [w,h]=profile.split('×').map(Number),planed=parts[0].kind!=='post',exact=project.priceMat.find(r=>new RegExp(`(?:${w}\\s*[×xх*]\\s*${h}|${h}\\s*[×xх*]\\s*${w})\\s*мм`,'i').test(r.name)&&(!planed||/строган/i.test(r.name))&&['м.п.','м','м3','м³'].includes(r.unit)),catalog=exact||project.priceMat.find(r=>r.id===(planed?'MAT-006':'MAT-018'));
  const count=reinforcementBoardCount(parts.map(m=>({...m,cutLength:m.length+2*Number(project.settings.productionCutting.endAllowanceMm||0)})),stock,kerf),purchaseMm=Math.max(count,Math.ceil(parts.reduce((sum,m)=>sum+m.cutLength,0)*1.1/stock))*stock,volume=purchaseMm*w*h/1e9,unit=catalog?.unit||'м³',base=catalog?.name.match(/(\d+)\s*[×xх*]\s*(\d+)/),area=base?Number(base[1])*Number(base[2]):w*h,qty=['м3','м³'].includes(unit)?volume:volume*1e6/area;
  rows.push({id:`terrace:railing-material-${profile}`,section:'terrace',kind:'material',catalogId:catalog?.id,name:`Ограждение · ${planed?'доска строганая':'стойки'} ${profile} мм · ${parts.length} деталей · ${purchaseMm/stock} досок × ${stock/1000} м`,unit,qty:Math.ceil(qty*1e6)/1e6,price:Number(catalog?.price)||0,pricePending:!(Number(catalog?.price)>0),priceEstimated:!exact,materialVolumeM3:volume,materialVolumeBasisQty:Math.ceil(qty*1e6)/1e6,source:`Сечения: поручень 45×90 мм; 3 ригеля 25×150 мм. Высота и зазор — по параметрам ограждения. Закупка: раскладка на хлысты + 10% с округлением до целой доски. ${exact?'Позиция прайса соответствует сечению.':`Ориентир по объёму позиции ${catalog?.id||'не найдена'}; подтвердить цену нужного строганого сечения.`}`});
 }
 const meters=layouts.flatMap(l=>l.runs).reduce((s,r)=>s+r.lengthMm/1000,0),labor=project.priceLab.find(r=>r.id===RAILING_LABOR_DEFAULT.id)||RAILING_LABOR_DEFAULT;
 if(meters)rows.push({id:'terrace:railing-work',section:'terrace',kind:'labor',catalogId:labor?.id,name:'Сборка ограждений террасы и крыльца',unit:'м.п.',qty:Math.round(meters*1000)/1000,price:Number(labor.price),pricePending:!(Number(labor.price)>0),source:'Ставка пользователя 16.11.2026: 2500 ₽/м.п. Фактическая длина ограждения, включая наклонные участки лестниц.'});
 return rows;
}
