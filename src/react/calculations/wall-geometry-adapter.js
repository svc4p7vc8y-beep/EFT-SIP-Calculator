import { boundsOf, houseContourPoints } from '../planner/geometry.js';
import { exteriorWallConstruction } from './wall-construction.js';
import { partitionSegments } from './partition-construction.js';
import { normalizeProductionCutting } from '../state/production-cutting.js';

const mm = value => Math.round(Number(value) * 1000) || 0;
const point = p => [mm(p.x), mm(p.y)];
const present = value => value !== '' && value != null && Number.isFinite(Number(value));

// Shared legacy binding policy, in metres. Extraction deliberately changes no
// distance/orientation/tie thresholds. Ambiguous candidates are never assigned.
export function openingWallCandidates(opening, edges) {
  return edges.filter(edge => opening.orientation === 'h'
    ? Math.abs(edge.a.y - edge.b.y) < .001
    : opening.orientation === 'v' ? Math.abs(edge.a.x - edge.b.x) < .001 : true)
    .map(edge => {
      const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y;
      const length = Math.hypot(dx, dy);
      const u = length ? ((opening.x - edge.a.x) * dx + (opening.y - edge.a.y) * dy) / length : 0;
      const distance = Math.hypot(opening.x - edge.a.x - Math.max(0, Math.min(length, u)) * dx / (length || 1), opening.y - edge.a.y - Math.max(0, Math.min(length, u)) * dy / (length || 1));
      return { edge, u, distance };
    }).sort((a, b) => a.distance - b.distance);
}

// Stage 1: derived, JSON-safe first-floor geometry, not a structural calculation.
// No prices, estimate or persisted derived state. IDs are compatibility refs,
// not the future stable physical-element registry.
export function buildFirstFloorWallGeometry({ plan, sip = {}, roof = {}, services = {}, productionSettings = {}, topFloor = true }) {
  const settings = normalizeProductionCutting(productionSettings);
  const contour = houseContourPoints(plan), bounds = boundsOf(contour);
  const issues = [];
  const issue = (code, target, message) => issues.push({ code, target, message });
  const rectangular = contour.length === 4 && contour.every((p, i) => {
    const next = contour[(i + 1) % 4];
    return Number.isFinite(p.x) && Number.isFinite(p.y) && Math.hypot(next.x - p.x, next.y - p.y) > .001
      && (Math.abs(p.x - next.x) < 1e-9 || Math.abs(p.y - next.y) < 1e-9);
  }) && new Set(contour.map(p => `${p.x}:${p.y}`)).size === 4
    && contour.every(p => (p.x === bounds.x || p.x === bounds.x2) && (p.y === bounds.y || p.y === bounds.y2))
    && bounds.w > 0 && bounds.h > 0;
  const supported = rectangular && plan.house?.contourDefined !== false;
  if (!supported) issue('GEOMETRY_SCOPE', 'Э1', 'Первый этап поддерживает заданный прямоугольный контур; действующий раскрой сохранён.');
  const construction = supported ? exteriorWallConstruction(plan, sip, roof, topFloor, services.roof) : [];
  const area = contour.reduce((sum, p, i) => sum + p.x * contour[(i + 1) % contour.length].y - contour[(i + 1) % contour.length].x * p.y, 0);
  const walls = construction.map(w => {
    const id = `Э1-С${w.index + 1}`;
    const key = `${id}@${mm(w.a.x)},${mm(w.a.y)}:${mm(w.b.x)},${mm(w.b.y)}`;
    const addition = Number(settings.wallAdditions[key]) || 0;
    const dx = (w.b.x - w.a.x) / w.externalLength || 0, dy = (w.b.y - w.a.y) / w.externalLength || 0;
    const inward = [-dy * Math.sign(area) || 0, dx * Math.sign(area) || 0];
    const start = point(w.start), end = point(w.end), thickness = mm(w.thickness);
    return {
      id, sourceRef: { floor: 1, contourEdge: w.index, legacyWallKey: key },
      outerStart: point(w.a), outerEnd: point(w.b), start, end,
      axisStart: start.map((v, i) => v + inward[i] * thickness / 2),
      axisEnd: end.map((v, i) => v + inward[i] * thickness / 2),
      localFrame: { origin: start, along: [dx, dy], inward, reference: 'наружная грань', elevation: 0 },
      externalLength: mm(w.externalLength), length: mm(w.length), thickness,
      trimStart: mm(w.trimStart), trimEnd: mm(w.trimEnd),
      heightStart: mm(w.heightStart) + addition, heightEnd: mm(w.heightEnd) + addition,
      addition, enabled: !!services.sipWalls, openings: [],
    };
  });
  for (const wall of walls) if (wall.length <= 0 || wall.heightStart < 0 || wall.heightEnd < 0)
    issue('WALL_SIZE', wall.id, 'Проверьте фактическую длину и высоту стены.');
  const edges = construction.map((w, i) => ({ ...w, id: walls[i].id, outer: true }));
  if (supported && services.partitions) {
    const seen = new Set();
    partitionSegments(plan).forEach(([a, b], i) => {
      const key = [a, b].map(p => `${mm(p.x)},${mm(p.y)}`).sort().join(':');
      if (!seen.has(key)) { edges.push({ a, b, id: `Э1-ПГ${i + 1}`, outer: false }); seen.add(key); }
    });
  }
  const openings = [];
  if (supported) for (const o of [...(plan.openings || []), ...(plan.wallGaps || []).map(gap => ({ ...gap, type: 'gap', height: plan.wallHeight }))]) {
    if (o.include === false || o.subtractFromSip === false) continue;
    const outer = typeof o.outer === 'boolean' ? o.outer : null;
    if ((outer === true && !services.sipWalls) || (outer === false && !services.partitions)) continue;
    const eligible = edges.filter(edge => (outer == null || edge.outer === outer) && (!edge.outer || services.sipWalls));
    const choices = openingWallCandidates(o, eligible), nearest = choices[0];
    const key = `1:${o.id}`;
    const ambiguous = choices[1] && Math.abs(choices[1].distance - nearest.distance) < .001;
    const valid = nearest && Number.isFinite(nearest.distance) && nearest.distance <= Math.max(Number(plan.wallThickness) || .174, .1) + .03 && !ambiguous;
    if (!valid) {
      openings.push({ id: o.id, key, status: 'unresolved', wallId: null, candidateWallIds: choices.map(c => c.edge.id) });
      issue('OPENING_WALL', key, 'Стена не найдена или привязка неоднозначна.');
      continue;
    }
    // Interior bindings participate in disambiguation, but are outside stage 1.
    if (!nearest.edge.outer) continue;
    const wall = walls.find(w => w.id === nearest.edge.id);
    const sill = o.type === 'gap' ? 0 : settings.openingSills[key] ?? (present(o.sillHeight) ? mm(o.sillHeight) : o.type === 'door' ? 0 : settings.windowSillMm);
    const opening = { id: o.id, key, wallId: wall.id, type: o.type, status: 'assigned',
      x: mm(nearest.u) - mm(o.width) / 2 - wall.trimStart,
      width: mm(o.width), height: o.type === 'gap' ? Math.max(wall.heightStart, wall.heightEnd) : mm(o.height), sill };
    const top = x => wall.heightStart + (wall.heightEnd - wall.heightStart) * x / wall.length;
    opening.topClearance = Math.min(top(opening.x), top(opening.x + opening.width)) - Number(sill) - opening.height;
    if (![opening.x, opening.width, opening.height, Number(sill)].every(Number.isFinite) || !present(sill) || Number(sill) < 0 || opening.width <= 0 || opening.height <= 0
      || opening.x < -1 || opening.x + opening.width > wall.length + 1 || (o.type !== 'gap' && opening.topClearance < -1)) {
      opening.status = 'invalid'; issue('OPENING_SIZE', key, 'Проём выходит за фактическую стену или имеет неверные размеры.');
    }
    wall.openings.push(opening); openings.push(opening);
  }
  for (const wall of walls) for (let i = 0; i < wall.openings.length; i++) {
    const a = wall.openings[i];
    for (const b of wall.openings.slice(i + 1)) if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0
      && Math.min(Number(a.sill) + a.height, Number(b.sill) + b.height) - Math.max(Number(a.sill), Number(b.sill)) > 0) {
      a.status = b.status = 'invalid';
      issue('OPENING_OVERLAP', wall.id, 'Проёмы пересекаются; положение исходных проёмов не изменено.');
    }
  }
  return { schemaVersion: 1, units: 'mm', floor: 1, supported,
    identityStatus: 'legacy-position-refs',
    outerContour: contour.map(point), bounds: { x: mm(bounds.x), y: mm(bounds.y), width: mm(bounds.w), length: mm(bounds.h) },
    walls, openings, corners: walls.map((w, i) => ({ point: w.outerStart, previousWallId: walls[(i + walls.length - 1) % walls.length].id, nextWallId: w.id, scheme: 'horizontal-through-vertical-butt' })), issues };
}

