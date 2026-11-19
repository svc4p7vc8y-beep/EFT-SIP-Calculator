import {partitionRuns,houseContourPoints} from '../planner/geometry.js';
import {partitionMaterial,partitionMaterialEdges} from '../planner/partition-material.js';
import {calculatePlanMetrics} from '../../calculations/plan-metrics.js';
import {partitionHeight} from '../../calculations/floor-height.js';
import {partitionTopFit,partitionProfileArea,partitionProfileTopLength} from './partition-top-fit.js';
export const hasPartitionMaterials=plan=>partitionMaterialEdges(plan).some(e=>['sip','frame'].includes(e.partitionType));
export function partitionMaterialPlan(plan,type,defaultType){
 const base={...plan,partitionDefaultType:defaultType},runs=partitionRuns(base),contour=houseContourPoints(plan);
 const selected=o=>{if(o.outer===true)return true;const distance=([a,b])=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(o.x-a.x-t*dx,o.y-a.y-t*dy);};const near=runs.map(run=>({run,d:distance(run)})).sort((a,b)=>a.d-b.d)[0];if(!near)return o.outer!==false;const outer=Math.min(...contour.map((p,i)=>distance([p,contour[(i+1)%contour.length]])));if(o.outer!==false&&outer<near.d)return true;return partitionMaterial(base,...near.run,defaultType)===type;};
 return {...base,partitionMaterialFilter:type,openings:(plan.openings||[]).filter(selected),wallGaps:(plan.wallGaps||[]).filter(selected)};
}
export function partitionMaterialQuantities(project,metrics,type){
 const fallback=project.settings.sip.partitionType==='sip'?'sip':'frame';
 return metrics.floorPlans.map(({plan,floor})=>{
  if(!hasPartitionMaterials(plan))return {plan,area:type===fallback?Number(floor===1?metrics.firstFloorPartitionNetArea:metrics.secondFloorPartitionNetArea)||0:0,length:type===fallback?Number(floor===1?metrics.firstFloorPartitionLength:metrics.secondFloorPartitionLength)||0:0,fit:type===fallback?metrics.partitionFits?.[floor]:null};
  const view=partitionMaterialPlan(plan,type,fallback),m=calculatePlanMetrics(view);let delta=0,grossArea=0,topLength=0,changed=false;
  for(const [a,b]of partitionRuns(view)){const A=[a.x*1000,a.y*1000],B=[b.x*1000,b.y*1000],height=partitionHeight(plan)*1000,L=Math.hypot(B[0]-A[0],B[1]-A[1]),profile=partitionTopFit(project,plan,floor,metrics.partitionFitContext,A,B,height),area=profile?partitionProfileArea(profile):L*height/1e6;grossArea+=area;topLength+=profile?partitionProfileTopLength(profile):L/1000;if(profile){delta+=area-L*height/1e6;changed=true;}}
  return {plan:view,area:Math.max(0,m.partitionNetArea+delta),length:m.partitionLength,fit:changed?{grossArea,topLength}:null};
 });
}
