import {houseContourPoints,boundsOf,roomPoints,preservePlanAttachments,resizeProjectHouse} from '../planner/geometry.js';
import {bindingPackageWidthMm,foundationAxisContour,offsetFoundationContour} from '../calculations/foundation-reference.js';
import {calculateFoundation,bindingLinesWithManual} from '../calculations/foundation-model.js';
const round=n=>Math.round(n*1e6)/1e6;
const key=ring=>JSON.stringify(ring.map(p=>[round(p.x),round(p.y)]));
function actualRectangleAxes(project,ring){
  if(ring.length!==4||ring.some((p,i)=>{const q=ring[(i+1)%4];return Math.abs(p.x-q.x)>.001&&Math.abs(p.y-q.y)>.001;}))return null;
  const points=calculateFoundation(project.plan,{...project.settings.piles,includePlatforms:false}).points;
  if(points.length<4)return null;const source=boundsOf(ring),target=boundsOf(points);if(target.w<.2||target.h<.2)return null;
  return ring.map(p=>({x:Math.abs(p.x-source.x)<.001?target.x:target.x2,y:Math.abs(p.y-source.y)<.001?target.y:target.y2}));
}
// Move only points attached to the changed exterior. Interior axes, equipment,
// pile rows and manually positioned roof members keep their world coordinates.
function moveExterior(plan,outer){
  const before=structuredClone(plan),old=houseContourPoints(plan),wall=Number(plan.wallThickness)||.174;
  const move=(p,tolerance)=>{
    let x=p.x,y=p.y;
    old.forEach((a,i)=>{const b=old[(i+1)%old.length],c=outer[i],d=outer[(i+1)%outer.length];if(!c||!d)return;
      if(Math.abs(a.x-b.x)<1e-6&&Math.abs(p.x-a.x)<=tolerance&&p.y>=Math.min(a.y,b.y)-tolerance&&p.y<=Math.max(a.y,b.y)+tolerance)x+=c.x-a.x;
      if(Math.abs(a.y-b.y)<1e-6&&Math.abs(p.y-a.y)<=tolerance&&p.x>=Math.min(a.x,b.x)-tolerance&&p.x<=Math.max(a.x,b.x)+tolerance)y+=c.y-a.y;
    });return {x:round(x),y:round(y)};
  };
  for(const room of plan.rooms||[]){if(room.extension)continue;room.points=roomPoints(room).map(p=>move(p,wall+.002));Object.assign(room,boundsOf(room.points));}
  for(const row of ['openings','wallGaps'])for(const item of plan[row]||[])if(item.outer!==false)Object.assign(item,move(item,wall+.002));
  const oldBox=boundsOf(old),newBox=boundsOf(outer);
  for(const p of plan.platforms||[]){
    if(Math.abs(p.x-oldBox.x2)<.003)p.x=round(p.x+newBox.x2-oldBox.x2);
    else if(Math.abs(p.x+p.w-oldBox.x)<.003)p.x=round(p.x+newBox.x-oldBox.x);
    if(Math.abs(p.y-oldBox.y2)<.003)p.y=round(p.y+newBox.y2-oldBox.y2);
    else if(Math.abs(p.y+p.h-oldBox.y)<.003)p.y=round(p.y+newBox.y-oldBox.y);
  }
  for(const line of plan.walls||[]){const a=move({x:line.x1,y:line.y1},.002),b=move({x:line.x2,y:line.y2},.002);Object.assign(line,{x1:a.x,y1:a.y,x2:b.x,y2:b.y});}
  const bounds=boundsOf(outer);plan.house={...plan.house,points:outer.map(p=>({x:round(p.x),y:round(p.y)})),w:round(bounds.w),h:round(bounds.h)};
  preservePlanAttachments(plan,before);
}
export function canUsePileAxisEnvelope(project){
  return project.settings.piles.pileType!=='slab'&&project.settings.piles.pileAxisAuto!==false&&(project.plan.bindingLines||[]).filter(l=>l.include!==false&&l.group!=='platform').length>=2;
}
export function applyPileAxisEnvelope(project,axisContour){
  if(!canUsePileAxisEnvelope(project))return project;
  const settings=project.settings.piles,old=houseContourPoints(project.plan);
  const axes=axisContour||project.plan.house.pileAxisContour||actualRectangleAxes(project,old)||(['floorEdges','wallAxes'].includes(settings.layoutReference)?foundationAxisContour(project.plan,settings.layoutReference==='floorEdges'?bindingPackageWidthMm(settings):project.settings.sip.wallThickness):old);
  const outer=offsetFoundationContour(axes,-bindingPackageWidthMm(settings)/2);
  if(key(old)!==key(outer)){
    moveExterior(project.plan,outer);
    for(const upper of project.upperFloors||[])if(key(houseContourPoints(upper))===key(old))moveExterior(upper,outer);
  }
  project.plan.house.pileAxisContour=structuredClone(axes);
  settings.pileAxisDatum=true;settings.externalBindingDatum=false;settings.layoutReference='floorEdges';
  delete settings.datumIssue;
  return project;
}
export function syncPileAxisEnvelope(previous,next){
  if(!next.settings.piles.pileAxisDatum||next.settings.piles.pileAxisAuto===false)return next;
  try{
    let axes=next.plan.house.pileAxisContour;
    if(key(houseContourPoints(previous.plan))!==key(houseContourPoints(next.plan))){
      axes=foundationAxisContour(next.plan,bindingPackageWidthMm(previous.settings.piles));
      const actual=actualRectangleAxes(next,axes);
      if(actual){const from=boundsOf(actual),to=boundsOf(axes),move=p=>({x:round(to.x+(p.x-from.x)*to.w/from.w),y:round(to.y+(p.y-from.y)*to.h/from.h)});
        for(const row of ['pileRows','bindingLines'])for(const line of next.plan[row]||[]){if(line.group==='platform')continue;const a=move({x:line.x1,y:line.y1}),b=move({x:line.x2,y:line.y2});Object.assign(line,{x1:a.x,y1:a.y,x2:b.x,y2:b.y});}
        for(const row of ['piles','excludedPiles'])for(const p of next.plan[row]||[])if(p.foundationSource!=='platform')Object.assign(p,move(p));
      }
    }else if(JSON.stringify(previous.plan.pileRows)!==JSON.stringify(next.plan.pileRows)||JSON.stringify(previous.plan.piles)!==JSON.stringify(next.plan.piles)){
      axes=actualRectangleAxes(next,axes)||axes;
      if(next.settings.piles.autoSyncBinding!==false)next.plan.bindingLines=bindingLinesWithManual(next.plan,next.plan.pileRows);
    }
    return applyPileAxisEnvelope(next,axes);
  }catch(error){next.settings.piles.datumIssue=error.message;return next;}
}
export function resizePileAxisEnvelope(project,width,height){
  const axes=project.plan.house.pileAxisContour||houseContourPoints(project.plan),box=boundsOf(axes),sx=width/box.w,sy=height/box.h;
  if(!(sx>0&&sy>0))return project;
  resizeProjectHouse(project,project.plan.house.w*sx,project.plan.house.h*sy);
  const scaled=axes.map(p=>({x:round(p.x*sx),y:round(p.y*sy)}));
  project.plan.house.pileAxisContour=scaled;
  return applyPileAxisEnvelope(project,scaled);
}
