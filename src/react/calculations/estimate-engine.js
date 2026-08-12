import { calculatePlanMetrics, calculateSipCutting, roofGeometry } from '../../calculations/plan-metrics.js';
import { calculateTerraceRoof } from '../../calculations/terrace-model.js';
import { calculateFoundation } from './foundation-model.js';

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

function catalogIndex(project) {
  const entries = [...project.priceMat, ...project.priceLab];
  return {
    entries,
    exact: new Map(entries.map((item) => [item.name.toLocaleLowerCase('ru'), item]))
  };
}

function findCatalog(index, query, kind) {
  const normalized = query.toLocaleLowerCase('ru');
  const exact = index.exact.get(normalized);
  if (exact && (!kind || exact.kind === kind)) return exact;
  return index.entries.find((item) => (!kind || item.kind === kind) && item.name.toLocaleLowerCase('ru').includes(normalized));
}

function makeLine(index, section, query, qty, options = {}) {
  const amount = Math.max(0, Number(qty) || 0);
  if (!amount) return null;
  const item = findCatalog(index, query, options.kind);
  return {
    id: `${section}:${options.key || query}`,
    section,
    catalogId: item?.id,
    name: options.name || item?.name || query,
    unit: options.unit || item?.unit || 'шт',
    qty: round(amount, options.digits ?? 2),
    price: Number(item?.price) || Number(options.price) || 0,
    kind: item?.kind || options.kind || 'material',
    source: options.source || section
  };
}

function compact(lines) {
  return lines.filter(Boolean);
}

function sipPanelName(thickness) {
  return `СИП-панель 2500×1250×${thickness} мм`;
}

function sipSection(project, metrics, index, warmRoofArea = 0) {
  const { sip } = project.settings;
  const surfaces = {
    floor: project.services.sipFloor ? metrics.roomArea : 0,
    walls: project.services.sipWalls ? metrics.exteriorWallNetArea : 0,
    ceiling: project.services.sipCeiling ? metrics.roomArea : 0,
    partitions: project.services.partitions ? metrics.partitionNetArea : 0,
    roof: project.services.roof ? warmRoofArea : 0
  };
  const cutting = calculateSipCutting(surfaces, { extraWastePercent: sip.wastePercent });
  const byKey = new Map(cutting.map((row) => [row.key, row]));
  const panelGroups = [
    ['floor', sip.floorThickness], ['walls', sip.wallThickness], ['ceiling', sip.ceilingThickness], ['roof', sip.ceilingThickness]
  ];
  const lines = [];
  panelGroups.forEach(([key, thickness]) => {
    const row = byKey.get(key);
    lines.push(makeLine(index, 'sip', sipPanelName(thickness), row.panels, { key: `panel-${key}`, source: `sip-${key}` }));
    const installQuery = key === 'ceiling' ? 'Монтаж сип-панели потолка' : key === 'roof' ? 'Монтаж СИП-кровли' : 'Монтаж сип-панели пол/стены';
    lines.push(makeLine(index, 'sip', installQuery, row.area, { key: `install-${key}`, kind: 'labor', source: `sip-${key}` }));
    lines.push(makeLine(index, 'sip', 'Раскрой сип-панелей', row.cutMeters, { key: `cut-${key}`, kind: 'labor', source: `sip-${key}` }));
  });
  const partition = byKey.get('partitions');
  if (partition.area) {
    lines.push(makeLine(index, 'sip', 'Доска ест.влажн. сосна 50*100мм', partition.area * 0.014, { key: 'partition-board', unit: 'м³', source: 'partitions' }));
    lines.push(makeLine(index, 'sip', 'Возведение перегородок из доски 100х50', partition.area, { key: 'partition-work', kind: 'labor', source: 'partitions' }));
  }
  const panelTotal = cutting.reduce((sum, row) => sum + row.panels, 0);
  const assemblyArea = surfaces.floor + surfaces.walls + surfaces.ceiling + surfaces.roof;
  lines.push(makeLine(index, 'sip', 'Пена монтажная 800мл', Math.ceil(panelTotal * 0.5), { key: 'foam' }));
  lines.push(makeLine(index, 'sip', 'Саморезы конст.', assemblyArea * 0.045, { key: 'fasteners', unit: 'кг' }));
  lines.push(makeLine(index, 'sip', 'Саморезы 4.2 x 75', assemblyArea * 0.012, { key: 'seam-screws', unit: 'кг' }));
  lines.push(makeLine(index, 'sip', 'Крепёж спиральный', Math.ceil(panelTotal / 35), { key: 'spiral-fasteners', unit: 'уп' }));
  return { lines: compact(lines), cutting };
}

