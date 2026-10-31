import {atticPartitionProfile} from './attic-partition-profile.js';
import {structuralFlatRoofRise} from './roof-wall-plate.js';
import {exteriorHeight} from '../../calculations/floor-height.js';
import {productionLevels} from './production-levels.js';

export function partitionTopFit(project,plan,floor,context,a,b,requestedHeight,addition=0) {
  if(!context||addition||plan.partitionFitTop===false||project.settings.sip.partitionTopMode==='manual')return null;
  const {model,calculation,bounds,floorCount}=context;
  if(floor!==floorCount||!project.services.roof)return null;
  const base=productionLevels(project,floorCount).bases[floor-1];
  if(plan.floorType==='attic')return atticPartitionProfile(model,a,b,base,requestedHeight);
  const hasCeiling=project.services.sipCeiling&&calculation.metrics.ceilingArea>0;
  if(!hasCeiling&&model.faces.some(face=>face.group==='main'&&face.warm))return atticPartitionProfile(model,a,b,base,Infinity);
  if(calculation.roof.mainRoofShape==='flat'&&calculation.roof.flatSlopeMode==='structural'){
    const height=exteriorHeight(plan)*1000,width=Math.hypot(b[0]-a[0],b[1]-a[1]);
    return [[0,height+structuralFlatRoofRise(project,calculation,bounds,a)],[width,height+structuralFlatRoofRise(project,calculation,bounds,b)]];
  }
  return null;
}
export const partitionProfileArea=profile=>profile.slice(1).reduce((sum,point,i)=>sum+(point[0]-profile[i][0])*(point[1]+profile[i][1])/2,0)/1e6;
export const partitionProfileTopLength=profile=>profile.slice(1).reduce((sum,point,i)=>sum+Math.hypot(point[0]-profile[i][0],point[1]-profile[i][1]),0)/1000;
