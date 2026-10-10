import { productionLevels } from './production-levels.js';
import { productionScene } from './production-scene.js';

import { AUTO_ROOF_LAYOUT,normalizeAutoRoofSupports } from '../state/auto-roof-supports.js';
export { AUTO_ROOF_LAYOUT,ROOF_SUPPORT_VARIANTS,normalizeAutoRoofSupports } from '../state/auto-roof-supports.js';
const section=value=>/^\d+×\d+$/.test(value)&&value.split('×').every(n=>Number(n)>0&&Number(n)<=10000);
const heightInSection=(section,x)=>{
  const [a,b]=[section.a,section.b],t=(x-a[0])/(b[0]-a[0]);
  return t>=-1e-6&&t<=1+1e-6?a[1]+t*(b[1]-a[1]):null;
};
const crossing=(a,b,c,d)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],ex=d[0]-c[0],ey=d[1]-c[1],den=dx*ey-dy*ex;
  if(Math.abs(den)<1e-8)return null;
  const t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/den,u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/den;
  return t>=0&&t<=1&&u>=0&&u<=1?t:null;
};

// A geometric template, NOT automatic structural design. It reads the current
// roof sections or actual SIP panel planes; it never changes roof calculations.
export function generateRoofSupportLayout(project,report,value) {
  const config=normalizeAutoRoofSupports(value),a=report.assembly,errors=[],warnings=[];
  const fail=message=>({items:[],errors:[message],warnings,counts:{purlins:0,posts:0}});
  if(!project.services.roof)return fail('Кровля отключена в параметрах проекта.');
  const floor=a.floors.at(-1),ring=floor?.contour||[];
  if(ring.length!==4||new Set(ring.map(p=>p.join(','))).size!==4||!ring.every((p,i)=>{const q=ring[(i+1)%4];return p.every(Number.isFinite)&&(p[0]===q[0]||p[1]===q[1]);}))return fail('Автосхема доступна для прямоугольного контура. Для сложной крыши разместите прогоны вручную.');
  if(!['gable','flat','tiered'].includes(a.roofShape)||a.rafterSystem==='truss')return fail('Для этой конструкции кровли требуется ручная проектная схема опор.');
  if(a.roofShape==='flat'&&project.settings.roof.flatSlopeMode==='tapered')return fail('Разуклонка не задаёт наклон несущей конструкции. Сначала укажите конструктивную схему кровли.');
  if(!section(config.purlinProfile)||!section(config.postProfile))return fail('Задайте положительные проектные сечения прогонов и стоек.');
  if(config.distribution==='uniform'&&(!Number.isInteger(config.postCount)||config.postCount<2||config.postCount>30))return fail('Количество стоек на прогон: целое число от 2 до 30.');
  const {roofBase}=productionLevels(project,a.floors.length),baseZ=config.baseZ===''?roofBase:config.baseZ;
  if(!Number.isFinite(baseZ)||Math.abs(baseZ)>100000)return fail('Неверная нижняя отметка стоек.');
  const axis=a.axis==='x'?0:1,across=1-axis,origin=[a.bounds.x,a.bounds.y],length=axis===0?a.bounds.width:a.bounds.height,span=across===0?a.bounds.width:a.bounds.height;
  if(![...origin,length,span].every(Number.isFinite)||length<=0||span<=0)return fail('Задайте корректные положительные размеры контура кровли.');
  const fractions=config.variant==='single'?[.5]:config.variant==='double'?[.25,.75]:[.25,.5,.75];
  const scene=a.roofDrawing?.sections?.length?null:productionScene(report,project);
  const roofZ=(x,y)=>{
    const acrossValue=(across===0?x:y)-origin[across];
    for(const s of a.roofDrawing?.sections||[]){const z=heightInSection(s,acrossValue);if(z!=null)return roofBase+z;}
    // Use a saved production roof panel's plane, not a second roof formula.
    for(const [id,p]of scene?.placements||[]){if(p.layer!=='roof'||Math.abs(p.normal[2])<1e-8)continue;
      if(a.roofShape==='gable'&&(p.v[across]>0?acrossValue>span/2+.1:acrossValue<span/2-.1))continue;
      const z=p.origin[2]-(p.normal[0]*(x-p.origin[0])+p.normal[1]*(y-p.origin[1]))/p.normal[2];
      const surface=report.surfaces.find(surface=>surface.id===id);
      const dx=x-p.origin[0],dy=y-p.origin[1],dz=z-p.origin[2],u=dx*p.u[0]+dy*p.u[1]+dz*p.u[2],v=dx*p.v[0]+dy*p.v[1]+dz*p.v[2];
      if(surface&&u>=-.1&&u<=surface.width+.1&&v>=-.1){
        if(v>surface.height+.1&&!warnings.includes('Плоскость SIP-кровли и край текущей панельной раскладки не совпадают: проверьте длину ската и примыкание к коньку. Автопрогон не исправляет эту раскладку.'))warnings.push('Плоскость SIP-кровли и край текущей панельной раскладки не совпадают: проверьте длину ската и примыкание к коньку. Автопрогон не исправляет эту раскладку.');
        return z;
      }
    }
    return null;
  };
  const items=[];
  for(const [index,fraction]of fractions.entries()){
    const xy=along=>axis===0?[origin[0]+along,origin[1]+span*fraction]:[origin[0]+span*fraction,origin[1]+along];
    const start=xy(0),end=xy(length),z=roofZ(...start),zEnd=roofZ(...end),beamId=`auto-roof-p${index+1}`;
    if(z==null||zEnd==null){errors.push(`Прогон ${index+1}: нет подтверждённой геометрии ската. Используйте ручное размещение.`);continue;}
    let positions;
    if(config.distribution==='bearing'){
      positions=[0,1,...(floor.bearing||[]).map(e=>crossing(start,end,e.a,e.b)).filter(t=>t!=null)];
      positions=[...new Set(positions.map(t=>Math.round(t*length)))].sort((x,y)=>x-y).map(d=>d/length);
      if(positions.length===2)warnings.push(`Прогон ${index+1}: пересечений с внутренними несущими стенами нет, оставлены только крайние стойки.`);
    }else positions=Array.from({length:config.postCount},(_,i)=>i/(config.postCount-1));
    const posts=positions.map((t,i)=>{
      const [x,y]=xy(length*t).map(Math.round),topZ=Math.round(z+(zEnd-z)*t);
      if(topZ<=baseZ){errors.push(`Прогон ${index+1}: нижняя отметка стойки должна быть ниже прогона.`);return null;}
      return {id:`${beamId}-s${i+1}`,type:'post',name:`Стойка ${index+1}.${i+1}`,profile:config.postProfile,nodeRef:config.nodeRef,
        x1:x,y1:y,z1:baseZ,x2:x,y2:y,z2:topZ,upperSupport:beamId,startSupport:'',endSupport:'',foundationRef:'',autoLayout:AUTO_ROOF_LAYOUT,
        estimateCatalogId:config.postCatalogId,estimateEnabled:config.estimateEnabled&&!!config.postCatalogId};
    }).filter(Boolean);
    const beam={id:beamId,type:'purlin',name:`Прогон ${index+1}`,profile:config.purlinProfile,nodeRef:config.nodeRef,x1:start[0],y1:start[1],z1:Math.round(z),x2:end[0],y2:end[1],z2:Math.round(zEnd),startSupport:posts[0]?.id||'',endSupport:posts.at(-1)?.id||'',foundationRef:'',autoLayout:AUTO_ROOF_LAYOUT,
      estimateCatalogId:config.purlinCatalogId,estimateEnabled:config.estimateEnabled&&!!config.purlinCatalogId};
    items.push(beam,...posts);
  }
  if(items.length>200)errors.push('Автосхема превышает ограничение 200 элементов. Уменьшите количество стоек.');
  warnings.push('Расстановка геометрическая: крайние стойки и промежуточные опоры не подтверждают передачу нагрузки к фундаменту. Нижние опоры, сечения, осевые отметки и рабочие узлы проверить по проекту.');
  if(errors.length)return {items:[],errors,warnings,counts:{purlins:0,posts:0}};
  const counts={purlins:items.filter(i=>i.type==='purlin').length,posts:items.filter(i=>i.type==='post').length};
  return {items,errors,warnings,counts,baseZ};
}

export function mergeRoofSupportLayout(existing,generated) {
  const kept=existing.filter(item=>item.autoLayout!==AUTO_ROOF_LAYOUT||item.autoLocked),mapping=new Map(),fresh=[];
  const same=(a,b)=>a.type===b.type&&a.profile===b.profile&&['x1','y1','z1','x2','y2','z2'].every(key=>Number(a[key])===Number(b[key]));
  for(const item of generated){const match=kept.find(old=>old.id===item.id||same(old,item));if(match)mapping.set(item.id,match.id);else fresh.push({...item});}
  for(const item of fresh)for(const key of ['startSupport','endSupport','upperSupport'])if(mapping.has(item[key]))item[key]=mapping.get(item[key]);
  if(kept.length+fresh.length>200)throw new Error('Общее количество проектных элементов превышает 200. Ручные элементы сохранены; автосхема не применена.');
  // Preserve the order (and displayed marks) of surviving physical positions.
  const remaining=new Map([...kept,...fresh].map(item=>[item.id,item])),ordered=[];
  for(const item of existing){if(remaining.has(item.id)){ordered.push(remaining.get(item.id));remaining.delete(item.id);}}
  return [...ordered,...remaining.values()];
}
