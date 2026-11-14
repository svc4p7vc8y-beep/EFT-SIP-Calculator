import {roomPoints} from '../planner/geometry.js';
import {calculatePlanMetrics} from '../../calculations/plan-metrics.js';

// Fill only the missing ceiling band along eaves of open-ceiling rooms.
// Roof, room and base wall dimensions are never changed by this adapter.
export function secondLightWallProfile(plan,edge,sip,roof,enabled=true) {
  const base=edge.baseHeight,width=edge.length;
  if(!enabled||!['gable','hip'].includes(roof.shape)||roof.type!=='cold'||plan.secondLightWallFit===false)return null;
  const axis=roof.ridgeAxis==='x'?'x':'y';
  if(roof.shape==='gable'&&Math.abs(edge.a[axis]-edge.b[axis])<.001)return null;
  const openRooms=(plan.rooms||[]).filter(r=>r.include!==false&&!r.extension&&['open','open-rafter'].includes(r.ceilingMode)&&r.openCeilingArea!==0);
  if(!openRooms.length)return null;
  const gap=calculatePlanMetrics(plan).ceilingArea>0?Math.max(0,Number(sip.ceilingThickness)||0)/1000:0;
  const dx=(edge.end.x-edge.start.x)/width,dy=(edge.end.y-edge.start.y)/width,tolerance=(Number(plan.wallThickness)||.174)+.04;
  const zones=[];
  for(const room of openRooms){
    if(room.include===false||room.extension||!['open','open-rafter'].includes(room.ceilingMode)||room.openCeilingArea===0)continue;
    const pts=roomPoints(room),rise=room.secondLightEaveHeightMm==null?gap:Math.max(0,Number(room.secondLightEaveHeightMm)/1000-base);
    if(!(rise>0)||rise>10)continue;
    for(let i=0;i<pts.length;i++){
      const a=pts[i],b=pts[(i+1)%pts.length];
      const distance=p=>Math.abs((p.x-edge.start.x)*dy-(p.y-edge.start.y)*dx);
      if(distance(a)>tolerance||distance(b)>tolerance)continue;
      const at=p=>(p.x-edge.start.x)*dx+(p.y-edge.start.y)*dy;
      const first=Math.min(at(a),at(b)),last=Math.max(at(a),at(b));
      const from=first<=tolerance?0:Math.max(0,first),to=last>=width-tolerance?width:Math.min(width,last);
      if(to-from>.01)zones.push({from,to,rise});
    }
  }
  if(!zones.length)return null;
  const breaks=[...new Set([0,width,...zones.flatMap(z=>[z.from,z.to])])].sort((a,b)=>a-b),profile=[];
  for(let i=0;i<breaks.length-1;i++){
    const a=breaks[i],b=breaks[i+1],mid=(a+b)/2,h=base+Math.max(0,...zones.filter(z=>mid>=z.from&&mid<=z.to).map(z=>z.rise));
    if(!profile.length||Math.abs(profile.at(-1)[1]-h)>.000001)profile.push([a,h]);
    profile.push([b,h]);
  }
  return profile;
}
export function wallProfileArea(wall) {
  const p=wall.topProfile;
  return p?p.slice(1).reduce((s,q,i)=>s+(q[0]-p[i][0])*(q[1]+p[i][1])/2,0):wall.length*(wall.heightStart+wall.heightEnd)/2;
}
