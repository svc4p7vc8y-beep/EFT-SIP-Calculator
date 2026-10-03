import clipping from 'polygon-clipping';
import { houseContourPoints, roomPoints, unifiedWallSegments, lineEndpoints } from '../planner/geometry.js';
import { sipTimberProfile } from './sip-joinery.js';
import { normalizeProductionCutting } from '../state/production-cutting.js';
import { cuttingRevision, validateProductionSettings, parseManualPanel, reconcileCutting } from './production-controls.js';

const mm = value => Math.round((Number(value) || 0) * 1000);
const round = value => Math.round(value * 1000) / 1000;
const rect = (x, y, w, h) => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
const polygon = points => [points.map(p => [mm(p.x), mm(p.y)])];
const presentNumber = value => value !== '' && value != null && Number.isFinite(Number(value));
export const MIN_PANEL_WIDTH_MM = 200;
const narrowPanelError = label => Object.assign(new Error(`${label}: деталь уже ${MIN_PANEL_WIDTH_MM} мм; измените шаг, сетку или положение проёма.`), { code:'MIN_PANEL_WIDTH' });
function balancedCells(start, end, maximum, minimum = MIN_PANEL_WIDTH_MM) {
  const length = end - start;
  const count = Math.max(1, Math.ceil(length / maximum));
  if (length < minimum - .001 || length / count < minimum - .001) return null;
  return Array.from({ length: count }, (_, index) => ({ x: start + length * index / count, width: length / count }));
}
export const polygonAreaMm = poly => poly.reduce((sum, ring, index) => {
  const area = Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  return sum + (index ? -area : area);
}, 0);
export const polygonBounds = poly => {
  const points = poly.flat();
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};
const subtract = (shape, holes) => holes.length ? clipping.difference(shape, ...holes) : clipping.union(shape);

// One joint lands on a jamb of each opening. Remaining bays are balanced
// between fixed points and never exceed the selected frame step.
export function wallPanelColumns(bounds, step, openings = []) {
  const start = bounds.x, end = bounds.x + bounds.width;
  const anchors = [start, end];
  const distanceToGrid = value => {
    const remainder = ((value - start) % step + step) % step;
    return Math.min(remainder, step - remainder);
  };
  for (const opening of [...openings].sort((a,b) => a.x - b.x)) {
    const candidates = [opening.x, opening.x + opening.width]
      .filter(value => value > start + 1 && value < end - 1);
    if (!candidates.length) continue;
    const chosen = candidates.sort((a,b) => {
      const score = value => distanceToGrid(value) + (Math.min(...anchors.map(anchor => Math.abs(value-anchor))) < step * .25 ? step : 0);
      return score(a) - score(b);
    })[0];
    if (anchors.every(value => Math.abs(value - chosen) >= MIN_PANEL_WIDTH_MM)) anchors.push(chosen);
  }
  anchors.sort((a,b) => a-b);
  const columns = [];
  for (let index=0; index<anchors.length-1; index++) {
    const left=anchors[index], right=anchors[index+1];
    const pieces = balancedCells(left, right, step);
    if (!pieces) return [];
    columns.push(...pieces);
  }
  return columns;
}

// Horizontal wall panels are cut as bands at the sill and lintel levels.
// This avoids long, narrow L-shaped remnants around doors and windows.
function tileHorizontalWall(surface, panelWidth, panelLength) {
  const bounds = polygonBounds(surface.geometry.flat());
  const bottom = bounds.y, top = bounds.y + bounds.height;
  const levels = [...new Set([bottom, top, ...surface.openings.flatMap(opening => [Number(opening.sill), Number(opening.sill) + opening.height])])]
    .filter(value => value >= bottom && value <= top).sort((a,b) => a-b);
  const parts = [];
  for (let band = 0; band < levels.length - 1; band++) {
    const y1 = levels[band], y2 = levels[band + 1];
    const rows = balancedCells(y1, y2, panelWidth);
    if (!rows) throw narrowPanelError(surface.name);
    const active = surface.openings.filter(opening => Number(opening.sill) < (y1+y2)/2 && Number(opening.sill)+opening.height > (y1+y2)/2)
      .map(opening => [opening.x, opening.x+opening.width]).sort((a,b)=>a[0]-b[0]);
    const spans = [];
    let cursor = bounds.x;
    for (const [left,right] of active) { if (left > cursor + .001) spans.push([cursor,left]); cursor = Math.max(cursor,right); }
    if (cursor < bounds.x+bounds.width-.001) spans.push([cursor,bounds.x+bounds.width]);
    for (const [left,right] of spans) {
      const columns = balancedCells(left,right,panelLength);
      if (!columns) throw narrowPanelError(surface.name);
      for (const row of rows) for (const column of columns) {
        const shape = rect(column.x,row.x,column.width,row.width);
        const box = polygonBounds(shape);
        parts.push({ id: `${surface.id}-P${parts.length+1}`, surfaceId:surface.id, surface:surface.name,
          floor:surface.floor, thickness:surface.thickness, family:surface.family, shape, ...box,
          blankWidth:box.height, blankHeight:box.width, area:polygonAreaMm(shape), upperCourse:row.x>=bottom+panelLength });
      }
    }
  }
  return parts;
}

function mergeNarrowParts(parts, panelWidth, panelLength, label) {
  const result = [...parts];
  for (let attempts = 0; attempts < parts.length; attempts++) {
    const index = result.findIndex(part => Math.min(part.width,part.height) < MIN_PANEL_WIDTH_MM-.001);
    if (index < 0) return result;
    const thin = result[index];
    let best = null;
    for (let otherIndex=0; otherIndex<result.length; otherIndex++) {
      if (otherIndex===index) continue;
      const other=result[otherIndex];
      if (thin.x>other.x+other.width+.001 || other.x>thin.x+thin.width+.001 ||
          thin.y>other.y+other.height+.001 || other.y>thin.y+thin.height+.001) continue;
      const shape=clipping.union(thin.shape,other.shape);
      if (shape.length!==1) continue;
      const box=polygonBounds(shape[0]);
      if (box.width>panelWidth+.001 || box.height>panelLength+.001) continue;
      const score=box.width*box.height - thin.width*thin.height - other.width*other.height;
      if (!best || score<best.score) best={otherIndex,shape:shape[0],box,score};
    }
    if (!best) throw narrowPanelError(label);
    const survivor=result[best.otherIndex];
    result[best.otherIndex]={...survivor,shape:best.shape,...best.box,area:polygonAreaMm(best.shape),upperCourse:survivor.upperCourse||thin.upperCourse};
    result.splice(index,1);
  }
  if (result.some(part=>Math.min(part.width,part.height)<MIN_PANEL_WIDTH_MM-.001)) throw narrowPanelError(label);
  return result;
}

