import { normalizeStairDirection } from "./stair-steps.js";
import clipping from 'polygon-clipping';
import { gapFragments } from '../calculations/gap-fragments.js';

const EPS = 0.035;

export const roundCoord = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

export function fitFloorOpening(opening, house) {
  const safeOpening = opening || {};
  const safeHouse = house || {};
  const houseWidth = Math.max(0, Number(safeHouse.w) || 0);
  const houseLength = Math.max(0, Number(safeHouse.h) || 0);
  const width = Math.min(
    Math.max(0, Number(safeOpening.width) || 0),
    houseWidth,
  );
  const length = Math.min(
    Math.max(0, Number(safeOpening.length) || 0),
    houseLength,
  );
  return {
    ...safeOpening,
    x: roundCoord(
      Math.max(
        0,
        Math.min(
          Number(safeOpening.x) || 0,
          Math.max(0, houseWidth - width),
        ),
      ),
    ),
    y: roundCoord(
      Math.max(
        0,
        Math.min(
          Number(safeOpening.y) || 0,
          Math.max(0, houseLength - length),
        ),
      ),
    ),
    width: roundCoord(width),
    length: roundCoord(length),
    direction: normalizeStairDirection(safeOpening.direction),
  };
}

export function roomPoints(room) {
  if (Array.isArray(room?.points) && room.points.length >= 3) return room.points;
  return [
    { x: room.x, y: room.y }, { x: room.x + room.w, y: room.y },
    { x: room.x + room.w, y: room.y + room.h }, { x: room.x, y: room.y + room.h }
  ];
}

export function houseContourPoints(plan = {}) {
  if (Array.isArray(plan?.house?.points) && plan.house.points.length >= 3) return plan.house.points;
  const width = Number(plan?.house?.w) || 0;
  const height = Number(plan?.house?.h) || 0;
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
}

export function boundsOf(points = []) {
  const xs = points.map((point) => Number(point.x) || 0);
  const ys = points.map((point) => Number(point.y) || 0);
  return {
    x: Math.min(...xs), y: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys),
    w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)
  };
}

export function withRoomBounds(room) {
  return { ...room, ...boundsOf(roomPoints(room)) };
}

export function rectanglePoints(a, b) {
  const x1 = Math.min(a.x, b.x); const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y); const y2 = Math.max(a.y, b.y);
  return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
}

export function dimensionOutsideHouse(line, house, offset = 0.8) {
  const next = { ...line };
  const horizontal = Math.abs(next.x2 - next.x1) >= Math.abs(next.y2 - next.y1);
  if (horizontal) {
    const y = (next.y1 + next.y2) / 2 < house.h / 2 ? -offset : house.h + offset;
    next.y1 = y; next.y2 = y;
  } else {
    const x = (next.x1 + next.x2) / 2 < house.w / 2 ? -offset : house.w + offset;
    next.x1 = x; next.x2 = x;
  }
  return next;
}

export function collectSnapAxes(plan, excludeRoomId) {
  const wall = Number(plan.wallThickness) || 0.174;
  const hasHouse = plan?.house?.contourDefined !== false;
  const xs = new Set(hasHouse ? [0, wall, plan.house.w - wall, plan.house.w] : []);
  const ys = new Set(hasHouse ? [0, wall, plan.house.h - wall, plan.house.h] : []);
  const points = new Map();
  const addPoint = (point) => {
    const next = { x: roundCoord(point.x), y: roundCoord(point.y) };
    xs.add(next.x); ys.add(next.y); points.set(`${next.x}:${next.y}`, next);
  };
  if (hasHouse) {
    houseContourPoints(plan).forEach(addPoint);
    [0, wall, plan.house.w - wall, plan.house.w].forEach((x) => {
      [0, wall, plan.house.h - wall, plan.house.h].forEach((y) => addPoint({ x, y }));
    });
  }
  for (const room of plan.rooms || []) {
    if (room.id === excludeRoomId || plan.layoutMode==='walls') continue;
    for (const point of roomPoints(room)) addPoint(point);
  }
  for (const wallLine of plan.walls || []) { addPoint({ x: wallLine.x1, y: wallLine.y1 }); addPoint({ x: wallLine.x2, y: wallLine.y2 }); }
  for (const row of plan.pileRows || []) { addPoint({ x: row.x1, y: row.y1 }); addPoint({ x: row.x2, y: row.y2 }); }
  for (const binding of plan.bindingLines || []) { addPoint({ x: binding.x1, y: binding.y1 }); addPoint({ x: binding.x2, y: binding.y2 }); }
  for (const dimension of plan.dimensions || []) { addPoint({ x: dimension.x1, y: dimension.y1 }); addPoint({ x: dimension.x2, y: dimension.y2 }); }
  for (const platform of plan.platforms || []) {
    addPoint({ x: platform.x, y: platform.y }); addPoint({ x: platform.x + platform.w, y: platform.y });
    addPoint({ x: platform.x + platform.w, y: platform.y + platform.h }); addPoint({ x: platform.x, y: platform.y + platform.h });
  }
  for (const pile of plan.piles || []) addPoint(pile);
  return { xs: [...xs], ys: [...ys], points: [...points.values()] };
}

