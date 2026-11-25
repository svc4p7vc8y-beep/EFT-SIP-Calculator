import {rafterEndOutline} from './rafter-end-cuts.js';
import {roofAt} from './roof-project.js';
import {planIntersection} from './roof-fabrication.js';
import {roofMemberGeometry} from './roof-rafter-detail.js';

// Saved axes are assembly geometry. Expansion is shared by takeoff and cutting.
export function configureDrawnBearingTruss(member,project,model){
 const profile=String(project.settings.roof.rafterSection||'50x150').replace(/[xх]/g,'×'),depth=Number(profile.split('×')[1]);
 const height=(x,y)=>{const hit=roofAt(model,x,y).sort((a,b)=>b.z-a.z)[0];if(!hit)throw Error('Конец фермы должен находиться под кровлей.');return hit.z-depth/(2*hit.face.normal[2])-depth/2;};
 return {...member,type:'purlin',name:'Ферма-прогон',planName:'Ферма-прогон',profile,z1:height(member.x1,member.y1),z2:height(member.x2,member.y2),bearingTruss:true,trussDepthMm:Math.max(330,depth+50),trussWebStepMm:600,trussRafterOverhangMm:0,trussOverhangStartMm:0,trussOverhangEndMm:0,estimateEnabled:true,estimateCatalogId:'',referenceOnly:false};
}
export function expandBearingTrusses(items,stockLength=6000){
 return items.flatMap(item=>{
  if(!item.bearingTruss)return [item];
  const A=[item.x1,item.y1,item.z1].map(Number),B=[item.x2,item.y2,item.z2].map(Number),L=Math.hypot(B[0]-A[0],B[1]-A[1]);
  const depth=Number(item.trussDepthMm),section=String(item.profile).split(/[×xх]/).map(Number),d=section[1];
  if(!(L>=300&&depth>d&&section.length===2&&section.every(n=>n>0)))return [];
  const step=Math.max(100,Math.min(2000,Number(item.trussWebStepMm)||600)),count=Math.min(200,Math.ceil(L/step));
  const at=(s,z=0)=>A.map((n,k)=>n+(B[k]-n)*s/L-(k===2?z:0));
  const rows=[],add=(id,type,name,a,b,role)=>{if(Math.hypot(...a.map((n,k)=>b[k]-n))<1)return;rows.push({...item,bearingTruss:false,bearingTrussId:item.id,trussId:item.id,trussRole:role,id:`${item.id}:${id}`,type,name:`Ферма-прогон · ${name}`,flat:false,referenceOnly:false,estimateEnabled:true,x1:a[0],y1:a[1],z1:a[2],x2:b[0],y2:b[1],z2:b[2]});};
  const max=Math.max(100,Number(stockLength)||6000)-2*(Number(item.trussEndAllowanceMm)||0),stations=Array.from({length:count+1},(_,i)=>L*i/count);
  // Chord joints occur at web nodes, never silently across an unsupported bay.
  let start=0,index=0;while(start<L-.01){const end=L-start<=max?L:stations.filter(s=>s>start+.01&&s-start<=max).at(-1);if(end==null)return [];
   add(`top:${index}`,'purlin','верхний пояс',at(start),at(end),'upperChord');add(`bottom:${index}`,'tie','нижний пояс',at(start,depth),at(end,depth),'lowerChord');start=end;index++;
  }
  for(let i=0;i<=count;i++)add(`post:${i}`,'post','стойка',at(stations[i],depth-d/2),at(stations[i],d/2),'web');
  return rows;
 });
}

export function createBearingTruss(project,assembly){
 const ring=assembly.floors.at(-1)?.contour||[],faces=assembly.roofModel.faces.filter(f=>f.group==='main'&&!f.warm);
 const edges=ring.map((a,i)=>{const b=ring[(i+1)%ring.length],ha=roofAt({faces},...a)[0],hb=roofAt({faces},...b)[0];return {a,b,ha,hb,L:Math.hypot(b[0]-a[0],b[1]-a[1])};}).filter(e=>e.ha&&e.hb&&e.L>=300&&Math.abs(e.ha.z-e.hb.z)<1).sort((a,b)=>b.ha.z-a.ha.z||b.L-a.L);
 const edge=edges[0];if(!edge)throw new Error('Нет горизонтального опорного края холодной кровли. Нарисуйте прогон вручную и включите «Ферма-прогон».');
 const profile=String(project.settings.roof.rafterSection||'50x150').replace(/[xх]/g,'×'),d=Number(profile.split('×')[1]);
 const top=edge.ha.z-d/(2*edge.ha.face.normal[2])-d/2,plate=assembly.roofTimbers.find(m=>m.name==='Мауэрлат'),bottom=assembly.roofTimbers.find(m=>m.roofMemberKind==='flat-frame-chord')?.worldA?.[2]??(plate?plate.plateTopZ+d/2:top-330);
 const id=`bearing-truss-${crypto.randomUUID()}`;
 return {id,type:'purlin',name:'Ферма-прогон',planName:'Ферма-прогон',planGroupId:id,planEndpointEditable:true,profile,x1:edge.a[0],y1:edge.a[1],z1:top,x2:edge.b[0],y2:edge.b[1],z2:top,bearingTruss:true,trussDepthMm:Math.max(d+50,top-bottom),trussWebStepMm:600,trussRafterOverhangMm:0,trussOverhangStartMm:0,trussOverhangEndMm:0,estimateEnabled:true,estimateCatalogId:'',referenceOnly:false,nodeRef:'',startSupport:'',endSupport:'',foundationRef:''};
}