function foundationSection(project, index) {
  const foundation = calculateFoundation(project.plan, project.settings.piles);
  if (!project.services.foundation) return { lines: [], foundation };
  const count = foundation.totalPiles;
  return {
    foundation,
    lines: compact([
      makeLine(index, 'foundation', 'Разбивка осей фундамента', count, { key: 'axes', kind: 'labor' }),
      makeLine(index, 'foundation', 'Монтаж свай', count, { key: 'pile-work', kind: 'labor' }),
      makeLine(index, 'foundation', 'Винтовые сваи 108мм', count, { key: 'piles' }),
      makeLine(index, 'foundation', 'Пескобетон М300', count * 0.01333, { key: 'concrete', unit: 'м³', digits: 3 }),
      makeLine(index, 'foundation', 'Оголовок для свай', count, { key: 'heads' }),
      makeLine(index, 'foundation', 'Монтаж оголовков', count, { key: 'heads-work', kind: 'labor' }),
      makeLine(index, 'foundation', 'Монтаж обвязки', count, { key: 'binding-work', kind: 'labor' }),
      makeLine(index, 'foundation', 'Доска ест. влажн. сосна 50х150мм', foundation.boardVolume, { key: 'binding-board', unit: 'м³', digits: 3 }),
      makeLine(index, 'foundation', 'Саморезы 6х120', count * 0.12, { key: 'binding-screws', unit: 'кг' }),
      makeLine(index, 'foundation', 'Уголок металлический крепёжный', count * 2, { key: 'binding-corners', unit: 'шт' })
    ])
  };
}

function roofSection(project, index) {
  if (!project.services.roof) return { lines: [], geometry: null, terraceRoofs: [] };
  const { roof } = project.settings;
  const span = Number(project.plan.house.h) || 0;
  const geometry = roofGeometry({ span, ridgeLength: roof.ridgeLength, ridgeHeight: roof.ridgeHeight });
  const mainArea = geometry.totalSlopeArea;
  const mainWarmPercent = roof.type === 'sip' ? 100 : roof.type === 'combo' ? roof.warmPercent : 0;
  let coldArea = mainArea * (1 - mainWarmPercent / 100);
  let warmArea = mainArea * mainWarmPercent / 100;
  const terraceRoofs = (project.plan.platforms || []).filter((platform) => platform.include !== false).map((platform) => ({
    platform,
    result: calculateTerraceRoof(platform, project.plan.house, { mainSlopeCoefficient: geometry.slopeCoefficient })
  }));
  terraceRoofs.forEach(({ platform, result }) => {
    if (platform.roof?.mode === 'warm') warmArea += result.netArea;
    if (platform.roof?.mode === 'cold') coldArea += result.netArea;
  });
  const totalArea = coldArea + warmArea;
  const lines = compact([
    makeLine(index, 'roof', 'Монтаж стропильной системы', coldArea, { key: 'rafters-work', kind: 'labor' }),
    makeLine(index, 'roof', 'Монтаж обрешётки и контробрешётки', coldArea, { key: 'lath-work', kind: 'labor' }),
    makeLine(index, 'roof', 'Доска ест. влажн. сосна 50х200мм', coldArea * 0.02456, { key: 'rafters', unit: 'м³', digits: 3 }),
    makeLine(index, 'roof', 'Доска ест.влажн. сосна 25*100мм', coldArea * 0.00655, { key: 'lath', unit: 'м³', digits: 3 }),
    makeLine(index, 'roof', 'Гидро-ветрозащитная мембрана', Math.ceil(totalArea / 70), { key: 'membrane', unit: 'рулон' }),
    makeLine(index, 'roof', 'Профлист С-21 окрашенный', totalArea * (1 + roof.wastePercent / 100), { key: 'cover', unit: 'м²' }),
    makeLine(index, 'roof', 'Саморезы кровельные', Math.ceil(totalArea * 8), { key: 'roof-screws', unit: 'шт' }),
    makeLine(index, 'roof', 'Планка конька', roof.ridgeLength * 1.1, { key: 'ridge', unit: 'м.п.' })
  ]);
  return { lines, geometry, terraceRoofs, coldArea: round(coldArea), warmArea: round(warmArea), totalArea: round(totalArea) };
}

