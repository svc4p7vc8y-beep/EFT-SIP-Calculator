import { calculatePlanMetrics, calculateSipCutting, calculateSipRoofCutting, roofGeometry } from '../../calculations/plan-metrics.js';
import { calculateTerraceRoof } from '../../calculations/terrace-model.js';
import { calculateFoundation } from './foundation-model.js';
import { deriveLinkedInputs } from './calculation-links.js';
import { calculateSipJoinery } from './sip-joinery.js';

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
    price: (Number(item?.price) || Number(options.price) || 0) * (Number(options.priceMultiplier) || 1),
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

function sipSection(project, metrics, index, inputs) {
  const { sip } = project.settings;
  const surfaces = {
    floor: project.services.sipFloor ? metrics.floorArea : 0,
    walls: project.services.sipWalls ? metrics.exteriorWallNetArea : 0,
    ceiling: project.services.sipCeiling ? metrics.ceilingArea : 0
  };
  const f = inputs.formulas;
  const cutting = calculateSipCutting(surfaces, { panelArea: f.panelArea, extraWastePercent: sip.wastePercent });
  const byKey = new Map(cutting.map((row) => [row.key, row]));
  const panelGroups = [
    ['floor', sip.floorThickness], ['walls', sip.wallThickness], ['ceiling', sip.ceilingThickness]
  ];
  const lines = [];
  panelGroups.forEach(([key, thickness]) => {
    const row = byKey.get(key);
    lines.push(makeLine(index, 'sip', sipPanelName(thickness), row.panels, { key: `panel-${key}`, source: `sip-${key}` }));
    const installQuery = key === 'ceiling' ? 'Монтаж сип-панели потолка' : 'Монтаж сип-панели пол/стены';
    lines.push(makeLine(index, 'sip', installQuery, row.area, { key: `install-${key}`, kind: 'labor', source: `sip-${key}` }));
    lines.push(makeLine(index, 'sip', 'Раскрой сип-панелей', row.cutMeters, { key: `cut-${key}`, kind: 'labor', source: `sip-${key}` }));
  });
  if (project.services.partitions && metrics.partitionNetArea) {
    lines.push(makeLine(index, 'sip', 'Доска ест.влажн. сосна 50*100мм', metrics.partitionNetArea * f.partitionBoardM3PerM2, { key: 'partition-board', unit: 'м³', source: 'partitions' }));
    lines.push(makeLine(index, 'sip', 'Возведение перегородок из доски 100х50', metrics.partitionNetArea, { key: 'partition-work', kind: 'labor', source: 'partitions' }));
  }
  const joinery = calculateSipJoinery(project.plan, project.services, sip, f);
  joinery.rows.forEach((row) => {
    const key = `${row.key}-connector`;
    if (joinery.type === 'thermal') {
      lines.push(makeLine(index, 'sip', `Термобрус ${row.thermalDepth}х90мм`, row.jointLength, { key, unit: 'м.п.', source: `sip-${row.key}-joints` }));
    } else if (joinery.type === 'board-pack') {
      lines.push(makeLine(index, 'sip', `Пакет досок 2×45×${row.endBoardDepth} мм для СИП ${row.panelThickness} мм`, row.jointLength, { key, unit: 'м.п.', source: `sip-${row.key}-joints` }));
    } else {
      const query = row.core === 100 ? 'Брус ест.влажн. сосна 100×100 мм' : row.core === 150 ? 'Брус мауэрлата ест.влажн. сосна 150×100 мм' : 'Доска ест. влажн. сосна 50х200мм';
      lines.push(makeLine(index, 'sip', query, row.jointLength * row.core / 1000 * 0.1, { key, name: `Брус соединительный ${row.core}×100 мм`, unit: 'м³', digits: 3, source: `sip-${row.key}-joints` }));
    }
    lines.push(makeLine(index, 'sip', `Доска сухая строганая ${row.endBoardDepth}×45 мм`, row.endBoardLength, { key: `${row.key}-edge-board`, unit: 'м.п.', source: `sip-${row.key}-edges` }));
  });
  const panelTotal = cutting.reduce((sum, row) => sum + row.panels, 0);
  const assemblyArea = surfaces.floor + surfaces.walls + surfaces.ceiling;
  lines.push(makeLine(index, 'sip', 'Пена монтажная 800мл', Math.ceil(panelTotal * f.foamUnitsPerPanel), { key: 'foam' }));
  lines.push(makeLine(index, 'sip', 'Саморезы конст.', assemblyArea * f.structuralFastenerKgPerM2, { key: 'fasteners', unit: 'кг' }));
  lines.push(makeLine(index, 'sip', 'Саморезы 4.2 x 75', assemblyArea * f.seamScrewKgPerM2, { key: 'seam-screws', unit: 'кг' }));
  lines.push(makeLine(index, 'sip', 'Крепёж спиральный', Math.ceil(panelTotal / f.spiralPackPerPanels), { key: 'spiral-fasteners', unit: 'уп' }));
  return { lines: compact(lines), cutting, joinery };
}

