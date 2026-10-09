import {houseContourPoints,boundsOf,roomPoints} from '../planner/geometry.js';
import {normalizeConstructionSources,ROLE_LABELS} from '../state/construction-sources.js';

const near=(a,b)=>Math.abs(a-b)<1e-8;
const same=(a,b)=>near(a.x,b.x)&&near(a.y,b.y);
const sameSegment=(a,b,c,d)=>(same(a,c)&&same(b,d))||(same(a,d)&&same(b,c));
const contains=(p,r)=>{const dx=r.b.x-r.a.x,dy=r.b.y-r.a.y,l2=dx*dx+dy*dy;
  const t=((p.x-r.a.x)*dx+(p.y-r.a.y)*dy)/(l2||1);return t>=-1e-8&&t<=1+1e-8;};
function overlaps(a,b,c,d) {
  const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);
  if(!l||[c,d].some(p=>Math.abs(dx*(p.y-a.y)-dy*(p.x-a.x))/l>1e-8))return false;
  const at=p=>((p.x-a.x)*dx+(p.y-a.y)*dy)/l;
  return Math.min(l,Math.max(at(c),at(d)))-Math.max(0,Math.min(at(c),at(d)))>1e-8;
}
export function rectangleRole(plan,a,b) {
  const contour=houseContourPoints(plan),bounds=boundsOf(contour);
  if(plan.house?.contourDefined===false||contour.length!==4||!(bounds.w>0&&bounds.h>0)||
    new Set(contour.map(p=>`${p.x}:${p.y}`)).size!==4||
    !contour.every((p,i)=>[p.x,p.y].every(Number.isFinite)&&
      (near(p.x,bounds.x)||near(p.x,bounds.x2))&&(near(p.y,bounds.y)||near(p.y,bounds.y2))&&
      (near(p.x,contour[(i+1)%4].x)||near(p.y,contour[(i+1)%4].y))))return null;
  if(near(a.y,bounds.y)&&near(b.y,bounds.y))return 'top';
  if(near(a.y,bounds.y2)&&near(b.y,bounds.y2))return 'bottom';
  if(near(a.x,bounds.x)&&near(b.x,bounds.x))return 'left';
  if(near(a.x,bounds.x2)&&near(b.x,bounds.x2))return 'right';
  return null;
}
// Identity of a source construction, not the identity of its generated parts.
function automaticConstructionSource(plan,edge,saved,floor=1) {
  const unresolved=reason=>({sourceIdentityStatus:'needs-review',sourceIdentityReason:reason});
  if(floor!==1)return unresolved('Исходные ID верхних этажей — следующий этап.');
  if(edge.outer) {
    const role=rectangleRole(plan,edge.a,edge.b);
    if(!role)return unresolved('Непрямоугольный контур: нужна явная идентичность рёбер.');
    const id=normalizeConstructionSources(saved).exterior[role];
    return {sourceIdentityStatus:id?'registered-source':'needs-registration',sourceRole:role,
      sourceRoleLabel:ROLE_LABELS[role],...(id?{constructionSourceId:`exterior:${id}`}:{})};
  }
  const walls=(plan.walls||[]).filter(w=>w.include!==false);
  const contributors=walls.filter(w=>overlaps(edge.a,edge.b,{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}));
  const roomSources=[];
  const rooms=(plan.rooms||[]).filter(r=>r.include!==false&&!r.extension);
  for(const room of rooms){
    const points=roomPoints(room),localPlan={house:{points,contourDefined:true}};
    points.forEach((a,i)=>{const b=points[(i+1)%points.length];if(overlaps(edge.a,edge.b,a,b))
      roomSources.push({kind:'room-side',id:room.id,name:room.name||'Комната',role:rectangleRole(localPlan,a,b),a,b});});
  }
  const refs=[...contributors.map(w=>({kind:'plan-wall',id:w.id,name:'Линия перегородки',a:{x:w.x1,y:w.y1},b:{x:w.x2,y:w.y2}})),...roomSources];
  const sourceContributors=refs.map(({a,b,...ref})=>({...ref,roleLabel:ROLE_LABELS[ref.role],complete:sameSegment(edge.a,edge.b,a,b)}));
  const diagnose=(code,label,reason)=>({...unresolved(reason),sourceTopology:code,sourceTopologyLabel:label,sourceContributors});
  if(roomSources.length){
    if(contributors.length)return diagnose('mixed-sources','Смешанные источники','Граница комнаты совпадает с отдельной линией. Требуется выбор исходной конструкции.');
    if(roomSources.some(r=>!r.role))return diagnose('unsupported-room-contour','Непрямоугольная комната','Рёбра непрямоугольных комнат пока не имеют постоянных исходных ID.');
    if(roomSources.some(r=>typeof r.id!=='string'||!r.id.trim()||rooms.filter(room=>room.id===r.id).length!==1)||roomSources.length>2)
      return diagnose('ambiguous-sources','Неоднозначные источники','Отсутствуют уникальные ID комнат либо совпадают более двух границ.');
    if(sourceContributors.some(r=>!r.complete)){
      // Distinguish a subsegment from an extension of the same source.
      const isSplit=refs.every(r=>contains(edge.a,r)&&contains(edge.b,r));
      return diagnose(isSplit?'split-source':'merged-sources',isSplit?'Часть исходной стороны':'Объединённые / частично совпадающие стороны','Участок не совпадает с целой исходной стороной. Проверьте разделение и объединение; прежние правки не переносятся.');
    }
    const opposite={top:'bottom',bottom:'top',left:'right',right:'left'};
    if(roomSources.length===2&&(roomSources[0].id===roomSources[1].id||opposite[roomSources[0].role]!==roomSources[1].role))
      return diagnose('ambiguous-sources','Наложение комнат','Совпадающие границы не являются противоположными сторонами двух комнат.');
    const pairs=roomSources.map(r=>[r.id,r.role]).sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:1);
    return {constructionSourceId:`room-boundary:${JSON.stringify(pairs)}`,sourceIdentityStatus:'registered-source',
      sourceTopology:roomSources.length===2?'shared-room-boundary':'single-room-side',
      sourceTopologyLabel:roomSources.length===2?'Общая сторона двух комнат':'Целая сторона комнаты',sourceContributors,
      constructionSourceRef:{kind:'room-boundary',sides:pairs}};
  }
  const source=contributors[0];
  if(!source)return diagnose('unresolved-source','Источник не найден','Нет соответствующей исходной линии.');
  if(contributors.some(w=>typeof w.id!=='string'||!w.id.trim()||walls.filter(other=>other.id===w.id).length!==1)||
    (contributors.length>1&&sourceContributors.every(r=>r.complete)))
    return diagnose('ambiguous-sources','Неоднозначные исходные линии','Повторяющиеся ID или несколько целиком совпадающих линий.');
  if(contributors.length!==1||!sourceContributors[0].complete){
    const split=refs.every(r=>contains(edge.a,r)&&contains(edge.b,r));
    return diagnose(split?'split-source':'merged-sources',split?'Часть исходной линии':'Объединённые исходные линии','Объединённый или разделённый участок: прежний ID не назначен.');
  }
  return {constructionSourceId:`partition:${encodeURIComponent(source.id)}`,sourceIdentityStatus:'registered-source',
    sourceTopology:'single-wall',sourceTopologyLabel:'Целая исходная линия',sourceContributors,
    constructionSourceRef:{kind:'plan-wall',id:source.id}};
}

