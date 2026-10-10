import { partitionRuns, partitionDepth } from '../planner/geometry.js';
import { bearingForSegment, splitAtBearingEdges } from './bearing-walls.js';
import { partitionHeight } from '../../calculations/floor-height.js';
import { normalizeProductionCutting } from '../state/production-cutting.js';
import { partitionFrameMembers } from './partition-cutting.js';
import { houseContourPoints } from '../planner/geometry.js';
import { cuttingRevision } from './production-controls.js';
import clipping from 'polygon-clipping';
import { refreshPartitionNotches } from './partition-geometry.js';
import { localWallSettings } from '../planner/wall-layout.js';

export function mergePartitionSegments(segments) {
  const groups=new Map();
  for(const [a,b]of segments){const length=Math.hypot(b.x-a.x,b.y-a.y);if(!length)continue;
    let ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;if(ux<-1e-8||(Math.abs(ux)<1e-8&&uy<0)){ux=-ux;uy=-uy;}
    const offset=-uy*a.x+ux*a.y,key=`${ux.toFixed(6)}:${uy.toFixed(6)}:${offset.toFixed(3)}`;
    if(!groups.has(key))groups.set(key,{ux,uy,offset,spans:[]});
    const x=ux*a.x+uy*a.y,y=ux*b.x+uy*b.y;groups.get(key).spans.push([Math.min(x,y),Math.max(x,y)]);
  }
  const result=[];
  for(const {ux,uy,offset,spans}of groups.values()){
    const merged=[];for(const span of spans.sort((a,b)=>a[0]-b[0])){const last=merged.at(-1);if(last&&span[0]<=last[1]+.001)last[1]=Math.max(last[1],span[1]);else merged.push([...span]);}
    merged.forEach(([start,end])=>result.push([{x:ux*start-uy*offset,y:uy*start+ux*offset},{x:ux*end-uy*offset,y:uy*end+ux*offset}]));
  }
  return result;
}
export function partitionSegments(plan) {
  return splitAtBearingEdges(plan,partitionRuns(plan));
}
export function partitionBacking(plan,a,b,segments=partitionSegments(plan)) {
  const contour=houseContourPoints(plan),all=[...segments,...contour.map((p,i)=>[p,contour[(i+1)%contour.length]])];
  const connects=p=>all.some(([u,v])=>{
    const dx=v.x-u.x,dy=v.y-u.y,l=Math.hypot(dx,dy),wallDx=b.x-a.x,wallDy=b.y-a.y;
    if(!l||Math.abs(dx*wallDy-dy*wallDx)<.0001)return false;
    const t=((p.x-u.x)*dx+(p.y-u.y)*dy)/(l*l);
    const distance=Math.abs(dx*(p.y-u.y)-dy*(p.x-u.x))/l;
    const outer=contour.some((q,i)=>q===u&&contour[(i+1)%contour.length]===v);
    return t>=-.001&&t<=1.001&&(outer?distance<.015||Math.abs(distance-(Number(plan.wallThickness)||.174))<.015:distance<.015||(plan.partitionJunctions==='butt'&&Math.abs(distance-partitionDepth(plan,u,v)/2)<.015));
  });
  return {startBacking:connects(a),endBacking:connects(b)};
}
export function partitionJunctionStuds(plan,a,b,segments=partitionSegments(plan)){
  const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);if(!l)return [];
  const positions=[];
  for(const [u,v]of segments){const cross=dx*(v.y-u.y)-dy*(v.x-u.x);if(Math.abs(cross)<.0001)continue;
    for(const p of [u,v]){const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/(l*l),distance=Math.abs(dx*(p.y-a.y)-dy*(p.x-a.x))/l;
      if(t>.001&&t<.999&&(distance<.015||plan.partitionJunctions==='butt'&&Math.abs(distance-partitionDepth(plan,a,b)/2)<.015))positions.push(Math.round(t*l*1000));}
  }
  return [...new Set(positions)];
}
// Shared with production: all=true returns the complete detailed frame;
// all=false returns only the additions to the legacy allowance.
export function partitionReinforcements(project,plan,floor=1,all=false) {
  if(!project.services.partitions||project.settings.sip.partitionType==='sip')return [];
  const settings=normalizeProductionCutting(project.settings.productionCutting),segments=partitionSegments(plan),members=[];
  const contour=houseContourPoints(plan),edges=[...contour.map((a,i)=>({a,b:contour[(i+1)%contour.length],outer:true})),...segments.map(([a,b],i)=>({a,b,outer:false,index:i}))];
  const assigned=new Map(segments.map((_,i)=>[i,[]])),blocked=new Set();
  for(const o of [...(plan.openings||[]),...(plan.wallGaps||[]).map(g=>({...g,type:'gap',height:partitionHeight(plan)}))].filter(o=>o.include!==false&&o.subtractFromSip!==false)){
    if(![o.x,o.y,o.width,o.height].every(v=>v!=null&&Number.isFinite(Number(v)))){segments.forEach((_,i)=>blocked.add(i));continue;}
    const choices=edges.filter(e=>(typeof o.outer!=='boolean'||o.outer===e.outer)&&(!e.outer||project.services.sipWalls)&&
      (o.orientation==='h'?Math.abs(e.a.y-e.b.y)<.001:o.orientation==='v'?Math.abs(e.a.x-e.b.x)<.001:true)).map(e=>{
        const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,l=Math.hypot(dx,dy),u=((o.x-e.a.x)*dx+(o.y-e.a.y)*dy)/(l||1),t=Math.max(0,Math.min(l,u))/(l||1);
        return {...e,u,distance:Math.hypot(o.x-e.a.x-dx*t,o.y-e.a.y-dy*t)};
      }).sort((a,b)=>a.distance-b.distance);
    const near=choices[0];
    if(!near||near.distance>Math.max(Number(plan.wallThickness)||.174,.1)+.03||(choices[1]&&Math.abs(choices[1].distance-near.distance)<.001)){
      choices.filter(e=>!e.outer).forEach(e=>blocked.add(e.index));continue;
    }
    if(!near.outer)assigned.get(near.index).push({key:`${floor}:${o.id}`,gap:o.type==='gap',x:Math.round(near.u*1000)-Math.round(Number(o.width)*1000)/2,width:Math.round(Number(o.width)*1000),height:Math.round(Number(o.height)*1000),sill:o.type==='gap'?0:settings.openingSills[`${floor}:${o.id}`]??(o.sillHeight!==''&&o.sillHeight!=null?Math.round(Number(o.sillHeight)*1000):o.type==='door'?0:settings.windowSillMm)});
  }
  segments.forEach(([a,b],i)=>{
    const length=Math.hypot(b.x-a.x,b.y-a.y),bearing=bearingForSegment(plan,a,b),openings=[];
    openings.push(...assigned.get(i));
    const id=`Э${floor}-ПГ${i+1}`,start=[a.x,a.y].map(v=>Math.round(v*1000)),end=[b.x,b.y].map(v=>Math.round(v*1000)),wallKey=`${id}@${start.join(',')}:${end.join(',')}`;
    const s={id,name:`Перегородка ${id}`,width:Math.round(length*1000),height:Math.round(partitionHeight(plan)*1000)+(Number(settings.wallAdditions[wallKey])||0),bearing:!!bearing,frameProfile:(bearing?.profile||localWallSettings(plan,a,b)?.frameProfile||project.settings.sip.partitionFrameSection||'50x100').replace(/[xх]/g,'×'),topPlateLayers:Math.max(1,Math.round(Number(project.settings.formulas.partitionTopPlateLayers)||1)),openings,...partitionBacking(plan,a,b,segments)};
    s.junctionStuds=partitionJunctionStuds(plan,a,b,segments);
    openings.filter(o=>o.gap).forEach(o=>o.height=s.height);
    if(!Number.isFinite(s.width)||!Number.isFinite(s.height)||blocked.has(i)||openings.some(o=>o.x< -1||o.x+o.width>s.width+1||!(o.width>0&&o.height>0)||o.sill===''||!Number.isFinite(Number(o.sill))||Number(o.sill)<0||Number(o.sill)+o.height>s.height+1))return;
    const rectangle=(x,y,w,h)=>[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]];
    const holes=openings.map(o=>rectangle(o.x,Number(o.sill),o.width,o.height));
    if(holes.some((h,j)=>holes.slice(j+1).some(other=>clipping.intersection(h,other).length)))return;
    const geometry=holes.length?clipping.difference(rectangle(0,0,s.width,s.height),...holes):[rectangle(0,0,s.width,s.height)];
    const layoutKey=`${id}:${cuttingRevision([geometry,start,end])}`;
    for(const m of partitionFrameMembers(s,settings).filter(m=>all||m.reinforcement)){
      const key=`detail:${m.id}:${cuttingRevision([layoutKey,m.a,m.b,m.profile,m.length,m.source])}`,override=settings.memberOverrides[key]||{};
      if(override.exclude)continue;
      if(override.profile&&/^\d+(?:[×хx]\d+)$/.test(override.profile))m.profile=override.profile.replace(/[xх]/g,'×');
      if(override.length!==''&&override.length!=null&&Number(override.length)>0)m.length=Number(override.length);
      m.cutLength=m.length+2*Number(settings.endAllowanceMm||0);members.push(m);
    }
  });
  return refreshPartitionNotches(members);
}

export function reinforcementBoardCount(members,stockLength,kerf=0) {
  const bars=[];let oversize=0;
  for(const m of [...members].sort((a,b)=>b.cutLength-a.cutLength)){
    if(m.cutLength>stockLength){oversize+=Math.ceil(m.cutLength/stockLength);continue;}
    let bar=bars.filter(b=>b.material===m.material&&b.used+kerf+m.cutLength<=stockLength).sort((a,b)=>b.used-a.used)[0];
    if(!bar){bar={material:m.material,used:0};bars.push(bar);}
    bar.used+=(bar.used?kerf:0)+m.cutLength;
  }
  return bars.length+oversize;
}
