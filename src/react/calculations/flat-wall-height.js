import {houseContourPoints,boundsOf} from '../planner/geometry.js';
export function flatWallSpan(project) {
  const plans=[project.plan,...(project.upperFloors||[])],plan=plans[Math.max(0,Math.min(plans.length-1,Number(project.meta.floors||1)-1))];
  const bounds=boundsOf(houseContourPoints(plan));
  return ['left','right'].includes(project.settings.roof.flatSlopeDirection)?bounds.w:bounds.h;
}
export const flatWallDrop=project=>flatWallSpan(project)*Math.max(0,Number(project.settings.roof.flatSlopePercent)||0)/100;
export function setFlatWallDrop(project,value) {
  if(Number(value)===Number(flatWallDrop(project).toFixed(2)))return;
  project.settings.roof.flatSlopePercent=Math.max(0,Math.min(20,Number(value)/(flatWallSpan(project)||1)*100));
  if(project.settings.roof.flatSlopeMode==='structural')project.settings.roof.flatWallHeightReference='high';
}
export const highFlatWall=roof=>roof.flatWallHeightReference==='high';

export const flatSlopeAngle=project=>Math.atan(Math.max(0,Number(project.settings.roof.flatSlopePercent)||0)/100)*180/Math.PI;
export function setFlatSlopeAngle(project,value){if(Number(value)===Number(flatSlopeAngle(project).toFixed(1)))return;project.settings.roof.flatSlopePercent=Math.max(0,Math.min(20,Math.tan(Math.max(0,Number(value)||0)*Math.PI/180)*100));}
