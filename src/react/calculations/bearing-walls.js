import { roomPoints, unifiedWallSegments, lineEndpoints, partitionRuns } from '../planner/geometry.js';

// Geometry-bound keys deliberately expire when a wall is moved or resized.
export const bearingWallKey=(a,b)=>[a,b].map(p=>`${Math.round(p.x*1000)},${Math.round(p.y*1000)}`).sort().join(':');
export function bearingSideLabels(points) {
  const cx=points.reduce((s,p)=>s+p.x,0)/(points.length||1),cy=points.reduce((s,p)=>s+p.y,0)/(points.length||1);
  const labels=points.map((a,i)=>{const b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y;
    if(Math.abs(dy)<.001)return (a.y+b.y)/2<=cy?'Верх':'Низ';
    if(Math.abs(dx)<.001)return (a.x+b.x)/2<=cx?'Лево':'Право';
    return `Наклонная ${i+1}`;
  });
  return labels.map((label,i)=>labels.filter(l=>l===label).length>1?`${label} · участок ${labels.slice(0,i+1).filter(l=>l===label).length}`:label);
}
export function roomBearingEdges(room) {
  const points=roomPoints(room);
  const labels=bearingSideLabels(points);
  return points.map((a,i)=>{const b=points[(i+1)%points.length],key=bearingWallKey(a,b),value=room.bearingWalls?.[key];
    return {a,b,key,index:i,label:labels[i],bearing:value?.enabled??(room.bearing===true),profile:String(value?.profile||room.bearingProfile||'')};
  }).filter(e=>Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y)>.001);
}
export const bearingEdges=plan=>[...(plan.rooms||[]).filter(r=>r.include!==false).flatMap(roomBearingEdges),...(plan.walls||[]).filter(w=>w.include!==false).map(w=>({a:{x:w.x1,y:w.y1},b:{x:w.x2,y:w.y2},bearing:w.bearing,profile:w.bearingProfile||''}))].filter(e=>e.bearing);
export function bearingForSegment(plan,a,b) {
  const length=Math.hypot(b.x-a.x,b.y-a.y),middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  return bearingEdges(plan).filter(e=>{
    const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,l=Math.hypot(dx,dy);
    return l>.001&&Math.abs(dx*(middle.y-e.a.y)-dy*(middle.x-e.a.x))/l<.015&&Math.abs(dx*(b.y-a.y)-dy*(b.x-a.x))/(l*length||1)<.001&&middle.x>=Math.min(e.a.x,e.b.x)-.001&&middle.x<=Math.max(e.a.x,e.b.x)+.001&&middle.y>=Math.min(e.a.y,e.b.y)-.001&&middle.y<=Math.max(e.a.y,e.b.y)+.001;
  }).sort((x,y)=>Number(y.profile.replace('×','x').split('x')[1]||0)-Number(x.profile.replace('×','x').split('x')[1]||0))[0];
}

export function splitAtBearingEdges(plan,segments,extraAnchors=[]) {
  const anchors=[...bearingEdges(plan).flatMap(e=>[e.a,e.b]),...extraAnchors];
  return segments.flatMap(([a,b])=>{const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);if(!L)return [];
    const cuts=[0,1];for(const p of anchors){const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/(L*L);if(t>.001&&t<.999&&Math.abs(dx*(p.y-a.y)-dy*(p.x-a.x))/L<.015)cuts.push(t);}
    const sorted=[...new Set(cuts)].sort((x,y)=>x-y);return sorted.slice(1).map((t,i)=>[{x:a.x+dx*sorted[i],y:a.y+dy*sorted[i]},{x:a.x+dx*t,y:a.y+dy*t}]);
  });
}

// Distribute the existing estimating allowance by selected wall length; no new consumption norm.
export function partitionProfileShares(plan,defaultProfile) {
  const raw=partitionRuns(plan);
  const runs=splitAtBearingEdges(plan,raw,raw.flat());
  const lengths=new Map(),seen=new Set();
  for(const [a,b]of runs){const key=bearingWallKey(a,b);if(seen.has(key))continue;seen.add(key);const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},local=(plan.walls||[]).find(w=>w.include!==false&&Math.hypot(w.x2-w.x1,w.y2-w.y1)>0&&Math.abs((w.x2-w.x1)*(mid.y-w.y1)-(w.y2-w.y1)*(mid.x-w.x1))/Math.hypot(w.x2-w.x1,w.y2-w.y1)<.001&&mid.x>=Math.min(w.x1,w.x2)-.001&&mid.x<=Math.max(w.x1,w.x2)+.001&&mid.y>=Math.min(w.y1,w.y2)-.001&&mid.y<=Math.max(w.y1,w.y2)+.001);const selected=(bearingForSegment(plan,a,b)?.profile||local?.frameProfile)?.replace('×','x'),profile=['50x100','50x150','50x200'].includes(selected)?selected:defaultProfile;lengths.set(profile,(lengths.get(profile)||0)+Math.hypot(b.x-a.x,b.y-a.y));}
  const total=[...lengths.values()].reduce((s,n)=>s+n,0);
  return total?[...lengths].map(([profile,length])=>({profile,share:length/total})):[{profile:defaultProfile,share:1}];
}

export function splitConnectorsAtBearing(segments,edges=[]) {
  return segments.flatMap(segment=>{
    const [a,b]=[segment.a,segment.b],dx=b[0]-a[0],dy=b[1]-a[1],cuts=[0,1];
    for(const edge of edges){const c=[edge.a.x*1000,edge.a.y*1000],ex=(edge.b.x-edge.a.x)*1000,ey=(edge.b.y-edge.a.y)*1000,den=dx*ey-dy*ex;if(Math.abs(den)<.01)continue;
      const t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/den,u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/den;
      if(t>.00001&&t<.99999&&u>=-.00001&&u<=1.00001)cuts.push(t);
    }
    const sorted=[...new Set(cuts)].sort((x,y)=>x-y);return sorted.slice(1).map((t,i)=>({...segment,a:[a[0]+dx*sorted[i],a[1]+dy*sorted[i]],b:[a[0]+dx*t,a[1]+dy*t],length:Math.hypot(dx,dy)*(t-sorted[i])}));
  });
}
