import { nearestRouteWall, routeSurfaceHeight } from './placement-route-surfaces.js';

const round = value => Math.round(value * 100) / 100;
const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)) < .001;

/** Only a wall that the user actually points at is magnetic. */
export function manualRouteSnap(plan, at, _routes, surface, tolerance = .12) {
  const wall = nearestRouteWall(plan, at);
  if (wall?.projection.distance <= tolerance) {
    return { position: { x: round(wall.projection.foot.x), y: round(wall.projection.foot.y) }, surface: 'wall', wallRef: wall.face.ref, snappedTo: 'wall' };
  }
  if (surface === 'wall') return null;
  return { position: { x: round(at.x), y: round(at.y) }, surface, wallRef: '', snappedTo: '' };
}

export function appendManualRouteWaypoint(points, choice, plan, wallHeight = null) {
  if (!points?.length || !choice?.position) return null;
  const next = { x: round(choice.position.x), y: round(choice.position.y),
    z: routeSurfaceHeight(plan, choice.surface, wallHeight), surface: choice.surface,
    ...(choice.wallRef ? { wallRef: choice.wallRef } : {}), waypoint: true };
  return same(points.at(-1), next) ? points : [...points, next];
}

/** Connect the clicked target by one straight segment, without adding bends. */
export function finishManualRoute(points, target) {
  if (!points?.length || !target) return null;
  const next = { ...target, x: round(target.x), y: round(target.y) };
  return same(points.at(-1), next) ? points : [...points, next];
}
