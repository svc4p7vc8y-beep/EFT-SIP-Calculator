import {planIntersection} from './roof-fabrication.js';

// Contact with actual wall plates and post-supported beams, not a floating preview.
export function platformRafterBearings(assembly){
 const faces=new Map(assembly.roofModel.faces.map(f=>[f.id,f]));
 for(const platform of assembly.platforms||[]){
  const plates=assembly.roofTimbers.filter(p=>p.name==='Мауэрлат'&&p.worldA&&p.worldB).map(p=>({id:p.id,a:p.worldA,b:p.worldB,topA:p.plateTopA,topB:p.plateTopB}));
  const beams=(platform.ties||[]).map(p=>({...p,topA:p.a[2]+(p.heightMm||Number(p.profile.split(/[×xх]/)[1]))/2,topB:p.b[2]+(p.heightMm||Number(p.profile.split(/[×xх]/)[1]))/2}));
  for(const r of assembly.rafters.filter(r=>faces.get(r.faceId)?.group===`terrace:${platform.id}`)){
   const d=Number(String(r.profile).split(/[×xх]/)[1]),nz=r.normal?.[2]||1,contacts=[];
   for(const support of [...plates,...beams]){
    const h=planIntersection(r.worldA,r.worldB,support.a,support.b);if(!h)continue;
    const center=r.worldA.map((n,i)=>n+(r.worldB[i]-n)*h.t),top=support.topA+(support.topB-support.topA)*h.u;
    const cut=(top-(center[2]-d/(2*nz)))*nz;
    if(cut>=-.1&&cut<=50)contacts.push({supportId:support.id,point:[center[0],center[1],top],notchMm:Math.max(0,cut),station:h.t});
   }
   contacts.sort((a,b)=>a.station-b.station);
   const distinct=contacts.filter((c,i)=>i===0||Math.abs(c.station-contacts[i-1].station)>.001);
   r.bearingContacts=distinct;r.bearingStatus=distinct.length>=2?'geometry-only':'unresolved';
   if(distinct.length){r.bearingPoint=distinct[0].point;if(plates.some(p=>p.id===distinct[0].supportId))r.bearingMauerlatId=distinct[0].supportId;else {delete r.bearingMauerlatId;r.bearingSupportId=distinct[0].supportId;}r.bearingNotchMm=distinct[0].notchMm;}
   const m=assembly.members.find(m=>m.id===r.id);if(m)Object.assign(m,{bearingContacts:distinct,bearingStatus:r.bearingStatus});
   if(distinct.length<2)assembly.issues.push(`${platform.name}: ${r.id} — нет двух подтверждённых геометрических опор. Проверьте мауэрлат, отметки кровли и балку по столбам.`);
  }
 }
}
