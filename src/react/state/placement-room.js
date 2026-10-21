import { boundsOf, roomPoints } from '../planner/geometry.js';
import { pointInPolygon } from './placement-geometry.js';

const round = value => Math.round(value * 100) / 100;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

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
  const box = boundsOf(vertices);
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const choices = [
    ['top', Math.abs(middle.y - box.y)],
    ['right', Math.abs(middle.x - box.x - box.w)],
    ['bottom', Math.abs(middle.y - box.y - box.h)],
    ['left', Math.abs(middle.x - box.x)],
  ];
  const side = choices.sort((first, second) => first[1] - second[1])[0][0];
  const reverse = (side === 'top' || side === 'bottom') ? b.x < a.x : b.y < a.y;
  return { side, length, reverse };
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
