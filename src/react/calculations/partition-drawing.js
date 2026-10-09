import { groupMembers } from './production-cutting.js';
import { dimensionValues } from './drawing-dimensions.js';

// Drawing geometry only: endpoints are cut faces, not centres of square line caps.
export function partitionBoardShape(member) {
  const thickness=Number(member.faceWidth??member.profile?.split(/[×xх]/)[0]);
  if(!member.a||!member.b||!(thickness>0))return null;
  const [x,y]=member.a,[u,v]=member.b,length=Math.hypot(u-x,v-y);
  if(!length)return null;
  const nx=-(v-y)/length*thickness/2,ny=(u-x)/length*thickness/2;
  return [[x+nx,y+ny],[u+nx,v+ny],[u-nx,v-ny],[x-nx,y-ny]];
}
export function partitionDrawingData(surface,members) {
  const boards=members.filter(m=>m.a&&m.b&&!m.excluded);
  const groups=groupMembers(boards),positions=new Map();
  groups.forEach((g,i)=>g.instances.forEach(m=>positions.set(m.id,m.displayMark||i+1)));
  const depth=Number(surface.frameProfile?.split(/[×xх]/)[1])||Number(surface.thickness)||100;
  return {boards,groups,positions,depth,axes:dimensionValues([0,surface.width,...boards.filter(m=>Math.abs(m.a[0]-m.b[0])<.01).map(m=>m.a[0])]),openingX:dimensionValues([0,surface.width,...(surface.openings||[]).flatMap(o=>[o.x,o.x+o.width])])};
}
