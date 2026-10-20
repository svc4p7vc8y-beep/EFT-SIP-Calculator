import { houseContourPoints, partitionDepth, partitionRuns } from '../planner/geometry.js';
import { pointInPolygon } from './placement-geometry.js';

const point = (a, b, amount) => ({ x: a.x + b.x * amount, y: a.y + b.y * amount });

export function placementWallBands(plan) {
  const contour = houseContourPoints(plan);
  const outerThickness = Number(plan.wallThickness) || .174;
  const outer = contour.map((a, index) => {
    const b = contour[(index + 1) % contour.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < .001) return null;
    const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const inward = pointInPolygon(point(middle, normal, .05), contour) ? normal : { x: -normal.x, y: -normal.y };
    return { a, b, thickness: outerThickness, type: 'outer', faces: [{ a: point(a, inward, outerThickness), b: point(b, inward, outerThickness), normal: inward }] };
  }).filter(Boolean);
  const partitions = partitionRuns(plan).map(([a, b]) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < .001) return null;
    const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
    const thickness = partitionDepth(plan, a, b);
    return { a, b, thickness, type: 'partition', faces: [1, -1].map(side => {
      const direction = { x: normal.x * side, y: normal.y * side };
      return { a: point(a, direction, thickness / 2), b: point(b, direction, thickness / 2), normal: direction };
    }) };
  }).filter(Boolean);
  return { contour, outer, partitions };
}

export function nearestWallDimension(plan, item, bands = placementWallBands(plan)) {
  const location = item.surface === 'facade' && Number.isFinite(item.anchorX) && Number.isFinite(item.anchorY)
    ? { x: item.anchorX, y: item.anchorY } : { x: item.x, y: item.y };
  if (!Number.isFinite(location.x) || !Number.isFinite(location.y)) return null;
  let nearest = null;
  for (const band of [...bands.outer, ...bands.partitions]) {
    for (const face of band.faces) {
      const dx = face.b.x - face.a.x, dy = face.b.y - face.a.y;
      const lengthSquared = dx * dx + dy * dy;
      const ratio = ((location.x - face.a.x) * dx + (location.y - face.a.y) * dy) / lengthSquared;
      if (ratio < -.001 || ratio > 1.001) continue;
      const from = { x: face.a.x + ratio * dx, y: face.a.y + ratio * dy };
      const distance = (location.x - from.x) * face.normal.x + (location.y - from.y) * face.normal.y;
      if (distance < -.01) continue;
      if (!nearest || distance < nearest.distance) nearest = { from, to: location, distance: Math.max(0, distance), wallType: band.type };
    }
  }
  return nearest;
}

// Snap the physical edge of an object to the room-facing wall face.
export function snapPlacementToWall(plan, position, item, tolerance = .28, bands = placementWallBands(plan)) {
  const quarterTurn = Math.round((Number(item.rotation) || 0) / 90) % 2 !== 0;
  const width = quarterTurn ? item.depth : item.width;
  const depth = quarterTurn ? item.width : item.depth;
  let best = null;
  for (const band of [...bands.outer, ...bands.partitions]) for (const face of band.faces) {
    const dx = face.b.x - face.a.x, dy = face.b.y - face.a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) continue;
    const ratio = ((position.x - face.a.x) * dx + (position.y - face.a.y) * dy) / lengthSquared;
    if (ratio < 0 || ratio > 1) continue;
    const foot = { x: face.a.x + ratio * dx, y: face.a.y + ratio * dy };
    const signed = (position.x - foot.x) * face.normal.x + (position.y - foot.y) * face.normal.y;
    if (signed < -.01 || signed > tolerance + Math.max(width, depth) / 2) continue;
    const half = (Math.abs(face.normal.x) * width + Math.abs(face.normal.y) * depth) / 2;
    const gap = Math.abs(signed - half);
    if (gap > tolerance || (best && gap >= best.gap)) continue;
    best = { x: foot.x + face.normal.x * half, y: foot.y + face.normal.y * half, gap, wallType: band.type };
  }
  return best ? { x: Math.round(best.x * 1000) / 1000, y: Math.round(best.y * 1000) / 1000 } : position;
}