const mergeWalls = segments => {
  const groups = new Map();
  for (const [a, b] of segments) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!length) continue;
    let ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
    if (ux < -1e-8 || (Math.abs(ux) < 1e-8 && uy < 0)) { ux = -ux; uy = -uy; }
    const offset = -uy * a.x + ux * a.y, key = `${ux.toFixed(6)}:${uy.toFixed(6)}:${offset.toFixed(3)}`;
    if (!groups.has(key)) groups.set(key, { ux, uy, offset, spans: [] });
    const x = ux * a.x + uy * a.y, y = ux * b.x + uy * b.y;
    groups.get(key).spans.push([Math.min(x, y), Math.max(x, y)]);
  }
  const result = [];
  for (const { ux, uy, offset, spans } of groups.values()) {
    const merged = [];
    for (const span of spans.sort((a, b) => a[0] - b[0])) {
      const last = merged.at(-1);
      if (last && span[0] <= last[1] + 0.001) last[1] = Math.max(last[1], span[1]);
      else merged.push([...span]);
    }
    merged.forEach(([start, end]) => result.push([{ x: ux * start - uy * offset, y: uy * start + ux * offset }, { x: ux * end - uy * offset, y: uy * end + ux * offset }]));
  }
  return result;
};

// Each connected polygon is a separate labelled part, including concave cuts
// and holes. A stock blank is its bounding rectangle, never its net area.
export function tileSurface(surface, panelWidth, panelLength, step, staggered) {
  if (surface.blocked || !surface.geometry.length) return [];
  if (surface.layout?.direction === 'y' && !surface.horizontal && surface.openings?.length &&
      !presentNumber(surface.layout?.originX) && !presentNumber(surface.layout?.originY))
    return tileHorizontalWall(surface, panelWidth, panelLength);
  if (surface.layout?.direction === 'y' && !surface.transposed) {
    const swap = shape => shape.map(r => r.map(([x,y]) => [y,x]));
    const parts = tileSurface({ ...surface, transposed: true, geometry: surface.geometry.map(swap), layout: { ...surface.layout, originX: surface.layout.originY, originY: surface.layout.originX } }, panelWidth, panelLength, step, staggered);
    return parts.map(part => { const shape = swap(part.shape); return { ...part, blankWidth: part.width, blankHeight: part.height, shape, ...polygonBounds(shape) }; });
  }
  const bounds = polygonBounds(surface.geometry.flat());
  const width = Math.min(panelWidth, surface.layoutWidth || panelWidth, step);
  const cells = Math.ceil(bounds.width / width) * (Math.ceil(bounds.height / panelLength) + 1);
  if (cells > 10000) throw new Error(`${surface.name}: более 10 000 ячеек. Проверьте размеры и шаг.`);
  const parts = [];
  const originX = presentNumber(surface.layout?.originX) ? Number(surface.layout.originX) : bounds.x;
  const originY = presentNumber(surface.layout?.originY) ? Number(surface.layout.originY) : bounds.y;
  const firstColumn = Math.floor((bounds.x - originX) / width);
  const adaptive = !surface.horizontal && surface.openings?.length && !presentNumber(surface.layout?.originX)
    ? wallPanelColumns(bounds, width, surface.openings) : null;
  const firstX = originX + firstColumn * width;
  const columns = adaptive || (!presentNumber(surface.layout?.originX) ? balancedCells(bounds.x,bounds.x+bounds.width,width) : null) || Array.from({ length: Math.ceil((bounds.x + bounds.width - firstX) / width) }, (_, index) => ({
    x: originX + (firstColumn + index) * width, width, column: firstColumn + index,
  })).filter(item => item.x < bounds.x + bounds.width - 0.01);
  if (!columns.length) throw narrowPanelError(surface.name);
  for (let index = 0; index < columns.length; index++) {
    const { x, width: cellWidth } = columns[index];
    const column = columns[index].column ?? index;
    const shift = staggered && surface.horizontal && surface.staggered !== false && column % 2 ? panelLength / 2 : 0;
    const firstRow = Math.floor((bounds.y - originY + shift) / panelLength);
    const rows = !presentNumber(surface.layout?.originY) && !shift && !surface.horizontal
      ? balancedCells(bounds.y,bounds.y+bounds.height,panelLength)?.map((cell,i)=>({y:cell.x,height:cell.width,row:i}))
      : null;
    if (!rows && !surface.horizontal && !presentNumber(surface.layout?.originY) && !shift) throw narrowPanelError(surface.name);
    const rowCells = rows || Array.from({ length: Math.ceil((bounds.y+bounds.height-(originY+firstRow*panelLength-shift))/panelLength) }, (_,i)=>({y:originY+(firstRow+i)*panelLength-shift,height:panelLength,row:firstRow+i}));
    for (const {y,height,row} of rowCells) {
      const pieces = clipping.intersection(surface.geometry, rect(x, y, cellWidth, height));
      pieces.forEach((shape, fragment) => {
        const area = polygonAreaMm(shape);
        if (area < 1) return;
        const box = polygonBounds(shape);
        parts.push({ id: `${surface.id}-P${column + 1}.${row + 1}${fragment ? `.${fragment + 1}` : ''}`, surfaceId: surface.id, surface: surface.name, floor: surface.floor, thickness: surface.thickness, family: surface.family, shape, ...box, area, upperCourse: !surface.horizontal && row > 0 });
      });
    }
  }
  return mergeNarrowParts(parts,panelWidth,panelLength,surface.name);
}

