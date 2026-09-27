import clipping from 'polygon-clipping';
import { houseContourPoints, roomPoints, unifiedWallSegments, lineEndpoints } from '../planner/geometry.js';
import { sipTimberProfile } from './sip-joinery.js';
import { normalizeProductionCutting } from '../state/production-cutting.js';

const mm = value => Math.round((Number(value) || 0) * 1000);
const round = value => Math.round(value * 1000) / 1000;
const rect = (x, y, w, h) => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
const polygon = points => [points.map(p => [mm(p.x), mm(p.y)])];
const presentNumber = value => value !== '' && value != null && Number.isFinite(Number(value));
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
  const bounds = polygonBounds(surface.geometry.flat());
  const width = Math.min(panelWidth, surface.layoutWidth || panelWidth, step);
  const cells = Math.ceil(bounds.width / width) * (Math.ceil(bounds.height / panelLength) + 1);
  if (cells > 10000) throw new Error(`${surface.name}: более 10 000 ячеек. Проверьте размеры и шаг.`);
  const parts = [];
  for (let column = 0; column * width < bounds.width - 0.01; column++) {
    const x = bounds.x + column * width;
    const shift = staggered && surface.horizontal && surface.staggered !== false && column % 2 ? panelLength / 2 : 0;
    for (let row = 0, y = bounds.y - shift; y < bounds.y + bounds.height - 0.01; y += panelLength, row++) {
      const pieces = clipping.intersection(surface.geometry, rect(x, y, width, panelLength));
      pieces.forEach((shape, fragment) => {
        const area = polygonAreaMm(shape);
        if (area < 1) return;
        const box = polygonBounds(shape);
        parts.push({ id: `${surface.id}-P${column + 1}.${row + 1}${fragment ? `.${fragment + 1}` : ''}`, surfaceId: surface.id, surface: surface.name, floor: surface.floor, thickness: surface.thickness, family: surface.family, shape, ...box, area, upperCourse: !surface.horizontal && row > 0 });
      });
    }
  }
  return parts;
}

// Split collinear edges at every endpoint. Shared seams are counted once,
// including T-joints of the staggered layout and edges interrupted by openings.
export function connectionSegments(parts) {
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
    const stops = [...new Set(spans.flatMap(s => [round(s.start), round(s.end)]))].sort((a, b) => a - b);
    for (let i = 0; i < stops.length - 1; i++) {
      const start = stops[i], end = stops[i + 1], mid = (start + end) / 2;
      const adjacent = spans.filter(s => s.start < mid && s.end > mid).map(s => s.id);
      if (!adjacent.length || end - start < 0.01) continue;
      result.push({ a: [round(ux * start - uy * offset), round(uy * start + ux * offset)], b: [round(ux * end - uy * offset), round(uy * end + ux * offset)], length: Math.ceil(end - start - 0.001), seam: adjacent.length > 1, panels: [...new Set(adjacent)] });
    }
  }
  return result;
}