// A horizontal setting-out dimension from the left or right wall at the object's Y.
export function electricalSettingOutDimension(plan, item, bands = placementWallBands(plan)) {
  if (item.surface === 'facade') return nearestPlacementDimension(plan, item, bands);
  const candidates = [];
  for (const band of [...bands.outer, ...bands.partitions]) for (const face of band.faces) {
    if (Math.abs(face.a.x - face.b.x) > .01) continue;
    const minY = Math.min(face.a.y, face.b.y), maxY = Math.max(face.a.y, face.b.y);
    if (item.y < minY - .001 || item.y > maxY + .001) continue;
    const delta = item.x - face.a.x;
    const side = delta >= 0 ? 'left' : 'right';
    if (item.dimensionSide && item.dimensionSide !== 'auto' && item.dimensionSide !== side) continue;
    if (delta * face.normal.x < -.001) continue;
    candidates.push({ from: { x: face.a.x, y: item.y }, to: { x: item.x, y: item.y }, distance: Math.abs(delta), side, wallType: band.type });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0] || nearestWallDimension(plan, item, bands);
}

export function nearestPlacementDimension(plan, item, bands = placementWallBands(plan)) {
  if (item.surface !== 'facade') return nearestWallDimension(plan, item, bands);
  const anchor = Number.isFinite(item.anchorX) && Number.isFinite(item.anchorY)
    ? { x: item.anchorX, y: item.anchorY } : { x: item.x, y: item.y };
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return null;

  const edges = bands.outer.map(({ a, b }) => {
    const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
    const ratio = ((anchor.x - a.x) * dx + (anchor.y - a.y) * dy) / lengthSquared;
    const clamped = Math.max(0, Math.min(1, ratio));
    const to = { x: a.x + clamped * dx, y: a.y + clamped * dy };
    return { a, b, dx, dy, lengthSquared, ratio: clamped, to,
      distance: Math.hypot(anchor.x - to.x, anchor.y - to.y) };
  }).filter(edge => edge.lengthSquared > 0);
  const edge = edges.sort((a, b) => a.distance - b.distance)[0];
  if (!edge) return null;

  const references = [
    { ratio: 0, reference: 'угла' },
    { ratio: 1, reference: 'угла' },
  ];
  for (const opening of plan.openings || []) {
    if (opening.outer === false || !['window', 'door'].includes(opening.type)) continue;
    const width = Number(opening.width);
    if (!(width > 0) || !Number.isFinite(opening.x) || !Number.isFinite(opening.y)) continue;
    const start = { x: opening.x, y: opening.y };
    const end = opening.orientation === 'h' ? { x: start.x + width, y: start.y }
      : opening.orientation === 'v' ? { x: start.x, y: start.y + width } : null;
    if (!end) continue;
    const projected = [start, end].map(p => {
      const ratio = ((p.x - edge.a.x) * edge.dx + (p.y - edge.a.y) * edge.dy) / edge.lengthSquared;
      const distance = Math.abs((p.x - edge.a.x) * edge.dy - (p.y - edge.a.y) * edge.dx) / Math.sqrt(edge.lengthSquared);
      return { ratio, distance };
    });
    const openingOffset = Math.max(.05, Number(plan.wallThickness || .174) / 2 + .05);
    if (projected.some(p => p.distance > openingOffset || p.ratio < -.001 || p.ratio > 1.001)) continue;
    for (const p of projected) references.push({ ratio: p.ratio, reference: opening.type === 'window' ? 'окна' : 'двери' });
  }
  const closest = references.sort((a, b) =>
    Math.abs(a.ratio - edge.ratio) - Math.abs(b.ratio - edge.ratio))[0];
  const from = { x: edge.a.x + closest.ratio * edge.dx, y: edge.a.y + closest.ratio * edge.dy };
  return { from, to: edge.to, distance: Math.hypot(from.x - edge.to.x, from.y - edge.to.y),
    wallType: 'facade', reference: closest.reference };
}
