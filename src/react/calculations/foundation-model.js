import { terraceAttachmentSide } from '../../calculations/terrace-model.js';
import { boundsOf, houseContourPoints, lineEndpoints, pointInPolygon, unifiedWallSegments } from '../planner/geometry.js';

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

function rowPoints(row) {
  const count = Math.max(2, Math.round(row.count) || 2);
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    return { x: row.x1 + (row.x2 - row.x1) * ratio, y: row.y1 + (row.y2 - row.y1) * ratio, source: row.group || 'house' };
  });
}

function perimeterRows(platform, spacing, house) {
  const x1 = Number(platform.x) || 0;
  const y1 = Number(platform.y) || 0;
  const x2 = x1 + (Number(platform.w) || 0);
  const y2 = y1 + (Number(platform.h) || 0);
  const count = (length) => Math.max(2, Math.ceil(length / spacing) + 1);
  const houseSide = platform.foundation?.mode === 'shared' ? terraceAttachmentSide(platform, house) : null;
  const attached = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }[houseSide] || null;
  return [
    { side: 'top', x1, y1, x2, y2: y1, count: count(x2 - x1), group: 'platform' },
    { side: 'right', x1: x2, y1, x2, y2, count: count(y2 - y1), group: 'platform' },
    { side: 'bottom', x1, y1: y2, x2, y2, count: count(x2 - x1), group: 'platform' },
    { side: 'left', x1, y1, x2: x1, y2, count: count(y2 - y1), group: 'platform' }
  ].filter((row) => row.side !== attached);
}

function uniquePoints(groups, tolerance = 0.12) {
  const points = [];
  groups.flat().forEach((point) => {
    const existing = points.find((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= tolerance);
    if (existing) {
      if (existing.source !== point.source) existing.source = 'shared';
    } else points.push({ ...point });
  });
  return points;
}

function platformBindingLength(platform, house) {
  if (platform.binding?.mode === 'none') return 0;
  const perimeter = 2 * ((Number(platform.w) || 0) + (Number(platform.h) || 0));
  if (platform.binding?.mode !== 'shared') return perimeter;
  const side = terraceAttachmentSide(platform, house);
  const attachment = side === 'left' || side === 'right' ? Number(platform.h) || 0 : Number(platform.w) || 0;
  return Math.max(0, perimeter - attachment);
}

export function bindingLinesFromPileRows(rows = []) {
  return rows.filter((row) => row.group !== 'platform').map((row, index) => ({
    id: `binding-${row.id || index + 1}`,
    name: `Обвязка ${index + 1}`,
    x1: Number(row.x1) || 0,
    y1: Number(row.y1) || 0,
    x2: Number(row.x2) || 0,
    y2: Number(row.y2) || 0,
    group: 'house',
    include: true,
    auto: true
  }));
}

export function generateAutoBindingLines(plan, verticalRows = 4, horizontalRows = 5) {
  const w = Math.max(0.5, Number(plan?.house?.w) || 0.5);
  const h = Math.max(0.5, Number(plan?.house?.h) || 0.5);
  const vCount = Math.max(2, Math.min(24, Math.round(Number(verticalRows) || 4)));
  const hCount = Math.max(2, Math.min(24, Math.round(Number(horizontalRows) || 5)));
  const lines = [];
  for (let index = 0; index < vCount; index += 1) {
    const x = vCount === 1 ? 0 : w * index / (vCount - 1);
    lines.push({ id: `auto-binding-v-${index + 1}`, name: `Авто · вертикаль ${index + 1}`, x1: round(x, 3), y1: 0, x2: round(x, 3), y2: round(h, 3), group: 'house', include: true, auto: true, axis: 'vertical' });
  }
  for (let index = 0; index < hCount; index += 1) {
    const y = hCount === 1 ? 0 : h * index / (hCount - 1);
    lines.push({ id: `auto-binding-h-${index + 1}`, name: `Авто · горизонталь ${index + 1}`, x1: 0, y1: round(y, 3), x2: round(w, 3), y2: round(y, 3), group: 'house', include: true, auto: true, axis: 'horizontal' });
  }
  return lines;
}

function pointOnSegment(point, a, b, tolerance = 0.015) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length <= tolerance) return false;
  const distance = Math.abs((b.x - a.x) * (a.y - point.y) - (a.x - point.x) * (b.y - a.y)) / length;
  if (distance > tolerance) return false;
  return point.x >= Math.min(a.x, b.x) - tolerance && point.x <= Math.max(a.x, b.x) + tolerance
    && point.y >= Math.min(a.y, b.y) - tolerance && point.y <= Math.max(a.y, b.y) + tolerance;
}