export function wallLocalToWorld(wall, x, height = 0, depth = 0) {
  const { origin, along, inward, elevation } = wall.localFrame;
  return [origin[0] + along[0] * x + inward[0] * depth, origin[1] + along[1] * x + inward[1] * depth, elevation + height];
}

export function wallWorldToLocal(wall, [x, y, z = 0]) {
  const { origin, along, inward, elevation } = wall.localFrame;
  return [(x - origin[0]) * along[0] + (y - origin[1]) * along[1], z - elevation, (x - origin[0]) * inward[0] + (y - origin[1]) * inward[1]];
}

// Shadow comparison only: never edits surfaces, quantities, approval or issues.
export function compareWallGeometry(model, surfaces, { framedSlope = false } = {}) {
  if (!model.supported) return { status: 'outside-scope', differences: [] };
  const differences = [];
  for (const wall of model.walls.filter(w => w.enabled)) {
    const surface = surfaces.find(s => s.id === wall.id);
    if (!surface && wall.heightStart === 0 && wall.heightEnd === 0 && !wall.openings.length) continue;
    if (!surface) { differences.push({ wallId: wall.id, field: 'surface', expected: 'present', actual: 'missing' }); continue; }
    for (const [field, expected, actual] of [
      ['length', wall.length, surface.width], ['start', wall.start, surface.planStart], ['end', wall.end, surface.planEnd],
      ['heightStart', wall.heightStart, surface.heightStart], ['heightEnd', wall.heightEnd, surface.heightEnd],
    ]) if (JSON.stringify(expected) !== JSON.stringify(actual)) differences.push({ wallId: wall.id, field, expected, actual,
      reason: framedSlope && field.startsWith('height') ? 'Холодный каркас уклона отделён от SIP-стены в действующем раскрое.' : null });
    for (const opening of wall.openings) {
      const actual = surface.openings.find(o => o.key === opening.key);
      for (const field of ['x', 'width', 'height', 'sill']) if (opening[field] !== actual?.[field]) differences.push({ wallId: wall.id, openingKey: opening.key, field, expected: opening[field], actual: actual?.[field] ?? null });
    }
  }
  return { status: differences.length ? 'differences' : 'matched', differences };
}