function terraceSection(project, index) {
  if (!project.services.terrace) return { lines: [], area: 0 };
  const platforms = project.plan.platforms.filter((platform) => platform.include !== false);
  const area = platforms.reduce((sum, platform) => sum + platform.w * platform.h, 0);
  const perimeter = platforms.reduce((sum, platform) => sum + 2 * (platform.w + platform.h), 0);
  const stairs = platforms.reduce((sum, platform) => sum + (Math.round(platform.steps) || 0), 0);
  const staircases = platforms.filter((platform) => Number(platform.steps) > 0).length;
  return {
    area: round(area),
    lines: compact([
      makeLine(index, 'terrace', 'Монтаж каркаса террасы', area, { key: 'frame-work', kind: 'labor', unit: 'м²' }),
      makeLine(index, 'terrace', 'Монтаж настила террасы', area, { key: 'deck-work', kind: 'labor', unit: 'м²' }),
      makeLine(index, 'terrace', 'Доска ест. влажн. сосна 50х150мм', perimeter * 0.05 * 0.15 + area * 0.024, { key: 'frame-board', unit: 'м³', digits: 3 }),
      makeLine(index, 'terrace', 'Доска террасная 45×145 мм', area * 0.045 * 1.05, { key: 'deck', unit: 'м³', digits: 3 }),
      makeLine(index, 'terrace', 'Саморезы 4.2 x 75', area * 0.12, { key: 'screws', unit: 'кг' }),
      makeLine(index, 'terrace', 'Ступень лестницы', stairs, { key: 'steps' }),
      makeLine(index, 'terrace', 'Изготовление лестниц', staircases, { key: 'steps-work', kind: 'labor', unit: 'шт' })
    ])
  };
}

function openingSection(project, index) {
  if (!project.services.openings) return { lines: [] };
  const lines = [];
  project.plan.openings.forEach((opening, openingIndex) => {
    const width = Math.round((opening.width || 0.8) * 1000);
    const height = Math.round((opening.height || 2) * 1000);
    const type = opening.type === 'window' ? 'Окно' : opening.doorType === 'interior' ? 'Комплект межкомнатной двери' : 'Дверь входная';
    const item = findCatalog(index, `${type} ${width}`) || findCatalog(index, type);
    lines.push(makeLine(index, 'openings', item?.name || `${type} ${width}×${height}`, 1, { key: `opening-${openingIndex}`, name: item?.name || `${type} ${width}×${height} мм`, unit: 'шт' }));
    const work = opening.type === 'window' ? 'Монтаж окна' : opening.doorType === 'interior' ? 'Установка межкомнатной двери' : 'Монтаж двери';
    lines.push(makeLine(index, 'openings', work, opening.type === 'window' ? opening.width * opening.height : 1, { key: `work-${openingIndex}`, kind: 'labor' }));
    lines.push(makeLine(index, 'openings', 'Комплект крепежа для монтажа окна / двери', 1, { key: `fastener-${openingIndex}`, unit: 'компл' }));
  });
  return { lines: compact(lines) };
}

function engineeringSection(project, index) {
  const s = project.settings.engineering;
  const lines = [];
  if (project.services.engineeringElectric) {
    lines.push(makeLine(index, 'engineering', 'Кабель ВВГнг-LS 3×1,5', s.cableRoute * 0.45, { key: 'cable-light', unit: 'м' }));
    lines.push(makeLine(index, 'engineering', 'Кабель ВВГнг-LS 3×2,5', s.cableRoute * 0.55, { key: 'cable-power', unit: 'м' }));
    lines.push(makeLine(index, 'engineering', 'Монтаж электрической точки', s.electricPoints, { key: 'electric-work', kind: 'labor', unit: 'точка' }));
  }
  if (project.services.engineeringPlumbing) {
    lines.push(makeLine(index, 'engineering', 'Труба полипропиленовая', s.waterPipe, { key: 'water-pipe', unit: 'м' }));
    lines.push(makeLine(index, 'engineering', 'Монтаж точки водоснабжения', s.waterPoints, { key: 'water-work', kind: 'labor', unit: 'точка' }));
  }
  if (project.services.engineeringSewerage) {
    lines.push(makeLine(index, 'engineering', 'Труба канализационная 110', s.sewerLength, { key: 'sewer-pipe', unit: 'м' }));
    lines.push(makeLine(index, 'engineering', 'Монтаж внутренней канализации', s.sewerPoints, { key: 'sewer-work', kind: 'labor', unit: 'точка' }));
  }
  if (project.services.engineeringVentilation) {
    lines.push(makeLine(index, 'engineering', 'Воздуховод', s.ventDuct, { key: 'vent-duct', unit: 'м' }));
    lines.push(makeLine(index, 'engineering', 'Монтаж вентиляционной решётки', s.ventGrilles, { key: 'vent-work', kind: 'labor', unit: 'шт' }));
  }
  return { lines: compact(lines) };
}

