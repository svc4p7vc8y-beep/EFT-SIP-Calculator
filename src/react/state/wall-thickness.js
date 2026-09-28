// An explicit construction selection applies to all floors: SIP settings are project-wide.
export function synchronizeWallThickness(project, key) {
  const sip=project.settings.sip;
  const plans=[project.plan,...(project.upperFloors||[])];
  if(key==='wallThickness') {
    const thickness=Number(sip.wallThickness);
    if(thickness>0)for(const plan of plans)plan.wallThickness=thickness/1000;
  }
  if(['partitionType','partitionThickness','partitionFrameSection'].includes(key)) {
    const thickness=sip.partitionType==='sip'?Number(sip.partitionThickness):sip.partitionFrameSection==='50x150'?150:100;
    if(thickness>0)for(const plan of plans)plan.partitionThickness=thickness/1000;
  }
  return project;
}
