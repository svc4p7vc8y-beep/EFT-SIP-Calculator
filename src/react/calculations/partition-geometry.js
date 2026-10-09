import clipping from 'polygon-clipping';

const closed = ring => [...ring, ring[0]];
export function boardFootprint(member) {
  if (member.outline) return member.outline;
  const thickness = Number(member.faceWidth ?? member.profile?.split(/[×xх]/)[0]);
  if (!member.a || !member.b || !(thickness > 0)) return null;
  const [x,y] = member.a, [u,v] = member.b, length = Math.hypot(u-x,v-y);
  if (!length) return null;
  const nx = -(v-y)/length*thickness/2, ny = (u-x)/length*thickness/2;
  return [[x+nx,y+ny],[u+nx,v+ny],[u-nx,v-ny],[x-nx,y-ny]];
}

// Cut the inclined board to the actual plate faces, not square SVG line caps.
export function braceFootprint(a,b,width,W,low,high) {
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]), extension=width*2;
  if (!length) return null;
  const direction=[(b[0]-a[0])/length,(b[1]-a[1])/length];
  const ring=boardFootprint({a:a.map((v,i)=>v-direction[i]*extension),b:b.map((v,i)=>v+direction[i]*extension),faceWidth:width});
  const boundary=[[0,low],[W,low],[W,high],[0,high],[0,low]];
  const result=clipping.intersection([closed(ring)],[boundary]);
  return result[0]?.[0]?.slice(0,-1).map(p=>p.map(v=>Math.round(v*1e6)/1e6))||null;
}

// These are projected contact/cut outlines. They do NOT prescribe notch depth.
export function partitionNotches(member,cutters) {
  const ring=boardFootprint(member),length=member.length;
  if (!ring || !length) return [];
  const ux=(member.b[0]-member.a[0])/Math.hypot(member.b[0]-member.a[0],member.b[1]-member.a[1]);
  const uy=(member.b[1]-member.a[1])/Math.hypot(member.b[0]-member.a[0],member.b[1]-member.a[1]);
  return cutters.flatMap(cutter=>{
    const cut=boardFootprint(cutter);if(!cut)return [];
    const shape=clipping.intersection([closed(ring)],[closed(cut)]);if(!shape.length)return [];
    const values=shape.flat(2).map(p=>(p[0]-member.a[0])*ux+(p[1]-member.a[1])*uy);
    return [{shape,type:cutter.role,depthMm:cutter.notchDepthMm??'',offsetMm:Math.round(Math.min(...values)),lengthMm:Math.round(Math.max(...values)-Math.min(...values))}];
  });
}

export function visibleBoardGeometry(member) {
  const ring=boardFootprint(member);if(!ring)return [];
  const notches=(member.notches||[]).map(n=>n.shape).filter(s=>s?.length);
  return notches.length?clipping.difference([closed(ring)],...notches):[[closed(ring)]];
}

export function refreshPartitionNotches(members) {
  const groups=new Map();
  for(const member of members)if(member.role==='brace'||member.role==='edge-board'||member.notches){
    if(!groups.has(member.surfaceId))groups.set(member.surfaceId,[]);
    groups.get(member.surfaceId).push(member);
  }
  for(const list of groups.values()){
    const cutters=list.filter(m=>!m.excluded&&(m.role==='brace'||m.role==='edge-board'));
    for(const member of list)if(member.a&&member.b&&(Math.abs(member.a[0]-member.b[0])<.01||member.role==='edge-board'))member.notches=partitionNotches(member,cutters.filter(c=>c!==member&&(member.role!=='edge-board'||c.role==='brace')));
  }
  return members;
}
