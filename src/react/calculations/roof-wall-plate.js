import { houseContourPoints } from '../planner/geometry.js';
import { productionLevels } from './production-levels.js';
import { platformRoofFrame } from '../planner/platform-roof-frame.js';
import { isAxisAlignedRectangleContour } from './roof-contour.js';

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
  return { wallTop, hasCeiling, topZ: wallTop + (hasCeiling ? Number(project.settings.sip.ceilingThickness || 0) : 0) };
}

export function structuralFlatRoofRise(project, calculation, bounds, point) {
  if (calculation.roof?.mainRoofShape !== 'flat' || calculation.roof?.flatSlopeMode !== 'structural') return 0;
  const acrossY = calculation.roof.ridgeAxis !== 'y';
  const start = acrossY ? bounds.y : bounds.x;
  const span = acrossY ? bounds.height : bounds.width;
  const position = (acrossY ? point[1] : point[0]) - start;
  const reverse = ['back', 'right'].includes(calculation.roof.flatSlopeDirection);
  return (reverse ? span - position : position) * Math.max(0, Number(project.settings.roof.flatSlopePercent) || 0) / 100;
}

export function roofBaseElevation(project, calculation, floorCount, spanMm, shape) {
  const settings = project.settings.roof;
  const design = project.settings.productionCutting?.roofDesign || {};
  const defaultBase = productionLevels(project, floorCount).roofBase;
  const profile = mauerlatProfile(settings);
  const ceiling = ceilingTopElevation(project, calculation, floorCount);
  const depth = settings.type === 'sip'
    ? Number(project.settings.sip.ceilingThickness) || 174
    : Number(String(calculation.roof?.rafterStructure?.section || '50x150').split(/[×xх]/)[1]) || 150;
  const pitch = Math.atan2(Number(settings.ridgeHeight || 0) * 1000, spanMm / 2 || 1);
  const aligned = ceiling.topZ + profile.heightMm + depth * Math.cos(pitch) / 2
    - (settings.type === 'sip' ? 0 : 25) - Math.tan(pitch) * profile.widthMm / 2;
  // A cold flat roof starts at the wall plate. For a structural slope the low
  // bearing edge is the datum; the raised edge still needs a designed support.
  const flatSlope = calculation.roof?.flatSlopeMode === 'structural'
    ? Number(settings.flatSlopePercent || 0) / 100 : 0;
  const flatAligned = ceiling.topZ + profile.heightMm + depth / 2 - 25
    - flatSlope * profile.widthMm / 2;
  // In the tapered-frame variant the lower chord bears on the plate; the
  // sloping upper chord starts one board depth above that lower chord.
  const taperedFrameBase = ceiling.topZ + profile.heightMm + depth * 1.5
    + Math.max(0, Number(settings.eaveOverhang) || 0) * 1000 * Math.max(0, Number(settings.flatSlopePercent) || 0) / 100;
  const fullyWarm = settings.type === 'sip' || settings.type === 'combo' && Number(settings.warmPercent) >= 100;
  return design.baseZ !== '' && design.baseZ != null && Number.isFinite(Number(design.baseZ))
    ? Number(design.baseZ)
    : fullyWarm ? ceiling.topZ + depth / 2
    : shape === 'flat' && settings.type === 'cold' && calculation.roof?.mauerlatLength > 0
      ? calculation.roof?.flatSlopeMode === 'tapered' ? taperedFrameBase : flatAligned
    : ceiling.hasCeiling && ['gable', 'hip'].includes(shape) && calculation.roof?.mauerlatLength > 0
      ? aligned : defaultBase;
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

export function mauerlatWallRuns(project, roof, axis = 'x', terraceRoofs = []) {
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
  const along = axis === 'x' ? 0 : 1, across = 1 - along;
  const endOverhang = roof.shape === 'gable' && roof.type !== 'sip' && !(roof.structureMode === 'manual' && roof.rafterSystem === 'truss') ? Math.max(0, Number(roof.gableOverhang) || 0) * 1000 : 0;
  const rectangle = isAxisAlignedRectangleContour(contour);
  const hasContinuation = terraceRoofs.some(({ result }) => result.mode === 'cold' && result.shape === 'continuation'
    && (axis === 'x' ? ['left', 'right'].includes(result.side) : ['top', 'bottom'].includes(result.side)));
  if (!rectangle || !runs.length || (!endOverhang && !hasContinuation)) return { runs, issue: '' };
  const edgeMin = Math.min(...contour.map(p => p[along]));
  const edgeMax = Math.max(...contour.map(p => p[along]));
  const extended = runs.map(([a, b]) => {
    if (Math.abs(a[across] - b[across]) > 1) return [a, b];
    const first = [...a], last = [...b];
    const continuation = terraceRoofs.filter(({ platform, result }) => {
      if (result.mode !== 'cold' || result.shape !== 'continuation' ||
        !(axis === 'x' ? ['left', 'right'].includes(result.side) : ['top', 'bottom'].includes(result.side))) return false;
      const crossStart = Number(axis === 'x' ? platform.y : platform.x) * 1000;
      const crossEnd = crossStart + Number(axis === 'x' ? platform.h : platform.w) * 1000;
      return first[across] >= crossStart - 1 && first[across] <= crossEnd + 1;
    });
    const extension = side => {
      const candidates = continuation.filter(({ result }) => result.side === side).map(({ platform }) => {
        const frame=platformRoofFrame(platform,project.plan.house,roof.rafterStep,roof);
        return frame ? (axis === 'x'
          ? side === 'left' ? frame.bounds.x1 : frame.bounds.x2
          : side === 'top' ? frame.bounds.y1 : frame.bounds.y2) * 1000 : NaN;
      }).filter(Number.isFinite);
      return side === 'left' || side === 'top'
        ? Math.min(endOverhang ? edgeMin - endOverhang : edgeMin + profile.widthMm / 2, ...candidates)
        : Math.max(endOverhang ? edgeMax + endOverhang : edgeMax - profile.widthMm / 2, ...candidates);
    };
    const low = extension(axis === 'x' ? 'left' : 'top');
    const high = extension(axis === 'x' ? 'right' : 'bottom');
    for (const point of [first, last]) {
      if (Math.abs(point[along] - edgeMin) < profile.widthMm) point[along] = low;
      else if (Math.abs(point[along] - edgeMax) < profile.widthMm) point[along] = high;
    }
    return [first, last];
  });
  return { runs: extended, issue: 'Торцевые консоли мауэрлата до крайних стропил выходят за стойки террасы; опирание, узлы и путь нагрузки требуют проверки конструктора.' };
}

export function mauerlatRunLength(runs) {
  return runs.reduce((sum, [a, b]) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]) / 1000, 0);
}