// Lookup is deliberately geometry-bound: it does not transfer a declaration to a moved wall.
export function sourceBindingKey(edge,floor=1) {
  return JSON.stringify([floor,[edge.a,edge.b].map(p=>[p.x,p.y]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])]);
}
export function constructionSource(plan,edge,saved,floor=1) {
  const result=automaticConstructionSource(plan,edge,saved,floor);
  if(edge.outer||floor!==1)return result;
  const sourceBinding=normalizeConstructionSources(saved).selections?.[sourceBindingKey(edge,floor)];
  const base={...result,sourceBindingKey:sourceBindingKey(edge,floor)};
  if(!sourceBinding)return base;
  const matches=(result.sourceContributors||[]).filter(r=>r.kind===sourceBinding.kind&&r.id===sourceBinding.id&&r.role===sourceBinding.role);
  const collection=sourceBinding.kind==='plan-wall'?(plan.walls||[]).filter(w=>w.include!==false):(plan.rooms||[]).filter(r=>r.include!==false&&!r.extension);
  const valid=matches.length===1&&matches[0].complete&&collection.filter(r=>r.id===sourceBinding.id).length===1;
  if(!valid){
    const {constructionSourceId,constructionSourceRef,...rest}=base;
    return {...rest,sourceBinding,sourceIdentityStatus:'needs-review',sourceIdentityReason:'Ручная привязка больше не применима: источник отсутствует, неоднозначен или не покрывает участок целиком.'};
  }
  const constructionSourceId=sourceBinding.kind==='plan-wall'?`partition:${encodeURIComponent(sourceBinding.id)}`:`room-boundary:${JSON.stringify([[sourceBinding.id,sourceBinding.role]])}`;
  return {...base,sourceBinding,constructionSourceId,constructionSourceRef:sourceBinding,
    sourceIdentityStatus:'registered-source',sourceIdentityReason:undefined,sourceSelectionLabel:'Источник выбран вручную; остальные совпадающие линии не удалены.'};
}
