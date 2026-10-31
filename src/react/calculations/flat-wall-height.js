import {houseContourPoints,boundsOf} from '../planner/geometry.js';
export function flatWallSpan(project) {
  const plans=[project.plan,...(project.upperFloors||[])],plan=plans[Math.max(0,Math.min(plans.length-1,Number(project.meta.floors||1)-1))];
  const bounds=boundsOf(houseContourPoints(plan));
  return ['left','right'].includes(project.settings.roof.flatSlopeDirection)?bounds.w:bounds.h;
}
export const flatWallDrop=project=>flatWallSpan(project)*Math.max(0,Number(project.settings.roof.flatSlopePercent)||0)/100;
export function setFlatWallDrop(project,value) {
  project.settings.roof.flatSlopePercent=Math.max(0,Math.min(20,Number(value)/(flatWallSpan(project)||1)*100));
  project.settings.roof.flatWallHeightReference='high';
}
export const highFlatWall=roof=>roof.flatWallHeightReference==='high';
