import { formatMoney, formatNumber } from '../utils/format.js';
import { EXTERIOR_TYPES } from './exterior-model.js';
import { isInteriorDoor } from './opening-types.js';

const ROOF_TYPES = { cold: 'холодная', sip: 'тёплая SIP', combo: 'комбинированная' };
const ROOF_SHAPES = { flat: 'плоская', gable: 'двускатная', hip: 'вальмовая' };
const ROOF_COVERINGS = { profile: 'профлист С-21', 'metal-tile': 'металлочерепица', soft: 'мягкая кровля с OSB' };
const CONNECTOR_TYPES = { thermal: 'термобрус', 'board-pack': 'клеёный пакет досок', solid: 'брус естественной влажности' };

function openingCounts(openings = []) {
  return openings.reduce((counts, opening) => {
    if (opening.type === 'window') counts.windows += 1;
    else if (opening.doorType === 'garage') counts.garage += 1;
    else counts.doors += 1;
    return counts;
  }, { windows: 0, doors: 0, garage: 0 });
}

function joinParts(parts) {
  return parts.filter(Boolean).join(' · ');
}

function pluralRu(value, one, few, many) {
  const amount = Math.abs(Math.round(Number(value) || 0));
  const lastTwo = amount % 100;
  const last = amount % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
  return `${amount} ${word}`;
}

function sectionCoverage(lines) {
  const hasMaterials = lines.some((line) => line.kind !== 'labor');
  const hasLabor = lines.some((line) => line.kind === 'labor');
  return [hasMaterials && 'Материалы', hasLabor && 'Работы'].filter(Boolean);
}

function sectionAmount(lines) {
  return lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.price) || 0), 0);
}

