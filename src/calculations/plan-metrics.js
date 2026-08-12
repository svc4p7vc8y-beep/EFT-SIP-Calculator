const DEFAULT_TOLERANCE = 0.04;

const round = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const roomPoints = (room = {}) => Array.isArray(room.points) && room.points.length >= 3
  ? room.points
  : [
      { x: room.x, y: room.y },
      { x: (room.x || 0) + (room.w || 0), y: room.y },
      { x: (room.x || 0) + (room.w || 0), y: (room.y || 0) + (room.h || 0) },
      { x: room.x, y: (room.y || 0) + (room.h || 0) }
    ];

export const polygonArea = (points = []) => {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
};

const mergeIntervals = (intervals, tolerance) => {
  const sorted = intervals
    .map(([start, end]) => [Math.min(start, end), Math.max(start, end)])
    .sort((left, right) => left[0] - right[0]);
  const merged = [];
  sorted.forEach((interval) => {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1] + tolerance) merged.push(interval.slice());
    else last[1] = Math.max(last[1], interval[1]);
  });
  return merged.reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0);
};

const openingArea = (opening) => Math.max(0, Number(opening.width) || 0) * Math.max(0, Number(opening.height) || 0);

const isOuterEdge = (a, b, plan, tolerance) => {
  const wall = Number(plan.wallThickness) || 0.174;
  const inner = { left: wall, top: wall, right: plan.house.w - wall, bottom: plan.house.h - wall };
  return (
    (Math.abs(a.x - inner.left) <= tolerance && Math.abs(b.x - inner.left) <= tolerance) ||
    (Math.abs(a.x - inner.right) <= tolerance && Math.abs(b.x - inner.right) <= tolerance) ||
    (Math.abs(a.y - inner.top) <= tolerance && Math.abs(b.y - inner.top) <= tolerance) ||
    (Math.abs(a.y - inner.bottom) <= tolerance && Math.abs(b.y - inner.bottom) <= tolerance)
  );
};

const inferOuterOpening = (opening, plan, tolerance) => {
  if (typeof opening.outer === 'boolean') return opening.outer;
  const wall = Number(plan.wallThickness) || 0.174;
  const axes = [wall / 2, plan.house.w - wall / 2, wall / 2, plan.house.h - wall / 2];
  const coordinate = opening.orientation === 'v' ? opening.x : opening.y;
  const relevant = opening.orientation === 'v' ? axes.slice(0, 2) : axes.slice(2);
  return relevant.some((axis) => Math.abs(coordinate - axis) <= tolerance * 3);
};

export function calculatePlanMetrics(plan, tolerance = DEFAULT_TOLERANCE) {
  if (!plan?.house) throw new TypeError('Для расчёта нужен план с габаритами дома');
  const horizontal = new Map();
  const vertical = new Map();
  const diagonal = new Map();

  const addSegment = (a, b, allowOuter = false) => {
    if (!allowOuter && isOuterEdge(a, b, plan, tolerance)) return;
    if (Math.abs(a.y - b.y) <= tolerance) {
      const key = round((a.y + b.y) / 2, 2);
      if (!horizontal.has(key)) horizontal.set(key, []);
      horizontal.get(key).push([a.x, b.x]);
      return;
    }
    if (Math.abs(a.x - b.x) <= tolerance) {
      const key = round((a.x + b.x) / 2, 2);
      if (!vertical.has(key)) vertical.set(key, []);
      vertical.get(key).push([a.y, b.y]);
      return;
    }
    const first = `${round(a.x, 2)}:${round(a.y, 2)}`;
    const second = `${round(b.x, 2)}:${round(b.y, 2)}`;
    const key = first < second ? `${first}|${second}` : `${second}|${first}`;
    diagonal.set(key, Math.hypot(b.x - a.x, b.y - a.y));
  };

  let roomArea = 0;
  (plan.rooms || []).forEach((room) => {
    const points = roomPoints(room);
    if (room.include !== false) roomArea += polygonArea(points);
    for (let index = 0; index < points.length; index += 1) {
      addSegment(points[index], points[(index + 1) % points.length]);
    }
  });
  (plan.walls || []).forEach((wall) => addSegment(
    { x: wall.x1, y: wall.y1 },
    { x: wall.x2, y: wall.y2 },
    true
  ));

  let partitionLength = 0;
  horizontal.forEach((intervals) => { partitionLength += mergeIntervals(intervals, tolerance); });
  vertical.forEach((intervals) => { partitionLength += mergeIntervals(intervals, tolerance); });
  diagonal.forEach((length) => { partitionLength += length; });

  let exteriorOpeningsArea = 0;
  let interiorOpeningsArea = 0;
  let windowArea = 0;
  let doorArea = 0;
  (plan.openings || []).forEach((opening) => {
    const area = openingArea(opening);
    if (opening.type === 'window') windowArea += area;
    if (opening.type === 'door') doorArea += area;
    if (inferOuterOpening(opening, plan, tolerance)) exteriorOpeningsArea += area;
    else if (opening.type === 'door') interiorOpeningsArea += area;
  });

  const wallHeight = Math.max(0, Number(plan.wallHeight) || 2.5);
  let exteriorGapLength = 0;
  let interiorGapLength = 0;
  (plan.wallGaps || []).forEach((gap) => {
    const width = Math.max(0, Number(gap.width) || 0);
    if (inferOuterOpening(gap, plan, tolerance)) exteriorGapLength += width;
    else interiorGapLength += width;
  });
  partitionLength = Math.max(0, partitionLength - interiorGapLength);
  const perimeter = 2 * ((Number(plan.house.w) || 0) + (Number(plan.house.h) || 0));
  const partitionGrossArea = partitionLength * wallHeight;
  const platformArea = (plan.platforms || []).reduce((sum, platform) => (
    platform.include === false ? sum : sum + Math.max(0, platform.w || 0) * Math.max(0, platform.h || 0)
  ), 0);

  return {
    roomArea: round(roomArea, 2),
    perimeter: round(perimeter, 2),
    exteriorWallGrossArea: round(perimeter * wallHeight, 2),
    exteriorOpeningsArea: round(exteriorOpeningsArea, 2),
    exteriorWallNetArea: round(Math.max(0, perimeter * wallHeight - exteriorOpeningsArea - exteriorGapLength * wallHeight), 2),
    partitionLength: round(partitionLength, 2),
    partitionGrossArea: round(partitionGrossArea, 2),
    interiorOpeningsArea: round(interiorOpeningsArea, 2),
    partitionNetArea: round(Math.max(0, partitionGrossArea - interiorOpeningsArea), 2),
    wallGapLength: round(exteriorGapLength + interiorGapLength, 2),
    windowArea: round(windowArea, 2),
    doorArea: round(doorArea, 2),
    totalOpeningsArea: round(windowArea + doorArea, 2),
    platformArea: round(platformArea, 2)
  };
}

