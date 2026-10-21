const round = value => Math.round(value * 100) / 100;
const clamp = value => Math.max(0, Math.min(1, value));

export function routeSegmentDirection(a, b) {
  const dx = Number(b.x) - Number(a.x);
  const dy = Number(b.y) - Number(a.y);
  if (Math.abs(dx) < .001 && Math.abs(dy) > .001) return 'vertical';
  if (Math.abs(dy) < .001 && Math.abs(dx) > .001) return 'horizontal';
  return null;
}

export function pointOnRouteSegment(points, index, location) {
  const a = points[index], b = points[index + 1];
  if (!a || !b) return null;
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < .0001) return null;
  const ratio = clamp(((location.x - a.x) * dx + (location.y - a.y) * dy) / lengthSquared);
  const length = Math.sqrt(lengthSquared);
  if (ratio * length < .03 || (1 - ratio) * length < .03) return null;
  return { x: round(a.x + dx * ratio), y: round(a.y + dy * ratio), z: round((Number(a.z) || 0) + ((Number(b.z) || 0) - (Number(a.z) || 0)) * ratio) };
}

export function insertRoutePoint(points, index, point) {
  if (!point || index < 0 || index >= points.length - 1) return null;
  return [...points.slice(0, index + 1).map(entry => ({ ...entry })), { ...point }, ...points.slice(index + 1).map(entry => ({ ...entry }))];
}

export function shiftRouteSegment(points, index, offset) {
  const a = points[index], b = points[index + 1];
  const direction = a && b && routeSegmentDirection(a, b);
  if (!direction || !Number.isFinite(offset) || Math.abs(offset) < .01) return null;
  const axis = direction === 'horizontal' ? 'y' : 'x';
  const shiftedA = { ...a, [axis]: round(a[axis] + offset) };
  const shiftedB = { ...b, [axis]: round(b[axis] + offset) };
  return shiftRouteSegmentTo(points, index, shiftedA, shiftedB);
}

export function shiftRouteSegmentTo(points, index, shiftedA, shiftedB) {
  if (!points[index] || !points[index + 1] || !shiftedA || !shiftedB) return null;
  // The two original points remain as elbows, so linked endpoints never move.
  return [...points.slice(0, index + 1).map(entry => ({ ...entry })), { ...shiftedA }, { ...shiftedB }, ...points.slice(index + 1).map(entry => ({ ...entry }))];
}
