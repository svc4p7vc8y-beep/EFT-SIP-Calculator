import clipping from 'polygon-clipping';
import {openingPolygon,shapeArea} from '../../calculations/opening-shape.js';
import {createWindowFromDesign,WINDOW_DESIGN_LIBRARY,resizeWindowProduct} from '../state/window-products.js';
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
  const dx=wall.planEnd[0]-wall.planStart[0],dy=wall.planEnd[1]-wall.planStart[1],length=Math.hypot(dx,dy)||1;
  const plates=(report.assembly?.roofTimbers||[]).filter(m=>!m.excluded&&m.worldA&&m.worldB&&/Мауэрлат/.test(m.material||m.name||'')).map(m=>{const a=m.worldA,b=m.worldB,L=Math.hypot(b[0]-a[0],b[1]-a[1])||1,parallel=Math.abs(((b[0]-a[0])*dx+(b[1]-a[1])*dy)/(L*length)),distance=Math.abs((a[0]-wall.planStart[0])*dy-(a[1]-wall.planStart[1])*dx)/length;return {m,score:distance+(parallel<.98?100000:0)};}).sort((a,b)=>a.score-b.score);
  const plate=plates[0]?.score<350?plates[0].m:null,mauerlatMm=plate?(plate.worldA[2]+plate.worldB[2])/2-(wall.baseZMm||0):wall.height;
  return {wall,mauerlatMm,mauerlatSource:plate?.id||'',shape:clipping.union(...shapes),key:JSON.stringify([facadeSourceKey(wall),...gables.map(s=>s.grossShape)])};
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
    posts:[inset,width/2,width-inset],postRefs:['post-0','post-1','post-2'],sillMm:300,transomMm:Math.round(envelope.mauerlatMm??wall.height),headInsetMm:100,clearanceMm:30,autoClip:true,transoms:[],
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
    if(!config.autoClip&&top<=transom+depth/2)errors.push(`Стойка ${i+1}: верхняя часть фасада ниже перемычки.`);
    members.push({key:stations[i].key,name:`Стойка ${i+1}`,type:'post',a:[x,0],b:[x,Math.max(1,top,config.autoClip?transom+depth/2:0)],profile:`${postWidth}×${depth}`,cutWidth:postWidth});
  });
  for(let i=0;i<posts.length-1;i++){
    const left=posts[i],right=posts[i+1],x=left+postWidth/2+clearance,w=right-left-postWidth-2*clearance;
    const headerKey=`header-${stations[i].key}-${stations[i+1].key}`,bayTransom=Number(config.transomOverrides?.[headerKey]??transom);
    members.push({key:`header-${stations[i].key}-${stations[i+1].key}`,name:`Перемычка ${i+1}`,type:'beam',a:[left,bayTransom],b:[right,bayTransom],profile:`${postWidth}×${depth}`,cutWidth:depth,startKey:stations[i].key,endKey:stations[i+1].key});
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
    if(config.autoClip||config.transoms?.length){
      const extras=(Array.isArray(config.transoms)?config.transoms:[]).filter(t=>!t.fromPost||stations.findIndex(s=>s.key===t.fromPost)<=i&&stations.findIndex(s=>s.key===t.toPost)>i).slice(0,24);
      const bars=[{id:'main',zMm:bayTransom},...extras].sort((a,b)=>a.zMm-b.zMm);
      for(const t of extras)members.push({key:`transom-${t.id}-${stations[i].key}-${stations[i+1].key}`,transomId:t.id,name:'Горизонтальная перемычка',type:'beam',a:[left,Number(t.zMm)],b:[right,Number(t.zMm)],profile:`${postWidth}×${depth}`,cutWidth:depth,startKey:stations[i].key,endKey:stations[i+1].key});
      if(bars.some((t,j)=>!finite(t.zMm)||Number(t.zMm)<=sill+depth/2+clearance||j&&t.zMm-bars[j-1].zMm<depth+2*clearance+100))errors.push(`Пролёт ${i+1}: перемычки расположены слишком близко или ниже подоконника.`);
      const top=Math.max(capBottom(x),capBottom(x+w)),under=[[[x,sill],[x+w,sill],[x+w,Math.max(sill,capBottom(x+w)-clearance)],[x,Math.max(sill,capBottom(x)-clearance)]]];
      const limits=[{id:'sill',zMm:sill-depth/2-clearance},...bars,{id:'roof',zMm:top+depth/2+clearance}];
      for(let j=0;j<limits.length-1;j++){
        const lo=limits[j].zMm+depth/2+clearance,hi=limits[j+1].zMm-depth/2-clearance;
        if(hi<=lo||!config.lower&&hi<=bayTransom||!config.upper&&lo>=bayTransom)continue;
        const shapes=clipping.intersection(under,rect(x,lo,w,hi-lo));
        let ring=shapes[0]?.[0];if(!ring)continue;if(ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1])ring=ring.slice(0,-1);
        const minX=Math.min(...ring.map(p=>p[0])),maxX=Math.max(...ring.map(p=>p[0])),minY=Math.min(...ring.map(p=>p[1])),maxY=Math.max(...ring.map(p=>p[1]));
        if(maxX-minX<100||maxY-minY<100)continue;
        const outline=ring.map(([a,b])=>[a-minX,b-minY]),leftHeight=Math.max(...outline.filter(p=>Math.abs(p[0])<1).map(p=>p[1])),rightHeight=Math.max(...outline.filter(p=>Math.abs(p[0]-(maxX-minX))<1).map(p=>p[1])),shape=ring.length===3?'triangle':Math.abs(leftHeight-rightHeight)<1?'rectangle':'trapezoid_sloped_top';
        const key=limits[j].id==='sill'?`lower-${i}`:limits[j].id==='main'?`upper-${i}`:`band-${limits[j].id}-${i}`;
        windows.push({key,x:minX,y:minY,width:maxX-minX,height:maxY-minY,outline,roughOutline:outline,shape,apexPosition:shape==='triangle'?outline.reduce((a,b)=>a[1]>b[1]?a:b)[0]/(maxX-minX):undefined,leftHeight,rightHeight});
      }
    }else{
    if(config.lower)add('lower',sill,transom-depth/2-clearance,transom-depth/2-clearance);
    if(config.upper)add('upper',transom+depth/2+clearance,capBottom(x)-clearance,capBottom(x+w)-clearance);
    }

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
  for(const win of windows){
    const v=config.windowOverrides?.[win.key]||{},oldW=win.width,oldH=win.height,w=Number(v.widthMm)||oldW,h=Number(v.heightMm)||oldH;
    if(w<100||h<100||w>30000||h>30000){errors.push(`${win.key}: проверьте размеры окна.`);continue;}
    win.outline=win.outline.map(([x,y])=>[x*w/oldW,y*h/oldH]);win.roughOutline=win.roughOutline.map(([x,y])=>[x*(w+2*clearance)/(oldW+2*clearance),y*(h+2*clearance)/(oldH+2*clearance)]);
    win.width=w;win.height=h;win.leftHeight*=h/oldH;win.rightHeight*=h/oldH;
    if(Number.isFinite(v.xMm))win.x=v.xMm;if(Number.isFinite(v.sillMm))win.y=v.sillMm;
  }
  if(config.autoClip||config.transoms?.length)for(const win of windows){const expanded=expandFacadeRing(win.outline,clearance).map(p=>p.map(n=>Math.round(n*1000)/1000)),xs=expanded.map(p=>p[0]),ys=expanded.map(p=>p[1]),left=Math.min(...xs),bottom=Math.min(...ys);win.roughBounds={left,bottom,width:Math.max(...xs)-left,height:Math.max(...ys)-bottom};win.roughOutline=expanded.map(([x,y])=>[x-left,y-bottom]);}
  for(let i=members.length-1;i>=0;i--)if(config.memberOverrides?.[members[i].key]?.exclude)members.splice(i,1);
  for(const member of members){const v=config.memberOverrides?.[member.key]||{},base=Number(envelope.wall.baseZMm)||0;if(Number.isFinite(v.z1))member.a=[member.a[0],v.z1-base];if(Number.isFinite(v.z2))member.b=[member.b[0],v.z2-base];}
  for(const win of windows){const shape=openingPolygon({facadeId:config.id,width:win.width,height:win.height,outline:win.outline},1,win.x,win.y);if(shapeArea(clipping.difference(shape,envelope.shape))>1)errors.push(`${win.key}: окно выходит за контур.`);}
  return {errors:[...new Set(errors)],warnings,windows,members,shape:envelope.shape};
}
export function facadeMemberShapes(config,layout){
  return layout.members.map(member=>{
    const a=member.a,b=member.b,dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),half=member.cutWidth/2,n=[-dy/l*half,dx/l*half];
    return {key:member.key,shape:[[[a[0]+n[0],a[1]+n[1]],[b[0]+n[0],b[1]+n[1]],[b[0]-n[0],b[1]-n[1]],[a[0]-n[0],a[1]-n[1]]]]};
  });
}
function expandFacadeRing(ring,gap){
 const area=ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0),sign=area<0?-1:1;
 const lines=ring.map((a,i)=>{const b=ring[(i+1)%ring.length],d=[b[0]-a[0],b[1]-a[1]],l=Math.hypot(...d);return {a:[a[0]+sign*d[1]/l*gap,a[1]-sign*d[0]/l*gap],d};});
 return lines.map((line,i)=>{const p=lines[(i+lines.length-1)%lines.length],cross=p.d[0]*line.d[1]-p.d[1]*line.d[0];if(Math.abs(cross)<1e-8)return line.a;const dx=line.a[0]-p.a[0],dy=line.a[1]-p.a[1],t=(dx*line.d[1]-dy*line.d[0])/cross;return [p.a[0]+t*p.d[0],p.a[1]+t*p.d[1]];});
}
// A deliberate beam edit rebuilds dependent pane positions; catalogue and price choices remain.
function resetFacadePanePositions(config){
 for(const v of Object.values(config.windowOverrides||{}))for(const key of ['xMm','sillMm','widthMm','heightMm'])delete v[key];
 return config;
}
export function moveFacadeTransom(config,key,zMm){
 if(!Number.isFinite(zMm))throw new Error('Задайте отметку перемычки.');
 const next=resetFacadePanePositions(structuredClone(config));next.autoClip=true;
 if(key==='main'){next.transomMm=zMm;next.transomOverrides={};}
 else {const extra=(next.transoms||[]).find(t=>key===`transom:${t.id}`||key.startsWith(`transom-${t.id}-`));if(extra)extra.zMm=zMm;else if(key.startsWith('header-'))next.transomOverrides={...next.transomOverrides,[key]:zMm};else throw new Error('Выберите горизонтальную перемычку.');}
 return next;
}
export function appendFacadeTransom(config,zMm,fromPost,toPost){
 if((config.transoms||[]).length>=24)throw new Error('Максимум 24 дополнительные перемычки.');
 return {...resetFacadePanePositions(structuredClone(config)),autoClip:true,transoms:[...(config.transoms||[]),{id:crypto.randomUUID(),zMm,fromPost:fromPost||config.postRefs?.[0],toPost:toPost||config.postRefs?.at(-1)}]};
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
  // Keep identifiers of explicitly reused wall posts so roof bindings survive.
  const adopted=new Set(Object.values(config.postSourceIds||{}).filter(id=>oldSupports.some(s=>s.id===id&&(s.facadeId===config.id||s.frameWallId===config.wallId&&s.frameFloor===config.floor)&&s.type==='post')));
  const memberId=key=>adopted.has(config.postSourceIds?.[key])?config.postSourceIds[key]:prefix+key;
  const supports=layout.members.map(member=>{
    const a=at(member.a),b=at(member.b),override=config.memberOverrides?.[member.key]||{};
    const previous=oldSupports.find(s=>s.id===memberId(member.key));
    return {id:memberId(member.key),facadeId:config.id,facadeMemberKey:member.key,facadeTransomId:member.transomId,name:`${config.name} · ${member.name}`,type:member.type,profile:member.profile,
      packageCount:Number(config.plies),packageProfile:`${Number(config.boardWidthMm)}×${Number(config.boardDepthMm)}`,packagePricing:config.packagePricing==='package'?'package':'board',nodeRef:config.nodeRef||'',
      x1:a[0],y1:a[1],z1:a[2],x2:b[0],y2:b[1],z2:b[2],estimateEnabled:true,estimateCatalogId:config.catalogId||'',
      startSupport:member.startKey?memberId(member.startKey):config.foundationRef?prefix+'foundation-'+member.key:previous?.startSupport||'',endSupport:member.endKey?memberId(member.endKey):previous?.endSupport||'',foundationRef:previous?.foundationRef||'',...override};
  });
  if(config.foundationRef)for(const member of supports.filter(s=>s.type==='post'))supports.push({id:prefix+'foundation-'+member.facadeMemberKey,facadeId:config.id,type:'foundation',name:`Основание · ${member.name}`,x1:member.x1,y1:member.y1,z1:member.z1,x2:member.x1,y2:member.y1,z2:member.z1,foundationRef:config.foundationRef,nodeRef:config.nodeRef||'',profile:'',referenceOnly:false});
  if(!config.foundationRef)for(const member of supports.filter(s=>s.type==='post')){const foundation=oldSupports.find(s=>s.type==='foundation'&&s.id===member.startSupport&&(s.id===member.id+'-foundation'||s.facadeId===config.id));if(foundation)supports.push({...foundation,facadeId:config.id,x1:member.x1,x2:member.x1,y1:member.y1,y2:member.y1,z1:member.z1,z2:member.z1});}
  const retained=oldSupports.filter(s=>s.facadeId!==config.id&&!supports.some(g=>g.id===s.id)&&!adopted.has(s.id)&&!(config.foundationRef&&[...adopted].some(id=>s.id===id+'-foundation')));
  if(retained.length+supports.length>200)throw new Error('Превышен лимит 200 опор. Уменьшите число элементов.');
  next.settings.productionCutting.roofSupports=[...retained,...supports];
  const oldOpenings=plan.openings||[],oldProducts=next.windowProducts||[];
  const generated=layout.windows.map(win=>{
    const id=prefix+win.key,bounds=win.roughBounds||{left:-Number(config.clearanceMm),bottom:-Number(config.clearanceMm),width:win.width+2*Number(config.clearanceMm),height:win.height+2*Number(config.clearanceMm)},mid=at([win.x+bounds.left+bounds.width/2,0]);
    const gap=Number(config.clearanceMm),roughWidth=bounds.width,roughHeight=bounds.height;
    const opening={id,facadeId:config.id,facadeWindowKey:win.key,facadeXMm:win.x+bounds.left,type:'window',outer:true,x:mid[0]/1000,y:mid[1]/1000,orientation:Math.abs(dx)>.5?'h':'v',angle:Math.atan2(dy,dx)*180/Math.PI,width:roughWidth/1000,height:Math.max(...win.roughOutline.map(p=>p[1]))/1000,sillHeight:(win.y+bounds.bottom)/1000,outline:win.roughOutline.map(p=>p.map(v=>v/1000)),displayOutline:win.outline.map(([x,y])=>[(x-bounds.left)/1000,(y-bounds.bottom)/1000]),include:true,includeInEstimate:true,subtractFromSip:true};
    const old=config.windowOverrides?.[win.key]?.productTemplate||oldProducts.find(p=>p.openingId===id),product=createWindowFromDesign(WINDOW_DESIGN_LIBRARY[0],{...old,id:old?.id||prefix+'product-'+win.key,facadeId:config.id,openingId:id,installationGaps:{leftMm:-bounds.left,rightMm:bounds.width-win.width+bounds.left,bottomMm:-bounds.bottom,topMm:bounds.height-win.height+bounds.bottom},mark:`${config.name} · ${win.key}`,shape:win.shape,apexPosition:win.apexPosition,widthMm:win.width,heightMm:win.height,leftHeightMm:win.leftHeight,rightHeightMm:win.rightHeight,roughOpening:{widthMm:roughWidth,heightMm:roughHeight,source:'Геометрия фасада и заданный монтажный зазор'},sections:old?.sections||[{id:'section-1',openingMode:'fixed',ratio:1}],price:old?.price||{mode:'design_unpriced',history:[]}});
    if(old){const resized=resizeWindowProduct(old,{widthMm:product.widthMm,heightMm:product.heightMm,leftHeightMm:product.leftHeightMm,rightHeightMm:product.rightHeightMm});product.price=resized.price;product.sections=resized.sections;product.geometryPriceReview=resized.geometryPriceReview;}
    if(old&&product.price?.mode!=='reference_area'&&['shape','widthMm','heightMm','leftHeightMm','rightHeightMm','apexPosition'].some(k=>(old[k]??null)!==(product[k]??null)))product.geometryPriceReview=true;
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
  for(const link of config.links||[]){const item=next.settings.productionCutting.roofSupports.find(s=>s.id===link.supportId&&s.facadeId!==config.id),target=supports.find(s=>s.id===memberId(link.memberKey));if(!item||!target)continue;item[link.end==='start'?'startSupport':'endSupport']=target.id;if(link.snap){const suffix=link.end==='start'?'1':'2';item['x'+suffix]=target.x2;item['y'+suffix]=target.y2;item['z'+suffix]=target.z2;}}
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

// A horizontal row shares one elevation across all adjacent bays.
export function facadeRowKey(config,memberKey){
 const extra=(config.transoms||[]).find(t=>memberKey===`transom:${t.id}`||memberKey.startsWith(`transom-${t.id}-`));
 return extra?`transom:${extra.id}`:memberKey==='main'||memberKey.startsWith('header-')?'main':null;
}
export function moveFacadeRow(config,memberKey,zMm){
 const key=facadeRowKey(config,memberKey);if(!key)throw new Error('Выберите горизонтальный ряд перемычек.');
 return moveFacadeTransom(config,key,zMm);
}