const CUTTING_RULES = {
  floor: { label: 'Пол', waste: 1, cutNorm: 0.701 },
  walls: { label: 'Стены', waste: 1.05, cutNorm: 0.324 },
  ceiling: { label: 'Потолок', waste: 1.03, cutNorm: 0.165 },
  partitions: { label: 'Перегородки', waste: 1.05, cutNorm: 0.2 },
  roof: { label: 'Крыша', waste: 1.1, cutNorm: 0.324 }
};

export function calculateSipCutting(surfaces, options = {}) {
  const panelArea = Math.max(0.1, Number(options.panelArea) || 3.125);
  const extraWaste = 1 + Math.max(0, Number(options.extraWastePercent) || 0) / 100;
  return Object.entries(CUTTING_RULES).map(([key, rule]) => {
    const area = Math.max(0, Number(surfaces?.[key]) || 0);
    const panels = area > 0 ? Math.ceil((area / panelArea) * rule.waste * extraWaste) : 0;
    const purchasedArea = panels * panelArea;
    return {
      key,
      label: rule.label,
      area: round(area, 2),
      panels,
      purchasedArea: round(purchasedArea, 2),
      offcutArea: round(Math.max(0, purchasedArea - area), 2),
      cutMeters: round(area * rule.cutNorm, 1)
    };
  });
}

export function roofGeometry({ span, ridgeLength, ridgeHeight }) {
  const safeSpan = Math.max(0, Number(span) || 0);
  const safeLength = Math.max(0, Number(ridgeLength) || 0);
  const safeHeight = Math.max(0, Number(ridgeHeight) || 0);
  const halfSpan = safeSpan / 2;
  const slopeLength = Math.hypot(halfSpan, safeHeight);
  return {
    slopeLength: round(slopeLength, 3),
    slopeArea: round(safeLength * slopeLength, 2),
    totalSlopeArea: round(safeLength * slopeLength * 2, 2),
    gableArea: round(safeSpan * safeHeight, 2),
    slopeCoefficient: round(halfSpan > 0 ? slopeLength / halfSpan : 1, 3)
  };
}

export function planFootprintBounds(plan) {
  const bounds = { minX: 0, minY: 0, maxX: Number(plan?.house?.w) || 0, maxY: Number(plan?.house?.h) || 0 };
  (plan?.platforms || []).forEach((platform) => {
    let minX = Number(platform.x) || 0;
    let minY = Number(platform.y) || 0;
    let maxX = minX + (Number(platform.w) || 0);
    let maxY = minY + (Number(platform.h) || 0);
    const stairDepth = Math.max(0, Math.round(Number(platform.steps) || 0)) * Math.max(0, Number(platform.tread) || 0.3);
    if (platform.stairSide === 'left') minX -= stairDepth;
    if (platform.stairSide === 'right') maxX += stairDepth;
    if (platform.stairSide === 'top') minY -= stairDepth;
    if (platform.stairSide === 'bottom') maxY += stairDepth;
    bounds.minX = Math.min(bounds.minX, minX);
    bounds.minY = Math.min(bounds.minY, minY);
    bounds.maxX = Math.max(bounds.maxX, maxX);
    bounds.maxY = Math.max(bounds.maxY, maxY);
  });
  return bounds;
}

export function chooseDimensionSides(plan) {
  const bounds = planFootprintBounds(plan);
  const width = Number(plan?.house?.w) || 0;
  const height = Number(plan?.house?.h) || 0;
  const leftObstruction = Math.max(0, -bounds.minX);
  const rightObstruction = Math.max(0, bounds.maxX - width);
  const topObstruction = Math.max(0, -bounds.minY);
  const bottomObstruction = Math.max(0, bounds.maxY - height);
  return {
    vertical: leftObstruction <= rightObstruction ? 'left' : 'right',
    horizontal: topObstruction <= bottomObstruction ? 'top' : 'bottom',
    bounds
  };
}