export function snapPointDetails(point, axes, options = {}) {
  const grid = Number(options.grid) || 0.1;
  const tolerance = Number(options.tolerance) || 0.16;
  const pointTolerance = Number(options.pointTolerance) || tolerance * 1.5;
  let closestPoint = null; let closestDistance = pointTolerance;
  for (const candidate of axes.points || []) {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance <= closestDistance) { closestPoint = candidate; closestDistance = distance; }
  }
  if (closestPoint) {
    const snapped = { x: roundCoord(closestPoint.x), y: roundCoord(closestPoint.y) };
    return { point: snapped, snap: { kind: 'node', ...snapped, matchedX: true, matchedY: true, distance: roundCoord(closestDistance) } };
  }
  const snapValue = (value, candidates) => {
    let best = Math.round(value / grid) * grid;
    let distance = tolerance;
    let matched = false;
    for (const candidate of candidates) {
      const next = Math.abs(candidate - value);
      if (next <= distance) { best = candidate; distance = next; matched = true; }
    }
    return { value: roundCoord(best), matched };
  };
  const x = snapValue(point.x, axes.xs || []);
  const y = snapValue(point.y, axes.ys || []);
  const snapped = { x: x.value, y: y.value };
  return {
    point: snapped,
    snap: x.matched || y.matched ? { kind: x.matched && y.matched ? 'intersection' : 'axis', ...snapped, matchedX: x.matched, matchedY: y.matched } : null
  };
}

export function snapPoint(point, axes, options = {}) {
  return snapPointDetails(point, axes, options).point;
}

export function pileRowAlignment(row, exactTolerance = 0.015, warningAngle = 7) {
  const dx = Math.abs((Number(row.x2) || 0) - (Number(row.x1) || 0));
  const dy = Math.abs((Number(row.y2) || 0) - (Number(row.y1) || 0));
  const length = Math.hypot(dx, dy);
  if (length <= exactTolerance) return { state: 'aligned', axis: 'point', offset: 0, angle: 0 };
  const horizontal = dx >= dy;
  const offset = horizontal ? dy : dx;
  const angle = Math.atan2(offset, Math.max(dx, dy)) * 180 / Math.PI;
  if (offset <= exactTolerance) return { state: 'aligned', axis: horizontal ? 'horizontal' : 'vertical', offset, angle: 0 };
  if (angle <= warningAngle) return { state: 'warning', axis: horizontal ? 'horizontal' : 'vertical', offset, angle };
  return { state: 'diagonal', axis: 'diagonal', offset, angle };
}

export function shouldClosePolygon(points, point, tolerance = 0.35) {
  if (!Array.isArray(points) || points.length < 3 || !point) return false;
  const first = points[0];
  return Math.hypot((Number(point.x) || 0) - (Number(first.x) || 0), (Number(point.y) || 0) - (Number(first.y) || 0)) <= tolerance;
}

export function movePoints(points, dx, dy, plan, axes) {
  const moved = points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  const movedBounds = boundsOf(moved);
  const snappedOrigin = snapPoint({ x: movedBounds.x, y: movedBounds.y }, axes);
  return moved.map((point) => ({
    x: roundCoord(point.x + snappedOrigin.x - movedBounds.x),
    y: roundCoord(point.y + snappedOrigin.y - movedBounds.y)
  }));
}

const scalePoint = (point, scaleX, scaleY) => ({
  x: roundCoord((Number(point?.x) || 0) * scaleX),
  y: roundCoord((Number(point?.y) || 0) * scaleY)
});

const scaleLine = (line, scaleX, scaleY) => {
  line.x1 = roundCoord((Number(line.x1) || 0) * scaleX);
  line.y1 = roundCoord((Number(line.y1) || 0) * scaleY);
  line.x2 = roundCoord((Number(line.x2) || 0) * scaleX);
  line.y2 = roundCoord((Number(line.y2) || 0) * scaleY);
};

