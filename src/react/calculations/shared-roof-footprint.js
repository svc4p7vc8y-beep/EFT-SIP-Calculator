import clipping from 'polygon-clipping';
import { houseContourPoints } from '../planner/geometry.js';

export const usesSharedRoof = platform => platform.include !== false && platform.roof?.mode === 'shared';
const ring = points => [[...points, points[0]]];
const toRing = points => ring(points.map(({ x, y }) => [Math.round(x * 1000), Math.round(y * 1000)]));

export function sharedRoofFootprint(plan, { enabled = true } = {}) {
  const walls = houseContourPoints(plan);
  const selected = (plan.platforms || []).filter(usesSharedRoof);
  if (!selected.length || !enabled) return { points: walls, included: [], excluded: selected.map(p => p.id) };
  let outline = toRing(walls);
  const remaining = selected.slice();
  const included = [];
  // A terrace may join another terrace that has already joined the house.
  for (let progress = true; progress && remaining.length;) {
    progress = false;
    for (let i = 0; i < remaining.length;) {
      const { id, x, y, w, h } = remaining[i];
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) { i++; continue; }
      const deck = toRing([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]);
      let joined;
      try { joined = clipping.union(outline, deck); } catch { i++; continue; }
      if (joined.length !== 1 || joined[0].length !== 1) { i++; continue; }
      outline = joined[0];
      included.push(id);
      remaining.splice(i, 1);
      progress = true;
    }
  }
  const points = included.length ? outline[0].slice(0, -1).map(([x, y]) => ({ x: x / 1000, y: y / 1000 })) : walls;
  return { points, included, excluded: remaining.map(p => p.id) };
}
