import { roomPoints } from '../planner/geometry.js';
import { pointInPolygon } from './placement-geometry.js';
import { projectToRoomEdge, roomEdgePosition } from './placement-room.js';
import { placementWallFaces, projectToWallFace } from './placement-walls.js';

const round = value => Math.round(value * 100) / 100;
const lightKinds = new Set(['light', 'spotlight', 'pendant-light']);

export const schematicPosition = item => item?.kind === 'junction-box' && Number.isFinite(item.diagramX) && Number.isFinite(item.diagramY)
  ? { x: item.diagramX, y: item.diagramY } : { x: item.x, y: item.y };

export function junctionWallMount(plan, position, preferredRoom = null) {
  const rooms = (plan.rooms || []).filter(room => room.include !== false);
  const room = preferredRoom && pointInPolygon(position, roomPoints(preferredRoom)) ? preferredRoom
    : rooms.find(entry => pointInPolygon(position, roomPoints(entry)));
  let mount = null;
  if (room) {
    const projections = roomPoints(room).map((_, index) => ({ index, ...projectToRoomEdge(room, index, position) }));
    const nearest = projections.sort((a, b) => a.distance - b.distance)[0];
    if (nearest) mount = roomEdgePosition(room, nearest.index, nearest.station, .08);
  }
  if (!mount) {
    const nearest = placementWallFaces(plan).map(face => ({ face, projection: projectToWallFace(face, position) }))
      .sort((a, b) => a.projection.distance - b.projection.distance)[0];
    if (nearest) mount = nearest.projection.foot;
  }
  if (!mount) return null;
  const face = placementWallFaces(plan).map(entry => ({ entry, distance: projectToWallFace(entry, mount)?.distance ?? Infinity }))
    .sort((a, b) => a.distance - b.distance)[0];
  return { x: round(mount.x), y: round(mount.y), wallRef: face?.entry.ref || '' };
}

export function alignLightToNeighbors(position, item, items, rooms, tolerance = .12) {
  if (!lightKinds.has(item?.kind)) return { position, guides: [] };
  const room = rooms.find(entry => pointInPolygon(position, roomPoints(entry)));
  const neighbors = items.filter(entry => entry.id !== item.id && lightKinds.has(entry.kind)
    && entry.floor === item.floor && (!room || pointInPolygon(entry, roomPoints(room))));
  const result = { ...position }, guides = [];
  for (const axis of ['x', 'y']) {
    const nearest = neighbors.filter(entry => Math.abs(entry[axis] - position[axis]) <= tolerance)
      .sort((a, b) => Math.abs(a[axis] - position[axis]) - Math.abs(b[axis] - position[axis])
        || Math.hypot(a.x - position.x, a.y - position.y) - Math.hypot(b.x - position.x, b.y - position.y))[0];
    if (nearest) {
      result[axis] = nearest[axis];
      guides.push({ axis, from: { x: nearest.x, y: nearest.y }, to: { ...result } });
    }
  }
  return { position: result, guides };
}

// A display-only set of parallel lanes over the common panel approach. Saved
// routes and cable quantities keep their own original geometry.
export function panelRouteBundles(routes) {
  const rays = new Map();
  for (const route of routes) {
    if (!route.circuitId || !route.fromItemId || route.fromItemId !== route.panelItemId) continue;
    const points = route.points || [];
    const start = points[0];
    const next = points.find(point => start && Math.hypot(point.x - start.x, point.y - start.y) > .01);
    if (!start || !next) continue;
    const axis = Math.abs(next.x - start.x) > .01 && Math.abs(next.y - start.y) < .01 ? 'x'
      : Math.abs(next.y - start.y) > .01 && Math.abs(next.x - start.x) < .01 ? 'y' : null;
    if (!axis) continue;
    const direction = Math.sign(next[axis] - start[axis]);
    const key = `${route.panelItemId}:${round(start.x)}:${round(start.y)}:${axis}:${direction}`;
    if (!rays.has(key)) rays.set(key, { start, axis, direction, routes: [] });
    rays.get(key).routes.push({ circuitId: route.circuitId, length: Math.abs(next[axis] - start[axis]) });
  }
  return [...rays.values()].map(ray => {
    const circuits = [...new Set(ray.routes.map(route => route.circuitId))].sort();
    const length = Math.min(...ray.routes.map(route => route.length));
    return { start: ray.start, end: { ...ray.start, [ray.axis]: ray.start[ray.axis] + ray.direction * length }, axis: ray.axis, circuits };
  }).filter(bundle => bundle.circuits.length > 1 && Math.abs(bundle.end[bundle.axis] - bundle.start[bundle.axis]) >= .15);
}

/** Display-only parallel lanes for every common straight run, including junction feeds. */
export function sharedElectricalRouteLanes(routes) {
  const groups = new Map();
  for (const route of routes) {
    for (let index = 0; index < (route.points?.length || 0) - 1; index += 1) {
      const first = route.points[index], last = route.points[index + 1];
      if (Math.abs((first.z || 0) - (last.z || 0)) > .001) continue;
      const axis = Math.abs(first.y - last.y) < .001 ? 'x' : Math.abs(first.x - last.x) < .001 ? 'y' : null;
      if (!axis || Math.abs(first[axis] - last[axis]) < .02) continue;
      const fixed = axis === 'x' ? round(first.y) : round(first.x);
      const surface = [last.surface, first.surface, route.surface].find(value => value === 'ceiling' || value === 'floor' || value === 'wall') || 'legacy';
      const key = `${axis}:${fixed}`;
      if (!groups.has(key)) groups.set(key, { axis, fixed, segments: [] });
      groups.get(key).segments.push({ start: Math.min(first[axis], last[axis]), end: Math.max(first[axis], last[axis]), routeId: route.id, circuitId: route.circuitId, surface, auto: route.auto });
    }
  }
  const lanes = [];
  for (const { axis, fixed, segments } of groups.values()) {
    const cuts = [...new Set(segments.flatMap(segment => [segment.start, segment.end]))].sort((a, b) => a - b);
    for (let index = 0; index < cuts.length - 1; index += 1) {
      const start = cuts[index], end = cuts[index + 1];
      if (end - start < .02) continue;
      const middle = (start + end) / 2;
      const active = [...new Map(segments.filter(segment => segment.start <= middle + .001 && segment.end >= middle - .001).map(segment => [segment.routeId, segment])).values()]
        .sort((a, b) => a.circuitId.localeCompare(b.circuitId) || a.routeId.localeCompare(b.routeId));
      if (active.length < 2) continue;
      lanes.push({ axis, start: axis === 'x' ? { x: start, y: fixed } : { x: fixed, y: start }, end: axis === 'x' ? { x: end, y: fixed } : { x: fixed, y: end }, routes: active });
    }
  }
  return lanes;
}
