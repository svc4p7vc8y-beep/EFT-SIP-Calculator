import { roomPoints } from '../planner/geometry.js';
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
