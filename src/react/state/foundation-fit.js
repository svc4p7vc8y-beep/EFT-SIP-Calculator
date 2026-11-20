import {generateAutoPileRows,bindingLinesWithManual,calculateFoundation} from '../calculations/foundation-model.js';
import {bindingPackageWidthMm} from '../calculations/foundation-reference.js';
import {houseContourPoints,boundsOf} from '../planner/geometry.js';

// Explicit project action. Existing projects are never moved by migration.
export function fitFoundationToFloor(project) {
  const settings=project.settings.piles;
  if(settings.pileType==='slab')throw new Error('Для плитного фундамента свайная привязка не применяется.');
  const auto=generateAutoPileRows(project.plan,settings.spacing,{mode:settings.autoLayoutMode,rowSpacing:settings.autoRowSpacing,includeInteriorWalls:settings.autoIncludeInteriorWalls,reference:'floorEdges',bindingWidthMm:bindingPackageWidthMm(settings)});
  const previous=new Map((project.plan.pileRows||[]).filter(r=>r.auto).map(r=>[r.id,r]));
  for(const row of auto){const old=previous.get(row.id);if(old&&old.count===row.count&&['x1','y1','x2','y2'].every(k=>Math.abs(old[k]-row[k])<.001))row.pileOffsets=old.pileOffsets;}
  project.plan.pileRows=[...(project.plan.pileRows||[]).filter(r=>!r.auto),...auto];
  project.plan.bindingLines=bindingLinesWithManual(project.plan,project.plan.pileRows);
  settings.layoutReference='floorEdges';settings.externalBindingDatum=true;
  project.plan.showPiles=true;project.plan.showBinding=true;
  return project;
}
export function foundationFootprint(project) {
  const outside=boundsOf(houseContourPoints(project.plan)),f=calculateFoundation(project.plan,{...project.settings.piles,includePlatforms:false});
  const axes=f.points.length?boundsOf(f.points):null,widthMm=bindingPackageWidthMm(project.settings.piles);
  const dimensions=b=>b?{...b,width:b.w,height:b.h}:null;
  return {outside:dimensions(outside),axes:dimensions(axes),widthMm,proposed:{width:outside.w-widthMm/1000,height:outside.h-widthMm/1000}};
}
const datumKey=p=>JSON.stringify([p.plan.house,p.settings.piles.bindingType,p.settings.piles.bindingBoardWidthMm,p.settings.piles.bindingBoardHeightMm,p.settings.piles.bindingLayers,p.settings.piles.boardVolumePerMeter,p.settings.piles.spacing,p.settings.piles.autoLayoutMode,p.settings.piles.autoRowSpacing]);
export function syncFoundationDatum(previous,next){
  if(next.settings.piles.externalBindingDatum!==true||next.settings.piles.layoutReference!=='floorEdges'||datumKey(previous)===datumKey(next))return next;
  try{fitFoundationToFloor(next);delete next.settings.piles.datumIssue;}catch(error){next.settings.piles.datumIssue=error.message;}
  return next;
}