// Group only truly identical local contours; position and wall name do not
// affect the fabrication shape, while thickness, family and handed cuts do.
export function groupPanels(parts = []) {
  const groups = new Map();
  const ringKey = (ring, x, y) => {
    const points = ring.at(-1)?.[0] === ring[0]?.[0] && ring.at(-1)?.[1] === ring[0]?.[1]
      ? ring.slice(0, -1) : ring;
    const local = points.map(([px, py]) => [round(px - x), round(py - y)]);
    const rotations = sequence => sequence.map((_, index) => JSON.stringify([...sequence.slice(index), ...sequence.slice(0,index)]));
    return [...rotations(local), ...rotations([...local].reverse())].sort()[0];
  };
  for (const part of parts) {
    const key = JSON.stringify([part.family, part.thickness, round(part.width), round(part.height),
      part.shape.map(ring => ringKey(ring, part.x, part.y)).sort()]);
    const group = groups.get(key);
    if (group) { group.qty++; group.instances.push(part.id); }
    else groups.set(key, { id: part.id, part, qty: 1, instances: [part.id] });
  }
  return [...groups.values()];
}

export function groupMembers(members = []) {
  const groups = new Map();
  for (const member of members) {
    const key = JSON.stringify([member.material,member.profile,round(member.length),round(member.cutLength),
      member.source,member.processing || '',member.nodeRef || '',member.excluded === true]);
    const group = groups.get(key);
    if (group) { group.qty++; group.instances.push(member); }
    else groups.set(key,{ id:member.id, member, qty:1, instances:[member] });
  }
  return [...groups.values()];
}

export function starterBoardPlan(surfaces = [], members = []) {
  return surfaces.filter(surface=>/^Э1-С\d+$/.test(surface.id) && !surface.blocked && surface.planStart && surface.planEnd).map(surface=>{
    const boards=members.filter(member=>member.surfaceId===surface.id && !member.excluded && !member.seam && member.a &&
      Math.abs(member.a[1])<.01 && Math.abs(member.b[1])<.01).map(member=>({
        id:member.id,start:Math.min(member.a[0],member.b[0]),end:Math.max(member.a[0],member.b[0]),
        length:round(Math.abs(member.b[0]-member.a[0])),cutLength:member.cutLength,profile:member.profile,
      })).sort((a,b)=>a.start-b.start);
    const openings=(surface.openings||[]).map(opening=>({id:opening.id,type:opening.type,
      start:opening.x,end:opening.x+opening.width,width:opening.width,sill:Number(opening.sill)||0,
      noBoard:opening.gap || Number(opening.sill)===0})).sort((a,b)=>a.start-b.start);
    return {id:surface.id,name:surface.name,start:surface.planStart,end:surface.planEnd,
      length:surface.width,boards,openings};
  });
}

// Split collinear edges at every endpoint. Shared seams are counted once,
// including T-joints of the staggered layout and edges interrupted by openings.
export function connectionSegments(parts, continuous = false) {
  const lines = new Map();
  for (const part of parts) for (const ring of part.shape) for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.01) continue;
    let ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length;
    if (ux < -1e-8 || (Math.abs(ux) < 1e-8 && uy < 0)) { ux = -ux; uy = -uy; }
    const offset = -uy * a[0] + ux * a[1];
    const key = `${ux.toFixed(6)}:${uy.toFixed(6)}:${offset.toFixed(3)}`;
    if (!lines.has(key)) lines.set(key, { ux, uy, offset, spans: [] });
    const start = ux * a[0] + uy * a[1], end = ux * b[0] + uy * b[1];
    lines.get(key).spans.push({ start: Math.min(start, end), end: Math.max(start, end), id: part.id });
  }
  const result = [];
  for (const { ux, uy, offset, spans } of lines.values()) {
    const lineStart = result.length;
    const stops = [...new Set(spans.flatMap(s => [round(s.start), round(s.end)]))].sort((a, b) => a - b);
    for (let i = 0; i < stops.length - 1; i++) {
      const start = stops[i], end = stops[i + 1], mid = (start + end) / 2;
      const adjacent = spans.filter(s => s.start < mid && s.end > mid).map(s => s.id);
      if (!adjacent.length || end - start < 0.01) continue;
      const segment = { a: [round(ux * start - uy * offset), round(uy * start + ux * offset)], b: [round(ux * end - uy * offset), round(uy * end + ux * offset)], length: Math.ceil(end - start - 0.001), seam: adjacent.length > 1, panels: [...new Set(adjacent)] };
      const previous = result.at(-1);
      if (continuous && result.length > lineStart && previous.seam === segment.seam && Math.hypot(previous.b[0]-segment.a[0], previous.b[1]-segment.a[1]) < .01) {
        previous.b = segment.b; previous.length = Math.ceil(Math.hypot(previous.b[0]-previous.a[0],previous.b[1]-previous.a[1])-.001); previous.panels = [...new Set([...previous.panels, ...segment.panels])];
      } else result.push(segment);
    }
  }
  return result;
}

