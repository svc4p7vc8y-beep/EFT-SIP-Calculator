import { appendSurfaceWaypoint, nearestRouteWall, routeSurfaceAtPoint, surfaceRouteLeg } from './placement-route-surfaces.js';

const round = value => Math.round(value * 100) / 100;
const grid = point => ({ x: round(Math.round(point.x * 10) / 10), y: round(Math.round(point.y * 10) / 10) });

function nearestWirePoint(at, routes, surface, tolerance = .14) {
  let nearest = null;
  for (const route of routes || []) {
    const points = route.points || [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const first = points[index], last = points[index + 1];
      const segmentSurface = [last.surface, first.surface, route.surface].find(value => value === 'ceiling' || value === 'floor' || value === 'wall');
      if (surface === 'wall' && segmentSurface !== 'wall') continue;
      if (Math.abs((last.z || 0) - (first.z || 0)) > .001) continue;
      const dx = last.x - first.x, dy = last.y - first.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared < .0001) continue;
      const fraction = Math.max(0, Math.min(1, ((at.x - first.x) * dx + (at.y - first.y) * dy) / lengthSquared));
      const position = { x: round(first.x + dx * fraction), y: round(first.y + dy * fraction) };
      const distance = Math.hypot(at.x - position.x, at.y - position.y);
      if (distance <= tolerance && (!nearest || distance < nearest.distance)) nearest = { position, distance, wallRef: last.wallRef || first.wallRef || '' };
    }
  }
  return nearest;
}

/** Pick an exact wire or wall axis before the finer 10 cm drawing grid. */
export function manualRouteSnap(plan, at, routes, surface, tolerance = .14) {
  const wire = nearestWirePoint(at, routes, surface, tolerance);
  if (wire) return { position: wire.position, surface, wallRef: wire.wallRef, snappedTo: 'wire' };
  if (surface === 'wall') {
    const wall = nearestRouteWall(plan, at);
    return wall?.projection.distance <= .6
      ? { position: wall.projection.foot, surface: 'wall', wallRef: wall.face.ref, snappedTo: 'wall' }
      : null;
  }
  const choice = routeSurfaceAtPoint(plan, at, surface, .16);
  // Snapping XY to a wall must not silently switch a ceiling or floor cable
  // onto the wall. The surface picker is the explicit physical route choice.
  return choice.surface === 'wall' ? { ...choice, surface, snappedTo: 'wall' } : { position: grid(at), surface, wallRef: '', snappedTo: 'grid' };
}

/** Each click remains a waypoint. Only a necessary right-angle elbow is inserted. */
export function orthogonalManualLeg(points, leg) {
  if (!leg) return null;
  const result = [...points];
  for (const next of leg.slice(1)) {
    const previous = result.at(-1);
    const dx = next.x - previous.x, dy = next.y - previous.y;
    if (Math.abs(dx) > .001 && Math.abs(dy) > .001 && Math.abs((next.z || 0) - (previous.z || 0)) < .001 && next.surface !== 'wall') {
      const preceding = result.at(-2);
      const priorHorizontal = preceding && Math.abs(preceding.y - previous.y) < .001 && Math.abs(preceding.x - previous.x) > .001;
      const priorVertical = preceding && Math.abs(preceding.x - previous.x) < .001 && Math.abs(preceding.y - previous.y) > .001;
      const horizontalFirst = priorHorizontal || (!priorVertical && Math.abs(dx) >= Math.abs(dy));
      result.push({ ...previous, x: horizontalFirst ? next.x : previous.x, y: horizontalFirst ? previous.y : next.y, surface: next.surface, waypoint: true, manualElbow: true });
    }
    if (Math.hypot(next.x - result.at(-1).x, next.y - result.at(-1).y, (next.z || 0) - (result.at(-1).z || 0)) > .001) result.push(next);
  }
  return result;
}

export function appendManualRouteWaypoint(points, choice, plan, wallHeight = null) {
  const appended = appendSurfaceWaypoint(points, choice.position, choice.surface, plan, wallHeight, choice.wallRef, { wallStartNearest: true });
  return appended && orthogonalManualLeg(points, appended.slice(points.length - 1));
}

export function finishManualRoute(points, target, surface, plan, wallHeight = null) {
  return orthogonalManualLeg(points, surfaceRouteLeg(points.at(-1), target, surface, plan, wallHeight, '', { wallStartNearest: true }));
}
