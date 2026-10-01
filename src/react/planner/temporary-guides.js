import { houseContourPoints, pointInPolygon, roundCoord } from './geometry.js';

// Construction aids are kept in the editor session, never in the project model.
export function guideFromOuterWall(plan, point, tolerance = 0.2) {
  if (plan.house?.contourDefined === false) return null;
  const contour = houseContourPoints(plan);
  let best = null;
  for (let index = 0; index < contour.length; index += 1) {
    const a = contour[index], b = contour[(index + 1) % contour.length];
    const vertical = Math.abs(a.x - b.x) < 0.001;
    const horizontal = Math.abs(a.y - b.y) < 0.001;
    if (!vertical && !horizontal) continue;
    const along = vertical ? point.y : point.x;
    const lower = Math.min(vertical ? a.y : a.x, vertical ? b.y : b.x);
    const upper = Math.max(vertical ? a.y : a.x, vertical ? b.y : b.x);
    const distance = Math.hypot(
      vertical ? point.x - a.x : Math.max(lower - along, 0, along - upper),
      vertical ? Math.max(lower - along, 0, along - upper) : point.y - a.y,
    );
    if (distance > tolerance || (best && best.distance <= distance)) continue;
    const origin = vertical ? a.x : a.y;
    const midpoint = (lower + upper) / 2;
    const inward = pointInPolygon(vertical ? { x: origin + 0.05, y: midpoint } : { x: midpoint, y: origin + 0.05 }, contour) ? 1 : -1;
    best = { axis: vertical ? 'x' : 'y', origin, anchor: roundCoord(Math.max(lower, Math.min(upper, along))), inward, distance };
  }
  return best && { axis: best.axis, origin: best.origin, anchor: best.anchor, inward: best.inward, target: best.origin };
}

export function moveTemporaryGuide(guide, point) {
  const value = Math.round(Number(point[guide.axis]) * 10) / 10;
  return { ...guide, target: roundCoord(guide.inward > 0 ? Math.max(guide.origin, value) : Math.min(guide.origin, value)) };
}
