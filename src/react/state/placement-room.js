import { boundsOf, roomPoints } from '../planner/geometry.js';
import { pointInPolygon } from './placement-geometry.js';

const round = value => Math.round(value * 100) / 100;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function roomDimensionEnd(start, end, mode = 'free') {
  if (mode === 'horizontal') return { x: round(end.x), y: round(start.y) };
  if (mode === 'vertical') return { x: round(start.x), y: round(end.y) };
  return { x: round(end.x), y: round(end.y) };
}

export function roomEdgePosition(room, edgeIndex, station, inset = .08) {
  const vertices = roomPoints(room);
  const a = vertices[edgeIndex], b = vertices[(edgeIndex + 1) % vertices.length];
  if (!a || !b) return null;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!length) return null;
  const t = clamp(station / length, 0, 1);
  const middle = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  const sign = pointInPolygon({ x: middle.x + normal.x * .05, y: middle.y + normal.y * .05 }, vertices) ? 1 : -1;
  return { x: round(middle.x + normal.x * inset * sign), y: round(middle.y + normal.y * inset * sign) };
}

export function projectToRoomEdge(room, edgeIndex, position) {
  const vertices = roomPoints(room);
  const a = vertices[edgeIndex], b = vertices[(edgeIndex + 1) % vertices.length];
  if (!a || !b) return null;
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (!length) return null;
  const station = clamp(((position.x - a.x) * dx + (position.y - a.y) * dy) / length, 0, length);
  const foot = { x: a.x + dx * station / length, y: a.y + dy * station / length };
  return { station, length, distance: Math.hypot(position.x - foot.x, position.y - foot.y) };
}

export function roomEdgeDisplay(room, edgeIndex) {
  const vertices = roomPoints(room);
  const a = vertices[edgeIndex], b = vertices[(edgeIndex + 1) % vertices.length];
  if (!a || !b) return null;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!length) return null;
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  const insideOnLeft = pointInPolygon({ x: middle.x + normal.x * .05, y: middle.y + normal.y * .05 }, vertices);
  const outward = insideOnLeft ? { x: -normal.x, y: -normal.y } : normal;
  const side = Math.abs(outward.x) > Math.abs(outward.y)
    ? outward.x > 0 ? 'right' : 'left'
    : outward.y > 0 ? 'bottom' : 'top';
  const reverse = (side === 'top' || side === 'bottom') ? b.x < a.x : b.y < a.y;
  return { side, length, reverse, outward };
}

const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .01
  && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .01;

export function roomUnfoldLayout(room, wallHeight) {
  const vertices = roomPoints(room);
  const box = boundsOf(vertices);
  const span = Math.max(.5, Number(wallHeight) || 2.5);
  const floor = { x: span, y: span, width: box.w, height: box.h };
  const placed = [];
  const detached = [];
  for (let index = 0; index < vertices.length; index++) {
    const a = vertices[index], b = vertices[(index + 1) % vertices.length];
    const display = roomEdgeDisplay(room, index);
    if (!display || display.length < .01) continue;
    const { side, length } = display;
    const horizontal = side === 'top' || side === 'bottom';
    const edgeX = floor.x + Math.min(a.x, b.x) - box.x;
    const edgeY = floor.y + Math.min(a.y, b.y) - box.y;
    const initial = {
      index, side, length, outward: display.outward,
      x: edgeX + (side === 'left' ? -span : 0),
      y: edgeY + (side === 'top' ? -span : 0),
      width: horizontal ? length : span,
      height: horizontal ? span : length,
      hinge: { x: floor.x + (a.x + b.x) / 2 - box.x, y: floor.y + (a.y + b.y) / 2 - box.y },
    };
    if (Math.abs(a.x - b.x) > .01 && Math.abs(a.y - b.y) > .01 || placed.some(other => overlap(initial, other))) detached.push(initial);
    else placed.push(initial);
  }
  let width = Math.max(floor.x + floor.width + span, ...placed.map(edge => edge.x + edge.width));
  let height = Math.max(floor.y + floor.height + span, ...placed.map(edge => edge.y + edge.height));
  const rowWidth = width;
  let cursorX = 0, cursorY = height + .4, rowHeight = 0;
  const edges = [...placed, ...detached.map(edge => {
    if (cursorX && cursorX + edge.width > rowWidth) { cursorX = 0; cursorY += rowHeight + .3; rowHeight = 0; }
    const shifted = { ...edge, x: cursorX, y: cursorY, detached: true };
    cursorX += edge.width + .3;
    rowHeight = Math.max(rowHeight, edge.height);
    width = Math.max(width, cursorX);
    return shifted;
  })].sort((a, b) => a.index - b.index);
  if (detached.length) height = cursorY + rowHeight;
  return { box, floor, edges, width, height };
}

