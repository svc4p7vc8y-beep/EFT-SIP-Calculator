import {roofWorld} from './roof-project.js';
import {productionLevels} from './production-levels.js';
import {roofGeometrySignature} from './roof-detailing.js';

const round=n=>Math.round(n);
const validProfile=value=>/^\d+×\d+$/.test(value)&&value.split('×').every(n=>Number(n)>0&&Number(n)<=10000);
const crossing=(a,b,c,d)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],ex=d[0]-c[0],ey=d[1]-c[1],den=dx*ey-dy*ex;
  if(Math.abs(den)<1e-8)return null;
  const t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/den,u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/den;
  return t>=0&&t<=1&&u>=0&&u<=1?t:null;
};
export function roofSupportOpeningAt(project,x,y,section){
  const plan=project.upperFloors?.at(-1)||project.plan;
  return (plan.openings||[]).some(o=>{
    const cx=Number(o.x)*1000,cy=Number(o.y)*1000,half=Number(o.width)*500+Number(section.split('×')[0])/2;
    return Number.isFinite(cx)&&Number.isFinite(cy)&&Number.isFinite(half)&&half>0&&(o.orientation==='v'?Math.abs(x-cx)<100&&Math.abs(y-cy)<half:Math.abs(y-cy)<100&&Math.abs(x-cx)<half);
  });
}

function intervalsAt(polygon,v){
  const hits=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    if((a[1]<=v&&b[1]>v)||(b[1]<=v&&a[1]>v))hits.push(a[0]+(b[0]-a[0])*(v-a[1])/(b[1]-a[1]));
  }
  hits.sort((a,b)=>a-b);
  return Array.from({length:Math.floor(hits.length/2)},(_,i)=>[hits[2*i],hits[2*i+1]]).filter(([a,b])=>b-a>100);
}

// Geometric proposal for facets that cannot use the rectangular purlin template.
// Every member remains editable and its connection to the foundation stays open.
export function facetSupportProposal(project,report,config,{groups='all'}={}){
  const model=report.assembly.roofModel,errors=[],warnings=[],items=[];
  if(!validProfile(config.purlinProfile)||!validProfile(config.postProfile))return {items,errors:['Задайте проектные сечения прогонов и стоек.'],warnings,counts:{purlins:0,posts:0}};
  const fractions=config.variant==='single'?[.5]:config.variant==='double'?[.33,.67]:[.25,.5,.75];
  const platforms=new Map((project.plan.platforms||[]).map(p=>[`terrace:${p.id}`,p]));
  const floorBase=productionLevels(project,report.assembly.floors.length).bases.at(-1)||0;
  for(const face of model.faces){
    if(groups==='main'&&face.group!=='main'||groups==='platforms'&&face.group==='main')continue;
    if(face.structureHorizontal)warnings.push(`${face.id}: прогон предложен на горизонтальной несущей плоскости под разуклонкой; его опирание требуется проверить.`);
    // A purlin runs across the fall of a facet. Local U is along the fall
    // for some terrace faces and along the ridge for others.
    const fallAxis=Math.abs(face.u[2])>Math.abs(face.v[2])?'u':'v';
    const outline=fallAxis==='u'?face.polygon.map(([u,v])=>[v,u]):face.polygon;
    const crossValues=outline.map(p=>p[1]),min=Math.min(...crossValues),max=Math.max(...crossValues);
    if(max-min<200){warnings.push(`${face.id}: ширина ската недостаточна для автопрогона.`);continue;}
    const platform=platforms.get(face.group),horizontal=face.group==='main'&&project.settings.roof.shape==='flat'&&project.settings.roof.flatSlopeMode!=='structural',baseZ=config.baseZ!==''?Number(config.baseZ):platform?Number(platform.deckHeightMm)||0:horizontal?floorBase:model.roofBase;
    for(const [index,fraction] of fractions.entries()){
      const v=min+(max-min)*fraction;
      for(const [part,[u1,u2]] of intervalsAt(outline,v).entries()){
        const a=roofWorld(face,fallAxis==='u'?[v,u1]:[u1,v]),b=roofWorld(face,fallAxis==='u'?[v,u2]:[u2,v]),id=`auto-roof-${face.id}-${index+1}-${part+1}`;
        if(face.structureHorizontal){a[2]=model.roofBase;b[2]=model.roofBase;}
        const bearings=report.assembly.floors.at(-1)?.bearing||[];
        const verified=face.group==='main'&&config.distribution==='bearing'?[...new Set(bearings.map(e=>crossing(a,b,e.a,e.b)).filter(t=>t!=null).map(t=>Math.round(t*1000)/1000))].sort((x,y)=>x-y):[];
        if(config.distribution==='bearing'&&face.group==='main'&&verified.length<2)warnings.push(`${face.id}: найдено менее двух пересечений с несущими стенами; стойки предложены геометрически, нижнее опирание не подтверждено.`);
        const count=Math.max(2,Math.min(30,Number(config.postCount)||3));
        const postTs=verified.length>=2?verified:Array.from({length:count},(_,i)=>.1+.8*i/(count-1));
        const posts=postTs.map((t,j)=>{
          const top=a.map((n,k)=>round(n+(b[k]-n)*t));
          if(roofSupportOpeningAt(project,top[0],top[1],config.postProfile)){warnings.push(`${face.id}: стойка попадает на проём; позиция пропущена.`);return null;}
          if(top[2]<=baseZ){warnings.push(`${face.id}: стойка ${j+1} не помещается под прогоном.`);return null;}
          return {id:`${id}-s${j+1}`,type:'post',name:`${face.id} · стойка ${index+1}.${j+1}`,profile:config.postProfile,nodeRef:config.nodeRef||'',x1:top[0],y1:top[1],z1:baseZ,x2:top[0],y2:top[1],z2:top[2],upperSupport:id,startSupport:'',endSupport:'',foundationRef:'',faceId:face.id,autoLayout:'roof-purlins',estimateCatalogId:config.postCatalogId||'',estimateEnabled:config.estimateEnabled===true&&!!config.postCatalogId};
        }).filter(Boolean);
        if(posts.length<2){warnings.push(`${face.id}: для прогона требуется минимум две допустимые опорные точки; линия пропущена.`);continue;}
        items.push({id,type:'purlin',name:`${face.id} · прогон ${index+1}`,profile:config.purlinProfile,nodeRef:config.nodeRef||'',x1:round(a[0]),y1:round(a[1]),z1:round(a[2]),x2:round(b[0]),y2:round(b[1]),z2:round(b[2]),startSupport:posts[0].id,endSupport:posts.at(-1).id,foundationRef:'',faceId:face.id,autoLayout:'roof-purlins',estimateCatalogId:config.purlinCatalogId||'',estimateEnabled:config.estimateEnabled===true&&!!config.purlinCatalogId},...posts);
      }
    }
  }
  if(!items.length)errors.push('Для выбранных скатов не удалось построить геометрическую схему опор. Задайте опоры вручную.');
  if(items.length>200)errors.push('Автосхема превышает предел 200 элементов. Уменьшите число прогонов.');
  for(const item of items)item.roofSourceKey=roofGeometrySignature(model);
  warnings.push('Авторасстановка показывает геометрию. Нижние опоры, пролёты, сечения, соединения и путь нагрузки до фундамента требуют проектной проверки.');
  return {items:errors.length?[]:items,errors,warnings,counts:{purlins:items.filter(i=>i.type==='purlin').length,posts:items.filter(i=>i.type==='post').length},baseZ:config.baseZ};
}