function finishSections(project, index) {
  const internal = project.settings.internal;
  const external = project.settings.external;
  const internalLines = project.services.internalFinish ? compact([
    makeLine(index, 'internal', 'Монтаж имитации бруса', internal.wallArea, { key: 'wall-work', kind: 'labor', unit: 'м²' }),
    makeLine(index, 'internal', 'Имитация бруса', internal.wallArea * 0.016, { key: 'wall-material', unit: 'м³' }),
    makeLine(index, 'internal', 'Ламинат', internal.laminateArea * 1.05, { key: 'laminate', unit: 'м²' }),
    makeLine(index, 'internal', 'Монтаж ламината', internal.laminateArea, { key: 'laminate-work', kind: 'labor', unit: 'м²' }),
    makeLine(index, 'internal', 'Плитка', internal.tileArea * 1.07, { key: 'tile', unit: 'м²' }),
    makeLine(index, 'internal', 'Укладка плитки', internal.tileArea, { key: 'tile-work', kind: 'labor', unit: 'м²' }),
    makeLine(index, 'internal', 'Комплект межкомнатной двери', internal.doors, { key: 'doors', unit: 'шт' })
  ]) : [];
  const externalLines = project.services.externalFinish ? compact([
    makeLine(index, 'external', 'Монтаж обрешётки фасада', external.facadeArea, { key: 'facade-work', kind: 'labor', unit: 'м²' }),
    makeLine(index, 'external', 'Ветро-влагозащита', Math.ceil(external.windArea / 70), { key: 'wind', unit: 'рулон' }),
    makeLine(index, 'external', 'Утеплитель 50мм', external.insulationArea * 0.05, { key: 'insulation', unit: 'м³' }),
    makeLine(index, 'external', 'Профлист С-21 окрашенный', external.metalArea, { key: 'metal', unit: 'м²' }),
    makeLine(index, 'external', 'Саморезы кровельные', Math.ceil(external.metalArea * 8), { key: 'screws', unit: 'шт' })
  ]) : [];
  return { internalLines, externalLines };
}

function deliverySection(project, index, subtotalVolume) {
  if (!project.services.delivery) return { lines: [] };
  const d = project.settings.delivery;
  return {
    lines: compact([
      makeLine(index, 'delivery', 'Доставка — базовая стоимость рейса', d.trips, { key: 'base', unit: 'рейс', price: d.baseTrip }),
      makeLine(index, 'delivery', 'Доставка — стоимость 1 км', d.distance * d.trips, { key: 'distance', unit: 'км', price: d.perKm }),
      makeLine(index, 'delivery', 'Погрузка/разгрузка материала', d.cargoVolume || subtotalVolume, { key: 'unload', unit: 'м³', price: d.unloadingPerM3 })
    ])
  };
}

export function calculateProject(project) {
  const metrics = calculatePlanMetrics(project.plan);
  const index = catalogIndex(project);
  const foundation = foundationSection(project, index);
  const roof = roofSection(project, index);
  const sip = sipSection(project, metrics, index, roof.warmArea || 0);
  const terrace = terraceSection(project, index);
  const openings = openingSection(project, index);
  const engineering = engineeringSection(project, index);
  const finishes = finishSections(project, index);
  const delivery = deliverySection(project, index, project.settings.delivery.cargoVolume);
  const sections = [
    { key: 'foundation', title: 'Свайно-винтовой фундамент и обвязка', lines: foundation.lines },
    { key: 'sip', title: 'СИП-конструкции и перегородки', lines: sip.lines },
    { key: 'roof', title: 'Кровля и фронтоны', lines: roof.lines },
    { key: 'terrace', title: 'Терраса и крыльцо', lines: terrace.lines },
    { key: 'openings', title: 'Окна и двери', lines: openings.lines },
    { key: 'engineering', title: 'Инженерные системы', lines: engineering.lines },
    { key: 'internal', title: 'Внутренняя отделка', lines: finishes.internalLines },
    { key: 'external', title: 'Наружная отделка', lines: finishes.externalLines },
    { key: 'delivery', title: 'Доставка и логистика', lines: delivery.lines }
  ].filter((section) => section.lines.length);
  const lines = sections.flatMap((section) => section.lines);
  const totals = lines.reduce((acc, line) => {
    const sum = line.qty * line.price;
    if (line.kind === 'labor') acc.labor += sum;
    else acc.materials += sum;
    return acc;
  }, { materials: 0, labor: 0 });
  totals.total = totals.materials + totals.labor;
  return { metrics, foundation: foundation.foundation, sip, roof, terrace, sections, lines, totals };
}
