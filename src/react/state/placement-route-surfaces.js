import { placementWallFaces, projectToWallFace } from './placement-walls.js';

export const ROUTE_SURFACES = [
  { id: 'ceiling', label: 'Потолок' },
  { id: 'wall', label: 'Стена' },
  { id: 'floor', label: 'Пол' },
];

const round = value => Math.round(value * 1000) / 1000;
const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)) < .001;
const point = (at, z, surface, wallRef = '') => ({ x: round(at.x), y: round(at.y), z: round(z), surface, ...(wallRef ? { wallRef } : {}), ...(at.waypoint ? { waypoint: true } : {}) });

export function nearestRouteWall(plan, at, wallRef = '') {
  const faces = placementWallFaces(plan);
  const projected = faces.map(face => ({ face, projection: projectToWallFace(face, at) }));
  return (projected.find(entry => entry.face.ref === wallRef) || projected.sort((a, b) => a.projection.distance - b.projection.distance)[0]) || null;
}

export function routeSurfaceAtPoint(plan, at, interiorSurface = 'ceiling', tolerance = .28) {
  const wall = nearestRouteWall(plan, at);
  return wall?.projection.distance <= tolerance
    ? { position: wall.projection.foot, surface: 'wall', wallRef: wall.face.ref }
    : { position: at, surface: interiorSurface === 'floor' ? 'floor' : 'ceiling', wallRef: '' };
}

export function sharedRouteWallCorner(first, second, tolerance = .3) {
  if (!first || !second) return null;
  const candidates = [first.a, first.b].flatMap(a => [second.a, second.b].map(b => ({ a, b, distance: Math.hypot(a.x - b.x, a.y - b.y) })));
  return candidates.sort((a, b) => a.distance - b.distance)[0]?.distance <= tolerance ? candidates[0] : null;
}

export function routeSurfaceHeight(plan, surface, wallHeight = null) {
  const ceiling = Math.max(0, Number(plan?.wallHeight) || 2.5);
  if (surface === 'floor') return 0;
  if (surface === 'ceiling') return ceiling;
  return Math.max(0, Math.min(ceiling, wallHeight == null ? ceiling - .15 : Number(wallHeight) || 0));
}

/** Build a physical route through the requested surface. Every height change is vertical at a wall face. */
export function surfaceRouteLeg(from, to, surface, plan, wallHeight = null, wallRef = '') {
  if (!from || !to || !ROUTE_SURFACES.some(entry => entry.id === surface)) return null;
  const level = routeSurfaceHeight(plan, surface, wallHeight);
  const result = [point(from, Number(from.z) || 0, from.surface || 'device', from.wallRef)];
  const append = next => { if (!same(result.at(-1), next)) result.push(next); };
  const wallAt = (at, ref = '') => nearestRouteWall(plan, at, ref);

  if (surface === 'wall') {
    const wall = wallAt(to, wallRef);
    if (!wall) return null;
    const previousFace = from.surface === 'wall' && from.wallRef ? placementWallFaces(plan).find(face => face.ref === from.wallRef) : null;
    const previousWall = previousFace && previousFace.ref !== wall.face.ref ? previousFace : wall.face;
    const first = projectToWallFace(previousWall, from);
    append(point(first.foot, from.z || 0, 'wall', previousWall.ref));
    append(point(first.foot, level, 'wall', previousWall.ref));
    if (previousWall.ref !== wall.face.ref) {
      const corner = sharedRouteWallCorner(previousWall, wall.face);
      if (!corner) return null;
      append(point(corner.a, level, 'wall', previousWall.ref));
      append(point(corner.b, level, 'wall', wall.face.ref));
    }
    append(point(wall.projection.foot, level, 'wall', wall.face.ref));
    append(point(wall.projection.foot, to.z || 0, 'wall', wall.face.ref));
    append(point(to, to.z || 0, 'wall', wall.face.ref));
    return result;
  }

  if (Math.abs((from.z || 0) - level) > .001) {
    const wall = wallAt(from, from.wallRef);
    if (!wall) return null;
    append(point(wall.projection.foot, from.z || 0, 'wall', wall.face.ref));
    append(point(wall.projection.foot, level, 'wall', wall.face.ref));
  }
  // The crossing on the chosen horizontal plane follows the exact order of the user's points.
  if (Math.abs((to.z || 0) - level) > .001) {
    const wall = wallAt(to, to.wallRef);
    if (!wall) return null;
    append(point(wall.projection.foot, level, surface, wall.face.ref));
    append(point(wall.projection.foot, to.z || 0, 'wall', wall.face.ref));
  }
  append(point(to, to.z || 0, surface, to.wallRef));
  return result;
}

export function appendSurfaceWaypoint(points, at, surface, plan, wallHeight = null, wallRef = '') {
  if (!points?.length) return null;
  const level = routeSurfaceHeight(plan, surface, wallHeight);
  const wall = surface === 'wall' ? nearestRouteWall(plan, at, wallRef) : null;
  if (surface === 'wall' && !wall) return null;
  const targetAt = wall ? wall.projection.foot : at;
  const target = point({ ...targetAt, waypoint: true }, level, surface, wall?.face.ref);
  const leg = surfaceRouteLeg(points.at(-1), target, surface, plan, wallHeight, wall?.face.ref);
  return leg ? [...points, ...leg.slice(1)] : null;
}

export function replaceRouteSurface(points, index, surface, plan, wallHeight = null) {
  if (!Array.isArray(points) || index < 0 || index >= points.length - 1) return null;
  const leg = surfaceRouteLeg(points[index], points[index + 1], surface, plan, wallHeight);
  return leg ? [...points.slice(0, index), ...leg, ...points.slice(index + 2)] : null;
}

export function orthogonalizeSurfaceRoute(points, plan) {
  if (!Array.isArray(points) || points.length < 2) return points;
  const result = [points[0]];
  for (const next of points.slice(1)) {
    const previous = result.at(-1);
    const horizontal = Math.hypot(next.x - previous.x, next.y - previous.y);
    const vertical = Math.abs((next.z || 0) - (previous.z || 0));
    if (horizontal > .001 && vertical > .001) {
      const surface = ROUTE_SURFACES.some(entry => entry.id === next.surface) ? next.surface
        : ROUTE_SURFACES.some(entry => entry.id === previous.surface) ? previous.surface : 'ceiling';
      const leg = surfaceRouteLeg(previous, next, surface, plan, next.surface === 'wall' ? next.z : null, next.wallRef);
      if (leg) { result.push(...leg.slice(1)); continue; }
    }
    result.push(next);
  }
  return result;
}