function foundationSection(project, index, inputs) {
  const foundation = calculateFoundation(project.plan, project.settings.piles);
  if (!project.services.foundation) return { lines: [], foundation };
  const count = foundation.totalPiles;
  return {
    foundation,
    lines: compact([
      makeLine(index, 'foundation', 'Разбивка осей фундамента (1 свая)', count, { key: 'axes', kind: 'labor' }),
      makeLine(index, 'foundation', 'Монтаж свай', count, { key: 'pile-work', kind: 'labor' }),
      makeLine(index, 'foundation', 'Винтовые сваи 108мм', count, { key: 'piles' }),
      makeLine(index, 'foundation', 'Пескобетон М300', count * inputs.formulas.pileConcreteM3, { key: 'concrete', unit: 'м³', digits: 3 }),
      makeLine(index, 'foundation', 'Оголовок для свай', count, { key: 'heads' }),
      makeLine(index, 'foundation', 'Монтаж оголовков', count, { key: 'heads-work', kind: 'labor' }),
      makeLine(index, 'foundation', 'Монтаж обвязки', count, { key: 'binding-work', kind: 'labor' }),
      makeLine(index, 'foundation', 'Доска ест. влажн. сосна 50х150мм', foundation.boardVolume, { key: 'binding-board', unit: 'м³', digits: 3 }),
      makeLine(index, 'foundation', 'Саморезы 6х120', count * inputs.formulas.pileScrewKg, { key: 'binding-screws', unit: 'кг' }),
      makeLine(index, 'foundation', 'Уголок металлический крепёжный', count * inputs.formulas.pileCorners, { key: 'binding-corners', unit: 'шт' })
    ])
  };
}

function roofSection(project, metrics, index, inputs) {
  if (!project.services.roof) return { lines: [], geometry: null, terraceRoofs: [], coldArea: 0, warmArea: 0, insulatedRafterArea: 0, totalArea: 0 };
  const { roof } = project.settings;
  const span = Number(project.plan.house.h) || 0;
  const geometry = roofGeometry({ span, ridgeLength: inputs.roof.ridgeLength, ridgeHeight: roof.ridgeHeight });
  const mainArea = geometry.totalSlopeArea;
  const mainWarmPercent = roof.type === 'sip' ? 100 : roof.type === 'combo' ? roof.warmPercent : 0;
  const insulatedRafterArea = Math.min(mainArea, (metrics.openCeilingArea || 0) * geometry.slopeCoefficient);
  let warmArea = Math.max(0, mainArea * mainWarmPercent / 100 - insulatedRafterArea);
  let coldArea = mainArea - warmArea;
  const terraceRoofs = (project.plan.platforms || []).filter((platform) => platform.include !== false).map((platform) => ({
    platform,
    result: calculateTerraceRoof(platform, project.plan.house, { mainSlopeCoefficient: geometry.slopeCoefficient })
  }));
  terraceRoofs.forEach(({ platform, result }) => {
    if (platform.roof?.mode === 'warm') warmArea += result.netArea;
    if (platform.roof?.mode === 'cold') coldArea += result.netArea;
  });
  const totalArea = coldArea + warmArea;
  const sipCutting = calculateSipRoofCutting(warmArea, { panelArea: inputs.formulas.panelArea, extraWastePercent: project.settings.sip.wastePercent });
  const lines = compact([
    makeLine(index, 'roof', 'Монтаж стропильной системы', coldArea, { key: 'rafters-work', kind: 'labor' }),
    makeLine(index, 'roof', 'Монтаж обрешётки и контробрешётки', coldArea, { key: 'lath-work', kind: 'labor' }),
    makeLine(index, 'roof', 'Доска ест. влажн. сосна 50х200мм', coldArea * inputs.formulas.rafterM3PerM2, { key: 'rafters', unit: 'м³', digits: 3 }),
    makeLine(index, 'roof', 'Доска ест.влажн. сосна 25*100мм', coldArea * inputs.formulas.lathM3PerM2, { key: 'lath', unit: 'м³', digits: 3 }),
    makeLine(index, 'roof', 'Гидро-ветрозащитная мембрана', Math.ceil(totalArea / 70), { key: 'membrane', unit: 'рулон' }),
    makeLine(index, 'roof', 'Профлист С-21 окрашенный', totalArea * (1 + roof.wastePercent / 100), { key: 'cover', unit: 'м²' }),
    makeLine(index, 'roof', 'Саморезы кровельные', Math.ceil(totalArea * inputs.formulas.roofScrewsPerM2), { key: 'roof-screws', unit: 'шт' }),
    makeLine(index, 'roof', 'Планка конька', inputs.roof.ridgeLength * inputs.formulas.ridgeReserve, { key: 'ridge', unit: 'м.п.' }),
    makeLine(index, 'roof', 'Утеплитель 100 мм П50-60', insulatedRafterArea * inputs.formulas.rafterInsulationThicknessM, { key: 'open-rafter-insulation', unit: 'м³', digits: 3, source: 'open-rafter' }),
    makeLine(index, 'roof', 'Укладка утеплителя стен 50 мм', insulatedRafterArea, { key: 'open-rafter-insulation-work', kind: 'labor', name: `Укладка минваты в стропила ${Math.round(inputs.formulas.rafterInsulationThicknessM * 1000)} мм`, unit: 'м²', priceMultiplier: inputs.formulas.rafterInsulationThicknessM / 0.05, source: 'open-rafter' }),
    makeLine(index, 'roof', 'Пароизоляция "В"', Math.ceil(insulatedRafterArea / Math.max(1, inputs.formulas.vaporBarrierRollArea)), { key: 'open-rafter-vapor', unit: 'рулон', source: 'open-rafter' }),
    makeLine(index, 'roof', 'Монтаж пароизоляции В', insulatedRafterArea, { key: 'open-rafter-vapor-work', kind: 'labor', source: 'open-rafter' }),
    makeLine(index, 'roof', sipPanelName(project.settings.sip.ceilingThickness), sipCutting.panels, { key: 'sip-panel', source: 'sip-roof' }),
    makeLine(index, 'roof', 'Монтаж СИП-кровли', sipCutting.area, { key: 'sip-install', kind: 'labor', source: 'sip-roof' }),
    makeLine(index, 'roof', 'Раскрой сип-панелей', sipCutting.cutMeters, { key: 'sip-cut', kind: 'labor', source: 'sip-roof' }),
    makeLine(index, 'roof', 'Пена монтажная 800мл', Math.ceil(sipCutting.panels * inputs.formulas.foamUnitsPerPanel), { key: 'sip-foam', source: 'sip-roof' }),
    makeLine(index, 'roof', 'Саморезы конст.', sipCutting.area * inputs.formulas.structuralFastenerKgPerM2, { key: 'sip-fasteners', unit: 'кг', source: 'sip-roof' })
  ]);
  return { lines, geometry, terraceRoofs, sipCutting, coldArea: round(coldArea), warmArea: round(warmArea), insulatedRafterArea: round(insulatedRafterArea), totalArea: round(totalArea) };
}