/** Keeps every plan layer on the same axes when the house length or width changes. */
export function resizePlanToHouse(plan, width, height) {
  const oldWidth = Math.max(0.001, Number(plan?.house?.w) || 0.001);
  const oldHeight = Math.max(0.001, Number(plan?.house?.h) || 0.001);
  const nextWidth = Math.max(0.001, Number(width) || oldWidth);
  const nextHeight = Math.max(0.001, Number(height) || oldHeight);
  const scaleX = nextWidth / oldWidth;
  const scaleY = nextHeight / oldHeight;

  if (Array.isArray(plan.house.points)) plan.house.points = plan.house.points.map((point) => scalePoint(point, scaleX, scaleY));
  plan.house.w = roundCoord(nextWidth);
  plan.house.h = roundCoord(nextHeight);
  for (const room of plan.rooms || []) {
    room.points = roomPoints(room).map((point) => scalePoint(point, scaleX, scaleY));
    Object.assign(room, boundsOf(room.points));
  }
  for (const platform of plan.platforms || []) {
    platform.x = roundCoord((Number(platform.x) || 0) * scaleX);
    platform.y = roundCoord((Number(platform.y) || 0) * scaleY);
    platform.w = roundCoord((Number(platform.w) || 0) * scaleX);
    platform.h = roundCoord((Number(platform.h) || 0) * scaleY);
  }
  for (const line of [...(plan.walls || []), ...(plan.pileRows || []), ...(plan.bindingLines || []), ...(plan.dimensions || [])]) scaleLine(line, scaleX, scaleY);
  for (const item of [...(plan.piles || []), ...(plan.excludedPiles || [])]) Object.assign(item, scalePoint(item, scaleX, scaleY));
  for (const opening of plan.openings || []) {
    opening.x = roundCoord((Number(opening.x) || 0) * scaleX);
    opening.y = roundCoord((Number(opening.y) || 0) * scaleY);
  }
  for (const gap of plan.wallGaps || []) {
    gap.x = roundCoord((Number(gap.x) || 0) * scaleX);
    gap.y = roundCoord((Number(gap.y) || 0) * scaleY);
  }
  for (const opening of [...(plan.floorOpenings||[]),...(plan.floorOpening?[plan.floorOpening]:[])]) {
    opening.x = roundCoord((Number(opening.x) || 0) * scaleX);
    opening.y = roundCoord((Number(opening.y) || 0) * scaleY);
    opening.width = roundCoord(
      (Number(opening.width) || 0) * scaleX,
    );
    opening.length = roundCoord(
      (Number(opening.length) || 0) * scaleY,
    );
  }
  return { scaleX, scaleY };
}

export function resizeProjectHouse(project, width, height) {
  const oldWidth = Math.max(0.001, Number(project?.plan?.house?.w) || 0.001);
  const oldHeight = Math.max(0.001, Number(project?.plan?.house?.h) || 0.001);
  const result = resizePlanToHouse(project.plan, width, height);
  for (const upperPlan of project.upperFloors || []) {
    resizePlanToHouse(
      upperPlan,
      (Number(upperPlan.house?.w) || oldWidth) * result.scaleX,
      (Number(upperPlan.house?.h) || oldHeight) * result.scaleY,
    );
  }
  if (project.settings?.links?.roofRidgeFromPlan === false && Number.isFinite(Number(project.settings?.roof?.ridgeLength))) {
    const ridgeAlongWidth = project.settings?.roof?.ridgeAxis !== "y";
    const scale = ridgeAlongWidth
      ? (Number(width) || oldWidth) / oldWidth
      : (Number(height) || oldHeight) / oldHeight;
    project.settings.roof.ridgeLength = roundCoord(
      Number(project.settings.roof.ridgeLength) * scale,
    );
  }
  return result;
}

