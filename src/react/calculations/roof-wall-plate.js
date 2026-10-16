import { houseContourPoints } from '../planner/geometry.js';
import { productionLevels } from './production-levels.js';

export const MAUERLAT_PROFILES = {
  '100x150': { profile: '100×150', heightMm: 100, widthMm: 150, catalogName: 'Брус ест.влажн. сосна 100×150 мм' },
  '50x150': { profile: '50×150', heightMm: 50, widthMm: 150, catalogName: 'Доска ест. влажн. сосна 50х150мм' },
};

export function mauerlatProfile(roof = {}) {
  return MAUERLAT_PROFILES[roof.mauerlatProfile] || MAUERLAT_PROFILES['100x150'];
}

export function ceilingTopElevation(project, calculation, floorCount) {
  const wallTop = productionLevels(project, floorCount).roofBase;
  const hasCeiling = project.services.sipCeiling && Number(calculation.metrics?.ceilingArea) > 0;
  return { wallTop, hasCeiling, topZ: wallTop + (hasCeiling ? Number(project.settings.sip.ceilingThickness || 0) / 2 : 0) };
}

const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export function insetRoofContour(points, insetMm) {
  if (points.length < 3) return null;
  const area = points.reduce((sum, a, i) => sum + cross(a, points[(i + 1) % points.length]), 0);
  if (Math.abs(area) < 1) return null;
  const sign = Math.sign(area);
  const edges = points.map((a, i) => {
    const b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 1) return null;
    const offset = [-sign * dy / length * insetMm, sign * dx / length * insetMm];
    return { p: [a[0] + offset[0], a[1] + offset[1]], d: [dx, dy] };
  });
  if (edges.some((edge) => !edge)) return null;
  const result = points.map((point, i) => {
    const previous = edges[(i + edges.length - 1) % edges.length], next = edges[i];
    const denominator = cross(previous.d, next.d);
    if (Math.abs(denominator) < 1e-6) return next.p;
    const distance = [next.p[0] - previous.p[0], next.p[1] - previous.p[1]];
    const t = cross(distance, next.d) / denominator;
    return [previous.p[0] + previous.d[0] * t, previous.p[1] + previous.d[1] * t];
  });
  if (result.some((p, i) => !p.every(Number.isFinite) || Math.hypot(p[0] - points[i][0], p[1] - points[i][1]) > insetMm * 4)) return null;
  return result;
}

export function mauerlatWallRuns(project, roof, axis = 'x') {
  const plan = project.upperFloors?.at(-1) || project.plan;
  const contour = houseContourPoints(plan).map((point) => [point.x * 1000, point.y * 1000]);
  const profile = mauerlatProfile(roof);
  const inset = insetRoofContour(contour, profile.widthMm / 2);
  if (!inset) return { runs: [], issue: 'Контур потолка не допускает однозначную раскладку мауэрлата шириной 150 мм.' };
  const all = inset.map((a, i) => [a, inset[(i + 1) % inset.length]]);
  const layout = roof.mauerlatLayout || 'perimeter';
  const runs = layout === 'none' ? [] : layout === 'supports' && roof.shape !== 'hip'
    ? all.filter(([a, b]) => Math.abs(a[axis === 'x' ? 1 : 0] - b[axis === 'x' ? 1 : 0]) < 1)
    : all;
  return { runs, issue: '' };
}

export function mauerlatRunLength(runs) {
  return runs.reduce((sum, [a, b]) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]) / 1000, 0);
}
