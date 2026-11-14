import {boardFootprint} from './partition-geometry.js';
import {houseContourPoints} from '../planner/geometry.js';

export function wallPoint(wall,x,z=0){
  const length=Math.hypot(wall.planEnd[0]-wall.planStart[0],wall.planEnd[1]-wall.planStart[1])||1;
  return [wall.planStart[0]+(wall.planEnd[0]-wall.planStart[0])*x/length,wall.planStart[1]+(wall.planEnd[1]-wall.planStart[1])*x/length,(wall.baseZMm||0)+z];
}
export function wallStation(wall,point){
  const dx=wall.planEnd[0]-wall.planStart[0],dy=wall.planEnd[1]-wall.planStart[1],length=Math.hypot(dx,dy)||1;
  return ((point[0]-wall.planStart[0])*dx+(point[1]-wall.planStart[1])*dy)/length;
}
export function structuralStuds(report,wall){
  return report.members.filter(m=>m.surfaceId===wall.id&&!m.excluded&&m.a&&m.b&&Math.abs(m.b[0]-m.a[0])<1&&Math.abs(m.b[1]-m.a[1])>100);
}
// Overrides refer to the original manufacturing key, so subsequent renders do
// not accumulate a displacement. A moved SIP connector requires a working node.
export function applyStructuralOffsets(members,surfaces,settings,issue){
  for(const m of members){
    const override=settings.memberOverrides?.[m.key],dx=Number(override?.frameOffsetMm);
    if(!dx)continue;
    const wall=surfaces.find(s=>s.id===m.surfaceId);
    if(!wall?.planStart||!m.a||!m.b||Math.abs(m.a[0]-m.b[0])>1||!Number.isFinite(dx)||Math.abs(dx)>100000){issue('FRAME_OFFSET',`${m.id}: перемещение допустимо только для вертикальной стойки стены.`,m.key);continue;}
    const half=(Number(m.faceWidth)||Number(m.profile?.split(/[×xх]/)[0])||50)/2,x=m.a[0]+dx;
    if(x-half<-.1||x+half>wall.width+.1||(wall.openings||[]).some(o=>x+half>o.x&&x-half<o.x+o.width&&Math.max(...[m.a[1],m.b[1]])>Number(o.sill)&&Math.min(...[m.a[1],m.b[1]])<Number(o.sill)+o.height)){
      issue('FRAME_OFFSET',`${m.id}: стойка выходит за стену или пересекает проём; перемещение не применено.`,m.key);continue;
    }
    m.a=[x,m.a[1]];m.b=[m.b[0]+dx,m.b[1]];
    if(m.outline)m.outline=m.outline.map(([x,y])=>[x+dx,y]);
    if(!override.nodeRef?.trim())issue('FRAME_NODE',`${m.id}: перемещена стойка; согласуйте паз SIP и рабочий узел.`,m.key);
  }
}
export function framePost(project,wall,{x,height,plies=2,width=50,depth=150,nodeRef='',foundationRef='',catalogId=''}){
  if(![x,height,plies,width,depth].every(Number.isFinite)||x<width*plies/2||x>wall.width-width*plies/2||height<=0||height>20000||![1,2,3].includes(plies)||width<20||depth<50)throw new Error('Проверьте положение, высоту и сечение стойки.');
  if(project.settings.productionCutting.roofSupports.length>=200)throw new Error('Достигнут лимит 200 опор.');
  const a=wallPoint(wall,x),b=wallPoint(wall,x,height);
  if(wall.exterior){const plan=wall.floor===1?project.plan:project.upperFloors[wall.floor-2],points=houseContourPoints(plan),sign=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0)<0?-1:1,dx=(wall.planEnd[0]-wall.planStart[0])/wall.width,dy=(wall.planEnd[1]-wall.planStart[1])/wall.width,inset=Number(wall.thickness)/2;for(const p of [a,b]){p[0]-=sign*dy*inset;p[1]+=sign*dx*inset;}}
  return {id:`frame-post-${crypto.randomUUID()}`,frameWallId:wall.id,frameFloor:wall.floor,type:'post',name:`Стойка стены · ${plies} доски`,profile:`${width*plies}×${depth}`,packageCount:plies,packageProfile:`${width}×${depth}`,packagePricing:'board',x1:a[0],y1:a[1],z1:a[2],x2:b[0],y2:b[1],z2:b[2],nodeRef,foundationRef,estimateEnabled:true,estimateCatalogId:catalogId,startSupport:'',endSupport:''};
}
export {boardFootprint};