function segmentIntersection(first, second, tolerance = 0.015) {
  const p = first.a; const r = { x: first.b.x - first.a.x, y: first.b.y - first.a.y };
  const q = second.a; const s = { x: second.b.x - second.a.x, y: second.b.y - second.a.y };
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const denominator = cross(r, s);
  if (Math.abs(denominator) <= tolerance) return null;
  const qp = { x: q.x - p.x, y: q.y - p.y };
  const t = cross(qp, s) / denominator;
  const u = cross(qp, r) / denominator;
  if (t < -tolerance || t > 1 + tolerance || u < -tolerance || u > 1 + tolerance) return null;
  return { x: p.x + t * r.x, y: p.y + t * r.y };
}

function splitAtFoundationNodes(candidates = []) {
  return candidates.flatMap((candidate, candidateIndex) => {
    const dx = candidate.b.x - candidate.a.x;
    const dy = candidate.b.y - candidate.a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0.0001) return [];
    const nodes = [candidate.a, candidate.b];
    candidates.forEach((other, otherIndex) => {
      if (candidateIndex === otherIndex) return;
      const crossing = segmentIntersection(candidate, other);
      if (crossing) nodes.push(crossing);
      [other.a, other.b].forEach((point) => {
        if (pointOnSegment(point, candidate.a, candidate.b)) nodes.push(point);
      });
    });
    const unique = [];
    nodes
      .map((point) => ({
        x: round(point.x, 3), y: round(point.y, 3),
        t: ((point.x - candidate.a.x) * dx + (point.y - candidate.a.y) * dy) / lengthSquared
      }))
      .sort((a, b) => a.t - b.t)
      .forEach((point) => {
        if (!unique.some((item) => Math.hypot(item.x - point.x, item.y - point.y) <= 0.015)) unique.push(point);
      });
    return unique.slice(0, -1).map((point, index) => ({
      ...candidate,
      id: `${candidate.id}-${index + 1}`,
      name: `${candidate.name} · участок ${index + 1}`,
      a: { x: point.x, y: point.y },
      b: { x: unique[index + 1].x, y: unique[index + 1].y }
    })).filter((item) => Math.hypot(item.b.x - item.a.x, item.b.y - item.a.y) >= 0.05);
  });
}

function gridSegmentsInsideContour(contour, rowSpacing) {
  const bounds = boundsOf(contour);
  const segments = [];
  const addAxis = (axis, fixed, index) => {
    const intersections = [];
    contour.forEach((point, edgeIndex) => {
      const next = contour[(edgeIndex + 1) % contour.length];
      if (axis === 'h') {
        if ((point.y <= fixed && next.y > fixed) || (next.y <= fixed && point.y > fixed)) {
          const ratio = (fixed - point.y) / (next.y - point.y);
          intersections.push(point.x + (next.x - point.x) * ratio);
        }
      } else if ((point.x <= fixed && next.x > fixed) || (next.x <= fixed && point.x > fixed)) {
        const ratio = (fixed - point.x) / (next.x - point.x);
        intersections.push(point.y + (next.y - point.y) * ratio);
      }
    });
    intersections.sort((a, b) => a - b);
    for (let pair = 0; pair + 1 < intersections.length; pair += 2) {
      const start = intersections[pair]; const end = intersections[pair + 1];
      const midpoint = axis === 'h' ? { x: (start + end) / 2, y: fixed } : { x: fixed, y: (start + end) / 2 };
      if (!pointInPolygon(midpoint, contour) || end - start < 0.05) continue;
      segments.push({
        id: `auto-grid-${axis}-${index}-${pair / 2 + 1}`,
        name: `Авто · сетка ${axis === 'h' ? 'горизонталь' : 'вертикаль'} ${index}`,
        a: axis === 'h' ? { x: start, y: fixed } : { x: fixed, y: start },
        b: axis === 'h' ? { x: end, y: fixed } : { x: fixed, y: end }
      });
    }
  };
  const verticalIntervals = Math.max(1, Math.ceil(bounds.w / rowSpacing));
  const horizontalIntervals = Math.max(1, Math.ceil(bounds.h / rowSpacing));
  for (let index = 1; index < verticalIntervals; index += 1) addAxis('v', bounds.x + bounds.w * index / verticalIntervals, index);
  for (let index = 1; index < horizontalIntervals; index += 1) addAxis('h', bounds.y + bounds.h * index / horizontalIntervals, index);
  return segments;
}

