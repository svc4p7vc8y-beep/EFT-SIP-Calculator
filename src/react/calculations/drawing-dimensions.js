// Drawing coordinates only; does not change cutting or purchased amounts.
export const dimensionValues = values => [...new Set(values.filter(v => v !== '' && v != null && Number.isFinite(Number(v))).map(v => Math.round(Number(v))))].sort((a,b)=>a-b);
export function pointBounds(points) {
  if (!points.length) return { x:0, y:0, width:0, height:0 };
  const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]), x=Math.min(...xs), y=Math.min(...ys);
  return { x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y };
}
export function structuralDimensions(assembly, binding=false) {
  const floor=binding?assembly.floors[0]:assembly.floors.at(-1);
  const house=pointBounds(floor.contour), roof=pointBounds(assembly.roofOutline||floor.contour);
  const items=binding?assembly.binding:assembly.rafters;
  return { house,roof,
    x:dimensionValues([...floor.contour.map(p=>p[0]),...(binding?assembly.piles.map(p=>p[0]):assembly.axis==='x'?items.map(r=>r.a[0]):[])]),
    y:dimensionValues([...floor.contour.map(p=>p[1]),...(binding?assembly.piles.map(p=>p[1]):assembly.axis==='y'?items.map(r=>r.a[1]):[])]),
  };
}
export function surfaceDimensions(surface, parts=[], members=[]) {
  const box=pointBounds(surface.geometry.flat(2));
  const openings=(surface.openings||[]).filter(o=>o.sill!==''&&o.sill!=null&&Number.isFinite(Number(o.sill)));
  return { box,
    x:dimensionValues([box.x,box.x+box.width,...parts.flatMap(p=>[p.x,p.x+p.width]),
      ...members.filter(m=>m.a&&!m.excluded&&Math.abs(m.a[0]-m.b[0])<.1).map(m=>m.a[0])]),
    openingX:dimensionValues([box.x,box.x+box.width,...openings.flatMap(o=>[o.x,o.x+o.width])]),
    openingY:dimensionValues([box.y,box.y+box.height,...openings.flatMap(o=>[Number(o.sill),Number(o.sill)+o.height])]),
  };
}
export function bearingPlanWidth(profile) {
  // 50×200: 50 is board thickness, 200 is wall depth in plan.
  const values=String(profile).split(/[×xх]/).map(Number);
  return values.length===2&&values.every(v=>Number.isFinite(v)&&v>0)?values[1]:null;
}

// Check diagonals join actual contour/support points, not invented bounding corners.
export function checkDiagonals(assembly) {
  const points=assembly.floors[0]?.contour||[],pairs=[];
  const pairKey=(a,b)=>[a,b].map(p=>p.map(v=>Math.round(v)).join(',')).sort().join('|');
  const add=(a,b,kind)=>{if(Math.abs(a[0]-b[0])<1||Math.abs(a[1]-b[1])<1)return;
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(!pairs.some(p=>pairKey(p.a,p.b)===pairKey(a,b)))pairs.push({a,b,length,kind});};
  for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++)add(points[i],points[j],'Контур');
  const longest=pairs.sort((a,b)=>b.length-a.length).slice(0,2);
  const supports=assembly.piles||[];
  const candidates=[];
  for(let i=0;i<supports.length;i++)for(let j=i+1;j<supports.length;j++){
    const a=supports[i],b=supports[j];
    if(Math.abs(a[0]-b[0])>1&&Math.abs(a[1]-b[1])>1&&!longest.some(p=>pairKey(p.a,p.b)===pairKey(a,b)))candidates.push({a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1]),kind:'Опоры'});
  }
  if(candidates.length)longest.push(candidates.sort((a,b)=>b.length-a.length)[0]);
  return longest;
}
