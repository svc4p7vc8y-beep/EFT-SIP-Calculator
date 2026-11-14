import clipping from 'polygon-clipping';
import {openingPolygon,shapeArea} from '../../calculations/opening-shape.js';
import {createWindowFromDesign,WINDOW_DESIGN_LIBRARY} from '../state/window-products.js';
import {productionLevels} from './production-levels.js';
import {houseContourPoints} from '../planner/geometry.js';

const rect=(x,y,w,h)=>[[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]];
const finite=n=>Number.isFinite(Number(n));
export const facadeSourceKey=wall=>JSON.stringify([wall.planStart,wall.planEnd,wall.baseZMm||0,wall.grossShape]);
export function facadeEnvelope(report,wallId){
  const wall=report.surfaces.find(s=>s.id===wallId&&s.exterior);
  if(!wall)return null;
  const gables=report.surfaces.filter(s=>s.parentWallId===wallId&&s.grossShape);
  const shapes=[wall.grossShape||rect(0,0,wall.width,wall.height),...gables.map(s=>s.grossShape.map(p=>p.map(r=>r.map(([x,y])=>[x,y+wall.height]))))];
  return {wall,shape:clipping.union(...shapes),key:JSON.stringify([facadeSourceKey(wall),...gables.map(s=>s.grossShape)])};
}
export function facadeHeight(shape,x){
  const values=[];
  for(const poly of shape)for(const ring of poly)for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    if(x<Math.min(a[0],b[0])-.01||x>Math.max(a[0],b[0])+.01)continue;
    if(Math.abs(a[0]-b[0])<.001)values.push(a[1],b[1]);
    else values.push(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));
  }
  return Math.max(0,...values);
}
export function createFacade(envelope,floor=1){
  const {wall}=envelope,inset=Math.min(400,wall.width/8),width=wall.width;
  return {id:crypto.randomUUID(),name:'Витражный фасад',floor,wallId:wall.id,sourceKey:envelope.key,anchor:[wall.planStart,wall.planEnd],widthMm:width,
    posts:[inset,width/2,width-inset],postRefs:['post-0','post-1','post-2'],sillMm:300,transomMm:Math.round(wall.height*.68),headInsetMm:400,clearanceMm:30,
    lower:true,upper:true,boardWidthMm:50,boardDepthMm:150,plies:3,nodeRef:'',foundationRef:'',catalogId:'',memberOverrides:{},windowOverrides:{},extras:[],links:[],
  };
}
export function facadeLayout(config,envelope){
  const stations=(config.posts||[]).map((x,i)=>({x:Number(x),key:config.postRefs?.[i]||`post-${i}`})).sort((a,b)=>a.x-b.x);
  const errors=[],warnings=[],posts=stations.map(s=>s.x),width=envelope.wall.width;
  const bw=Number(config.boardWidthMm),depth=Number(config.boardDepthMm),plies=Number(config.plies),postWidth=bw*plies,clearance=Number(config.clearanceMm),sill=Number(config.sillMm),transom=Number(config.transomMm),inset=Number(config.headInsetMm);
  if(config.sourceKey!==envelope.key)errors.push('Контур стены или кровли изменился. Обновите контур фасада и проверьте размеры.');
  if(![bw,depth,plies,clearance,sill,transom,inset,...posts].every(finite)||bw<20||depth<50||bw>500||depth>1000||!Number.isInteger(plies)||plies<1||plies>8||clearance<0||sill<0||transom<=sill||inset<depth/2||posts.length<2||posts.length>12){errors.push('Проверьте размеры, пакет досок и число стоек (2–12).');return {errors,warnings,windows:[],members:[],shape:envelope.shape};}
  if(posts[0]<postWidth/2||posts.at(-1)>width-postWidth/2||posts.some((x,i)=>i&&x-posts[i-1]<postWidth+2*clearance+150))errors.push('Стойки или межстоечные проёмы не помещаются на фасаде.');
  if(!config.nodeRef?.trim())warnings.push('Рабочие узлы и крепёж не заданы. Несущая способность пакета досок не подтверждена.');
  if(!config.foundationRef?.trim())warnings.push('Укажите основание стоек: путь нагрузки до фундамента не заполнен.');
  const windows=[],members=[];
  posts.forEach((x,i)=>{
    const top=facadeHeight(envelope.shape,x)-inset;
    if(top<=transom+depth/2)errors.push(`Стойка ${i+1}: верхняя часть фасада ниже перемычки.`);
    members.push({key:stations[i].key,name:`Стойка ${i+1}`,type:'post',a:[x,0],b:[x,Math.max(1,top)],profile:`${postWidth}×${depth}`,cutWidth:postWidth});
  });
  for(let i=0;i<posts.length-1;i++){
    const left=posts[i],right=posts[i+1],x=left+postWidth/2+clearance,w=right-left-postWidth-2*clearance;
    members.push({key:`header-${stations[i].key}-${stations[i+1].key}`,name:`Перемычка ${i+1}`,type:'beam',a:[left,transom],b:[right,transom],profile:`${postWidth}×${depth}`,cutWidth:depth,startKey:stations[i].key,endKey:stations[i+1].key});
    // A sloped cap follows every roof vertex. A ridge must be a supported node.
    const vertices=[x,x+w,...envelope.shape.flatMap(p=>p[0].map(p=>p[0])).filter(v=>v>x+.1&&v<x+w-.1)].sort((a,b)=>a-b);
    const unique=[...new Set(vertices)];
    if(unique.length>2)errors.push(`Пролёт ${i+1}: излом кровли должен совпадать со стойкой. Добавьте стойку под коньком.`);
    const topLeft=facadeHeight(envelope.shape,left)-inset,topRight=facadeHeight(envelope.shape,right)-inset;
    members.push({key:`cap-${stations[i].key}-${stations[i+1].key}`,name:`Верхняя балка ${i+1}`,type:'beam',a:[left,topLeft],b:[right,topRight],profile:`${postWidth}×${depth}`,cutWidth:depth,startKey:stations[i].key,endKey:stations[i+1].key});
    const capSlope=(topRight-topLeft)/(right-left),capHalf=depth/2*Math.sqrt(1+capSlope**2);
    const capBottom=at=>topLeft+capSlope*(at-left)-capHalf;
    const add=(row,bottom,l,r)=>{
      const h=Math.max(l,r)-bottom;
      if(!(w>0&&h>150&&Math.min(l,r)>bottom+150)){errors.push(`Пролёт ${i+1}, ${row==='lower'?'нижнее':'верхнее'} окно: недостаточная высота.`);return;}
      const roughTop=at=>row==='upper'?capBottom(at):transom-depth/2;
      windows.push({key:`${row}-${i}`,x,y:bottom,width:w,height:h,outline:[[0,0],[w,0],[w,r-bottom],[0,l-bottom]],roughOutline:[[0,0],[w+2*clearance,0],[w+2*clearance,roughTop(x+w+clearance)-bottom+clearance],[0,roughTop(x-clearance)-bottom+clearance]],shape:Math.abs(l-r)<1?'rectangle':'trapezoid_sloped_top',leftHeight:l-bottom,rightHeight:r-bottom});
    };
    if(config.lower)add('lower',sill,transom-depth/2-clearance,transom-depth/2-clearance);
    if(config.upper)add('upper',transom+depth/2+clearance,capBottom(x)-clearance,capBottom(x+w)-clearance);
  }
  for(let i=windows.length-1;i>=0;i--){
    const win=windows[i],override=config.windowOverrides?.[win.key]||{};
    if(override.enabled===false){windows.splice(i,1);continue;}
    if(override.shape==='rectangle'){
      const h=Math.min(win.leftHeight,win.rightHeight);win.leftHeight=h;win.rightHeight=h;win.height=h;win.outline=[[0,0],[win.width,0],[win.width,h],[0,h]];win.shape='rectangle';
      win.roughOutline=[[0,0],[win.width+2*clearance,0],[win.width+2*clearance,h+2*clearance],[0,h+2*clearance]];
    }
    if(override.shape==='triangle'){
      const apex=override.apexPosition==null?(win.rightHeight>win.leftHeight?1:0):Math.max(0,Math.min(1,Number(override.apexPosition)));
      const h=win.leftHeight+(win.rightHeight-win.leftHeight)*apex;
      win.shape='triangle';win.apexPosition=apex;win.height=h;win.outline=[[0,0],[win.width,0],[win.width*apex,h]];
      // Mounting pocket is an offset of the triangle, not its bounding box.
      const ring=win.outline,shifted=ring.map((a,j)=>{const b=ring[(j+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);return {a:[a[0]+dy/l*clearance,a[1]-dx/l*clearance],d:[dx,dy]};});
      const expanded=shifted.map((line,j)=>{const before=shifted[(j+shifted.length-1)%shifted.length],cross=before.d[0]*line.d[1]-before.d[1]*line.d[0],v=[line.a[0]-before.a[0],line.a[1]-before.a[1]],t=(v[0]*line.d[1]-v[1]*line.d[0])/cross;return [before.a[0]+t*before.d[0]+clearance,before.a[1]+t*before.d[1]+clearance];});
      const clipped=clipping.intersection([expanded],[win.roughOutline]);win.roughOutline=clipped[0]?.[0]||expanded;
    }
  }
  for(const win of windows){const shape=openingPolygon({facadeId:config.id,width:win.width,height:win.height,outline:win.outline},1,win.x,win.y);if(shapeArea(clipping.difference(shape,envelope.shape))>1)errors.push(`${win.key}: окно выходит за контур.`);}
  return {errors:[...new Set(errors)],warnings,windows,members,shape:envelope.shape};
}
export function facadeMemberShapes(config,layout){
  return layout.members.map(member=>{
    const a=member.a,b=member.b,dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),half=member.cutWidth/2,n=[-dy/l*half,dx/l*half];
    return {key:member.key,shape:[[[a[0]+n[0],a[1]+n[1]],[b[0]+n[0],b[1]+n[1]],[b[0]-n[0],b[1]-n[1]],[a[0]-n[0],a[1]-n[1]]]]};
  });
}
export function facadeReservedShape(plan,wallId){
  const shapes=(plan.facades||[]).filter(f=>f.wallId===wallId).flatMap(f=>f.memberShapes||[]).filter(p=>Array.isArray(p)&&p.length&&p.length<=8&&p.every(r=>Array.isArray(r)&&r.length>=3&&r.length<=32&&r.every(v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000))));
  return shapes.length?clipping.union(...shapes):[];
}
export function applyFacade(project,config,envelope){
  const layout=facadeLayout(config,envelope);
  if(layout.errors.length)throw new Error(layout.errors.join(' '));
  const next=structuredClone(project),plan=config.floor===1?next.plan:next.upperFloors[config.floor-2],wall=envelope.wall;
  if((plan.facades||[]).some(f=>f.id!==config.id&&f.wallId===config.wallId))throw new Error('На этой стене уже есть фасад. Откройте его для редактирования.');
  const dx=(wall.planEnd[0]-wall.planStart[0])/wall.width,dy=(wall.planEnd[1]-wall.planStart[1])/wall.width;
  const base=productionLevels(next,Math.max(1,Number(next.meta.floors)||1)).bases[config.floor-1]||0;
  const contour=houseContourPoints(plan),sign=contour.reduce((s,p,i)=>{const q=contour[(i+1)%contour.length];return s+p.x*q.y-q.x*p.y;},0)<0?-1:1;
  const normal=[sign*dy,-sign*dx],thickness=Number(wall.thickness)||174;
  const at=([x,z])=>[wall.planStart[0]+dx*x-normal[0]*thickness/2,wall.planStart[1]+dy*x-normal[1]*thickness/2,base+z];
  const prefix=`facade:${config.id}:`,oldSupports=next.settings.productionCutting.roofSupports||[];
  const supports=layout.members.map(member=>{
    const a=at(member.a),b=at(member.b),override=config.memberOverrides?.[member.key]||{};
    return {id:prefix+member.key,facadeId:config.id,facadeMemberKey:member.key,name:`${config.name} · ${member.name}`,type:member.type,profile:member.profile,
      packageCount:Number(config.plies),packageProfile:`${Number(config.boardWidthMm)}×${Number(config.boardDepthMm)}`,packagePricing:config.packagePricing==='package'?'package':'board',nodeRef:config.nodeRef||'',
      x1:a[0],y1:a[1],z1:a[2],x2:b[0],y2:b[1],z2:b[2],estimateEnabled:true,estimateCatalogId:config.catalogId||'',
      startSupport:member.startKey?prefix+member.startKey:config.foundationRef?prefix+'foundation-'+member.key:'',endSupport:member.endKey?prefix+member.endKey:'',foundationRef:'',...override};
  });
  if(config.foundationRef)for(const member of supports.filter(s=>s.type==='post'))supports.push({id:prefix+'foundation-'+member.facadeMemberKey,facadeId:config.id,type:'foundation',name:`Основание · ${member.name}`,x1:member.x1,y1:member.y1,z1:member.z1,x2:member.x1,y2:member.y1,z2:member.z1,foundationRef:config.foundationRef,nodeRef:config.nodeRef||'',profile:'',referenceOnly:false});
  if(oldSupports.filter(s=>s.facadeId!==config.id).length+supports.length>200)throw new Error('Превышен лимит 200 опор. Уменьшите число элементов.');
  next.settings.productionCutting.roofSupports=[...oldSupports.filter(s=>s.facadeId!==config.id),...supports];
  const oldOpenings=plan.openings||[],oldProducts=next.windowProducts||[];
  const generated=layout.windows.map(win=>{
    const id=prefix+win.key,mid=at([win.x+win.width/2,0]);
    const gap=Number(config.clearanceMm),roughWidth=win.width+2*gap,roughHeight=win.height+2*gap;
    const opening={id,facadeId:config.id,facadeWindowKey:win.key,facadeXMm:win.x-gap,type:'window',outer:true,x:mid[0]/1000,y:mid[1]/1000,orientation:Math.abs(dx)>.5?'h':'v',angle:Math.atan2(dy,dx)*180/Math.PI,width:roughWidth/1000,height:Math.max(...win.roughOutline.map(p=>p[1]))/1000,sillHeight:(win.y-gap)/1000,outline:win.roughOutline.map(p=>p.map(v=>v/1000)),displayOutline:win.outline.map(p=>p.map(v=>(v+gap)/1000)),include:true,includeInEstimate:true,subtractFromSip:true};
    const old=oldProducts.find(p=>p.openingId===id),product=createWindowFromDesign(WINDOW_DESIGN_LIBRARY[0],{...old,id:old?.id||prefix+'product-'+win.key,facadeId:config.id,openingId:id,mark:`${config.name} · ${win.key}`,shape:win.shape,apexPosition:win.apexPosition,widthMm:win.width,heightMm:win.height,leftHeightMm:win.leftHeight,rightHeightMm:win.rightHeight,roughOpening:{widthMm:roughWidth,heightMm:roughHeight,source:'Геометрия фасада и заданный монтажный зазор'},sections:old?.sections||[{id:'section-1',openingMode:'fixed',ratio:1}],price:old?.price||{mode:'design_unpriced',history:[]}});
    if(old&&['shape','widthMm','heightMm','leftHeightMm','rightHeightMm','apexPosition'].some(k=>(old[k]??null)!==(product[k]??null)))product.geometryPriceReview=true;
    return {opening,product};
  });
  plan.openings=[...oldOpenings.filter(o=>o.facadeId!==config.id),...generated.map(g=>g.opening)];
  next.windowProducts=[...oldProducts.filter(p=>p.facadeId!==config.id),...generated.map(g=>g.product)];
  const memberShapes=facadeMemberShapes(config,layout).map(m=>m.shape);
  plan.facades=[...(plan.facades||[]).filter(f=>f.id!==config.id),{...config,memberShapes}];
  next.customEstimateLines=(next.customEstimateLines||[]).filter(l=>l.facadeId!==config.id);
  for(const extra of config.extras||[]){
    const catalog=(extra.kind==='labor'?next.priceLab:next.priceMat).find(r=>r.id===extra.catalogId);
    if(!catalog||!finite(extra.qty)||Number(extra.qty)<=0)throw new Error('Крепёж и работы фасада: выберите позицию прайса и задайте положительное количество по проекту.');
    next.customEstimateLines.push({id:prefix+'extra-'+extra.id,facadeId:config.id,section:'roof',catalogId:catalog.id,name:`${config.name} · ${catalog.name}`,unit:catalog.unit,qty:Number(extra.qty),price:Number(catalog.price)||0,kind:extra.kind==='labor'?'labor':'material',source:config.nodeRef||'Проектная ведомость фасада'});
  }
  for(const link of config.links||[]){const item=next.settings.productionCutting.roofSupports.find(s=>s.id===link.supportId&&s.facadeId!==config.id),target=supports.find(s=>s.id===prefix+link.memberKey);if(!item||!target)continue;item[link.end==='start'?'startSupport':'endSupport']=target.id;if(link.snap){const suffix=link.end==='start'?'1':'2';item['x'+suffix]=target.x2;item['y'+suffix]=target.y2;item['z'+suffix]=target.z2;}}
  return next;
}
export function removeFacade(project,id,floor){
  const next=structuredClone(project),plan=floor===1?next.plan:next.upperFloors[floor-2];
  plan.facades=(plan.facades||[]).filter(f=>f.id!==id);plan.openings=(plan.openings||[]).filter(o=>o.facadeId!==id);
  next.windowProducts=(next.windowProducts||[]).filter(o=>o.facadeId!==id);
  next.customEstimateLines=(next.customEstimateLines||[]).filter(o=>o.facadeId!==id);
  next.settings.productionCutting.roofSupports=next.settings.productionCutting.roofSupports.filter(s=>s.facadeId!==id);
  return next;
}
