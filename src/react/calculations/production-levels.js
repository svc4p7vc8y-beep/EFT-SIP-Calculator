import { exteriorHeight } from '../../calculations/floor-height.js';

// Shared elevations of the existing production model (mm).
export function productionLevels(project,floorCount) {
  const plans=[project.plan,...(project.upperFloors||[])].slice(0,floorCount||1),bases=[0];
  for(let i=1;i<plans.length;i++)bases[i]=bases[i-1]+exteriorHeight(plans[i-1],project.settings.sip)*1000+Number(project.settings.sip.secondFloorThickness||0);
  const top=plans.length-1;
  return {plans,bases,roofBase:bases[top]+exteriorHeight(plans[top],project.settings.sip)*1000};
}