export function trussAxis(item){
 const a=[item.x1,item.y1,item.z1].map(Number),b=[item.x2,item.y2,item.z2].map(Number),L=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
 const at=s=>a.map((n,k)=>n+(b[k]-n)*s/L);
 return {...item,x1:at(-Number(item.trussOverhangStartMm||0))[0],y1:at(-Number(item.trussOverhangStartMm||0))[1],z1:at(-Number(item.trussOverhangStartMm||0))[2],x2:at(L+Number(item.trussOverhangEndMm||0))[0],y2:at(L+Number(item.trussOverhangEndMm||0))[1],z2:at(L+Number(item.trussOverhangEndMm||0))[2]};
}

export function applyBearingTrusses(assembly,settings){
 const trusses=(settings.roofSupports||[]).filter(m=>m.bearingTruss&&!m.referenceOnly).map(trussAxis);
 for(const r of assembly.rafters){if(!r.worldA||!r.worldB)continue;
  const originalA=[...r.worldA],originalB=[...r.worldB],L=Math.hypot(originalB[0]-originalA[0],originalB[1]-originalA[1]);if(L<1)continue;
  const hits=trusses.flatMap(t=>{const a=[t.x1,t.y1,t.z1],b=[t.x2,t.y2,t.z2],hit=planIntersection(originalA,originalB,a,b);return hit?[{t,a,b,hit}]:[];});
  const used=new Set();
  for(const {t,a,b,hit}of hits.sort((a,b)=>Math.min(a.hit.t,1-a.hit.t)-Math.min(b.hit.t,1-b.hit.t))){
   const end=hit.t<=.5?'A':'B';if(used.has(end))continue;used.add(end);
   const d=Number(String(r.profile).split(/[×xх]/)[1])||0,td=Number(String(t.profile).split(/[×xх]/)[1])||0,nz=r.normal?.[2]||1;
   const z=a[2]+(b[2]-a[2])*hit.u+td/2,oldZ=originalA[2]+(originalB[2]-originalA[2])*hit.t;
   // Preserve roof planes. A moved support which misses the underside is diagnosed.
   if(Math.abs(z-(oldZ-d/(2*nz)))>5){assembly.issues.push(`${t.name}: верхний пояс не совпадает с низом стропила ${r.id}. Проверьте отметку Z.`);continue;}
   const overhang=Math.max(0,Math.min(3000,Number(t.trussRafterOverhangMm)||0)),s=hit.t+(end==='A'?-overhang:overhang)/L;
   r['world'+end]=originalA.map((n,k)=>n+(originalB[k]-n)*s);r[end.toLowerCase()]=r['world'+end].slice(0,2);
   Object.assign(r,roofMemberGeometry(r.worldA,r.worldB,r.profile),{length:Math.ceil(Math.hypot(...r.worldA.map((n,k)=>r.worldB[k]-n))),bearingTrussId:t.id,bearingStatus:'geometry-only',bearingPoint:[originalA[0]+(originalB[0]-originalA[0])*hit.t,originalA[1]+(originalB[1]-originalA[1])*hit.t,z]});
   const m=assembly.members.find(m=>m.id===r.id);if(m)Object.assign(m,{worldA:r.worldA,worldB:r.worldB,length:r.length,cutLength:r.length+2*Number(settings.endAllowanceMm||0),bearingTrussId:t.id});
   if(m&&settings.rafterEndCuts){const cut=rafterEndOutline(r.worldA,r.worldB,d);if(cut)Object.assign(m,{endCutOutline:cut.outline,cutLength:cut.blankLength+2*Number(settings.endAllowanceMm||0)});}
   // The horizontal lower chord butts into the inner side of the truss.
   for(const chord of assembly.roofTimbers.filter(c=>c.id.startsWith(r.id+'-НП')&&c.worldA&&c.worldB)){
    const crossing=planIntersection(chord.worldA,chord.worldB,a,b);if(!crossing)continue;
    const ce=crossing.t<=.5?'A':'B',cd=Number(String(chord.profile).split(/[×xх]/)[1])||0,lowerZ=a[2]+(b[2]-a[2])*crossing.u-Number(t.trussDepthMm);
    if(Math.abs(chord['world'+ce][2]-lowerZ)>(cd+td)/2)continue;
    const cL=Math.hypot(chord.worldB[0]-chord.worldA[0],chord.worldB[1]-chord.worldA[1]),width=Number(String(t.profile).split(/[×xх]/)[0]),q=crossing.t+(ce==='A'?1:-1)*width/(2*cL),point=chord.worldA.map((n,k)=>n+(chord.worldB[k]-n)*q);
    chord['world'+ce]=point;chord[ce.toLowerCase()]=point.slice(0,2);chord.length=Math.ceil(Math.hypot(...chord.worldA.map((n,k)=>chord.worldB[k]-n)));chord.bearingTrussId=t.id;
    const cm=assembly.members.find(m=>m.id===chord.id);if(cm)Object.assign(cm,{worldA:chord.worldA,worldB:chord.worldB,length:chord.length,cutLength:chord.length+2*Number(settings.endAllowanceMm||0)});
   }
  }
 }
}
