import { nearestRouteWall, routeSurfaceHeight } from './placement-route-surfaces.js';
import { placementWallFaces, projectToWallFace } from './placement-walls.js';

const round = value => Math.round(value * 100) / 100;
const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)) < .001;

/** Only a wall that the user actually points at is magnetic. */
export function manualRouteSnap(plan, at, _routes, surface, tolerance = .12, anchors = []) {
  const wall = nearestRouteWall(plan, at);
  if (wall?.projection.distance <= tolerance) {
    return { position: { x: round(wall.projection.foot.x), y: round(wall.projection.foot.y) }, surface: 'wall', wallRef: wall.face.ref, snappedTo: 'wall' };
  }
  if (surface === 'wall') return null;
  const xGuide = anchors.filter(anchor => Math.abs(anchor.x - at.x) <= tolerance)
    .sort((a, b) => Math.abs(a.x - at.x) - Math.abs(b.x - at.x))[0];
  const yGuide = anchors.filter(anchor => Math.abs(anchor.y - at.y) <= tolerance)
    .sort((a, b) => Math.abs(a.y - at.y) - Math.abs(b.y - at.y))[0];
  const position = { x: round(xGuide?.x ?? at.x), y: round(yGuide?.y ?? at.y) };
  const guides = [xGuide && { axis: 'x', from: xGuide }, yGuide && { axis: 'y', from: yGuide }].filter(Boolean);
  return { position, surface, wallRef: '', snappedTo: guides.length ? 'alignment' : '', guides };
}

/** Keep a manually drawn leg on one axis, or normal to the wall the user clicked. */
export function constrainManualRouteChoice(points, choice, plan) {
  if (!points?.length || !choice?.position) return choice;
  const from = points.at(-1);
  const face = (ref) => ref ? placementWallFaces(plan).find(entry => entry.ref === ref) : null;
  const fromWall = face(from.wallRef);
  let position = choice.position;
  if (choice.surface === 'wall' && choice.wallRef) {
    const targetWall = face(choice.wallRef);
    if (targetWall && from.wallRef !== choice.wallRef) position = projectToWallFace(targetWall, from).foot;
  } else if (fromWall && projectToWallFace(fromWall, from).distance <= .35) {
    const dx = fromWall.b.x - fromWall.a.x, dy = fromWall.b.y - fromWall.a.y;
    const length = Math.hypot(dx, dy);
    const normal = { x: -dy / length, y: dx / length };
    const distance = (position.x - from.x) * normal.x + (position.y - from.y) * normal.y;
    position = { x: from.x + normal.x * distance, y: from.y + normal.y * distance };
  } else {
    const dx = position.x - from.x, dy = position.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) position = { x: position.x, y: from.y };
    else position = { x: from.x, y: position.y };
  }
  position = { x: round(position.x), y: round(position.y) };
  return { ...choice, position };
}

export function appendManualRouteWaypoint(points, choice, plan, wallHeight = null) {
  if (!points?.length || !choice?.position) return null;
  const constrained = constrainManualRouteChoice(points, choice, plan);
  const next = { x: constrained.position.x, y: constrained.position.y,
    z: routeSurfaceHeight(plan, constrained.surface, wallHeight), surface: constrained.surface,
    ...(constrained.wallRef ? { wallRef: constrained.wallRef } : {}), waypoint: true };
  return same(points.at(-1), next) ? points : [...points, next];
}

/** A target needs an explicit turn when it is off the current axis. */
export function finishManualRoute(points, target, _surface, plan) {
  if (!points?.length || !target) return null;
  const next = { ...target, x: round(target.x), y: round(target.y) };
  const from = points.at(-1);
  const dx = next.x - from.x, dy = next.y - from.y;
  if (Math.abs(dx) > .01 && Math.abs(dy) > .01) {
    const wall = target.wallRef && plan ? placementWallFaces(plan).find(face => face.ref === target.wallRef) : null;
    const tangent = wall && { x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y };
    const alongSameWall = wall && from.wallRef === wall.ref && projectToWallFace(wall, from).distance <= .35;
    const perpendicular = tangent && Math.abs(dx * tangent.x + dy * tangent.y) <= .01 * Math.hypot(dx, dy) * Math.hypot(tangent.x, tangent.y);
    if (!alongSameWall && !perpendicular) return null;
  }
  return same(points.at(-1), next) ? points : [...points, next];
}