export function packPanelBlanks(parts, stockWidth, stockLength, kerf = 0, allowRotation = false) {
  const sheets = [], unplaced = [];
  const sorted = [...parts].sort((a, b) => b.height - a.height || b.width - a.width || a.id.localeCompare(b.id));
  for (const part of sorted) {
    let width = Math.ceil(round(part.blankWidth ?? part.width)), height = Math.ceil(round(part.blankHeight ?? part.height)), rotated = false;
    if (allowRotation && height <= stockWidth && width <= stockLength && (width > stockWidth || height > stockLength || (width > height && sheets.some(s => s.material === `${part.family}/${part.thickness}` && s.shelves.some(sh => width <= sh.height && sh.used + kerf + height <= stockWidth))))) { [width, height] = [height, width]; rotated = true; }
    const material = `${part.family}/${part.thickness}`;
    if (width > stockWidth || height > stockLength) { unplaced.push(part.id); continue; }
    let placement;
    for (const sheet of sheets.filter(s => s.material === material)) {
      for (const shelf of sheet.shelves) if (height <= shelf.height && shelf.used + kerf + width <= stockWidth) {
        placement = { sheet, shelf, x: shelf.used + kerf }; break;
      }
      if (placement) break;
      const y = sheet.shelves.reduce((sum, s) => sum + s.height + kerf, 0);
      if (y + height <= stockLength) {
        const shelf = { y, height, used: 0 }; sheet.shelves.push(shelf); placement = { sheet, shelf, x: 0 }; break;
      }
    }
    if (!placement) {
      const shelf = { y: 0, height, used: 0 };
      const sheet = { id: `Л-${sheets.length + 1}`, material, thickness: part.thickness, family: part.family, shelves: [shelf], parts: [], width: stockWidth, height: stockLength };
      sheets.push(sheet); placement = { sheet, shelf, x: 0 };
    }
    const { sheet, shelf, x } = placement;
    sheet.parts.push({ id: part.id, x, y: shelf.y, width, height, rotated });
    shelf.used = x + width;
  }
  const remnants = sheets.flatMap(sheet => {
    const right = sheet.shelves.filter(s => stockWidth - s.used - kerf > 0).map(s => ({ sheet: sheet.id, x: s.used + kerf, y: s.y, width: stockWidth - s.used - kerf, height: s.height }));
    const y = sheet.shelves.reduce((sum,s)=>sum+s.height+kerf,0);
    return [...right, ...(y < stockLength ? [{ sheet: sheet.id, x:0, y, width:stockWidth, height:stockLength-y }] : [])];
  });
  const stockArea = sheets.length * stockWidth * stockLength;
  return { sheets, unplaced, remnants, wastePercent: stockArea ? 100 * (1 - parts.filter(p => !unplaced.includes(p.id)).reduce((sum,p)=>sum+(p.area ?? p.width*p.height),0)/stockArea) : 0 };
}

export function packMembers(members, stockLength, kerf) {
  const bars = [], unplaced = [];
  for (const part of [...members].sort((a, b) => b.cutLength - a.cutLength || a.id.localeCompare(b.id))) {
    if (part.cutLength > stockLength) { unplaced.push(part.id); continue; }
    const candidates = bars.filter(b => b.profile === part.profile && b.material === part.material && b.used + kerf + part.cutLength <= stockLength).sort((a, b) => b.used - a.used);
    let bar = candidates[0];
    if (!bar) { bar = { id: `Х-${bars.length + 1}`, profile: part.profile, material: part.material, used: 0, parts: [] }; bars.push(bar); }
    const start = bar.used + (bar.parts.length ? kerf : 0);
    bar.parts.push({ id: part.id, start, length: part.cutLength }); bar.used = start + part.cutLength;
  }
  return { bars, unplaced };
}

