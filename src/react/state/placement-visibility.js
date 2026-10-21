import { roomPoints } from '../planner/geometry.js';
import { pointInPolygon } from './placement-geometry.js';

const edgeDistance = (point, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
};

export function roomNameForPlacement(item, rooms) {
  const point = { x: Number(item.x), y: Number(item.y) };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return 'Вне комнат';
  const polygons = rooms.map(room => ({ room, points: roomPoints(room) })).filter(entry => entry.points.length > 1);
  const containing = polygons.find(({ points }) => pointInPolygon(point, points));
  if (containing) return containing.room.name || 'Комната';
  const nearest = polygons.map(({ room, points }) => ({ room, distance: points.reduce((best, a, index) => Math.min(best, edgeDistance(point, a, points[(index + 1) % points.length])), Infinity) })).sort((a, b) => a.distance - b.distance)[0];
  return nearest?.distance <= .35 ? nearest.room.name || 'Комната' : 'Вне комнат';
}

export function electricalPlacementClusters(items, rooms) {
  const electrical = items.filter(item => item.layer === 'electric');
  const roomNames = new Map(electrical.map(item => [item.id, roomNameForPlacement(item, rooms)]));
  const visited = new Set();
  const clusters = [];
  for (const start of electrical) {
    if (visited.has(start.id)) continue;
    visited.add(start.id);
    const group = [start];
    for (let index = 0; index < group.length; index++) {
      const current = group[index];
      for (const candidate of electrical) {
        if (visited.has(candidate.id)) continue;
        if (Math.abs(Number(current.x) - Number(candidate.x)) > .22 || Math.abs(Number(current.y) - Number(candidate.y)) > .65) continue;
        if (current.wallRef && candidate.wallRef && current.wallRef !== candidate.wallRef) continue;
        if (roomNames.get(current.id) !== roomNames.get(candidate.id)) continue;
        visited.add(candidate.id);
        group.push(candidate);
      }
    }
    if (group.length > 1) clusters.push({ id: group.map(item => item.id).sort().join('|'), items: group.sort((a, b) => a.y - b.y), x: group.reduce((sum, item) => sum + Number(item.x), 0) / group.length, y: group.reduce((sum, item) => sum + Number(item.y), 0) / group.length });
  }
  return clusters;
}
