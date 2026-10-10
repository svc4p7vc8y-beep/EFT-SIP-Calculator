export const STAIR_DIRECTIONS = ["right", "left", "down", "up"];

export function normalizeStairDirection(value) {
  return STAIR_DIRECTIONS.includes(value) ? value : "right";
}

export const STAIR_TYPES = [['straight','Прямая'],['l','Г-образная с площадкой'],['u','П-образная с площадкой'],['l-winder','Г-образная с забежными ступенями'],['u-winder','П-образная с забежными ступенями']];
export const normalizeStairType=value=>STAIR_TYPES.some(([id])=>id===value)?value:'straight';
export function stairStepGeometry({ x, y, width, height }, direction, count = 12, type='straight') {
  if(normalizeStairType(type)!=='straight')return turningStair({x,y,width,height},direction,count,type);
  const axis = normalizeStairDirection(direction);
  const horizontal = axis === "right" || axis === "left";
  const steps=Math.max(1,Math.min(60,Math.round(Number(count)||12)));
  const treads = Array.from({ length: steps }, (_, index) => {
    const fraction = (index + 1) / (steps + 1);
    return horizontal
      ? { x1: x + width * fraction, y1: y, x2: x + width * fraction, y2: y + height }
      : { x1: x, y1: y + height * fraction, x2: x + width, y2: y + height * fraction };
  });
  const arrow = horizontal
    ? { x1: x + width * (axis === "right" ? .18 : .82), y1: y + height * .78,
        x2: x + width * (axis === "right" ? .82 : .18), y2: y + height * .78 }
    : { x1: x + width * .78, y1: y + height * (axis === "down" ? .18 : .82),
        x2: x + width * .78, y2: y + height * (axis === "down" ? .82 : .18) };
  const dx = arrow.x2 - arrow.x1;
  const dy = arrow.y2 - arrow.y1;
  const size = Math.min(width, height) * .08;
  const magnitude = Math.hypot(dx, dy) || 1;
  const ux = dx / magnitude;
  const uy = dy / magnitude;
  const baseX = arrow.x2 - ux * size;
  const baseY = arrow.y2 - uy * size;
  const head = [
    [arrow.x2, arrow.y2],
    [baseX - uy * size * .5, baseY + ux * size * .5],
    [baseX + uy * size * .5, baseY - ux * size * .5],
  ];
  return { treads, arrow, head: head.map(([px, py]) => `${px},${py}`).join(" ") };
}

function turningStair({x,y,width,height},direction,count,type){
  const axis=normalizeStairDirection(direction),uShape=type.startsWith('u'),winder=type.endsWith('winder');
  const map=([a,b])=>{const [u,v]=axis==='left'?[1-a,1-b]:axis==='down'?[1-b,a]:axis==='up'?[b,1-a]:[a,b];return [x+u*width,y+v*height];};
  // Equal physical flight widths in both directions, not equal normalized
  // fractions of unequal rectangle sides. This is a schematic proportion.
  const horizontal=axis==='left'||axis==='right',t=Math.min(width,height)*.33,sx=t/(horizontal?width:height),sy=t/(horizontal?height:width),ix=1-sx,iy=1-sy;
  const route=(uShape?[[.08,sy/2],[1-sx/2,sy/2],[1-sx/2,1-sy/2],[.08,1-sy/2]]:[[.08,sy/2],[1-sx/2,sy/2],[1-sx/2,.92]]).map(map);
  const n=Math.max(1,Math.min(60,Math.round(Number(count)||12))),groups=winder?(uShape?4:3):2,counts=Array.from({length:groups},(_,i)=>Math.floor(n/groups)+(i<n%groups?1:0)),treads=[],landings=[];
  const add=(a,b)=>{const [x1,y1]=map(a),[x2,y2]=map(b);treads.push({x1,y1,x2,y2});};
  for(let i=1;i<=counts[0];i++){const a=ix*i/(counts[0]+1);add([a,0],[a,sy]);}
  for(let i=1;i<=counts[1];i++){if(uShape){const a=ix*i/(counts[1]+1);add([a,iy],[a,1]);}else{const b=sy+(1-sy)*i/(counts[1]+1);add([ix,b],[1,b]);}}
  if(winder){for(let group=2;group<groups;group++)for(let i=0;i<counts[group];i++){const f=(i+.5)/counts[group];if(group===2)add([ix,sy],f<=.5?[ix+2*sx*f,0]:[1,2*sy*(f-.5)]);else add([ix,iy],f<=.5?[1,iy+2*sy*f]:[1-2*sx*(f-.5),1]);}}
  else{const before=treads.length;add([ix,0],[ix,sy]);if(uShape)add([ix,iy],[ix,1]);else add([ix,sy],[1,sy]);landings.push(...treads.splice(before));}
  const [a,b]=route.slice(-2),arrow={x1:a[0],y1:a[1],x2:b[0],y2:b[1]},d=Math.hypot(b[0]-a[0],b[1]-a[1])||1,s=Math.min(width,height)*.08,ux=(b[0]-a[0])/d,uy=(b[1]-a[1])/d;
  const head=[b,[b[0]-ux*s-uy*s*.5,b[1]-uy*s+ux*s*.5],[b[0]-ux*s+uy*s*.5,b[1]-uy*s-ux*s*.5]].map(p=>p.join(',')).join(' ');
  const outline=(uShape?[[0,0],[1,0],[1,1],[0,1],[0,iy],[ix,iy],[ix,sy],[0,sy]]:[[0,0],[1,0],[1,1],[ix,1],[ix,sy],[0,sy]]).map(map);
  return {treads,landings,arrow,head,path:route.map(p=>p.join(',')).join(' '),outline};
}

export function stairOpeningPolygon(opening){
  const box={x:Number(opening.x)||0,y:Number(opening.y)||0,width:Number(opening.width),height:Number(opening.length)};
  if(opening.contourMode==='stair')return stairStepGeometry(box,opening.direction,opening.stepCount,opening.stairType).outline||[[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]];
  return [[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]];
}
