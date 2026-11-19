// Per-run construction choices; no inference of bearing capacity.
const key=(a,b)=>[a,b].map(p=>`${Math.round(p.x*1000)},${Math.round(p.y*1000)}`).sort().join(':');
const points=r=>r.points?.length>=3?r.points:[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}];
export function partitionMaterialEdges(plan){
 return [...(plan.walls||[]).filter(w=>w.include!==false).map(w=>({a:{x:w.x1,y:w.y1},b:{x:w.x2,y:w.y2},...w})),...(plan.rooms||[]).filter(r=>r.include!==false).flatMap(r=>{const ps=points(r);return ps.map((a,i)=>({a,b:ps[(i+1)%ps.length],...(r.bearingWalls?.[key(a,ps[(i+1)%ps.length])]||{})}));})];
}
export function partitionMaterialSettings(plan,a,b){
 const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},L=Math.hypot(b.x-a.x,b.y-a.y);
 const hits=partitionMaterialEdges(plan).filter(e=>{const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,l=Math.hypot(dx,dy),t=((mid.x-e.a.x)*dx+(mid.y-e.a.y)*dy)/(l*l||1);return l>0&&t>=-.001&&t<=1.001&&Math.abs(dx*(mid.y-e.a.y)-dy*(mid.x-e.a.x))/l<.015&&Math.abs(dx*(b.y-a.y)-dy*(b.x-a.x))/(l*L||1)<.001;});
 const typed=hits.find(e=>['sip','frame'].includes(e.partitionType));return {...hits.find(e=>[124,174,224].includes(Number(e.sipThickness))),...typed};
}
export function partitionMaterial(plan,a,b,fallback){return partitionMaterialSettings(plan,a,b).partitionType||fallback||plan.partitionDefaultType||([.124,.174,.224].includes(Number(plan.partitionThickness))?'sip':'frame');}
export function splitPartitionMaterials(plan,runs){
 const anchors=partitionMaterialEdges(plan).filter(e=>['sip','frame'].includes(e.partitionType)).flatMap(e=>[e.a,e.b]);
 return runs.flatMap(([a,b])=>{const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy),cuts=[0,1];for(const p of anchors){const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/(L*L||1);if(t>.0001&&t<.9999&&Math.abs(dx*(p.y-a.y)-dy*(p.x-a.x))/(L||1)<.001)cuts.push(t);}const ts=[...new Set(cuts)].sort((a,b)=>a-b);return ts.slice(1).map((t,i)=>[{x:a.x+dx*ts[i],y:a.y+dy*ts[i]},{x:a.x+dx*t,y:a.y+dy*t}]);});
}
