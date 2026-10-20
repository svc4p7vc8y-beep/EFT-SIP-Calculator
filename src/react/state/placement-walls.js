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
