import { houseContourPoints } from '../planner/geometry.js';

const round = (value, digits = 3) => Number((Number(value) || 0).toFixed(digits));
const positive = (value, fallback, min = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= min ? number : fallback;
};

export const DEFAULT_FOUNDATION_SLAB = Object.freeze({
  extensionMm: 150,
  thicknessMm: 200,
  concreteReservePercent: 5,
  sandThicknessMm: 150,
  stoneThicknessMm: 150,
  sandPurchaseFactor: 1.15,
  stonePurchaseFactor: 1.15,
  geotextileReservePercent: 5,
  filmReservePercent: 5,
  xpsEnabled: false,
  xpsThicknessMm: 100,
  blind: Object.freeze({ enabled: false, widthMm: 1000, thicknessMm: 100 }),
  structuralApproval: 'not_confirmed',
});

export function normalizeFoundationSlab(raw = {}) {
  return {
    ...DEFAULT_FOUNDATION_SLAB,
    ...raw,
    extensionMm: positive(raw.extensionMm, 150),
    thicknessMm: positive(raw.thicknessMm, 200, 1),
    concreteReservePercent: positive(raw.concreteReservePercent, 5),
    sandThicknessMm: positive(raw.sandThicknessMm, 150),
    stoneThicknessMm: positive(raw.stoneThicknessMm, 150),
    sandPurchaseFactor: positive(raw.sandPurchaseFactor, 1.15, 1),
    stonePurchaseFactor: positive(raw.stonePurchaseFactor, 1.15, 1),
    geotextileReservePercent: positive(raw.geotextileReservePercent, 5),
    filmReservePercent: positive(raw.filmReservePercent, 5),
    xpsEnabled: raw.xpsEnabled === true,
    xpsThicknessMm: positive(raw.xpsThicknessMm, 100),
    blind: {
      ...DEFAULT_FOUNDATION_SLAB.blind,
      ...(raw.blind || {}),
      enabled: raw.blind?.enabled === true,
      widthMm: positive(raw.blind?.widthMm, 1000),
      thicknessMm: positive(raw.blind?.thicknessMm, 100, 1),
    },
    structuralApproval: raw.structuralApproval === 'confirmed' ? 'confirmed' : 'not_confirmed',
  };
}

export function polygonMetrics(points = []) {
  if (!Array.isArray(points) || points.length < 3) throw new Error('Контур плиты должен содержать не менее трёх точек.');
  let signedArea = 0;
  let perimeter = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    if (![point?.x, point?.y, next?.x, next?.y].every(Number.isFinite)) throw new Error('В контуре плиты есть неверные координаты.');
    signedArea += point.x * next.y - next.x * point.y;
    perimeter += Math.hypot(next.x - point.x, next.y - point.y);
  });
  const area = Math.abs(signedArea) / 2;
  if (!(area > 0.000001)) throw new Error('Контур плиты имеет нулевую площадь.');
  return { area, perimeter, orientation: Math.sign(signedArea) || 1 };
}

const cross = (a, b) => a.x * b.y - a.y * b.x;

function lineIntersection(first, second) {
  const denominator = cross(first.direction, second.direction);
  if (Math.abs(denominator) < 1e-10) return null;
  const delta = { x: second.point.x - first.point.x, y: second.point.y - first.point.y };
  const ratio = cross(delta, second.direction) / denominator;
  return {
    x: first.point.x + first.direction.x * ratio,
    y: first.point.y + first.direction.y * ratio,
  };
}

function segmentsIntersect(a, b, c, d) {
  const orient = (p, q, r) => cross({ x: q.x - p.x, y: q.y - p.y }, { x: r.x - p.x, y: r.y - p.y });
  const first = orient(a, b, c);
  const second = orient(a, b, d);
  const third = orient(c, d, a);
  const fourth = orient(c, d, b);
  return first * second < -1e-9 && third * fourth < -1e-9;
}

function assertSimplePolygon(points) {
  for (let left = 0; left < points.length; left += 1) {
    const leftNext = (left + 1) % points.length;
    for (let right = left + 1; right < points.length; right += 1) {
      const rightNext = (right + 1) % points.length;
      if (left === right || leftNext === right || rightNext === left) continue;
      if (segmentsIntersect(points[left], points[leftNext], points[right], points[rightNext])) {
        throw new Error('После выпуска контур плиты самопересекается. Уменьшите выпуск или отредактируйте контур.');
      }
    }
  }
}