export function generateAutoPileRows(plan, spacing = 2.5, options = {}) {
  const safeSpacing = Math.max(0.5, Number(spacing) || 2.5);
  const mode = ['nodes', 'uniform', 'contour'].includes(options.mode) ? options.mode : 'nodes';
  const rowSpacing = Math.max(0.5, Number(options.rowSpacing) || safeSpacing);
  const createRow = (id, name, a, b, group = 'house') => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return {
      id, name, x1: round(a.x, 3), y1: round(a.y, 3), x2: round(b.x, 3), y2: round(b.y, 3),
      count: Math.max(2, Math.ceil(length / safeSpacing) + 1), group, auto: true
    };
  };
  const contour = houseContourPoints(plan);
  const rectangleIds = ['auto-top', 'auto-right', 'auto-bottom', 'auto-left'];
  const rectangleNames = ['Авто · верх', 'Авто · справа', 'Авто · низ', 'Авто · слева'];
  const customContour = Array.isArray(plan?.house?.points) && plan.house.points.length >= 3;
  const candidates = contour.map((point, index) => ({
    id: customContour ? `auto-contour-${index + 1}` : rectangleIds[index],
    name: customContour ? `Авто · контур ${index + 1}` : rectangleNames[index],
    a: point,
    b: contour[(index + 1) % contour.length]
  }));
  if (mode === 'uniform') candidates.push(...gridSegmentsInsideContour(contour, rowSpacing));
  if (mode === 'nodes' && options.includeInteriorWalls !== false) unifiedWallSegments(plan).forEach((segment, index) => {
    const [a, b] = lineEndpoints(segment);
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const inside = midpoint.x >= 0 && midpoint.x <= plan.house.w && midpoint.y >= 0 && midpoint.y <= plan.house.h;
    const first = { x: Math.max(0, Math.min(plan.house.w, a.x)), y: Math.max(0, Math.min(plan.house.h, a.y)) };
    const second = { x: Math.max(0, Math.min(plan.house.w, b.x)), y: Math.max(0, Math.min(plan.house.h, b.y)) };
    if (inside && Math.hypot(second.x - first.x, second.y - first.y) >= 0.5) candidates.push({ id: `auto-inner-${index + 1}`, name: `Авто · под стеной ${index + 1}`, a: first, b: second });
  });
  if (mode === 'nodes' && options.includeInteriorWalls !== false) (plan.walls || []).forEach((wall, index) => {
    const a = { x: wall.x1, y: wall.y1 }; const b = { x: wall.x2, y: wall.y2 };
    if (Math.hypot(b.x - a.x, b.y - a.y) >= 0.5) candidates.push({ id: `auto-wall-${index + 1}`, name: `Авто · отдельная стена ${index + 1}`, a, b });
  });
  return splitAtFoundationNodes(candidates).map((candidate) => createRow(candidate.id, candidate.name, candidate.a, candidate.b));
}