/** Moves a partition and keeps every partition joined to either endpoint connected. */
export function moveConnectedWall(plan, wallId, dx, dy, tolerance = 0.001, normalOnly = true) {
  const wall = (plan.walls || []).find((item) => item.id === wallId);
  if (!wall) return null;
  const oldA = { x: Number(wall.x1) || 0, y: Number(wall.y1) || 0 };
  const oldB = { x: Number(wall.x2) || 0, y: Number(wall.y2) || 0 };
  const horizontal = Math.abs(oldB.x - oldA.x) >= Math.abs(oldB.y - oldA.y);
  const moveX = normalOnly && horizontal ? 0 : Number(dx) || 0;
  const moveY = normalOnly && !horizontal ? 0 : Number(dy) || 0;
  const newA = { x: roundCoord(oldA.x + moveX), y: roundCoord(oldA.y + moveY) };
  const newB = { x: roundCoord(oldB.x + moveX), y: roundCoord(oldB.y + moveY) };
  const near = (point, target) => Math.hypot(point.x - target.x, point.y - target.y) <= tolerance;
  const onLine=point=>{const x=oldB.x-oldA.x,y=oldB.y-oldA.y,L=Math.hypot(x,y),t=((point.x-oldA.x)*x+(point.y-oldA.y)*y)/(L*L||1);return L>0&&t>=0&&t<=1&&Math.abs(x*(point.y-oldA.y)-y*(point.x-oldA.x))/L<=tolerance;};

  for (const neighbor of plan.walls || []) {
    if (neighbor.id === wallId) continue;
    const first = { x: Number(neighbor.x1) || 0, y: Number(neighbor.y1) || 0 };
    const second = { x: Number(neighbor.x2) || 0, y: Number(neighbor.y2) || 0 };
    if (near(first, oldA)) { neighbor.x1 = newA.x; neighbor.y1 = newA.y; }
    else if (near(first, oldB)) { neighbor.x1 = newB.x; neighbor.y1 = newB.y; }
    else if(onLine(first)){neighbor.x1=roundCoord(first.x+moveX);neighbor.y1=roundCoord(first.y+moveY);}
    if (near(second, oldA)) { neighbor.x2 = newA.x; neighbor.y2 = newA.y; }
    else if (near(second, oldB)) { neighbor.x2 = newB.x; neighbor.y2 = newB.y; }
    else if(onLine(second)){neighbor.x2=roundCoord(second.x+moveX);neighbor.y2=roundCoord(second.y+moveY);}
  }
  Object.assign(wall, { x1: newA.x, y1: newA.y, x2: newB.x, y2: newB.y });
  return wall;
}

const axialSegment = (a, b, source = {}) => {
  if (Math.abs(a.y - b.y) <= EPS) return { axis: 'h', fixed: roundCoord((a.y + b.y) / 2), start: Math.min(a.x, b.x), end: Math.max(a.x, b.x), ...source };
  if (Math.abs(a.x - b.x) <= EPS) return { axis: 'v', fixed: roundCoord((a.x + b.x) / 2), start: Math.min(a.y, b.y), end: Math.max(a.y, b.y), ...source };
  return { axis: 'd', a: { ...a }, b: { ...b }, start: 0, end: Math.hypot(b.x - a.x, b.y - a.y), ...source };
};

export function roomWallSegments(plan) {
  if (plan.layoutMode === 'walls') return [];
  const wall = Number(plan.wallThickness) || 0.174;
  const contour = houseContourPoints(plan);
  const pointSegmentDistance = (point, a, b) => {
    const dx = b.x - a.x; const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
    return Math.hypot(point.x - (a.x + ratio * dx), point.y - (a.y + ratio * dy));
  };
  const segments = [];
  for (const room of plan.rooms || []) {
    if (room.extension || room.include === false) continue;
    const points = roomPoints(room);
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      const segment = axialSegment(point, next, { roomId: room.id, ref:`room:${room.id}:${index}` });
      const outerFace = contour.some((edgeStart, edgeIndex) => {
        const edgeEnd = contour[(edgeIndex + 1) % contour.length];
        return pointSegmentDistance(point, edgeStart, edgeEnd) <= wall + EPS && pointSegmentDistance(next, edgeStart, edgeEnd) <= wall + EPS;
      });
      if (!outerFace) segments.push(segment);
    });
  }
  return segments;
}