export function calculateProductionCutting(project, calculation) {
  const settings = normalizeProductionCutting(project.settings?.productionCutting);
  validateProductionSettings(settings);
  const f = project.settings?.formulas || {}, sip = project.settings?.sip || {}, services = project.services || {};
  const panelWidth = mm(f.panelWidth || 1.25), panelLength = mm(f.panelLength || 2.5);
  if (!(panelWidth >= 100 && panelWidth <= 10000 && panelLength >= 100 && panelLength <= 20000)) throw new Error('Проверьте формат панели в формулах проекта: ширина 100–10 000 мм, длина 100–20 000 мм.');
  const surfaces = [], issues = [], openings = [], walls = [];
  const issue = (code, message, target = '') => issues.push({ code, message, target });
  if (settings.kerfMm === '') issue('KERF', 'Укажите ширину пропила оборудования, мм.');
  if (settings.endAllowanceMm === '') issue('ALLOWANCE', 'Укажите припуск на каждый торец соединительного элемента, мм (0 — без припуска).');
  const plans = calculation.metrics?.floorPlans?.map(item => item.plan) || [project.plan];
  const addSurface = data => {
    const surface = { family: 'pps', ...data };
    surface.layoutKey = `${surface.id}:${cuttingRevision([surface.geometry, surface.planStart, surface.planEnd])}`;
    surface.layout = settings.layouts[surface.layoutKey] || {};
    for (const key of ['originX', 'originY', 'step']) if (presentNumber(surface.layout[key]) && (Math.abs(Number(surface.layout[key])) > 100000 || (key === 'step' && (Number(surface.layout[key]) < 100 || Number(surface.layout[key]) > 2500)))) throw new Error(`${surface.id}: недопустимая сетка раскладки`);
    if (presentNumber(surface.layout.step)) surface.layoutWidth = Number(surface.layout.step);
    surface.effectiveStep = Math.min(panelWidth, surface.layoutWidth || settings.frameStepMm);
    surfaces.push(surface); return surface;
  };
  plans.forEach((plan, floorIndex) => {
    const floor = floorIndex + 1, contour = houseContourPoints(plan), shape = polygon(contour);
    if (plan.house?.contourDefined === false) { issue('CONTOUR', `${floor} этаж: задайте контур дома на плане.`); return; }
    const h = mm(plan.wallHeight);
    const edges = contour.map((a, i) => ({ a, b: contour[(i + 1) % contour.length], id: `Э${floor}-С${i + 1}`, outer: true }));
    if (services.partitions && sip.partitionType === 'sip') {
      const segments = mergeWalls([...unifiedWallSegments({ ...plan, rooms: (plan.rooms || []).filter(r => r.include !== false) }).map(lineEndpoints), ...(plan.walls || []).filter(w => w.include !== false).map(w => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }])]);
      const seen = new Set();
      segments.forEach(([a, b], i) => { const key = [a, b].map(p => `${mm(p.x)},${mm(p.y)}`).sort().join(':'); if (!seen.has(key)) { edges.push({ a, b, id: `Э${floor}-ПГ${i + 1}`, outer: false }); seen.add(key); } });
    }
    const assigned = new Map(edges.map(edge => [edge.id, []]));
    const blockedWalls = new Set();
    for (const opening of [...(plan.openings || []), ...(plan.wallGaps || []).map(gap => ({ ...gap, type: 'gap', height: plan.wallHeight }))].filter(o => o.include !== false && o.subtractFromSip !== false)) {
      const outer = typeof opening.outer === 'boolean' ? opening.outer : null;
      if ((outer === true && !services.sipWalls) || (outer === false && (!services.partitions || sip.partitionType !== 'sip'))) continue;
      const eligible = edges.filter(edge => (outer == null || edge.outer === outer) && (!edge.outer || services.sipWalls));
      const choices = eligible.filter(edge => opening.orientation === 'h' ? Math.abs(edge.a.y - edge.b.y) < .001 : opening.orientation === 'v' ? Math.abs(edge.a.x - edge.b.x) < .001 : true).map(edge => {
        const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y, length = Math.hypot(dx, dy);
        const u = length ? ((opening.x - edge.a.x) * dx + (opening.y - edge.a.y) * dy) / length : 0;
        const distance = Math.hypot(opening.x - edge.a.x - Math.max(0, Math.min(length, u)) * dx / (length || 1), opening.y - edge.a.y - Math.max(0, Math.min(length, u)) * dy / (length || 1));
        return { edge, u, distance };
      }).sort((a, b) => a.distance - b.distance);
      const nearest = choices[0], key = `${floor}:${opening.id}`;
      const sillValue = opening.type === 'gap' ? 0 : settings.openingSills[key] ?? (presentNumber(opening.sillHeight) ? mm(opening.sillHeight) : opening.type === 'door' ? 0 : settings.windowSillMm);
      const row = { key, id: opening.id, type: opening.type, gap: opening.type === 'gap', name: `${floor} этаж · ${opening.type === 'window' ? 'Окно' : opening.type === 'gap' ? 'Разрыв' : 'Проём'} ${opening.id}`, sill: sillValue, width: mm(opening.width), height: mm(opening.height), wallId: nearest?.edge.id };
      if (!row.gap) openings.push(row);
      if (!nearest || nearest.distance > Math.max(Number(plan.wallThickness) || 0.174, 0.1) + 0.03 || (choices[1] && Math.abs(choices[1].distance - nearest.distance) < .001)) {
        issue('OPENING_WALL', `${row.name}: стена не найдена или привязка неоднозначна. Раскрой возможных стен заблокирован; уточните положение и ориентацию на плане.`, key);
        eligible.forEach(edge => blockedWalls.add(edge.id)); continue;
      }
      assigned.get(nearest.edge.id).push({ ...row, x: mm(nearest.u) - row.width / 2 });
    }
    for (const edge of edges) {
      if (edge.outer && !services.sipWalls) continue;
      const wallKey = `${edge.id}@${mm(edge.a.x)},${mm(edge.a.y)}:${mm(edge.b.x)},${mm(edge.b.y)}`;
      const addition = Number(settings.wallAdditions[wallKey]) || 0;
      const height = h + addition, width = mm(Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y));
      const holes = [], selectedOpenings = assigned.get(edge.id); let blocked = blockedWalls.has(edge.id);
      walls.push({ id: edge.id, key: wallKey, name: `${edge.outer ? 'Стена' : 'Перегородка'} ${edge.id}`, floor, baseHeight: h, addition });
      if (height <= 0 || width <= 0 || height > 30000 || width > 100000 || addition < 0) { issue('WALL_SIZE', `${edge.id}: проверьте размеры стены и добавочную высоту.`, edge.id); continue; }
      for (const o of selectedOpenings) {
        if (o.gap) o.height = height;
        const displayRow = openings.find(row => row.key === o.key);
        if (displayRow) displayRow.topClearance = height - Number(o.sill) - o.height;
        if (!presentNumber(o.sill) || Number(o.sill) < 0) { issue('OPENING_SILL', `${o.name}: укажите отметку низа от пола. Развёртка ${edge.id} ожидает данные.`, o.key); blocked = true; continue; }
        if (o.width <= 0 || o.height <= 0 || o.x < -1 || o.x + o.width > width + 1 || Number(o.sill) + o.height > height + 1) { issue('OPENING_SIZE', `${o.name}: проём выходит за стену или имеет неверный размер.`, o.key); blocked = true; continue; }
        const hole = rect(o.x, Number(o.sill), o.width, o.height);
        if (holes.some(previous => clipping.intersection(previous, hole).reduce((sum, poly) => sum + polygonAreaMm(poly), 0) > 1)) {
          issue('OPENING_OVERLAP', `${edge.id}: проёмы пересекаются. Исправьте их положение до раскроя.`, edge.id); blocked = true;
        }
        holes.push(hole);
      }
      const geometry = subtract(rect(0, 0, width, height), holes);
      addSurface({ id: edge.id, name: `${edge.outer ? 'Стена' : 'Перегородка'} ${edge.id}`, floor, horizontal: false, planStart: [mm(edge.a.x), mm(edge.a.y)], planEnd: [mm(edge.b.x), mm(edge.b.y)], thickness: Number(edge.outer ? sip.wallThickness : sip.partitionThickness), family: edge.outer ? sip.wallPanelFamily : sip.partitionPanelFamily, geometry, width, height, blocked, openings: selectedOpenings });
    }
    if ((floorIndex === 0 && services.sipFloor) || (floorIndex > 0 && services.sipSecondFloor)) {
      const hole = plan.floorOpening;
      const holes = floorIndex > 0 && Number(hole?.width) > 0 && Number(hole?.length) > 0 ? [rect(mm(hole.x), mm(hole.y), mm(hole.width), mm(hole.length))] : [];
      const blocked = holes.some(h => clipping.difference(h, shape).reduce((sum, poly) => sum + polygonAreaMm(poly), 0) > 1) || (floorIndex > 0 && ((Number(hole?.width) > 0) !== (Number(hole?.length) > 0)));
      if (blocked) issue('STAIR_BOUNDS', `${floor} этаж: лестничный проём имеет неполный размер или выходит за контур. Перекрытие заблокировано.`, `Э${floor}-ПОЛ`);
      addSurface({ id: `Э${floor}-ПОЛ`, name: `${floor} этаж · ${floorIndex ? 'Межэтажное перекрытие' : 'Пол'}`, floor, horizontal: true, thickness: Number(floorIndex ? sip.secondFloorThickness : sip.floorThickness), family: floorIndex ? sip.secondFloorPanelFamily : sip.floorPanelFamily, layoutWidth: mm(floorIndex ? sip.secondFloorPanelWidth : sip.floorPanelWidth), geometry: subtract(shape, holes), blocked });
    }
    if (floorIndex === plans.length - 1 && services.sipCeiling) {
      let blocked = false;
      const holes = (plan.rooms || []).filter(r => r.include !== false && ['open', 'open-rafter'].includes(r.ceilingMode)).flatMap(r => {
        const hole = polygon(roomPoints(r)), area = polygonAreaMm(hole) / 1e6;
        if (r.openCeilingArea != null && Number(r.openCeilingArea) === 0) return [];
        if (r.openCeilingArea != null && Number(r.openCeilingArea) < area - 0.001) { blocked = true; issue('CEILING_OPENING', `${floor} этаж: у комнаты «${r.name || r.id}» задана только площадь открытого потолка. Укажите его контур в рабочем проекте.`); return []; }
        if (clipping.difference(hole, shape).length || (r.openCeilingArea != null && Number(r.openCeilingArea) > area + .001)) { blocked = true; issue('CEILING_BOUNDS', `${floor} этаж: открытый потолок комнаты «${r.name || r.id}» выходит за контур или площадь превышает комнату.`); return []; }
        return [hole];
      });
      addSurface({ id: `Э${floor}-ПТ`, name: `${floor} этаж · Потолок`, floor, horizontal: true, thickness: Number(sip.ceilingThickness), family: sip.ceilingPanelFamily, layoutWidth: mm(sip.ceilingPanelWidth), geometry: subtract(shape, holes), blocked });
    }
    if ((plan.rooms || []).some(room => room.extension && room.include !== false)) issue('COMPLEX_PLAN', `${floor} этаж: пристроенные помещения требуют отдельной карты — внесите детали вручную.`, `floor-${floor}`);
  });
  const roof = calculation.roof || {};
  const wallKeys = new Set(walls.map(wall => wall.key));
  if (Object.entries(settings.wallAdditions).some(([key, value]) => Number(value) && !wallKeys.has(key))) issue('STALE_HEIGHT', 'Контур стен изменился: часть сохранённых добавочных высот больше не привязана к стенам и не применяется. Перепроверьте высоты в исходных данных.');
  const roofSettings = project.settings?.roof || {}, roofGeometry = roof.geometry;
  if (services.roof && roofGeometry && plans.at(-1).house?.contourDefined !== false) {
    const shape = polygon(houseContourPoints(plans.at(-1))), bounds = polygonBounds(shape);
    const rectangular = Math.abs(polygonAreaMm(shape) - bounds.width * bounds.height) < 1;
    const addRoof = (id, name, shape, thickness = sip.ceilingThickness, horizontal = true) => addSurface({ id, name, floor: plans.length, horizontal, staggered: false, thickness: Number(thickness), family: horizontal ? sip.ceilingPanelFamily : sip.wallPanelFamily, geometry: clipping.union(shape), layoutWidth: mm(roof.sipFrameStep || f.panelWidth || 1.25) });
    if (roof.mainRoofShape === 'tiered' && rectangular && Number(roof.warmSlopeArea) > 0) {
      const settings = roofSettings.tiered || {};
      const warmLevel = settings.warmLevel || 'upper';
      const warmLevels = roofSettings.type === 'sip' || warmLevel === 'both' ? ['upper', 'lower'] : [warmLevel];
      for (const level of warmLevels) {
        const length = mm(roofGeometry.roofLength);
        const slope = mm(roofGeometry[`${level}SlopeLength`]);
        addRoof(`КР-${level === 'upper' ? 'В' : 'Н'}`, `Кровля · ${level === 'upper' ? 'верхний' : 'нижний'} односкатный уровень`, rect(0, 0, length, slope));
      }
      if (Number(roof.warmSlopeArea) < warmLevels.reduce((sum,level)=>sum+Number(roofGeometry[`${level}Area`]||0),0)-0.01)
        issue('ROOF_OPEN', 'На SIP-скатах есть открытые участки. Для вычета из раскроя задайте их точные контуры в рабочем проекте.');
    } else if (roofSettings.type === 'sip' && rectangular) {
      const length = mm(roofGeometry.roofLength), span = mm(roofGeometry.roofSpan), slope = mm(roofGeometry.slopeLength);
      if (roof.mainRoofShape === 'hip') {
        const ridge = mm(roofGeometry.ridgeLength), inset = (length - ridge) / 2;
        for (let i = 1; i <= 2; i++) {
          addRoof(`КР-С${i}`, `Кровля · трапециевидный скат ${i}`, [[[0,0],[length,0],[length-inset,slope],[inset,slope],[0,0]]]);
          addRoof(`КР-В${i}`, `Кровля · вальма ${i}`, [[[0,0],[span,0],[span/2,slope],[0,0]]]);
        }
      } else for (let i = 1; i <= (roof.mainRoofShape === 'flat' ? 1 : 2); i++) addRoof(`КР-С${i}`, `Кровля · скат ${i}`, rect(0, 0, length, slope));
    } else if (roofSettings.type === 'sip' || Number(roof.warmSlopeArea) > 0) issue('ROOF', 'Комбинированная или контурная SIP-кровля: нужны границы тёплых скатов и ендов из рабочего проекта. Автоматический раскрой этих скатов пока не сформирован.');
    if (roof.mainRoofShape === 'tiered' && roof.tieredGables?.zones.some(zone => zone.type === 'sip')) {
      if (!rectangular) issue('GABLE', 'Г-образный контур: геометрию фронтонов и перепада уровней требуется уточнить в рабочем проекте.');
      else for (const zone of roof.tieredGables.zones.filter(item => item.type === 'sip')) {
        if (Math.abs(zone.area-zone.calculatedArea)>0.01) { issue('GABLE', `${zone.label}: проектная площадь отличается от геометрической. Автоматическая развёртка не создана.`); continue; }
        const width = mm(zone.internal ? roofGeometry.junctionLength : zone.key.startsWith('upper') ? roofGeometry.upperSpan : roofGeometry.lowerSpan);
        const height = mm(zone.internal ? roofGeometry.stepHeight : zone.key.startsWith('upper') ? roofGeometry.upperRise : roofGeometry.lowerRise);
        if (!width || !height) continue;
        const geometry = zone.internal ? rect(0,0,width,height) : [[[0,0],[width,0],[width,height],[0,0]]];
        addRoof(`ФР-${zone.key}`, zone.label, geometry, sip.wallThickness, false);
      }
    } else if (roof.mainGableType === 'sip') {
      if (rectangular && roof.mainRoofShape === 'gable') {
        const height = mm(roofSettings.ridgeHeight), span = roof.ridgeAxis === 'y' ? bounds.width : bounds.height;
        for (let i = 1; i <= Math.min(2, Number(roofSettings.gableCount) || 0); i++) addRoof(`ФР-${i}`, `Фронтон ${i}`, [[[0,0],[span,0],[span/2,height],[0,0]]], sip.wallThickness, false);
      } else issue('GABLE', 'Фронтоны сложной или односкатной кровли: требуются отдельные развёртки и проёмы.');
    }
  }
  if ((project.plan.platforms || []).some(p => p.include !== false)) issue('PLATFORMS', 'Пристройки: задайте их производственные детали вручную по конструктивному проекту.');
  const parts = [];
  for (const surface of surfaces) {
    try { parts.push(...tileSurface(surface, panelWidth, panelLength, surface.layoutWidth || settings.frameStepMm, settings.staggered)); }
    catch (error) {
      if (error.code !== 'MIN_PANEL_WIDTH') throw error;
      surface.blocked = true;
      issue(error.code, error.message, surface.id);
    }
  }
  const manualIds = new Set();
  for (const item of settings.manualPanels) {
    try {
      if (!item?.id || manualIds.has(item.id)) throw new Error('Нет уникальной марки');
      manualIds.add(item.id);
      const shape = parseManualPanel(item), quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Количество: целое от 1 до 100');
      const outer = [shape[0]], holes = shape.slice(1).map(r => [r]);
      if (holes.some(h => clipping.difference(h, outer).length)) throw new Error('Вырез выходит за внешний контур');
      for(let i=0;i<holes.length;i++) for(let j=i+1;j<holes.length;j++) if(clipping.intersection(holes[i],holes[j]).length) throw new Error('Вырезы пересекаются');
      const geometry = subtract(outer, holes);
      if (geometry.length !== 1 || polygonAreaMm(geometry[0]) < 1) throw new Error('Панель должна быть одной связной деталью ненулевой площади');
      for (let i=0;i<quantity;i++) {
        const id = `РП-${item.id}-${i+1}`;
        addSurface({ id, name: item.name, thickness: Number(item.thickness), family: item.family, geometry, horizontal: true, manual: true });
        parts.push({ id: `${id}-P1`, surfaceId: id, surface: item.name, thickness: Number(item.thickness), family: item.family, shape: geometry[0], ...polygonBounds(geometry[0]), area: polygonAreaMm(geometry[0]), upperCourse: false });
      }
    } catch (error) { issue('MANUAL_PANEL', `Ручная панель ${item?.name || ''}: ${error.message}`); }
  }
  const activeLayouts = new Set(surfaces.map(s=>s.layoutKey));
  if (Object.keys(settings.layouts).some(key=>!activeLayouts.has(key))) issue('STALE_LAYOUT', 'Геометрия изменилась: часть индивидуальных сеток не применяется. Проверьте и сбросьте устаревшие настройки.');
  const members = [];
  const overrideKeys = new Set(), profileMismatches = new Set();
  for (const surface of surfaces) {
    const segments = connectionSegments(parts.filter(part => part.surfaceId === surface.id), settings.continuousMembers);
    const profile = sipTimberProfile(surface.thickness);
    const jambs = !surface.blocked && !surface.horizontal && surface.openings?.length ? surface.openings.filter(opening => !opening.gap && ['window','door'].includes(opening.type))
      .flatMap(opening => [{opening,side:'left',x:opening.x},{opening,side:'right',x:opening.x+opening.width}]) : [];
    segments.forEach((segment, i) => {
      const id = `${surface.id}-${segment.seam ? 'Ш' : 'Т'}${i + 1}`;
      const key = `${surface.layoutKey}:${cuttingRevision([segment.a, segment.b, segment.seam, surface.thickness, sip.connectorType])}`;
      overrideKeys.add(key);
      const override = settings.memberOverrides[key] || {};
      const estimateProfile = segment.seam ? sip.connectorType === 'solid' ? `${profile.core}×100` : `${profile.thermalDepth}×95` : `${profile.endBoardDepth}×45`;
      const savedProfile = `${profile.thermalDepth}×${segment.seam ? settings.splineWidthMm : settings.edgeWidthMm}`;
      const selectedProfile = override.profile?.trim() || (settings.profileMode === 'estimate' ? estimateProfile : savedProfile);
      if (selectedProfile !== estimateProfile) profileMismatches.add(`${selectedProfile} ↔ ${estimateProfile}`);
      const length = presentNumber(override.length) ? Number(override.length) : segment.length;
      if (!(length > 0 && length <= 100000)) { issue('MEMBER_OVERRIDE', `${id}: неверная длина`, key); return; }
      if ((override.exclude || override.profile || presentNumber(override.length)) && !override.nodeRef?.trim()) issue('MEMBER_NODE', `${id}: для изменения или исключения укажите рабочий узел`, key);
      const replacedByJamb = jambs.some(jamb => Math.abs(segment.a[0]-jamb.x)<.01 && Math.abs(segment.b[0]-jamb.x)<.01);
      members.push({ ...segment, id, key, excluded: override.exclude === true || replacedByJamb, replacedByJamb, nodeRef: override.nodeRef || '', processing: override.processing || '', geometricLength: segment.length, length, surface: surface.name, surfaceId: surface.id, material: segment.seam ? ({ thermal: 'Термобрус', 'board-pack': 'Клеёный пакет', solid: 'Брус' }[sip.connectorType] || 'Соединительная шпонка') : 'Торцевая / обрамляющая доска', profile: selectedProfile, estimateProfile, cutLength: length + 2 * Number(settings.endAllowanceMm || 0), source: replacedByJamb ? 'Заменено полной стойкой проёма' : segment.seam ? 'Шов панелей' : 'Открытая кромка / проём' });
    });
    for (const [jambIndex,jamb] of jambs.entries()) {
      const id=`${surface.id}-С${jambIndex+1}-${jamb.side}-${round(jamb.x)}`;
      const key=`${surface.layoutKey}:jamb:${jamb.opening.key}:${jamb.side}:${round(jamb.x)}`;
      overrideKeys.add(key);
      const override=settings.memberOverrides[key] || {};
      const estimateProfile=`${profile.endBoardDepth}×45`;
      const savedProfile=`${profile.thermalDepth}×${settings.edgeWidthMm}`;
      const selectedProfile=override.profile?.trim() || (settings.profileMode==='estimate' ? estimateProfile : savedProfile);
      if (selectedProfile!==estimateProfile) profileMismatches.add(`${selectedProfile} ↔ ${estimateProfile}`);
      const geometricLength=surface.height;
      const length=presentNumber(override.length) ? Number(override.length) : geometricLength;
      if (!(length>0 && length<=100000)) { issue('MEMBER_OVERRIDE',`${id}: неверная длина`,key); continue; }
      if ((override.exclude || override.profile || presentNumber(override.length)) && !override.nodeRef?.trim()) issue('MEMBER_NODE',`${id}: для изменения или исключения укажите рабочий узел`,key);
      const a=[round(jamb.x),0], b=[round(jamb.x),surface.height];
      members.push({id,key,a,b,length,geometricLength,cutLength:length+2*Number(settings.endAllowanceMm||0),
        material:'Стойка проёма',source:'Стойка проёма',openingRef:`${jamb.opening.type==='window'?'Окно':'Дверь'} ${jamb.opening.id} · ${jamb.side==='left'?'левая':'правая'}`,
        role:'jamb',profile:selectedProfile,estimateProfile,excluded:override.exclude===true,
        nodeRef:override.nodeRef||'',processing:override.processing||'',surface:surface.name,surfaceId:surface.id,
        panels:parts.filter(part=>part.surfaceId===surface.id && (Math.abs(part.x-jamb.x)<.01 || Math.abs(part.x+part.width-jamb.x)<.01)).map(part=>part.id)});
    }
  }
  if (Object.keys(settings.memberOverrides).some(key=>!overrideKeys.has(key))) issue('STALE_MEMBER', 'Часть правок соединителей устарела после изменения геометрии/типа соединителя и не применяется.');
  const notices = [...profileMismatches].map(value => `Сечение раскроя / сметы: ${value} мм. Смета не изменена; подтвердите проектный профиль.`);
  const ids = new Set(); let manualCount = 0;
  for (const item of settings.manualParts) {
    if (ids.has(item.id)) { issue('MANUAL_ID', `Повторная марка ручной детали: ${item.id}`); continue; } ids.add(item.id);
    if (!item.name?.trim() || !item.profile?.trim() || !(Number(item.length) > 0) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 1000) { issue('MANUAL', 'Ручная деталь: заполните название, сечение, длину и целое количество от 1 до 1000.', item.id); continue; }
    const quantity = Math.min(1000, Math.floor(Number(item.quantity)));
    manualCount += quantity;
    if (manualCount > 10000) { issue('MANUAL_LIMIT', 'Более 10 000 ручных деталей: разделите комплект на партии.'); break; }
    for (let i = 0; i < quantity; i++) members.push({ id: `Р-${item.id}-${i + 1}`, material: item.name.trim(), profile: item.profile.trim(), length: Number(item.length), cutLength: Number(item.length) + 2 * Number(settings.endAllowanceMm || 0), source: 'Ручная деталь', surface: 'Спецузлы', panels: [] });
  }
  const panelStock = packPanelBlanks(parts, panelWidth, panelLength, Number(settings.kerfMm || 0), settings.allowRotation);
  const timberStock = packMembers(members.filter(m=>!m.excluded), settings.stockLengthMm, Number(settings.kerfMm || 0));
  if (panelStock.unplaced.length) issue('PANEL_SIZE', `Не помещаются в заготовку: ${panelStock.unplaced.join(', ')}`);
  if (timberStock.unplaced.length) issue('MEMBER_SIZE', `Длиннее хлыста: ${timberStock.unplaced.join(', ')}. Нужен проект стыковки или другая длина заготовки.`);
  if (!surfaces.length && !members.length) issue('EMPTY', 'Нет включённых SIP-конструкций. Задайте план и состав домокомплекта.');
  const { approval, ...revisionSettings } = settings;
  const revision = cuttingRevision({ plans, sip, services, formulas: f, roof: roofSettings, settings: revisionSettings, nodes: project.nodes, construction: project.construction, estimate: calculation.lines, reviewer: approval.reviewer || '', nodeRef: approval.nodeRef || '' });
  const report = { settings, revision, panelWidth, panelLength, surfaces, parts, panelGroups: groupPanels(parts), members, memberGroups:groupMembers(members), starterBoards:starterBoardPlan(surfaces,members), openings, walls, issues, notices, panelStock, timberStock, netArea: parts.reduce((sum, part) => sum + part.area, 0) / 1e6, upperCourseCount: parts.filter(part => part.upperCourse).length };
  report.reconciliation = reconcileCutting(report, calculation);
  report.approvalStatus = approval.revision === revision && !issues.length && approval.reviewer?.trim() && approval.nodeRef?.trim() && ['geometry','nodes','released'].includes(approval.status) ? approval.status : 'draft';
  return report;
}