export function packPanelBlanks(parts, stockWidth, stockLength, kerf = 0) {
  const sheets = [], unplaced = [];
  const sorted = [...parts].sort((a, b) => b.height - a.height || b.width - a.width || a.id.localeCompare(b.id));
  for (const part of sorted) {
    const width = Math.ceil(round(part.width)), height = Math.ceil(round(part.height));
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
    sheet.parts.push({ id: part.id, x, y: shelf.y, width, height });
    shelf.used = x + width;
  }
  return { sheets, unplaced };
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
  const f = project.settings?.formulas || {}, sip = project.settings?.sip || {}, services = project.services || {};
  const panelWidth = mm(f.panelWidth || 1.25), panelLength = mm(f.panelLength || 2.5);
  if (!(panelWidth >= 100 && panelWidth <= 10000 && panelLength >= 100 && panelLength <= 20000)) throw new Error('Проверьте формат панели в формулах проекта: ширина 100–10 000 мм, длина 100–20 000 мм.');
  const surfaces = [], issues = [], openings = [], walls = [];
  const issue = (code, message, target = '') => issues.push({ code, message, target });
  if (settings.kerfMm === '') issue('KERF', 'Укажите ширину пропила оборудования, мм.');
  if (settings.endAllowanceMm === '') issue('ALLOWANCE', 'Укажите припуск на каждый торец соединительного элемента, мм (0 — без припуска).');
  const plans = calculation.metrics?.floorPlans?.map(item => item.plan) || [project.plan];
  const addSurface = data => { const surface = { family: 'pps', ...data }; surfaces.push(surface); return surface; };
  plans.forEach((plan, floorIndex) => {
    const floor = floorIndex + 1, contour = houseContourPoints(plan), shape = polygon(contour);
    if (plan.house?.contourDefined === false) { issue('CONTOUR', `${floor} этаж: задайте контур дома на плане.`); return; }
    const h = mm(plan.wallHeight);
    const edges = contour.map((a, i) => ({ a, b: contour[(i + 1) % contour.length], id: `Э${floor}-С${i + 1}`, outer: true }));
    if (services.partitions && sip.partitionType === 'sip') {
      const segments = mergeWalls([...unifiedWallSegments(plan).map(lineEndpoints), ...(plan.walls || []).filter(w => w.include !== false).map(w => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }])]);
      const seen = new Set();
      segments.forEach(([a, b], i) => { const key = [a, b].map(p => `${mm(p.x)},${mm(p.y)}`).sort().join(':'); if (!seen.has(key)) { edges.push({ a, b, id: `Э${floor}-ПГ${i + 1}`, outer: false }); seen.add(key); } });
    }
    const assigned = new Map(edges.map(edge => [edge.id, []]));
    for (const opening of [...(plan.openings || []), ...(plan.wallGaps || []).map(gap => ({ ...gap, type: 'gap', height: plan.wallHeight }))].filter(o => o.include !== false && o.subtractFromSip !== false)) {
      const outer = opening.outer !== false;
      if ((outer && !services.sipWalls) || (!outer && (!services.partitions || sip.partitionType !== 'sip'))) continue;
      const choices = edges.filter(edge => edge.outer === outer).map(edge => {
        const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y, length = Math.hypot(dx, dy);
        const u = length ? ((opening.x - edge.a.x) * dx + (opening.y - edge.a.y) * dy) / length : 0;
        const distance = Math.hypot(opening.x - edge.a.x - Math.max(0, Math.min(length, u)) * dx / (length || 1), opening.y - edge.a.y - Math.max(0, Math.min(length, u)) * dy / (length || 1));
        return { edge, u, distance };
      }).sort((a, b) => a.distance - b.distance);
      const nearest = choices[0], key = `${floor}:${opening.id}`;
      const sillValue = opening.type === 'gap' ? 0 : settings.openingSills[key] ?? (presentNumber(opening.sillHeight) ? mm(opening.sillHeight) : opening.type === 'door' ? 0 : '');
      const row = { key, id: opening.id, gap: opening.type === 'gap', name: `${floor} этаж · ${opening.type === 'window' ? 'Окно' : opening.type === 'gap' ? 'Разрыв' : 'Проём'} ${opening.id}`, sill: sillValue, width: mm(opening.width), height: mm(opening.height), wallId: nearest?.edge.id };
      if (!row.gap) openings.push(row);
      if (!nearest || nearest.distance > Math.max(Number(plan.wallThickness) || 0.174, 0.1) + 0.03) { issue('OPENING_WALL', `${row.name}: не найдена стена. Уточните положение на плане.`, key); continue; }
      assigned.get(nearest.edge.id).push({ ...row, x: mm(nearest.u) - row.width / 2 });
    }
    for (const edge of edges) {
      if (edge.outer && !services.sipWalls) continue;
      const wallKey = `${edge.id}@${mm(edge.a.x)},${mm(edge.a.y)}:${mm(edge.b.x)},${mm(edge.b.y)}`;
      const addition = Number(settings.wallAdditions[wallKey]) || 0;
      const height = h + addition, width = mm(Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y));
      const holes = [], selectedOpenings = assigned.get(edge.id); let blocked = false;
      walls.push({ id: edge.id, key: wallKey, name: `${edge.outer ? 'Стена' : 'Перегородка'} ${edge.id}`, floor, baseHeight: h, addition });
      if (height <= 0 || width <= 0 || height > 30000 || width > 100000 || addition < 0) { issue('WALL_SIZE', `${edge.id}: проверьте размеры стены и добавочную высоту.`, edge.id); continue; }
      for (const o of selectedOpenings) {
        if (o.gap) o.height = height;
        if (!presentNumber(o.sill) || Number(o.sill) < 0) { issue('OPENING_SILL', `${o.name}: укажите отметку низа от пола. Развёртка ${edge.id} ожидает данные.`, o.key); blocked = true; continue; }
        if (o.width <= 0 || o.height <= 0 || o.x < -1 || o.x + o.width > width + 1 || Number(o.sill) + o.height > height + 1) { issue('OPENING_SIZE', `${o.name}: проём выходит за стену или имеет неверный размер.`, o.key); blocked = true; continue; }
        holes.push(rect(o.x, Number(o.sill), o.width, o.height));
      }
      const geometry = subtract(rect(0, 0, width, height), holes);
      addSurface({ id: edge.id, name: `${edge.outer ? 'Стена' : 'Перегородка'} ${edge.id}`, floor, horizontal: false, planStart: [mm(edge.a.x), mm(edge.a.y)], planEnd: [mm(edge.b.x), mm(edge.b.y)], thickness: Number(edge.outer ? sip.wallThickness : sip.partitionThickness), family: edge.outer ? sip.wallPanelFamily : sip.partitionPanelFamily, geometry, width, height, blocked, openings: selectedOpenings });
    }
    if ((floorIndex === 0 && services.sipFloor) || (floorIndex > 0 && services.sipSecondFloor)) {
      const hole = plan.floorOpening;
      const holes = floorIndex > 0 && Number(hole?.width) > 0 && Number(hole?.length) > 0 ? [rect(mm(hole.x), mm(hole.y), mm(hole.width), mm(hole.length))] : [];
      addSurface({ id: `Э${floor}-ПОЛ`, name: `${floor} этаж · ${floorIndex ? 'Межэтажное перекрытие' : 'Пол'}`, floor, horizontal: true, thickness: Number(floorIndex ? sip.secondFloorThickness : sip.floorThickness), family: floorIndex ? sip.secondFloorPanelFamily : sip.floorPanelFamily, layoutWidth: mm(floorIndex ? sip.secondFloorPanelWidth : sip.floorPanelWidth), geometry: subtract(shape, holes) });
    }
    if (floorIndex === plans.length - 1 && services.sipCeiling) {
      let blocked = false;
      const holes = (plan.rooms || []).filter(r => r.include !== false && ['open', 'open-rafter'].includes(r.ceilingMode)).flatMap(r => {
        const hole = polygon(roomPoints(r)), area = polygonAreaMm(hole) / 1e6;
        if (r.openCeilingArea != null && Number(r.openCeilingArea) === 0) return [];
        if (r.openCeilingArea != null && Number(r.openCeilingArea) < area - 0.001) { blocked = true; issue('CEILING_OPENING', `${floor} этаж: у комнаты «${r.name || r.id}» задана только площадь открытого потолка. Укажите его контур в рабочем проекте.`); return []; }
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
    if (roofSettings.type === 'sip' && rectangular) {
      const length = mm(roofGeometry.roofLength), span = mm(roofGeometry.roofSpan), slope = mm(roofGeometry.slopeLength);
      if (roof.mainRoofShape === 'hip') {
        const ridge = mm(roofGeometry.ridgeLength), inset = (length - ridge) / 2;
        for (let i = 1; i <= 2; i++) {
          addRoof(`КР-С${i}`, `Кровля · трапециевидный скат ${i}`, [[[0,0],[length,0],[length-inset,slope],[inset,slope],[0,0]]]);
          addRoof(`КР-В${i}`, `Кровля · вальма ${i}`, [[[0,0],[span,0],[span/2,slope],[0,0]]]);
        }
      } else for (let i = 1; i <= (roof.mainRoofShape === 'flat' ? 1 : 2); i++) addRoof(`КР-С${i}`, `Кровля · скат ${i}`, rect(0, 0, length, slope));
    } else if (roofSettings.type === 'sip' || Number(roof.warmSlopeArea) > 0) issue('ROOF', 'Комбинированная или контурная SIP-кровля: нужны границы тёплых скатов и ендов из рабочего проекта. Автоматический раскрой этих скатов пока не сформирован.');
    if (roof.mainGableType === 'sip') {
      if (rectangular && roof.mainRoofShape === 'gable') {
        const height = mm(roofSettings.ridgeHeight), span = roof.ridgeAxis === 'y' ? bounds.width : bounds.height;
        for (let i = 1; i <= Math.min(2, Number(roofSettings.gableCount) || 0); i++) addRoof(`ФР-${i}`, `Фронтон ${i}`, [[[0,0],[span,0],[span/2,height],[0,0]]], sip.wallThickness, false);
      } else issue('GABLE', 'Фронтоны сложной или односкатной кровли: требуются отдельные развёртки и проёмы.');
    }
  }
  if ((project.plan.platforms || []).some(p => p.include !== false)) issue('PLATFORMS', 'Пристройки: задайте их производственные детали вручную по конструктивному проекту.');
  const parts = surfaces.flatMap(surface => tileSurface(surface, panelWidth, panelLength, settings.frameStepMm, settings.staggered));
  const members = [];
  for (const surface of surfaces) {
    const segments = connectionSegments(parts.filter(part => part.surfaceId === surface.id));
    const profile = sipTimberProfile(surface.thickness);
    segments.forEach((segment, i) => members.push({ ...segment, id: `${surface.id}-${segment.seam ? 'Ш' : 'Т'}${i + 1}`, surface: surface.name, surfaceId: surface.id, material: segment.seam ? ({ thermal: 'Термобрус', 'board-pack': 'Клеёный пакет', solid: 'Брус' }[sip.connectorType] || 'Соединительная шпонка') : 'Торцевая / обрамляющая доска', profile: `${profile.thermalDepth}×${segment.seam ? settings.splineWidthMm : settings.edgeWidthMm}`, cutLength: segment.length + 2 * Number(settings.endAllowanceMm || 0), source: segment.seam ? 'Шов панелей' : 'Открытая кромка / проём' }));
  }
  for (const item of settings.manualParts) {
    if (!item.name?.trim() || !item.profile?.trim() || !(Number(item.length) > 0) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 1000) { issue('MANUAL', 'Ручная деталь: заполните название, сечение, длину и целое количество от 1 до 1000.', item.id); continue; }
    const quantity = Math.min(1000, Math.floor(Number(item.quantity)));
    for (let i = 0; i < quantity; i++) members.push({ id: `Р-${item.id}-${i + 1}`, material: item.name.trim(), profile: item.profile.trim(), length: Number(item.length), cutLength: Number(item.length) + 2 * Number(settings.endAllowanceMm || 0), source: 'Ручная деталь', surface: 'Спецузлы', panels: [] });
  }
  const panelStock = packPanelBlanks(parts, panelWidth, panelLength, Number(settings.kerfMm || 0));
  const timberStock = packMembers(members, settings.stockLengthMm, Number(settings.kerfMm || 0));
  if (panelStock.unplaced.length) issue('PANEL_SIZE', `Не помещаются в заготовку: ${panelStock.unplaced.join(', ')}`);
  if (timberStock.unplaced.length) issue('MEMBER_SIZE', `Длиннее хлыста: ${timberStock.unplaced.join(', ')}. Нужен проект стыковки или другая длина заготовки.`);
  if (!surfaces.length) issue('EMPTY', 'Нет включённых SIP-конструкций. Задайте план и состав домокомплекта.');
  return { settings, panelWidth, panelLength, surfaces, parts, members, openings, walls, issues, panelStock, timberStock, netArea: parts.reduce((sum, part) => sum + part.area, 0) / 1e6, upperCourseCount: parts.filter(part => part.upperCourse).length };
}
