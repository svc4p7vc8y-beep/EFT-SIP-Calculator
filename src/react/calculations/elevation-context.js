import {houseContourPoints} from '../planner/geometry.js';
import {wallStation} from './structural-frame.js';
// Project only objects in this wall plane; crossing beams are shown in section.
export function elevationContext(project,report,wall){
 const base=Number(wall.baseZMm)||0,dx=wall.planEnd[0]-wall.planStart[0],dy=wall.planEnd[1]-wall.planStart[1],L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,tol=Math.max(200,Number(wall.thickness)||0);
 const distance=p=>(p[0]-wall.planStart[0])*(-uy)+(p[1]-wall.planStart[1])*ux;
 const local=p=>[wallStation(wall,p),Number(p[2]||0)-base];
 const projectLine=(a,b)=>{if(!a||!b||![...a,...b].every(Number.isFinite))return null;const da=distance(a),db=distance(b);if(Math.min(Math.abs(da),Math.abs(db))>tol&&da*db>0)return null;
  if(Math.abs(da-db)>tol&&da*db<=0){const t=da/(da-db),p=a.map((v,i)=>v+(b[i]-v)*t),q=local(p);return q[0]>=-tol&&q[0]<=L+tol?{a:q,b:q,section:true}:null;}
  if(Math.max(Math.abs(da),Math.abs(db))>tol)return null;let A=local(a),B=local(b);if(Math.max(A[0],B[0])<0||Math.min(A[0],B[0])>L)return null;
  const span=B[0]-A[0];if(Math.abs(span)>1){const t0=Math.max(0,Math.min((-200-A[0])/span,(L+200-A[0])/span)),t1=Math.min(1,Math.max((-200-A[0])/span,(L+200-A[0])/span));if(t1<t0)return null;const origin=A;A=origin.map((n,i)=>n+(B[i]-n)*t0);B=origin.map((n,i)=>n+(B[i]-n)*t1);}return {a:A,b:B,section:false};};
 const assembly=report.assembly,roof=[];
 for(const s of assembly.roofTimbers||[]){if(s.excluded)continue;const p=projectLine(s.worldA,s.worldB);if(p)roof.push({...p,id:s.id,label:s.material||s.name||s.id,profile:s.profile,readOnly:true});}
 for(const s of project.settings.productionCutting.roofSupports||[]){if(s.referenceOnly||s.type==='foundation')continue;const p=projectLine([s.x1,s.y1,s.z1],[s.x2,s.y2,s.z2]);if(p)roof.push({...p,id:s.id,label:s.name||s.type,profile:s.profile,source:s,readOnly:false});}
 for(const s of assembly.supports||[]){if(s.referenceOnly||s.type==='foundation'||roof.some(r=>r.id===s.id)||project.settings.productionCutting.roofSupports.some(r=>r.id===s.id))continue;const p=projectLine(s.a,s.b);if(p)roof.push({...p,id:s.id,label:s.name||s.type||s.id,profile:s.profile,readOnly:true});}
 const binding=(assembly.binding||[]).flatMap(s=>{const depth=Number(s.profile?.split(/[×xх]/)[1])||150,z=-Number(project.settings.sip.floorThickness)-depth/2,p=projectLine([...s.a,z],[...s.b,z]);return p?[{...p,id:s.id,label:s.id,depth,layers:s.layers,profile:s.profile}]:[];});
 const piles=(assembly.piles||[]).flatMap((p,i)=>Math.abs(distance(p))<=tol&&wallStation(wall,p)>=-tol&&wallStation(wall,p)<=L+tol?[{id:`pile-${i}`,x:wallStation(wall,p),z:-Number(project.settings.sip.floorThickness)-180-base,label:`Свая ${i+1}`}]:[]);
 const nodes=(assembly.nodes||[]).filter(n=>n.floor===(wall.floor||1)&&Math.abs(distance([n.x,n.y]))<=tol&&wallStation(wall,[n.x,n.y])>=0&&wallStation(wall,[n.x,n.y])<=L).map(n=>({...n,station:wallStation(wall,[n.x,n.y]),z:-Number(project.settings.sip.floorThickness)-500,label:n.nodeRef||n.id,heightUnknown:true}));
 for(const r of roof.filter(r=>r.source?.nodeRef))for(const [i,p] of [r.a,r.b].entries())nodes.push({id:`${r.id}-node-${i}`,station:p[0],z:p[1],label:r.source.nodeRef,heightUnknown:false});
 const plan=wall.floor===1?project.plan:project.upperFloors[wall.floor-2],origins=wall.exterior?houseContourPoints(plan).map(p=>[p.x*1000,p.y*1000]).filter(p=>Math.abs(distance(p))<=tol).map(p=>wallStation(wall,p)).filter(s=>s>=-tol&&s<=tol):[];
 const originStation=origins.length?Math.min(0,...origins):0;
 return {roof,binding,piles,nodes,originStation,minZ:Math.min(0,...binding.map(s=>Math.min(s.a[1],s.b[1])-s.depth/2),...piles.map(p=>p.z-280),...nodes.map(n=>n.z-80))};
}