function scopeDescription(key, project, calculation, lineCount) {
  const { metrics, foundation, roof, terrace } = calculation;
  const platforms = (project.plan.platforms || []).filter((platform) => platform.include !== false);
  const floorCount = Math.max(1, Math.min(2, Number(project.meta?.floors) || 1));
  const floorPlans = [
    project.plan,
    ...(project.upperFloors || []).slice(0, floorCount - 1),
  ];
  const openings = openingCounts(
    floorPlans.flatMap((plan) => plan.openings || []).filter(o => !isInteriorDoor(o) && o.includeInEstimate !== false),
  );

  if (key === 'foundation') return {
    summary: `${pluralRu(foundation.totalPiles, 'свая', 'сваи', 'свай')}, обвязка ${formatNumber(foundation.bindingLength)} м`,
    details: `Разбивка, монтаж свай, оголовки, крепёж и ${foundation.boardCount} досок обвязки по 6 м`
  };
  if (key === 'sip') {
    const surfaces = [
      project.services.sipFloor && `пол 1 этажа ${formatNumber(metrics.floorArea)} м²`,
      project.services.sipSecondFloor && floorCount > 1 && `пол 2 этажа ${formatNumber(metrics.secondFloorArea)} м²`,
      project.services.sipWalls && `стены 1 этажа ${formatNumber(metrics.firstFloorExteriorWallNetArea)} м²`,
      project.services.sipWalls && floorCount > 1 && `стены 2 этажа ${formatNumber(metrics.secondFloorExteriorWallNetArea)} м²`,
      project.services.sipCeiling && `потолок ${formatNumber(metrics.ceilingArea)} м²`,
      project.services.partitions && metrics.firstFloorPartitionNetArea > 0 && `перегородки 1 этажа ${formatNumber(metrics.firstFloorPartitionNetArea)} м²`,
      project.services.partitions && floorCount > 1 && metrics.secondFloorPartitionNetArea > 0 && `перегородки 2 этажа ${formatNumber(metrics.secondFloorPartitionNetArea)} м²`
    ];
    return {
      summary: joinParts(surfaces),
      details: joinParts([
        `Панели ${project.settings.sip.floorPanelFamily || 'pps'}/${project.settings.sip.wallPanelFamily || 'pps'}/${project.settings.sip.ceilingPanelFamily || 'pps'}, раскладка пола ${Math.round(Number(project.settings.sip.floorPanelWidth || 1.25) * 1000)} мм и потолка ${Math.round(Number(project.settings.sip.ceilingPanelWidth || 1.25) * 1000)} мм, соединения (${CONNECTOR_TYPES[project.settings.sip.connectorType] || 'термобрус'}), резка, торцевые доски, крепёж и монтаж`,
        floorCount > 1 && metrics.secondFloorOpeningArea > 0 && `лестничный проём ${formatNumber(metrics.secondFloorOpeningWidth)} × ${formatNumber(metrics.secondFloorOpeningLength)} м расположен на планах обоих этажей и вычтен из межэтажного перекрытия`,
      ])
    };
  }
  if (key === 'roof') {
    const coveredPlatforms = platforms.filter((platform) => platform.roof?.mode && platform.roof.mode !== 'none').length;
    return {
      summary: `${ROOF_SHAPES[project.settings.roof.shape] || 'двускатная'} ${ROOF_TYPES[project.settings.roof.type] || 'холодная'} кровля, ${ROOF_COVERINGS[project.settings.roof.covering] || 'профлист С-21'}, ${formatNumber(roof.totalArea)} м²`,
      details: joinParts([
        `основная кровля, ${roof.rafterStructure?.system === 'layered' ? 'наслонная система' : roof.rafterStructure?.system === 'truss' ? 'стропильные фермы' : 'висячая система'} с чистым шагом ${formatNumber(roof.rafterStructure?.step || .6)} м`,
        roof.mauerlatLength > 0 && `мауэрлат 100×150 мм: ${formatNumber(roof.mauerlatLength)} м, ${roof.mauerlatBoardCount || 0} брусьев по 6 м`,
        roof.mauerlatFastener === 'sip-screws' && `крепление мауэрлата: ${roof.mauerlatScrewCount || 0} конструкционных саморезов ${roof.mauerlatScrewSize || ''}`,
        roof.mauerlatFastener === 'anchors' && `крепление мауэрлата: ${roof.mauerlatAnchors || 0} анкер-шпилек`,
        `крепёж стропильных узлов ${roof.framingNailCount || 0} шт, обрешётки ${roof.lathNailCount || 0} шт`,
        `обрешётка с шагом ${formatNumber(roof.lathStep || .35, 2)} м`,
        project.settings.roof.shape === 'hip' && `коэффициент вальмовой кровли: материалы +25%, работы +50%`,
        `конёк включён`,
        project.settings.roof.includeGutter === true && `водосточная система ${formatNumber(roof.gutterLength)} м`,
        roof.gableArea > 0 && `фронтоны ${formatNumber(roof.gableArea)} м²`,
        coveredPlatforms > 0 && `кровля ${pluralRu(coveredPlatforms, 'пристройки', 'пристроек', 'пристроек')}`
      ])
    };
  }
  if (key === 'terrace') {
    const terraces = platforms.filter((platform) => platform.kind !== 'porch').length;
    const porches = platforms.filter((platform) => platform.kind === 'porch').length;
    const steps = platforms.reduce((sum, platform) => sum + (Number(platform.steps) || 0), 0);
    return {
      summary: `${pluralRu(platforms.length, 'площадка', 'площадки', 'площадок')}, ${formatNumber(terrace.area)} м²`,
      details: joinParts([terraces && `террасы: ${terraces}`, porches && `крыльца: ${porches}`, steps && `ступени: ${steps}`, 'каркас и настил'])
    };
  }
  if (key === 'openings') return {
    summary: joinParts([`окна: ${openings.windows}`, `двери: ${openings.doors}`, openings.garage && `ворота: ${openings.garage}`]),
    details: 'Комплектация и монтаж проёмов по размерам плана'
  };
  if (key === 'engineering') {
    const systems = [
      project.services.engineeringElectric && 'электрика',
      project.services.engineeringPlumbing && 'водоснабжение',
      project.services.engineeringSewerage && 'канализация',
      project.services.engineeringVentilation && 'вентиляция'
    ].filter(Boolean);
    return { summary: systems.join(', '), details: 'Материалы и монтаж выбранных инженерных систем' };
  }
  if (key === 'internal') {
    const detailed=calculation.internal?.mode==='rooms';
    return {
      summary: detailed
        ? `полы ${formatNumber(calculation.internal.totals.floorArea)} м², стены ${formatNumber(calculation.internal.totals.wallArea)} м², потолки ${formatNumber(calculation.internal.totals.ceilingArea)} м²`
        : `внутренняя отделка ${formatNumber(calculation.inputs.internal.wallArea)} м² стен`,
      details: joinParts([detailed?'Отделка назначена отдельно по помещениям и этажам':'Выбранные отделочные материалы и монтажные работы',calculation.inputs.internal.doors>0&&`межкомнатные двери с монтажом: ${calculation.inputs.internal.doors} шт`])
    };
  }
  if (key === 'external' && project.settings.external.assemblyVersion !== 0 && calculation.exterior) {
    const e = calculation.exterior, s = e.settings;
    return {
      summary: joinParts(EXTERIOR_TYPES.filter(type => e.areas[type.value] > 0).map(type => `${type.label} ${formatNumber(e.areas[type.value])} м²`)) || 'Наружные работы',
      details: joinParts([
        s.insulationEnabled && e.area > 0 && 'утепление 50 мм с каркасом',
        s.windEnabled && e.area > 0 && 'ветровлагозащита',
        s.counterEnabled && e.area > 0 && 'вентиляционная контробрешётка',
        s.trimsEnabled && e.area > 0 && 'углы и обрамления проёмов',
        s.painting && e.areas.wood > 0 && `покраска дерева ${s.paintCoats} слоя`,
        e.soffitArea > 0 && `подшивка ${formatNumber(e.soffitArea)} м²`,
        e.plinthArea > 0 && `цоколь ${formatNumber(e.plinthArea)} м², высота ${formatNumber(s.plinthHeight)} м, ${s.plinthMaterial === 'brick' ? 'панели под кирпич' : 'профлист'}, труба 50×25×2`,
        s.outdoorEnabled && (s.lights || s.sockets || s.lightingLine || s.socketLine) && `наружная электрика: светильники ${s.lights}, розетки ${s.sockets}, линии ${formatNumber(Number(s.lightingLine) + Number(s.socketLine))} м`,
      ]),
    };
  }
  if (key === 'external') return {
    summary: `наружная отделка ${formatNumber(calculation.inputs.external.facadeArea)} м² фасада`,
    details: joinParts(['Фасадные материалы, крепёж и монтажные работы', calculation.exterior?.plinthArea > 0 && `цоколь ${formatNumber(calculation.exterior.plinthArea)} м²`])
  };
  if (key === 'delivery') return {
    summary: `${formatNumber(project.settings.delivery.distance)} км, ${pluralRu(project.settings.delivery.trips, 'рейс', 'рейса', 'рейсов')}`,
    details: 'Доставка материалов и погрузочно-разгрузочные работы'
  };
  return { summary: `${lineCount} поз.`, details: 'Позиции, включённые в текущую смету проекта' };
}

export function buildCommercialScope(project, calculation) {
  return calculation.sections.filter((section) => section.lines.length).map((section) => {
    const description = scopeDescription(section.key, project, calculation, section.lines.length);
    const estimateGroups = section.key === 'sip' ? [...new Set(section.lines.map((line) => line.estimateGroup).filter(Boolean))] : [];
    return {
      key: section.key,
      title: section.title,
      ...description,
      coverage: [...sectionCoverage(section.lines), ...estimateGroups],
      total: formatMoney(sectionAmount(section.lines))
    };
  });
}
