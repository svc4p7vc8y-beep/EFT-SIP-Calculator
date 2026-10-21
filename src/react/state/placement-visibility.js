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
        // Only points on the same vertical installation axis share a row.
        if (Math.hypot(Number(start.x) - Number(candidate.x), Number(start.y) - Number(candidate.y)) > .06) continue;
        if (current.wallRef && candidate.wallRef && current.wallRef !== candidate.wallRef) continue;
        if (roomNames.get(current.id) !== roomNames.get(candidate.id)) continue;
        visited.add(candidate.id);
        group.push(candidate);
      }
    }
    if (group.length > 1) {
      const x = group.reduce((sum, item) => sum + Number(item.x), 0) / group.length;
      const y = group.reduce((sum, item) => sum + Number(item.y), 0) / group.length;
      const room = rooms.find(entry => pointInPolygon({ x, y }, roomPoints(entry))) || rooms.find(entry => roomNameForPlacement({ x, y }, [entry]) !== 'Вне комнат');
      const vertices = room ? roomPoints(room) : [];
      const edges = vertices.map((a, index) => {
        const b = vertices[(index + 1) % vertices.length];
        return { index, a, b, distance: edgeDistance({ x, y }, a, b) };
      });
      const edge = edges.sort((a, b) => a.distance - b.distance)[0];
      let normal = { x: 0, y: 1 };
      if (edge) {
        const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y, length = Math.hypot(dx, dy);
        const candidate = { x: -dy / length, y: dx / length };
        const inward = pointInPolygon({ x: x + candidate.x * .15, y: y + candidate.y * .15 }, vertices);
        normal = inward ? candidate : { x: -candidate.x, y: -candidate.y };
      }
      clusters.push({ id: group.map(item => item.id).sort().join('|'), items: group.sort((a, b) => Number(a.height || 0) - Number(b.height || 0)), x, y, normal, edgeIndex: edge?.index ?? -1 });
    }
  }
  return clusters;
}

const circuitColors = ['#b84b36', '#326fb4', '#16806c', '#9860a9', '#aa6a16', '#527b2d', '#b14d85', '#417f93'];

export function electricalGroupColor(circuitId, circuits = []) {
  if (!circuitId) return '#64748b';
  const index = circuits.findIndex(circuit => circuit.id === circuitId);
  if (index >= 0) return index < circuitColors.length ? circuitColors[index] : `hsl(${Math.round(index * 137.508) % 360} 62% 40%)`;
  const hash = [...String(circuitId)].reduce((value, char) => value * 31 + char.charCodeAt(0), 0);
  return circuitColors[Math.abs(hash) % circuitColors.length];
}
