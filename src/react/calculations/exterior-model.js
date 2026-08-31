import { calculatePlanMetrics } from '../../calculations/plan-metrics.js';

export const EXTERIOR_TYPES = [
  { value: 'siding', label: 'Виниловый сайдинг' }, { value: 'wood', label: 'Имитация бруса' },
  { value: 'metal', label: 'Профлист' }, { value: 'brick', label: 'Панели под кирпич' },
  { value: 'bitumen', label: 'Битумная фасадная плитка (HAUBERK)' },
];
export const DEFAULT_EXTERIOR = {
  assemblyVersion: 1, cladding: 'siding', shares: { siding: 50, wood: 50, metal: 0, brick: 0, bitumen: 0 },
  reserve: 10, insulationEnabled: true, windEnabled: true, counterEnabled: true, crossBattens: 'auto',
  insulationSpacing: 0.6, battenSpacing: 0.4, membraneRollArea: 70, insulationPackageVolume: 0.3,
  sidingPanelArea: 0.84, brickPanelArea: 0.44, bitumenPackageArea: 2,
  woodThickness: 16, woodWidth: 145, woodWorkingWidth: 135, woodLength: 6,
  painting: false, paintCoats: 2, paintConsumption: 0.12, primerConsumption: 0.1,
  trimsEnabled: true, trimMaterial: 'auto', trimAuto: true, outerCornerLength: 0, innerCornerLength: 0,
  openingTrimLength: 0, sillLength: 0, startLength: 0, finishLength: 0, jointLength: 0,
  ventilationMesh: true, fastenersPerM2: 10, bitumenNailsPerM2: 40, tapePerM2: 1,
  soffitEnabled: false, soffitAuto: true, soffitType: 'soffit', soffitPaint: false,
  soffitArea: 0, soffitTrimLength: 0,
  outdoorEnabled: false, lights: 0, sockets: 0, lightingLine: 0, socketLine: 0, boxes: 0, circuits: 0,
  accessEnabled: false,
};
const n = value => Math.max(0, Number(value) || 0);
const r = (value, digits = 3) => Number(value.toFixed(digits));
const ceilPack = (qty, pack) => qty > 0 ? Math.ceil((qty - 1e-9) / pack) * pack : 0;
export function normalizeExterior(raw = {}) {
  const result = { ...DEFAULT_EXTERIOR, ...raw, shares: { ...DEFAULT_EXTERIOR.shares, ...raw.shares } };
  if (![...EXTERIOR_TYPES.map(item => item.value), 'combined'].includes(result.cladding)) result.cladding = 'siding';
  return result;
}
function corners(plan) {
  const p = plan.house?.points;
  if (!Array.isArray(p) || p.length < 3) return { outer: 4, inner: 0 };
  let area = 0;
  p.forEach((a, i) => { const b = p[(i + 1) % p.length]; area += a.x * b.y - b.x * a.y; });
  let outer = 0, inner = 0;
  p.forEach((a, i) => {
    const b = p[(i + 1) % p.length], c = p[(i + 2) % p.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-8) return;
    if (cross * area > 0) outer++; else inner++;
  });
  return { outer, inner };
}
export function exteriorGeometry(project, metrics, roof = {}) {
  const floors = [project.plan, ...(project.upperFloors || []).slice(0, Math.max(0, (Number(project.meta?.floors) || 1) - 1))];
  let outerCornerLength = 0, innerCornerLength = 0, openingTrimLength = 0, sillLength = 0, groundDoors = 0;
  floors.forEach((plan, floor) => {
    const c = corners(plan), h = n(plan.wallHeight);
    outerCornerLength += c.outer * h; innerCornerLength += c.inner * h;
    (plan.openings || []).filter(o => o.outer && o.include !== false).forEach(o => {
      openingTrimLength += 2 * n(o.height) + n(o.width);
      if (o.type === 'window') sillLength += n(o.width);
      else if (floor === 0) groundDoors += n(o.width);
    });
  });
  const bottom = calculatePlanMetrics(floors[0]), top = calculatePlanMetrics(floors.at(-1));
  const g = roof.geometry || {};
  const roofW = n(g.roofSpan), roofL = n(g.roofLength);
  // Horizontal underside projection; unlike roofing area, no slope coefficient.
  const wallW = n(project.plan.house?.w), wallL = n(project.plan.house?.h);
  const soffitArea = Math.max(0, roofW * roofL - wallW * wallL);
  const soffitTrimLength = soffitArea ? 2 * (roofW + roofL + wallW + wallL) : 0;
  return { facadeArea: metrics.exteriorWallNetArea, outerCornerLength, innerCornerLength, openingTrimLength, sillLength,
    startLength: Math.max(0, bottom.perimeter - groundDoors), finishLength: top.perimeter, soffitArea, soffitTrimLength };
}
export function calculateExterior(project, metrics, roof = {}, linked = {}) {
  const s = normalizeExterior(project.settings.external), auto = exteriorGeometry(project, metrics, roof);
  const area = n(linked.facadeArea ?? s.facadeArea), reserve = 1 + n(s.reserve) / 100;
  const fractions = Object.fromEntries(EXTERIOR_TYPES.map(t => [t.value, s.cladding === 'combined' ? n(s.shares[t.value]) / 100 : Number(s.cladding === t.value)]));
  const areas = Object.fromEntries(Object.entries(fractions).map(([key, fraction]) => [key, area * fraction]));
  const trim = Object.fromEntries(['outerCornerLength', 'innerCornerLength', 'openingTrimLength', 'sillLength', 'startLength', 'finishLength', 'jointLength'].map(key => [key, n(s.trimAuto && key !== 'jointLength' ? auto[key] : s[key])]));
  const soffitArea = s.soffitEnabled ? n(s.soffitAuto ? auto.soffitArea : s.soffitArea) : 0;
  const soffitTrimLength = soffitArea ? n(s.soffitAuto ? auto.soffitTrimLength : s.soffitTrimLength) : 0;
  const warnings = [];
  if (s.soffitEnabled && s.soffitAuto && !roof.geometry) warnings.push('Для автоматической подшивки включите расчёт кровли или задайте площадь вручную.');
  const sum = Object.values(fractions).reduce((a,b) => a+b,0);
  if (Math.abs(sum - 1) > 0.0001) warnings.push(`Доли комбинированной отделки составляют ${r(sum * 100)}%, должно быть 100%.`);
  if (!s.counterEnabled && area) warnings.push('Вентиляционная контробрешётка отключена: подтвердите допустимость выбранной фасадной системы.');
  if (s.insulationEnabled && !s.windEnabled && area) warnings.push('Утепление включено без ветровлагозащиты: проверьте проектный узел.');
  if (n(s.woodWorkingWidth) > n(s.woodWidth)) warnings.push('Рабочая ширина имитации не может превышать полную ширину доски.');
  if (project.plan.house?.points?.length > 4 || (project.plan.rooms || []).some(room => room.extension)) warnings.push('Для сложного контура проверьте вручную углы, доборы и площадь подшивы; автоматическая подшива рассчитана по габаритам основной крыши.');
  if (s.outdoorEnabled && (n(s.lights) + n(s.sockets)) > 0 && n(s.circuits) === 0) warnings.push('Защита наружных электрических групп не включена: подтвердите, что она учтена в щите.');
  const catalog = new Map([...project.priceMat, ...project.priceLab].map(item => [item.id, item]));
  const lines = [];
  const add = (id, key, qty, group, name, unit) => {
    if (!(qty > 0) || !project.services.externalFinish) return;
    const item = catalog.get(id);
    if (!item) warnings.push(`Нет позиции прайса ${id}.`);
    lines.push({ id: `external:${key}`, section: 'external', catalogId: id, name: name || item?.name || id,
      kind: item?.kind || (id.includes('LAB') ? 'labor' : 'material'), unit: unit || item?.unit || 'шт', qty: r(qty, /м[³3]/.test(unit || item?.unit || '') ? 6 : 3), price: n(item?.price), source: 'exterior-assembly', estimateGroup: group });
  };
  const timber = (key, length, width, thickness, id, group, name) => {
    const boards = Math.ceil(Math.max(0, length * reserve - 1e-9) / 6);
    add(id, key, boards * 6 * width * thickness, group, `${name} · ${boards} шт × 6 м`, 'м³');
  };
  const insulationArea = s.insulationEnabled ? area : 0;
  const base = 'Утепление и основание фасада';
  if (insulationArea) {
    add('MAT-100', 'insulation', ceilPack(insulationArea * .05 * reserve, Math.max(.001,n(s.insulationPackageVolume))), base);
    add('LAB-055', 'insulation-work', insulationArea, base);
    timber('insulation-frame', insulationArea / Math.max(.1,n(s.insulationSpacing)), .05,.05,'MAT-096',base,'Каркас утепления 50×50 мм');
    add('EXT-LAB-FRAME', 'insulation-frame-work', insulationArea, base);
  }
  if (s.windEnabled && area) {
    add('MAT-097','wind',Math.ceil(area * reserve / Math.max(1,n(s.membraneRollArea))),base);
    add('LAB-048','wind-work',area,base);
    add('EXT-MAT-TAPE','membrane-tape',area * n(s.tapePerM2) * reserve,base);
  }
  if (s.counterEnabled && area) {
    timber('counter', area / Math.max(.1,n(s.battenSpacing)) + trim.openingTrimLength + trim.sillLength,.05,.05,'MAT-096',base,'Вентиляционная контробрешётка 50×50 мм');
    add('LAB-050','counter-work',area,base);
  }
  const crossArea = s.crossBattens === 'on' ? area : s.crossBattens === 'off' ? 0 : areas.metal;
  if(crossArea) {
    timber('cross-battens',crossArea / Math.max(.1,n(s.battenSpacing)),.1,.025,'MAT-098',base,'Поперечная обрешётка 100×25 мм');
    add('LAB-051','cross-battens-work',crossArea,base);
  }
  if (area && s.ventilationMesh && s.counterEnabled) add('EXT-MAT-MESH','vent-mesh',(trim.startLength + trim.finishLength) * reserve,base);
  if (area && (s.insulationEnabled || s.counterEnabled || crossArea)) add('EXT-MAT-SCREW','frame-fasteners',Math.ceil(area * n(s.fastenersPerM2) * reserve),base,'Крепёж основания фасада (уточнить длину по узлу)');
  const wood = (a,key,group) => {
    const length = Math.max(.1,n(s.woodLength)), width = Math.max(.001,n(s.woodWidth)/1000), working = Math.max(.001,Math.min(n(s.woodWorkingWidth),n(s.woodWidth))/1000);
    const count = Math.ceil(a * reserve / (working * length) - 1e-9);
    add('MAT-105',key,count * length * width * n(s.woodThickness)/1000,group,`Имитация бруса ${s.woodThickness}×${s.woodWidth}×${length * 1000} мм · ${count} досок`, 'м³');
  };
  const paint = (a,key,group) => {
    if(!a) return;
    add('EXT-MAT-PRIMER',`${key}-primer`,a * n(s.primerConsumption) * reserve,group);
    add('EXT-LAB-PRIMER',`${key}-primer-work`,a,group);
    add('MAT-107',`${key}-paint`,a * n(s.paintConsumption) * Math.ceil(n(s.paintCoats)) * reserve,group);
    add('LAB-066',`${key}-paint-work`,a * Math.ceil(n(s.paintCoats)),group,'Окраска деревянной отделки · площадь × число слоёв');
  };
  EXTERIOR_TYPES.forEach(type => {
    const a = areas[type.value], group = `Облицовка · ${type.label}`;
    if (!a) return;
    const key = type.value;
    if (key === 'siding') { add('EXT-MAT-SIDING',key,Math.ceil(a * reserve / Math.max(.01,n(s.sidingPanelArea))),group,`Виниловый сайдинг · панель ${s.sidingPanelArea} м²`); add('EXT-LAB-SIDING',`${key}-work`,a,group); }
    if (key === 'brick') { add('EXT-MAT-BRICK',key,Math.ceil(a * reserve / Math.max(.01,n(s.brickPanelArea))),group,`Полимерная панель под кирпич · ${s.brickPanelArea} м²`); add('EXT-LAB-BRICK',`${key}-work`,a,group); }
    if (key === 'wood') { wood(a,key,group); add('LAB-049',`${key}-work`,a,group); if (s.painting) paint(a,'wood',group); }
    if (key === 'metal') { add('MAT-041',key,a * reserve,group); add('LAB-054',`${key}-work`,a,group); }
    if (key === 'bitumen') {
      add('EXT-MAT-BITUMEN',key,ceilPack(a * reserve,Math.max(.01,n(s.bitumenPackageArea))),group);
      add('EXT-LAB-BITUMEN',`${key}-work`,a,group);
      add('MAT-111','facade-osb',Math.ceil(a * reserve / 3.125),group);
      add('LAB-065','facade-osb-work',a,group);
      add('EXT-MAT-NAIL','bitumen-nails',Math.ceil(a * n(s.bitumenNailsPerM2) * reserve),group);
    }
    add('EXT-MAT-SCREW',`${key}-fasteners`,Math.ceil(a * n(s.fastenersPerM2) * reserve),group, key === 'bitumen' ? 'Крепёж основания ОСП фасада' : undefined);
  });
  if (s.trimsEnabled && area) {
    // Combined facade can choose one trim family or allocate by surface share.
    const trimShares = s.trimMaterial === 'auto' ? {
      PVC: fractions.siding + fractions.brick, WOOD: fractions.wood, METAL: fractions.metal, BITUMEN: fractions.bitumen,
    } : { [s.trimMaterial]: 1 };
    const group = 'Углы, проёмы и доборы';
    Object.entries(trimShares).forEach(([family, share]) => {
      if(!share) return;
      add(`EXT-MAT-${family}-CORNER`,`${family}-corners`,ceilPack((trim.outerCornerLength + trim.innerCornerLength) * share * reserve, family === 'PVC' ? 3 : 2),group);
      for (const [key,label] of [['openingTrimLength','Обрамления окон и дверей'],['startLength','Стартовая планка'],['finishLength','Финишная планка'],['jointLength','Соединительные планки']])
        add(`EXT-MAT-${family}-TRIM`,`${family}-${key}`,ceilPack(trim[key] * share * reserve, family === 'PVC' ? 3 : 2),group,`${label} · ${family === 'PVC' ? 'ПВХ' : family === 'WOOD' ? 'дерево' : family === 'BITUMEN' ? 'с гранулятом' : 'металл'}`);
    });
    add('EXT-MAT-SILL','sills',ceilPack(trim.sillLength * reserve,2),group);
    add('LAB-052','trims-work',Object.values(trim).reduce((a,b)=>a+b,0),group);
  }
  if (soffitArea) {
    const group = 'Подшивка свесов';
    if(s.soffitType === 'wood') wood(soffitArea,'soffit-wood',group);
    else add(s.soffitType === 'metal' ? 'MAT-041' : 'EXT-MAT-SOFFIT','soffit',soffitArea * reserve,group);
    add('LAB-053','soffit-work',soffitArea,group);
    timber('soffit-frame',soffitArea / Math.max(.1,n(s.battenSpacing)),.05,.05,'MAT-096',group,'Каркас подшивы 50×50 мм');
    add('LAB-050','soffit-frame-work',soffitArea,group);
    add('EXT-MAT-METAL-TRIM','soffit-trim',ceilPack(soffitTrimLength * reserve,2),group,'Профили примыкания подшивы (подобрать под материал)');
    add('LAB-052','soffit-trim-work',soffitTrimLength,group);
    add('EXT-MAT-SCREW','soffit-fasteners',Math.ceil(soffitArea * n(s.fastenersPerM2) * reserve),group);
    if (s.soffitType !== 'soffit') add('EXT-MAT-MESH','soffit-mesh',soffitTrimLength / 2 * reserve,group);
    if(s.soffitType === 'wood' && s.soffitPaint) paint(soffitArea,'soffit',group);
  }
  if(s.outdoorEnabled) {
    const group = 'Наружное освещение и розетки', lights = Math.ceil(n(s.lights)), sockets = Math.ceil(n(s.sockets)), length = n(s.lightingLine) + n(s.socketLine);
    add('EXT-MAT-LIGHT','lights',lights,group); add('LAB-074','lights-work',lights,group);
    add('EXT-MAT-SOCKET','sockets',sockets,group); add('LAB-079','sockets-work',sockets,group);
    add('EXT-MAT-PAD','electric-pads',lights + sockets,group);
    add('MAT-125','light-cable',n(s.lightingLine) * reserve,group); add('MAT-126','socket-cable',n(s.socketLine) * reserve,group);
    add('EXT-MAT-CONDUIT','conduit',length * reserve,group); add('LAB-072','electric-route-work',length,group);
    add('MAT-134','conduit-clips',Math.ceil(length / .5 * reserve),group);
    add('EXT-MAT-BOX','electric-boxes',Math.ceil(n(s.boxes)),group); add('LAB-073','electric-boxes-work',Math.ceil(n(s.boxes)),group);
    add('EXT-MAT-RCD','circuit-protection',Math.ceil(n(s.circuits)),group); add('EXT-LAB-RCD','circuit-protection-work',Math.ceil(n(s.circuits)),group);
  }
  if(s.accessEnabled && area) add('EXT-LAB-ACCESS','access',1,'Организация работ');
  return { settings: s, auto, area, areas, trim, soffitArea, soffitTrimLength, lines, warnings };
}