// Miter offset for a verified simple polygon. It follows every saved contour edge;
// it never substitutes the bounding rectangle for an L/P-shaped house.
export function offsetPolygon(points, distanceM) {
  const distance = positive(distanceM, 0);
  const metrics = polygonMetrics(points);
  if (!distance) return points.map(point => ({ ...point }));
  const lines = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const direction = { x: next.x - point.x, y: next.y - point.y };
    const length = Math.hypot(direction.x, direction.y);
    if (!(length > 0.000001)) throw new Error('Контур плиты содержит повторяющиеся точки.');
    const outward = metrics.orientation > 0
      ? { x: direction.y / length, y: -direction.x / length }
      : { x: -direction.y / length, y: direction.x / length };
    return {
      point: { x: point.x + outward.x * distance, y: point.y + outward.y * distance },
      direction,
    };
  });
  const result = lines.map((line, index) => {
    const previous = lines[(index - 1 + lines.length) % lines.length];
    const point = lineIntersection(previous, line);
    if (!point || ![point.x, point.y].every(Number.isFinite)) throw new Error('Не удалось построить выпуск плиты у параллельных граней.');
    if (Math.hypot(point.x - points[index].x, point.y - points[index].y) > Math.max(10, distance * 20)) {
      throw new Error('Слишком острый угол контура для выбранного выпуска плиты.');
    }
    return { x: round(point.x, 6), y: round(point.y, 6) };
  });
  assertSimplePolygon(result);
  return result;
}

export function calculateFoundationSlab(plan, rawSettings = {}) {
  const settings = normalizeFoundationSlab(rawSettings);
  if (plan?.house?.contourDefined === false) return { active: false, settings, errors: ['Сначала замкните контур дома.'] };
  try {
    const housePolygon = houseContourPoints(plan).map(point => ({ x: Number(point.x), y: Number(point.y) }));
    const slabPolygon = offsetPolygon(housePolygon, settings.extensionMm / 1000);
    const slabMetrics = polygonMetrics(slabPolygon);
    const concreteNetM3 = slabMetrics.area * settings.thicknessMm / 1000;
    const concreteOrderM3 = concreteNetM3 * (1 + settings.concreteReservePercent / 100);
    const blindOuterPolygon = settings.blind.enabled
      ? offsetPolygon(slabPolygon, settings.blind.widthMm / 1000)
      : [];
    const blindAreaM2 = settings.blind.enabled
      ? Math.max(0, polygonMetrics(blindOuterPolygon).area - slabMetrics.area)
      : 0;
    const blindConcreteNetM3 = blindAreaM2 * settings.blind.thicknessMm / 1000;
    const sandCompactedM3 = slabMetrics.area * settings.sandThicknessMm / 1000;
    const stoneCompactedM3 = slabMetrics.area * settings.stoneThicknessMm / 1000;
    return {
      active: true,
      settings,
      errors: [],
      warnings: settings.structuralApproval === 'confirmed' ? [] : ['Толщина, основание и армирование требуют проверки конструктора.'],
      housePolygon,
      slabPolygon,
      blindOuterPolygon,
      areaM2: round(slabMetrics.area, 4),
      perimeterM: round(slabMetrics.perimeter, 4),
      concreteNetM3: round(concreteNetM3, 4),
      concreteOrderM3: round(concreteOrderM3, 3),
      sandCompactedM3: round(sandCompactedM3, 4),
      sandPurchaseM3: round(sandCompactedM3 * settings.sandPurchaseFactor, 3),
      stoneCompactedM3: round(stoneCompactedM3, 4),
      stonePurchaseM3: round(stoneCompactedM3 * settings.stonePurchaseFactor, 3),
      geotextileAreaM2: round((slabMetrics.area + blindAreaM2) * (1 + settings.geotextileReservePercent / 100), 2),
      filmAreaM2: round(slabMetrics.area * (1 + settings.filmReservePercent / 100), 2),
      xpsAreaM2: settings.xpsEnabled ? round(slabMetrics.area, 2) : 0,
      blindAreaM2: round(blindAreaM2, 4),
      blindConcreteNetM3: round(blindConcreteNetM3, 4),
      blindConcreteOrderM3: round(blindConcreteNetM3 * (1 + settings.concreteReservePercent / 100), 3),
    };
  } catch (error) {
    return { active: false, settings, errors: [error.message] };
  }
}