function terraceSection(project, index, inputs) {
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
      makeLine(index, 'terrace', 'Доска ест. влажн. сосна 50х150мм', perimeter * 0.05 * 0.15 + area * inputs.formulas.terraceFrameBoardM3PerM2, { key: 'frame-board', unit: 'м³', digits: 3 }),
      makeLine(index, 'terrace', 'Доска террасная 45×145 мм', area * 0.045 * inputs.formulas.terraceDeckReserve, { key: 'deck', unit: 'м³', digits: 3 }),
      makeLine(index, 'terrace', 'Саморезы 4.2 x 75', area * inputs.formulas.terraceScrewKgPerM2, { key: 'screws', unit: 'кг' }),
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

function engineeringSection(project, index, inputs) {
  const s = inputs.engineering;
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

function finishSections(project, index, inputs) {
  const internal = inputs.internal;
  const external = inputs.external;
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

function deliverySection(project, index, inputs) {
  if (!project.services.delivery) return { lines: [] };
  const d = project.settings.delivery;
  return {
    lines: compact([
      makeLine(index, 'delivery', 'Доставка — базовая стоимость рейса', d.trips, { key: 'base', unit: 'рейс', price: d.baseTrip }),
      makeLine(index, 'delivery', 'Доставка — стоимость 1 км', d.distance * d.trips, { key: 'distance', unit: 'км', price: d.perKm }),
      makeLine(index, 'delivery', 'Погрузка/разгрузка материала', inputs.delivery.cargoVolume, { key: 'unload', unit: 'м³', price: d.unloadingPerM3 })
    ])
  };
}

export function calculateProject(project) {
  const metrics = calculatePlanMetrics(project.plan);
  const inputs = deriveLinkedInputs(project, metrics);
  const index = catalogIndex(project);
  const foundation = foundationSection(project, index, inputs);
  const roof = roofSection(project, metrics, index, inputs);
  const sip = sipSection(project, metrics, index, inputs);
  const terrace = terraceSection(project, index, inputs);
  const openings = openingSection(project, index);
  const engineering = engineeringSection(project, index, inputs);
  const finishes = finishSections(project, index, inputs);
  const delivery = deliverySection(project, index, inputs);
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
  return { metrics, inputs, foundation: foundation.foundation, sip, roof, terrace, sections, lines, totals };
}
