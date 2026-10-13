import { profileHeight } from './attic-partition-profile.js';
import { sipTimberProfile } from './sip-joinery.js';
import { exteriorWallConstruction } from './wall-construction.js';
import { openingWallCandidates } from './wall-geometry-adapter.js';
import { partitionSegments } from './partition-construction.js';

// User-approved 45 mm supplementary jamb boards above heads and below sills.
// Shared geometry for fabrication and the estimate; no opening is moved.
export function sipOpeningInserts(surface,settings,issue=()=>{}) {
  if(surface.blocked)return [];
  const depth=sipTimberProfile(surface.thickness).endBoardDepth,face=settings.profileMode==='estimate'?45:Number(settings.edgeWidthMm)||45;
  const top=x=>surface.topProfile?profileHeight(surface.topProfile,x):surface.heightStart!=null?surface.heightStart+(surface.heightEnd-surface.heightStart)*x/surface.width:surface.height;
  const result=[],seen=new Set(),holes=(surface.openings||[]).filter(o=>!o.gap&&['window','door'].includes(o.type));
  for(const o of holes)for(const side of ['left','right']){
    const x=side==='left'?o.x+face/2:o.x+o.width-face/2;
    const high=Math.min(top(x-face/2),top(x+face/2))-face;
    for(const [zone,low,end] of [['above',Number(o.sill)+o.height+face,high],['below',face,Number(o.sill)-face]]){
      if(!(end>low+.01))continue;
      let spans=[[low,end]];
      for(const other of holes){if(x+face/2<=other.x+.01||x-face/2>=other.x+other.width-.01)continue;
        const a=Number(other.sill)-face,b=Number(other.sill)+other.height+face;
        spans=spans.flatMap(([u,v])=>b<=u||a>=v?[[u,v]]:[[u,Math.min(v,a)],[Math.max(u,b),v]].filter(([u,v])=>v>u+.01));
      }
      for(const [i,[u,v]]of spans.entries()){
        const identity=[x,u,v,depth,face].map(n=>Math.round(n*1000)/1000).join(':');if(seen.has(identity))continue;seen.add(identity);
        const key=`opening-insert:${o.key}:${side}:${zone}:${i}`,override=settings.memberOverrides?.[key]||{};
        const profile=override.profile?.trim()||`${depth}×${face}`,[d,t]=profile.split(/[×xх]/).map(Number),geometricLength=Math.ceil(v-u-.001),length=override.length!==''&&override.length!=null?Number(override.length):geometricLength;
        if(!(d>0&&t>0&&length>0&&length<=100000)){issue('MEMBER_OVERRIDE','Неверное сечение или длина дополнительной доски проёма',key);continue;}
        const center=side==='left'?o.x+t/2:o.x+o.width-t/2;
        result.push({id:`${surface.id}-ДП${result.length+1}`,key,a:[center,u],b:[center,v],length,geometricLength,cutLength:length+2*Number(settings.endAllowanceMm||0),
          profile,estimateProfile:`${depth}×${face}`,faceWidth:t,normalDepthMm:d,role:'opening-insert',material:'Дополнительная доска проёма',source:'Обрамление по схеме EFT',
          surface:surface.name,surfaceId:surface.id,openingRef:o.name,panels:[],excluded:override.exclude===true,nodeRef:override.nodeRef||'',processing:override.processing||'Короткая доска рядом с полной стойкой; встык между обвязкой и доской проёма'});
      }
    }
  }
  return result;
}

export function projectOpeningInserts(project,floorPlans) {
  if(!project.services.sipWalls)return [];
  const settings=project.settings.productionCutting,result=[];
  floorPlans.forEach(({plan},i)=>{
    const walls=exteriorWallConstruction(plan,project.settings.sip,project.settings.roof,i===floorPlans.length-1,project.services.roof).map(w=>({...w,id:`Э${i+1}-С${w.index+1}`,outer:true}));
    const edges=[...walls,...partitionSegments(plan).map(([a,b])=>({a,b,outer:false}))],assigned=new Map(walls.map(w=>[w.id,[]]));
    for(const o of (plan.openings||[]).filter(o=>o.include!==false&&o.subtractFromSip!==false&&o.outer!==false&&['window','door'].includes(o.type))){
      const candidates=openingWallCandidates(o,edges.filter(e=>typeof o.outer!=='boolean'||o.outer===e.outer)),near=candidates[0];
      if(!near?.edge.outer||near.distance>Math.max(Number(plan.wallThickness)||.174,.1)+.03||candidates[1]&&Math.abs(candidates[1].distance-near.distance)<.001)continue;
      const key=`${i+1}:${o.id}`,sill=settings.openingSills[key]??(o.sillHeight!==''&&o.sillHeight!=null?Math.round(Number(o.sillHeight)*1000):o.type==='door'?0:settings.windowSillMm);
      assigned.get(near.edge.id).push({key,name:o.id,type:o.type,x:Math.round(near.u*1000)-Math.round(Number(o.width)*1000)/2-Math.round(near.edge.trimStart*1000),width:Math.round(Number(o.width)*1000),height:Math.round(Number(o.height)*1000),sill});
    }
    for(const w of walls){const wallKey=`${w.id}@${Math.round(w.a.x*1000)},${Math.round(w.a.y*1000)}:${Math.round(w.b.x*1000)},${Math.round(w.b.y*1000)}`,addition=Number(settings.wallAdditions[wallKey])||0;
      const surface={id:w.id,name:w.id,width:Math.round(w.length*1000),heightStart:Math.round(w.heightStart*1000)+addition,heightEnd:Math.round(w.heightEnd*1000)+addition,thickness:project.settings.sip.wallThickness,openings:assigned.get(w.id)};
      if(surface.openings.some(o=>o.x<0||o.x+o.width>surface.width||o.sill===''||!(o.width>0&&o.height>0)))continue;
      result.push(...sipOpeningInserts(surface,settings));
    }
  });
  return result.filter(m=>!m.excluded);
}
