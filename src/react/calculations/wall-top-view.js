import clipping from 'polygon-clipping';
import { pointBounds } from './drawing-dimensions.js';

// A display section through the existing fabrication geometry, not a new layout.
export function panelSection(part,height=1000) {
  if(!part.shape?.length)return [];
  const rings=part.shape.map(r=>r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]?r:[...r,r[0]]);
  return clipping.intersection(rings,[[[-1e7,height],[1e7,height],[1e7,height+.01],[-1e7,height+.01],[-1e7,height]]])
    .map(p=>{const b=pointBounds(p.flat());return {x:b.x,width:b.width,part};}).filter(p=>p.width>.01);
}

export function wallTopView(report,floor=1,height=1000) {
  const contour=report.assembly.floors.find(f=>f.floor===floor)?.contour||[];
  const signed=contour.reduce((sum,a,i)=>{const b=contour[(i+1)%contour.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
  const partsByWall=new Map(),membersByWall=new Map();
  for(const p of report.parts||[]){if(!partsByWall.has(p.surfaceId))partsByWall.set(p.surfaceId,[]);partsByWall.get(p.surfaceId).push(p);}
  for(const m of report.members||[]){if(m.excluded)continue;if(!membersByWall.has(m.surfaceId))membersByWall.set(m.surfaceId,[]);membersByWall.get(m.surfaceId).push(m);}
  const walls=report.surfaces.filter(s=>s.planStart&&s.planEnd&&s.floor===floor).map(s=>{
    const partition=s.id.includes('-ПГ'),frame=!!s.frameOnly||!!s.partitionFrame;
    const depth=frame?(Number(s.frameProfile?.split(/[×xх]/)[1])||Number(s.thickness)):Number(s.thickness);
    const offset=partition?-depth/2:0,side=partition?1:signed<0?-1:1;
    const angle=Math.atan2(s.planEnd[1]-s.planStart[1],s.planEnd[0]-s.planStart[0])*180/Math.PI;
    const panels=(partsByWall.get(s.id)||[]).flatMap(p=>panelSection(p,height));
    const studs=(membersByWall.get(s.id)||[]).filter(m=>m.a&&m.b&&Math.abs(m.a[0]-m.b[0])<.01&&Math.min(m.a[1],m.b[1])<=height&&Math.max(m.a[1],m.b[1])>=height)
      .map(m=>({x:m.a[0],width:Number(m.profile?.split(/[×xх]/)[0])||45,member:m}));
    const openings=(s.openings||[]).filter(o=>o.gap||(Number(o.sill)<=height&&Number(o.sill)+o.height>height));
    return {surface:s,partition,frame,depth,offset,side,angle,panels,studs,openings};
  });
  return {contour,walls,box:pointBounds(contour)};
}
