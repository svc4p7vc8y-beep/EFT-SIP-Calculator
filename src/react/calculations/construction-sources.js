import {houseContourPoints,boundsOf,roomPoints} from '../planner/geometry.js';
import {normalizeConstructionSources,ROLE_LABELS} from '../state/construction-sources.js';

const near=(a,b)=>Math.abs(a-b)<1e-8;
const same=(a,b)=>near(a.x,b.x)&&near(a.y,b.y);
const sameSegment=(a,b,c,d)=>(same(a,c)&&same(b,d))||(same(a,d)&&same(b,c));
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
export function constructionSource(plan,edge,saved,floor=1) {
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
  const roomContribution=(plan.rooms||[]).filter(r=>r.include!==false).some(r=>{
    const points=roomPoints(r);return points.some((p,i)=>overlaps(edge.a,edge.b,p,points[(i+1)%points.length]));
  });
  const source=contributors[0];
  if(roomContribution||contributors.length!==1||typeof source?.id!=='string'||!source.id.trim()||walls.filter(w=>w.id===source.id).length!==1||
    !sameSegment(edge.a,edge.b,{x:source.x1,y:source.y1},{x:source.x2,y:source.y2}))
    return unresolved('Комнатный, объединённый, разделённый или неоднозначный участок: прежний ID не назначен.');
  return {constructionSourceId:`partition:${encodeURIComponent(source.id)}`,sourceIdentityStatus:'registered-source',
    constructionSourceRef:{kind:'plan-wall',id:source.id}};
}