const floorKinds = new Set(['light', 'spotlight', 'pendant-light', 'floor-heating-loop', 'sewer-floor-drain', 'floor-drain', 'heat-source', 'air-unit', 'water-heater-point']);
const wallLayers = new Set(['electric', 'plumbing', 'heating', 'sewer', 'ventilation']);

export function roomItemPlane(room, item) {
  const vertices = roomPoints(room);
  const nearest = vertices.map((_, index) => ({ index, ...projectToRoomEdge(room, index, item) }))
    .filter(entry => Number.isFinite(entry.distance))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest) return { plane: 'floor', edgeIndex: -1 };
  const explicit = item.displayPlane;
  const wallEligible = wallLayers.has(item.layer) && !floorKinds.has(item.kind) || item.kind === 'wall-cabinet';
  const onWall = explicit === 'wall' ? nearest.distance <= .8
    : explicit === 'floor' ? false
      : wallEligible && nearest.distance <= .35 && (Boolean(item.wallRef) || nearest.distance <= .2);
  return { plane: onWall ? 'wall' : 'floor', edgeIndex: onWall ? nearest.index : -1, distance: nearest.distance };
}

export function roomWallDisplayPoint(room, edgeIndex, position, elevation, wallHeight) {
  const edge = roomEdgeDisplay(room, edgeIndex);
  const projection = projectToRoomEdge(room, edgeIndex, position);
  if (!edge || !projection) return null;
  const station = edge.reverse ? edge.length - projection.station : projection.station;
  const z = clamp(Number(elevation) || 0, 0, wallHeight);
  if (edge.side === 'right') return { x: z, y: station, distance: projection.distance };
  if (edge.side === 'bottom') return { x: station, y: z, distance: projection.distance };
  if (edge.side === 'left') return { x: wallHeight - z, y: station, distance: projection.distance };
  return { x: station, y: wallHeight - z, distance: projection.distance };
}

export function roomWallPlanPoint(room, edgeIndex, x, y, wallHeight) {
  const edge = roomEdgeDisplay(room, edgeIndex);
  if (!edge) return null;
  const visualStation = edge.side === 'left' || edge.side === 'right' ? y : x;
  const station = edge.reverse ? edge.length - visualStation : visualStation;
  const elevation = edge.side === 'right' ? x : edge.side === 'bottom' ? y : edge.side === 'left' ? wallHeight - x : wallHeight - y;
  return { position: roomEdgePosition(room, edgeIndex, station), elevation: round(clamp(elevation, 0, wallHeight)) };
}

export function roomOpeningOnEdge(room, edgeIndex, opening, wallHeight) {
  if (!opening || opening.include === false || !['window', 'door'].includes(opening.type)) return null;
  const width = Number(opening.width), openingHeight = Number(opening.height || 1.2);
  if (!(width > 0) || !(openingHeight > 0)) return null;
  const vertices = roomPoints(room);
  const a = vertices[edgeIndex], b = vertices[(edgeIndex + 1) % vertices.length];
  if (!a || !b) return null;
  const horizontal = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
  if ((opening.orientation === 'h') !== horizontal) return null;
  const center = { x: Number(opening.x), y: Number(opening.y) };
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return null;
  const projected = projectToRoomEdge(room, edgeIndex, center);
  if (!projected || projected.distance > .28) return null;
  const startStation = Math.max(0, projected.station - width / 2);
  const endStation = Math.min(projected.length, projected.station + width / 2);
  if (endStation - startStation < .01) return null;
  const direction = { x: (b.x - a.x) / projected.length, y: (b.y - a.y) / projected.length };
  const start = { x: a.x + direction.x * startStation, y: a.y + direction.y * startStation };
  const end = { x: a.x + direction.x * endStation, y: a.y + direction.y * endStation };
  const sill = opening.sillHeight == null
    ? opening.type === 'door' ? 0 : Math.max(0, (wallHeight - openingHeight) / 2)
    : clamp(Number(opening.sillHeight) || 0, 0, wallHeight);
  const top = clamp(sill + openingHeight, 0, wallHeight);
  const first = roomWallDisplayPoint(room, edgeIndex, start, sill, wallHeight);
  const second = roomWallDisplayPoint(room, edgeIndex, end, top, wallHeight);
  if (!first || !second) return null;
  return {
    x: Math.min(first.x, second.x), y: Math.min(first.y, second.y),
    width: Math.abs(first.x - second.x), height: Math.abs(first.y - second.y),
    sill, clippedWidth: endStation - startStation,
  };
}
