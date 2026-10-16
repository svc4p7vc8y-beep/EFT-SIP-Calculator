import { mauerlatProfile, ceilingTopElevation, roofBaseElevation } from './roof-wall-plate.js';
import { houseContourPoints } from '../planner/geometry.js';

export const LAYERED_FRAME_SOURCE = 'layered-frame';

export function layeredFrameFractions(spanMm, roof = {}) {
  const count = roof.layeredFrameMode === 'manual'
    ? Math.min(3, Math.max(1, Math.round(Number(roof.layeredFrameCount) || 1)))
    : spanMm <= 6000 ? 1 : spanMm <= 10000 ? 2 : 3;
  const fallback = Array.from({ length: count }, (_, i) => (i + 1) / (count + 1));
  if (roof.layeredFrameMode !== 'manual') return fallback;
  const saved = roof.layeredFramePositions;
  if (!Array.isArray(saved) || saved.length !== count) return fallback;
  const fractions = saved.map(value => Number(value) / 100);
  return fractions.every((value, i) => Number.isFinite(value) && value >= .05 && value <= .95 && (i === 0 || value - fractions[i - 1] >= .05)) ? fractions : fallback;
}

export function layeredFrameEnabled(project, roof) {
  const settings = project.settings.roof;
  const saved = project.settings.productionCutting?.roofSupports || [];
  const contour = houseContourPoints(project.upperFloors?.at(-1) || project.plan);
  const baseContour = houseContourPoints(project.plan);
  const sameFootprint = contour.length === baseContour.length && contour.every((point, i) =>
    point.x === baseContour[i].x && point.y === baseContour[i].y);
  const rectangular = contour.length === 4 && contour.every((point, i) => {
    const next = contour[(i + 1) % contour.length];
    return point.x === next.x || point.y === next.y;
  });
  return project.services.roof && settings.type === 'cold' && settings.layeredFrameEnabled !== false
    && rectangular && sameFootprint && roof.mainRoofShape === 'gable' && roof.rafterStructure?.system === 'layered'
    && roof.coldSlopeArea > 0 && roof.mauerlatLength > 0
    && !project.settings.productionCutting?.roofDesign?.enabled
    && !saved.some(item => item.type === 'purlin' && !item.referenceOnly);
}

// A geometric and purchasing proposal. It does not verify walls, joints or member capacity.
export function layeredFrameLayout(project, calculation, bounds, axis, stockLengthMm = 6000) {
  const roof = calculation.roof, settings = project.settings.roof;
  if (!layeredFrameEnabled(project, roof)) return { items: [], issues: [], fractions: [] };
  const span = axis === 'x' ? bounds.height : bounds.width;
  const length = axis === 'x' ? bounds.width : bounds.height;
  if (!(span > 0 && length > 0)) return { items: [], issues: ['Прогоны: неверный габарит здания.'], fractions: [] };
  const fractions = layeredFrameFractions(span, settings);
  const floorCount = calculation.metrics?.floorPlans?.length || 1;
  const ceiling = ceilingTopElevation(project, calculation, floorCount);
  const plate = mauerlatProfile(settings);
  const roofBase = roofBaseElevation(project, calculation, floorCount, span, 'gable');
  const rafterDepth = Number(String(roof.rafterStructure.section).split(/[×xх]/)[1]) || 150;
  const rise = Number(settings.ridgeHeight || 0) * 1000;
  const slope = rise / (span / 2);
  const cos = 1 / Math.hypot(1, slope);
  const reserve = 1.1;
  const stock = Math.max(1000, Number(stockLengthMm) || 6000);
  const allowance = Math.max(0, Number(project.settings.productionCutting?.endAllowanceMm) || 0);
  const usable = stock - 2 * allowance;
  if (usable < 1000) return { items: [], issues: ['Прогоны: заготовка слишком короткая с учётом припусков.'], fractions: [] };
  const spacing = Math.min(usable, Math.max(1000, Number(settings.layeredFramePostSpacingMm) || usable));
  const items = [], issues = [];
  const xy = (along, across) => axis === 'x' ? [bounds.x + along, bounds.y + across] : [bounds.x + across, bounds.y + along];
  for (const [index, fraction] of fractions.entries()) {
    const group = index + 1, across = span * fraction;
    const roofZ = roofBase + rise * (1 - Math.abs(2 * fraction - 1));
    const purlinZ = roofZ - rafterDepth / (2 * cos) - 75 * Math.abs(slope) - 25;
    const sleeperZ = ceiling.topZ + plate.heightMm / 2;
    const postBottom = ceiling.topZ + plate.heightMm;
    const postTop = purlinZ - 25;
    if (postTop - postBottom < 100) {
      issues.push(`Прогон ${group}: недостаточно высоты для стойки между лежнем и стропилом.`);
      continue;
    }
    if (postTop - postBottom + 2 * allowance > stock) {
      issues.push(`Прогон ${group}: стойка длиннее выбранной заготовки ${stock} мм с припусками; нужна другая заготовка или проектный стык.`);
      continue;
    }
    const bays = Math.ceil(length / spacing);
    const stations = Array.from({ length: bays + 1 }, (_, i) => length * i / bays);
    const add = (role, ordinal, a, b, profile, heightMm, name) => {
      const id = `КР-НФ${group}-${role}-${ordinal}`;
      items.push({ id, role, group, frameGroup: `layered-frame-${group}`, name, profile, heightMm, flat: role !== 'post',
        a, b, length: Math.ceil(Math.hypot(...a.map((n, j) => b[j] - n))),
        structuralStatus: 'unverified', autoLayout: LAYERED_FRAME_SOURCE });
    };
    for (let i = 0; i < bays; i++) {
      add('purlin', i + 1, [...xy(stations[i], across), purlinZ], [...xy(stations[i + 1], across), purlinZ], '50×150', 50, `Прогон ${group} · участок ${i + 1}`);
      add('sleeper', i + 1, [...xy(stations[i], across), sleeperZ], [...xy(stations[i + 1], across), sleeperZ], plate.profile, plate.heightMm, `Лежень ${group} · участок ${i + 1}`);
    }
    for (const [i, along] of stations.entries()) add('post', i + 1, [...xy(along, across), postBottom], [...xy(along, across), postTop], '50×150', 150, `Стойка ${group}.${i + 1}`);
  }
  if (items.length) issues.push('Наслонные опорные рамы: положение прогонов принято по ширине здания; несущие стены, опирание лежней, стойки, узлы и сечения не проверены расчётом.');
  return { items, issues, fractions, reserve, stockLengthMm: stock, endAllowanceMm: allowance };
}

export function layeredFramePurchases(layout) {
  const groups = new Map();
  for (const item of layout.items) {
    const key = `${item.role}:${item.profile}`;
    if (!groups.has(key)) groups.set(key, { role: item.role, profile: item.profile, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()].map(group => {
    const stock = layout.stockLengthMm;
    const blanks = [];
    for (const item of [...group.items].sort((a, b) => b.length - a.length)) {
      const cutLength = item.length + 2 * (layout.endAllowanceMm || 0);
      let index = blanks.findIndex(remaining => remaining >= cutLength);
      if (index < 0) { index = blanks.length; blanks.push(stock); }
      blanks[index] -= cutLength;
    }
    const count = Math.ceil(blanks.length * (layout.reserve || 1.1));
    const [width, height] = group.profile.split('×').map(Number);
    return { ...group, count, volume: count * stock * width * height / 1e9,
      requiredLengthMm: group.items.reduce((sum, item) => sum + item.length, 0) };
  });
}