export function unifiedWallSegments(plan) {
  const axial = roomWallSegments(plan).filter((segment) => segment.axis !== 'd');
  const diagonal = roomWallSegments(plan).filter((segment) => segment.axis === 'd');
  const groups = new Map();
  for (const segment of axial) {
    const key = `${segment.axis}:${roundCoord(segment.fixed, 3)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(segment);
  }
  const merged = [];
  for (const [,list] of [...groups].sort(([a],[b])=>a.localeCompare(b))) {
    list.sort((left, right) => left.start - right.start || left.fixed - right.fixed || left.end - right.end);
    for (const segment of list) {
      const last = merged.at(-1);
      if (last && last.axis === segment.axis && Math.abs(last.fixed - segment.fixed) <= .001 && segment.start <= last.end + .001) { last.end = Math.max(last.end, segment.end); last.fixed = Math.min(last.fixed, segment.fixed); }
      else merged.push({ ...segment });
    }
  }
  return [...merged, ...diagonal];
}

// One shared interval model for plan, quantities, clear areas and production.
// Millimetre rounding follows saved plan precision; it is not an installation allowance.
export function partitionRuns(plan, rawAxes = false) {
  const groups = new Map();
  const contour=houseContourPoints(plan),wall=Number(plan.wallThickness)||.174;
  const isOuter=([a,b])=>contour.some((u,i)=>{const v=contour[(i+1)%contour.length],dx=v.x-u.x,dy=v.y-u.y,l2=dx*dx+dy*dy;
    const distance=p=>{const t=Math.max(0,Math.min(1,((p.x-u.x)*dx+(p.y-u.y)*dy)/(l2||1)));return Math.hypot(p.x-u.x-t*dx,p.y-u.y-t*dy);};
    return distance(a)<=wall+EPS&&distance(b)<=wall+EPS;
  });
  const lines = [...unifiedWallSegments(plan).map(lineEndpoints), ...(plan.walls || []).filter(w => w.include !== false).map(w => [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}]).filter(line=>!isOuter(line))];
  for (const [a,b] of lines) {
    const length = Math.hypot(b.x-a.x,b.y-a.y); if (!(length > .0001)) continue;
    let ux=(b.x-a.x)/length, uy=(b.y-a.y)/length;
    if(ux < -1e-8 || (Math.abs(ux)<1e-8 && uy<0)){ux=-ux;uy=-uy;}
    const offset=-uy*a.x+ux*a.y, key=`${ux.toFixed(6)}:${uy.toFixed(6)}:${offset.toFixed(3)}`;
    if(!groups.has(key))groups.set(key,{ux,uy,offset,spans:[]});
    groups.get(key).spans.push([Math.min(ux*a.x+uy*a.y,ux*b.x+uy*b.y),Math.max(ux*a.x+uy*a.y,ux*b.x+uy*b.y)]);
  }
  const result=[];
  for(const {ux,uy,offset,spans} of groups.values()) {
    const merged=[];
    for(const span of spans.sort((a,b)=>a[0]-b[0])){const last=merged.at(-1);if(last&&span[0]<=last[1]+.001)last[1]=Math.max(last[1],span[1]);else merged.push([...span]);}
    for(const [start,end] of merged)result.push([{x:ux*start-uy*offset,y:uy*start+ux*offset},{x:ux*end-uy*offset,y:uy*end+ux*offset}]);
  }
  if(rawAxes || plan.partitionJunctions!=='butt')return result;
  return result.map(([a,b],index)=>{
    const L=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/L,uy=(b.y-a.y)/L;
    const trim=(p,end)=>{
      let inset=0;
      result.forEach(([c,d],other)=>{
        if(other===index)return;
        const dx=d.x-c.x,dy=d.y-c.y,l=Math.hypot(dx,dy),t=((p.x-c.x)*dx+(p.y-c.y)*dy)/(l*l||1);
        if(!l||Math.abs(ux*dy-uy*dx)/l<.999||t<-.001||t>1.001||Math.abs(dx*(p.y-c.y)-dy*(p.x-c.x))/l>.001)return;
        const interior=t>.001&&t<.999;
        // At a corner horizontal wall is through; at a T the uninterrupted wall is through.
        if(interior || Math.abs(uy)>.999){inset=Math.max(inset,partitionDepth(plan,c,d)/2);}
      });
      return {x:roundCoord(p.x+ux*inset*end),y:roundCoord(p.y+uy*inset*end)};
    };
    return [trim(a,1),trim(b,-1)];
  }).filter(([a,b])=>Math.hypot(b.x-a.x,b.y-a.y)>.001);
}

export function partitionDepth(plan,a,b){
  // Supported finished SIP thicknesses are not replaced by a frame board depth.
  if([.124,.174,.224].includes(Number(plan.partitionThickness)))return Number(plan.partitionThickness);
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  const covers=(u,v)=>{const dx=v.x-u.x,dy=v.y-u.y,l=Math.hypot(dx,dy),L=Math.hypot(b.x-a.x,b.y-a.y),t=((mid.x-u.x)*dx+(mid.y-u.y)*dy)/(l*l||1);return l>0&&t>=0&&t<=1&&Math.abs(dx*(mid.y-u.y)-dy*(mid.x-u.x))/l<.015&&Math.abs(dx*(b.y-a.y)-dy*(b.x-a.x))/(l*L||1)<.001;};
  const profiles=[];
  for(const w of plan.walls||[])if(w.include!==false&&covers({x:w.x1,y:w.y1},{x:w.x2,y:w.y2}))profiles.push(w.bearing?w.bearingProfile:w.frameProfile);
  for(const r of plan.rooms||[])if(r.include!==false){const points=roomPoints(r);points.forEach((p,i)=>{const q=points[(i+1)%points.length],setting=r.bearingWalls?.[edgeKey(p,q)];if(covers(p,q)&&(setting?.enabled??r.bearing))profiles.push(setting?.profile||r.bearingProfile);});}
  return Math.max(0,...profiles.map(p=>Number(String(p||'').split(/[×xх]/)[1])/1000||0))||Number(plan.partitionThickness)||.1;
}

const edgeKey=(a,b)=>[a,b].map(p=>`${Math.round(p.x*1000)},${Math.round(p.y*1000)}`).sort().join(':');
const sourceEdges=plan=>[
  ...(plan.rooms||[]).flatMap(room=>roomPoints(room).map((a,i,points)=>({ref:`room:${room.id}:${i}`,a,b:points[(i+1)%points.length]}))),
  ...(plan.walls||[]).map(w=>({ref:`wall:${w.id}`,a:{x:w.x1,y:w.y1},b:{x:w.x2,y:w.y2}}))
];

export function preservePlanAttachments(plan,before) {
  const oldEdges=sourceEdges(before), newEdges=new Map(sourceEdges(plan).map(e=>[e.ref,e]));
  for(const key of ['openings','wallGaps'])for(const opening of plan[key]||[]){
    if(opening.outer===true)continue;
    const saved=(before[key]||[]).find(o=>o.id===opening.id);
    if(!saved || saved.x!==opening.x || saved.y!==opening.y || saved.wallRef!==opening.wallRef)continue;
    const choices=oldEdges.map(e=>{const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,l2=dx*dx+dy*dy,t=l2?((opening.x-e.a.x)*dx+(opening.y-e.a.y)*dy)/l2:0;
      return {...e,t,distance:Math.hypot(opening.x-e.a.x-dx*t,opening.y-e.a.y-dy*t)};
    }).filter(e=>e.t>=0&&e.t<=1&&e.distance<.015).sort((a,b)=>a.distance-b.distance||a.ref.localeCompare(b.ref));
    const old=choices.find(e=>e.ref===opening.wallRef)||choices[0], next=old&&newEdges.get(old.ref);
    if(next){const oldLength=Math.hypot(old.b.x-old.a.x,old.b.y-old.a.y),newLength=Math.hypot(next.b.x-next.a.x,next.b.y-next.a.y),offset=old.t*oldLength;
      if(newLength>0){opening.x=roundCoord(next.a.x+(next.b.x-next.a.x)*offset/newLength);opening.y=roundCoord(next.a.y+(next.b.y-next.a.y)*offset/newLength);opening.wallRef=old.ref;}}
  }
  for(const room of plan.rooms||[]){
    const old=(before.rooms||[]).find(r=>r.id===room.id);if(!old?.bearingWalls)continue;
    const a=roomPoints(old),b=roomPoints(room);if(a.length!==b.length)continue;
    room.bearingWalls={...room.bearingWalls};
    a.forEach((p,i)=>{const oldKey=edgeKey(p,a[(i+1)%a.length]),newKey=edgeKey(b[i],b[(i+1)%b.length]);if(oldKey!==newKey&&old.bearingWalls[oldKey]){delete room.bearingWalls[oldKey];room.bearingWalls[newKey]={...old.bearingWalls[oldKey]};}});
  }
}

export function allOpeningSegments(plan) {
  const contour = houseContourPoints(plan);
  const outerSegments = contour.map((point, index) => axialSegment(point, contour[(index + 1) % contour.length], { outer: true })).filter((segment) => segment.axis !== 'd');
  const segments = [
    ...outerSegments,
    ...unifiedWallSegments(plan).filter((segment) => segment.axis !== 'd').map((segment) => ({ ...segment, outer: false })),
    ...(plan.walls || []).filter(w=>w.include!==false).map((wall) => ({ ...axialSegment({ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }), outer: false,ref:`wall:${wall.id}` })).filter((segment) => segment.axis !== 'd')
  ];
  return segments;
}

export function nearestSegment(point, segments) {
  let best = null;
  for (const segment of segments) {
    const along = segment.axis === 'v' ? point.y : point.x;
    const across = segment.axis === 'v' ? point.x : point.y;
    const projected = Math.max(segment.start, Math.min(segment.end, along));
    const distance = Math.hypot(across - segment.fixed, along - projected);
    if (!best || distance < best.distance) best = { ...segment, projected, distance };
  }
  return best;
}

export function projectOpeningToWall(opening, point, plan, options = {}) {
  const lockDoorType = options.lockDoorType === true;
  const isDoor = opening?.type === 'door';
  const doorType = opening?.doorType;
  let segments = allOpeningSegments(plan);
  if (isDoor && (doorType === 'garage' || (lockDoorType && doorType === 'entrance'))) {
    segments = segments.filter((segment) => segment.outer);
  } else if (isDoor && lockDoorType && doorType === 'interior') {
    segments = segments.filter((segment) => !segment.outer);
  }
  const segment = nearestSegment(point, segments);
  if (!segment) return { ...opening };
  const halfWidth = Math.min(Math.max(0, Number(opening?.width) || 0) / 2, Math.max(0, segment.end - segment.start) / 2);
  const projected = Math.max(segment.start + halfWidth, Math.min(segment.end - halfWidth, segment.projected));
  const result = {
    ...opening,
    orientation: segment.axis,
    outer: segment.outer,
    wallRef: segment.ref || '',
    x: segment.axis === 'v' ? segment.fixed : projected,
    y: segment.axis === 'v' ? projected : segment.fixed
  };
  if (isDoor) {
    if (doorType === 'garage') result.doorType = 'garage';
    else if (!lockDoorType) result.doorType = segment.outer ? 'entrance' : 'interior';
  }
  return result;
}

/** Moves selected objects by an exact keyboard step and keeps openings attached to walls. */
export function nudgePlanSelection(plan, selected, dx, dy) {
  if (!selected) return false;
  const byId = (key) => (plan[key] || []).find((item) => item.id === selected.id);
  if (selected.type === 'room') {
    if(plan.layoutMode==='walls')return false;
    const room = byId('rooms');
    if (!room) return false;
    const before=structuredClone(plan);
    room.points = roomPoints(room).map((point) => ({ x: roundCoord(point.x + dx), y: roundCoord(point.y + dy) }));
    Object.assign(room, boundsOf(room.points));
    preservePlanAttachments(plan,before);
    return true;
  }
  if (selected.type === 'roomLabel') {
    const room = byId('rooms');
    if (!room) return false;
    const bounds = boundsOf(roomPoints(room));
    room.labelX = roundCoord((Number.isFinite(Number(room.labelX)) ? Number(room.labelX) : bounds.x + bounds.w / 2) + dx);
    room.labelY = roundCoord((Number.isFinite(Number(room.labelY)) ? Number(room.labelY) : bounds.y + bounds.h / 2) + dy);
    return true;
  }
  if (selected.type === 'annotation') {
    const annotation = byId('annotations');
    if (!annotation) return false;
    annotation.x = roundCoord(annotation.x + dx);
    annotation.y = roundCoord(annotation.y + dy);
    return true;
  }
  if (selected.type === 'platform') {
    const platform = byId('platforms');
    if (!platform) return false;
    platform.x = roundCoord(platform.x + dx);
    platform.y = roundCoord(platform.y + dy);
    return true;
  }
  if (selected.type === 'opening') {
    const opening = byId('openings');
    if (!opening) return false;
    const target = {
      x: roundCoord(opening.x + (opening.orientation === 'h' ? dx : 0)),
      y: roundCoord(opening.y + (opening.orientation === 'v' ? dy : 0)),
    };
    Object.assign(opening, projectOpeningToWall(opening, target, plan, {
      lockDoorType: opening.type === 'door',
    }));
    return true;
  }
  if (selected.type === 'gap') {
    const gap = byId('wallGaps');
    if (!gap) return false;
    const target = {
      x: roundCoord(gap.x + (gap.orientation === 'h' ? dx : 0)),
      y: roundCoord(gap.y + (gap.orientation === 'v' ? dy : 0)),
    };
    const segment = nearestSegment(target, allOpeningSegments(plan));
    if (!segment) return false;
    gap.orientation = segment.axis;
    gap.outer = segment.outer;
    gap.x = segment.axis === 'v' ? segment.fixed : roundCoord(segment.projected);
    gap.y = segment.axis === 'v' ? roundCoord(segment.projected) : segment.fixed;
    return true;
  }
  if (selected.type === 'pile') {
    const pile = byId('piles');
    if (!pile) return false;
    pile.x = roundCoord(pile.x + dx);
    pile.y = roundCoord(pile.y + dy);
    return true;
  }
  const key = selected.type === 'wall' ? 'walls'
    : selected.type === 'dimension' ? 'dimensions'
      : selected.type === 'pileRow' ? 'pileRows'
        : selected.type === 'bindingLine' ? 'bindingLines'
          : null;
  if (!key) return false;
  const line = byId(key);
  if (!line) return false;
  if(selected.type==='wall'){
    const before=structuredClone(plan);moveConnectedWall(plan,line.id,dx,dy,.001,false);preservePlanAttachments(plan,before);return true;
  }
  const before=selected.type==='wall'?structuredClone(plan):null;
  line.x1 = roundCoord(line.x1 + dx);
  line.y1 = roundCoord(line.y1 + dy);
  line.x2 = roundCoord(line.x2 + dx);
  line.y2 = roundCoord(line.y2 + dy);
  if(before)preservePlanAttachments(plan,before);
  return true;
}

const pointOnBoundary = (point, polygon) => polygon.some((a, index) => {
  const b = polygon[(index + 1) % polygon.length];
  const cross = Math.abs((point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y));
  return cross <= EPS && point.x >= Math.min(a.x, b.x) - EPS && point.x <= Math.max(a.x, b.x) + EPS && point.y >= Math.min(a.y, b.y) - EPS && point.y <= Math.max(a.y, b.y) + EPS;
});

export function pointInPolygon(point, polygon) {
  if (pointOnBoundary(point, polygon)) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]; const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function planIssues(plan) {
  const wall = Number(plan.wallThickness) || 0.174;
  const issues = [];
  const contour = houseContourPoints(plan);
  const gapEdges=[...partitionRuns(plan).map(([a,b],i)=>({a,b,id:`partition-${i}`})),...contour.map((a,i)=>({a,b:contour[(i+1)%contour.length],id:`outer-${i}`,outer:true}))];
  for(const gap of plan.wallGaps||[]){
    if(gap.include===false||gap.subtractFromSip===false)continue;
    const eligible=gapEdges.filter(e=>typeof gap.outer!=='boolean'||!!e.outer===gap.outer);
    const result=gapFragments(gap,eligible);
    if(result.error)issues.push({type:'opening-gap',point:{x:gap.x,y:gap.y},openingId:gap.id,roomIds:[],message:`Разрыв: ${result.error} (${gap.x}; ${gap.y})`});
  }
  for (const room of plan.rooms || []) {
    if (room.extension) continue;
    const points = roomPoints(room);
    if (points.some((point) => !pointInPolygon(point, contour) && !pointOnBoundary(point, contour))) {
      issues.push({ type: 'outside', roomIds: [room.id], message: `${room.name}: выходит за внутренний контур дома` });
    }
  }
  for (let i = 0; i < (plan.rooms || []).length; i += 1) {
    for (let j = i + 1; j < plan.rooms.length; j += 1) {
      const left = plan.rooms[i]; const right = plan.rooms[j];
      const a = roomPoints(left); const b = roomPoints(right);
      const overlap=clipping.intersection([a.map(p=>[p.x,p.y])],[b.map(p=>[p.x,p.y])]);
      const overlapArea=overlap.reduce((sum,poly)=>sum+poly.reduce((s,ring,i)=>s+(i?-1:1)*Math.abs(ring.reduce((v,p,k)=>{const q=ring[(k+1)%ring.length];return v+p[0]*q[1]-q[0]*p[1];},0))/2,0),0);
      if (overlapArea > .000001) {
        issues.push({ type: 'overlap', roomIds: [left.id, right.id], message: `${left.name} и ${right.name}: помещения пересекаются` });
      }
    }
  }
  for(const [a,b] of partitionRuns(plan))for(const p of [a,b]){
    const outerDistances=contour.map((u,i)=>{const v=contour[(i+1)%contour.length],dx=v.x-u.x,dy=v.y-u.y,l=Math.hypot(dx,dy),t=((p.x-u.x)*dx+(p.y-u.y)*dy)/(l*l||1);return t>=0&&t<=1?Math.abs(dx*(p.y-u.y)-dy*(p.x-u.x))/(l||1):Infinity;});
    const gap=Math.min(...outerDistances)-wall;
    if(gap>.001&&gap<.1)issues.push({type:'junction-gap',point:p,roomIds:[],message:`Перегородка (${p.x.toFixed(3)}; ${p.y.toFixed(3)}): до грани наружной стены ${Math.round(gap*1000)} мм. Проверьте примыкание.`});
  }
  const internalEdges = roomWallSegments(plan).filter((edge) => edge.axis !== 'd');
  const gapRooms = new Set();
  for (let i = 0; i < internalEdges.length; i += 1) {
    for (let j = i + 1; j < internalEdges.length; j += 1) {
      const left = internalEdges[i]; const right = internalEdges[j];
      if (left.roomId === right.roomId || left.axis !== right.axis) continue;
      const separation = Math.abs(left.fixed - right.fixed);
      const overlap = Math.min(left.end, right.end) - Math.max(left.start, right.start);
      // Two almost-parallel room faces indicate a drawing gap. A deliberately
      // open zone has no close opposing face and therefore remains valid.
      if (separation > .001 && separation <= 0.35 && overlap > 0.2) {
        gapRooms.add(left.roomId); gapRooms.add(right.roomId);
      }
    }
  }
  for (const roomId of gapRooms) {
    const room = (plan.rooms || []).find((candidate) => candidate.id === roomId);
    issues.push({ type: 'gap', roomIds: [roomId], message: `${room?.name || 'Комната'}: стена не состыкована с соседним помещением` });
  }
  return issues;
}

export function lineEndpoints(segment) {
  if (segment.axis === 'h') return [{ x: segment.start, y: segment.fixed }, { x: segment.end, y: segment.fixed }];
  if (segment.axis === 'v') return [{ x: segment.fixed, y: segment.start }, { x: segment.fixed, y: segment.end }];
  return [segment.a, segment.b];
}
