const EPS = 0.035;

export const roundCoord = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

export function roomPoints(room) {
  if (Array.isArray(room?.points) && room.points.length >= 3) return room.points;
  return [
    { x: room.x, y: room.y }, { x: room.x + room.w, y: room.y },
    { x: room.x + room.w, y: room.y + room.h }, { x: room.x, y: room.y + room.h }
  ];
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

export function collectSnapAxes(plan, excludeRoomId) {
  const wall = Number(plan.wallThickness) || 0.174;
  const xs = new Set([0, wall, plan.house.w - wall, plan.house.w]);
  const ys = new Set([0, wall, plan.house.h - wall, plan.house.h]);
  for (const room of plan.rooms || []) {
    if (room.id === excludeRoomId) continue;
    for (const point of roomPoints(room)) { xs.add(point.x); ys.add(point.y); }
  }
  for (const wallLine of plan.walls || []) { xs.add(wallLine.x1); xs.add(wallLine.x2); ys.add(wallLine.y1); ys.add(wallLine.y2); }
  return { xs: [...xs], ys: [...ys] };
}

export function snapPoint(point, axes, options = {}) {
  const grid = Number(options.grid) || 0.1;
  const tolerance = Number(options.tolerance) || 0.16;
  const snapValue = (value, candidates) => {
    let best = Math.round(value / grid) * grid;
    let distance = tolerance;
    for (const candidate of candidates) {
      const next = Math.abs(candidate - value);
      if (next <= distance) { best = candidate; distance = next; }
    }
    return roundCoord(best);
  };
  return { x: snapValue(point.x, axes.xs || []), y: snapValue(point.y, axes.ys || []) };
}

export function movePoints(points, dx, dy, plan, axes) {
  const moved = points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  const bounds = boundsOf(moved);
  const wall = Number(plan.wallThickness) || 0.174;
  let correctionX = 0; let correctionY = 0;
  if (bounds.x < wall) correctionX = wall - bounds.x;
  if (bounds.x2 > plan.house.w - wall) correctionX = plan.house.w - wall - bounds.x2;
  if (bounds.y < wall) correctionY = wall - bounds.y;
  if (bounds.y2 > plan.house.h - wall) correctionY = plan.house.h - wall - bounds.y2;
  const corrected = moved.map((point) => ({ x: point.x + correctionX, y: point.y + correctionY }));
  const correctedBounds = boundsOf(corrected);
  const snappedOrigin = snapPoint({ x: correctedBounds.x, y: correctedBounds.y }, axes);
  return corrected.map((point) => ({
    x: roundCoord(point.x + snappedOrigin.x - correctedBounds.x),
    y: roundCoord(point.y + snappedOrigin.y - correctedBounds.y)
  }));
}

const axialSegment = (a, b, source = {}) => {
  if (Math.abs(a.y - b.y) <= EPS) return { axis: 'h', fixed: roundCoord((a.y + b.y) / 2), start: Math.min(a.x, b.x), end: Math.max(a.x, b.x), ...source };
  if (Math.abs(a.x - b.x) <= EPS) return { axis: 'v', fixed: roundCoord((a.x + b.x) / 2), start: Math.min(a.y, b.y), end: Math.max(a.y, b.y), ...source };
  return { axis: 'd', a: { ...a }, b: { ...b }, start: 0, end: Math.hypot(b.x - a.x, b.y - a.y), ...source };
};

export function roomWallSegments(plan) {
  const wall = Number(plan.wallThickness) || 0.174;
  const segments = [];
  for (const room of plan.rooms || []) {
    const points = roomPoints(room);
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      const segment = axialSegment(point, next, { roomId: room.id });
      const outerFace = segment.axis === 'v'
        ? Math.abs(segment.fixed - wall) <= EPS || Math.abs(segment.fixed - (plan.house.w - wall)) <= EPS
        : segment.axis === 'h'
          ? Math.abs(segment.fixed - wall) <= EPS || Math.abs(segment.fixed - (plan.house.h - wall)) <= EPS
          : false;
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
    const key = `${segment.axis}:${roundCoord(segment.fixed, 2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(segment);
  }
  const merged = [];
  for (const list of groups.values()) {
    list.sort((left, right) => left.start - right.start);
    for (const segment of list) {
      const last = merged.at(-1);
      if (last && last.axis === segment.axis && Math.abs(last.fixed - segment.fixed) <= EPS && segment.start <= last.end + EPS) last.end = Math.max(last.end, segment.end);
      else merged.push({ ...segment });
    }
  }
  return [...merged, ...diagonal];
}

export function allOpeningSegments(plan) {
  const segments = [
    { axis: 'v', fixed: 0, start: 0, end: plan.house.h, outer: true },
    { axis: 'v', fixed: plan.house.w, start: 0, end: plan.house.h, outer: true },
    { axis: 'h', fixed: 0, start: 0, end: plan.house.w, outer: true },
    { axis: 'h', fixed: plan.house.h, start: 0, end: plan.house.w, outer: true },
    ...unifiedWallSegments(plan).filter((segment) => segment.axis !== 'd').map((segment) => ({ ...segment, outer: false })),
    ...(plan.walls || []).map((wall) => ({ ...axialSegment({ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }), outer: false })).filter((segment) => segment.axis !== 'd')
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
  for (const room of plan.rooms || []) {
    const points = roomPoints(room);
    if (points.some((point) => point.x < wall - EPS || point.x > plan.house.w - wall + EPS || point.y < wall - EPS || point.y > plan.house.h - wall + EPS)) {
      issues.push({ type: 'outside', roomIds: [room.id], message: `${room.name}: выходит за внутренний контур дома` });
    }
  }
  for (let i = 0; i < (plan.rooms || []).length; i += 1) {
    for (let j = i + 1; j < plan.rooms.length; j += 1) {
      const left = plan.rooms[i]; const right = plan.rooms[j];
      const a = roomPoints(left); const b = roomPoints(right);
      if (a.some((point) => pointInPolygon(point, b)) || b.some((point) => pointInPolygon(point, a))) {
        issues.push({ type: 'overlap', roomIds: [left.id, right.id], message: `${left.name} и ${right.name}: помещения пересекаются` });
      }
    }
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
      if (separation > EPS && separation <= 0.35 && overlap > 0.2) {
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