export function calculateFoundation(plan, settings = {}) {
  const spacing = Math.max(0.5, Number(settings.spacing) || 2.5);
  const houseRows = (plan.pileRows || []).filter((row) => row.group !== 'platform');
  const housePoints = uniquePoints([houseRows.flatMap(rowPoints).concat((plan.piles || []).map((pile) => ({ ...pile, source: 'house' })))], 0.05);
  const platforms = settings.includePlatforms === false ? [] : (plan.platforms || []).filter((platform) => platform.include !== false && platform.foundation?.mode !== 'none');
  const platformPoints = platforms.flatMap((platform) => perimeterRows(platform, spacing, plan.house).flatMap(rowPoints));
  // Опора террасы/крыльца рядом с домовой опорой считается общей, даже если геометрически точки не совпали идеально.
  // Это убирает бессмысленные дубли свай вдоль примыкания площадки к дому.
  const sharedReuseDistance = Math.max(0.18, Math.min(0.6, Number(settings.sharedPileReuseDistance) || spacing * 0.2));
  const exclusions = plan.excludedPiles || [];
  const isExcluded = (point) => exclusions.some((excluded) => Math.hypot(excluded.x - point.x, excluded.y - point.y) <= 0.015);
  const points = housePoints.filter((point) => !isExcluded(point)).map((point) => ({ ...point }));
  platformPoints.forEach((point) => {
    const nearbyHouse = points.find((candidate) => (candidate.source === 'house' || candidate.source === 'shared') && Math.hypot(candidate.x - point.x, candidate.y - point.y) <= sharedReuseDistance);
    if (nearbyHouse) { nearbyHouse.source = 'shared'; return; }
    const nearbyPlatform = points.find((candidate) => candidate.source === 'platform' && Math.hypot(candidate.x - point.x, candidate.y - point.y) <= 0.05);
    if (!nearbyPlatform && !isExcluded(point)) points.push({ ...point, source: 'platform' });
  });
  const sharedPiles = points.filter((point) => point.source === 'shared').length;
  const housePiles = points.filter((point) => point.source === 'house' || point.source === 'shared').length;
  const platformPiles = points.filter((point) => point.source === 'platform' || point.source === 'shared').length;
  const bindingLines = Array.isArray(plan.bindingLines) ? plan.bindingLines : bindingLinesFromPileRows(houseRows);
  const houseBindingLength = bindingLines.filter((line) => line.include !== false).reduce((sum, line) => sum + Math.hypot(line.x2 - line.x1, line.y2 - line.y1), 0);
  const platformBinding = (plan.platforms || []).filter((platform) => platform.include !== false).reduce((sum, platform) => sum + platformBindingLength(platform, plan.house), 0);
  const bindingLength = houseBindingLength + platformBinding;
  const boardWidth = Math.max(0.01, (Number(settings.bindingBoardWidthMm) || 50) / 1000);
  const boardHeight = Math.max(0.01, (Number(settings.bindingBoardHeightMm) || 150) / 1000);
  const bindingLayers = Math.max(1, Math.round(Number(settings.bindingLayers) || Math.round((Number(settings.boardVolumePerMeter) || 0.0225) / (boardWidth * boardHeight)) || 3));
  const boardStockLength = 6;
  const requiredBoardLength = bindingLength * bindingLayers;
  const boardCount = requiredBoardLength ? Math.ceil(requiredBoardLength / boardStockLength) : 0;
  const purchaseBoardLength = boardCount * boardStockLength;
  return {
    points,
    totalPiles: points.length,
    housePiles,
    platformPiles,
    sharedPiles,
    sharedReuseDistance: round(sharedReuseDistance, 2),
    houseBindingLength: round(houseBindingLength),
    platformBindingLength: round(platformBinding),
    bindingLength: round(bindingLength),
    bindingLayers,
    boardStockLength,
    requiredBoardLength: round(requiredBoardLength, 3),
    boardCount,
    purchaseBoardLength: round(purchaseBoardLength, 3),
    boardWasteLength: round(Math.max(0, purchaseBoardLength - requiredBoardLength), 3),
    boardVolume: round(purchaseBoardLength * boardWidth * boardHeight, 3)
  };
}
