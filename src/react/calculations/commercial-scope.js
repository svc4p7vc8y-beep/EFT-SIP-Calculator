import { formatMoney, formatNumber } from '../utils/format.js';
import { EXTERIOR_TYPES } from './exterior-model.js';
import { isInteriorDoor } from './opening-types.js';
import { buildClientEstimate, isEstimateAccessory, isEstimateCutting } from './client-estimate.js';
import { constructionDescription, internalDescription } from './proposal-description.js';

const ROOF_TYPES = { cold: 'холодная', sip: 'тёплая SIP', combo: 'комбинированная' };
const ROOF_SHAPES = { flat: 'плоская', gable: 'двускатная', hip: 'вальмовая', tiered: 'два односкатных уровня' };
const ROOF_COVERINGS = { profile: 'профлист С-21', 'profile-st15': 'профлист ST15', 'metal-tile': 'металлочерепица', soft: 'мягкая кровля с OSB' };
const CONNECTOR_TYPES = { thermal: 'термобрус', 'board-pack': 'клеёный пакет досок', 'board-kit': 'комплект для пакета досок', solid: 'брус естественной влажности' };

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

function scopeDescription(key, project, calculation, lineCount, lines) {
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

  if (key === 'foundation') return project.services.foundation ? (() => {
    const blockLine = lines.find(line => line.id === 'foundation:concrete-blocks');
    const concretePileLine = lines.find(line => line.id === 'foundation:concrete-piles');
    const screwPileLine = lines.find(line => line.id === 'foundation:piles');
    const support = blockLine
      ? pluralRu(blockLine.qty, 'бетонный блок', 'бетонных блока', 'бетонных блоков')
      : concretePileLine
        ? pluralRu(concretePileLine.qty, 'железобетонная свая', 'железобетонные сваи', 'железобетонных свай')
        : screwPileLine
          ? pluralRu(screwPileLine.qty, 'свая', 'сваи', 'свай')
          : 'опоры исключены из текущей сметы';
    const supportDetails = blockLine ? 'Бетонные блоки с монтажом'
      : concretePileLine ? 'Железобетонные сваи с оголовками и установкой'
        : screwPileLine ? screwPileLine.catalogId?.startsWith('MAT-PILE-KIT-')
          ? 'Винтовые сваи с установкой, оголовками и пескобетоном; разбивка осей отдельно'
          : 'Разбивка, монтаж винтовых свай и оголовки' : '';
    return {
      summary: `${support}, обвязка ${formatNumber(foundation.bindingLength)} м`,
      details: joinParts([supportDetails, `${foundation.boardCount} досок обвязки по 6 м`, lines.some(line => line.id.includes('binding-pack-screw')) && 'крепёж обвязки']),
    };
  })() : foundation.concreteBase?.active ? {
    summary: `Готовое бетонное основание; обвязка ${formatNumber(foundation.concreteBase?.length || 0)} м`,
    details: `Лежачий брус 100×150, отсечная гидроизоляция, ${foundation.concreteBase?.anchorCount || 0} анкеров к бетону и монтаж; устройство бетона не входит в предложение. Шаг анкеров и узел проверить по проекту.`,
  } : {
    summary: 'Основание и обвязка не включены',
    details: 'Комплект по готовому бетонному основанию отключён; бетон, обвязка и их монтаж не входят в предложение.',
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
      blocks: constructionDescription(project, lines),
      details: joinParts([
        `Типы конструкций и толщины указаны ниже по параметрам сметы. Соединения панелей: ${CONNECTOR_TYPES[project.settings.sip.connectorType] || 'термобрус'}. Чистовая отделка описана отдельно`,
        floorCount > 1 && metrics.secondFloorOpeningArea > 0 && `лестничный проём ${formatNumber(metrics.secondFloorOpeningWidth)} × ${formatNumber(metrics.secondFloorOpeningLength)} м расположен на планах обоих этажей и вычтен из межэтажного перекрытия`,
      ])
    };
  }
  if (key === 'roof') {
    const coveredPlatforms = platforms.filter((platform) => platform.roof?.mode && platform.roof.mode !== 'none').length;
    return {
      summary: `${ROOF_SHAPES[project.settings.roof.shape] || 'двускатная'} ${ROOF_TYPES[project.settings.roof.type] || 'холодная'} кровля, ${project.settings.roof.shape === 'flat' && project.settings.roof.flatCoverSystem === 'bitumen' ? `обрешётка, ${project.settings.roof.flatDeckMaterial === 'osb' ? 'ОСБ' : 'ЦСП'} и два слоя рулонной гидроизоляции` : ROOF_COVERINGS[project.settings.roof.covering] || 'профлист С-21'}, ${formatNumber(roof.totalArea)} м²`,
      details: joinParts([
        project.settings.roof.shape === 'flat'
          ? `плоская кровля: ${roof.flatSlopeMode === 'structural' ? 'перепад высоты стен' : roof.flatSlopeMode === 'tapered' ? 'разуклонка верхними досками' : 'уклон не задан'}; ${project.settings.roof.type === 'cold' ? roof.flatSlopeMode === 'structural' ? `стеновые SIP подрезаны по уклону, потолок и мауэрлат следуют перепаду, стропила с шагом ${formatNumber(roof.rafterStructure?.step || .6)} м; узлы требуют проверки` : `верхние стропила с шагом ${formatNumber(roof.rafterStructure?.step || .6)} м, нижний пояс и стойки через 1 м${roof.flatSlopeMode === 'tapered' ? '' : `, глубина каркаса ${Number(project.settings.roof.flatFrameDepthMm) || 300} мм`}; раскрой и узлы требуют проверки` : 'несущая схема по проекту'}`
          : project.settings.roof.shape === 'tiered'
          ? `два односкатных уровня: верхний ${formatNumber(roof.geometry?.upperArea || 0)} м², нижний ${formatNumber(roof.geometry?.lowerArea || 0)} м²; шаг стропил ${formatNumber(roof.rafterStructure?.step || .6)} м; линия примыкания ${formatNumber(roof.geometry?.junctionLength || 0)} м`
          : `основная кровля, ${roof.rafterStructure?.system === 'layered' ? 'наслонная система' : roof.rafterStructure?.system === 'truss' ? 'стропильные фермы' : 'висячая система'} с чистым шагом ${formatNumber(roof.rafterStructure?.step || .6)} м`,
        project.settings.roof.shape === 'tiered' && 'опоры перепада уровней, высотные отметки и гидроизоляция примыкания — по конструктивному проекту',
        project.settings.roof.shape === 'flat' && project.settings.roof.type === 'cold' && roof.flatSlopeMode !== 'structural' && 'нижний пояс и стойки показаны в конструктиве и раскрое; в цену не включены до проверки сечения, стыков и опор',
        roof.flatParapetLength > 0 && `SIP-парапет ${formatNumber(roof.flatParapetLength)} м по краю кровли; ${project.settings.roof.flatParapetMode === 'open' ? `открытая сторона ${project.settings.roof.flatOpenSide || 'back'}, вынос ${Number(project.settings.roof.flatOpenOverhangMm ?? 500)} мм` : project.settings.roof.flatParapetMode === 'closed' ? `через парапет ${Number(project.settings.roof.flatDrainCount ?? 2)} воронки` : 'листовое покрытие с примыканием'}`,
        roof.flatWaterproofArea > 0 && `обрешётка 25×100 мм, по ней ${project.settings.roof.flatDeckMaterial === 'osb' ? `ОСБ ${Number(project.settings.roof.flatOsbThicknessMm) === 9 ? 9 : 12} мм` : 'ЦСП 12 мм'} в ${Number(project.settings.roof.flatDeckLayers ?? 2)} сл.; праймер, ${project.settings.roof.flatDeckMaterial === 'osb' ? 'самоклеящийся нижний Техноэласт С ЭМС и верхний Техноэласт ЭКП' : 'нижний ХПП и верхний ХКП'}, подъём на парапет и спуск на фасад; площадь каждого слоя гидроизоляции ${formatNumber(roof.flatWaterproofArea)} м²`,
        roof.layeredRidgeLength > 0 && `два ряда конькового прогона 100×50 мм с монтажом; несущие опоры и их крепление уточняются по конструктивному проекту`,
        roof.mauerlatLength > 0 && `мауэрлат ${roof.mauerlatProfile} мм плашмя: ${formatNumber(roof.mauerlatLength)} м, ${roof.mauerlatBoardCount || 0} заготовок по 6 м`,
        roof.mauerlatFastener === 'sip-screws' && `крепление мауэрлата: ${roof.mauerlatScrewCount || 0} конструкционных саморезов ${roof.mauerlatScrewSize || ''}`,
        roof.mauerlatFastener === 'anchors' && `крепление мауэрлата: ${roof.mauerlatAnchors || 0} анкер-шпилек`,
        `крепёж стропильных узлов ${roof.framingNailCount || 0} шт, обрешётки ${roof.lathNailCount || 0} шт`,
        `обрешётка с шагом ${formatNumber(roof.lathStep || .35, 2)} м`,
        project.settings.roof.shape === 'hip' && `коэффициент вальмовой кровли: материалы +25%, работы +50%`,
        ['gable', 'hip'].includes(project.settings.roof.shape) && `конёк включён`,
        project.settings.roof.includeGutter === true && `водосточная система ${formatNumber(roof.gutterLength)} м`,
        roof.gableArea > 0 && (roof.flatSlopeMode === 'structural'
          ? `зашивка перепада высот ${formatNumber(roof.gableArea)} м²`
          : `фронтоны ${formatNumber(roof.gableArea)} м²`),
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
    const s = calculation.engineering?.settings || project.settings.engineering || {};
    const stage = value => ({ rough: 'черновая', prefinish: 'предчистовая без приборов', complete: 'полная' }[value] || 'базовая');
    const ventilation = { natural: 'КИВ + вытяжка', decentralized: 'комнатные рекуператоры', supply: 'общий приток с подогревом' }[s.ventilationSolution];
    const systems = [
      project.services.engineeringElectric && `электрика: ${stage(s.electricStage)}`,
      project.services.engineeringPlumbing && `водоснабжение: ${stage(s.waterStage)}${s.waterSource === 'well' ? `, колодец ${s.wellRings || 0} колец` : ''}`,
      project.services.engineeringSewerage && `канализация: ${stage(s.sewerStage)}`,
      project.services.engineeringVentilation && `вентиляция: ${stage(s.ventilationStage)}${ventilation ? `, ${ventilation}` : ''}`,
      project.services.engineeringHeating && `отопление: ${stage(s.heatingStage)}, ${s.heatingBoilerType === 'none' ? 'без котла' : `${s.heatingBoilerType === 'gas' ? 'газовый' : 'электрический'} котёл ${s.heatingBoilerPowerKw || 0} кВт`}, тёплый пол ${formatNumber(s.heatingArea)} м², стяжка ${s.screedThicknessMm || 0} мм`,
    ].filter(Boolean);
    return { summary: systems.join(', '), details: 'Каждая система учитывает выбранную стадию; в предчистовой комплектации финальные приборы не входят' };
  }
  if (key === 'internal') {
    const detailed=calculation.internal?.mode==='rooms';
    return {
      summary: detailed
        ? 'Отделка по помещениям: покрытия пола, облицовка стен и потолков, основания и дополнительные элементы'
        : `внутренняя отделка ${formatNumber(calculation.inputs.internal.wallArea)} м² стен`,
      blocks: internalDescription(calculation, lines),
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
        e.soffitArea > 0 && `подшивка ${formatNumber(e.soffitArea)} м²${s.soffitType === 'metal-st15' ? ' профлистом ST-15' : s.soffitType === 'metal' ? ' профлистом С-21' : ''}`,
        e.plinthArea > 0 && `цоколь ${formatNumber(e.plinthArea)} м², высота ${formatNumber(s.plinthHeight)} м, ${s.plinthMaterial === 'brick' ? 'панели под кирпич' : s.plinthMaterial === 'metal-st15' ? 'профлист ST-15' : 'профлист С-21'}, труба 50×25×2`,
        s.outdoorEnabled && (s.lights || s.sockets || s.lightingLine || s.socketLine) && `наружная электрика: светильники ${s.lights}, розетки ${s.sockets}, линии ${formatNumber(Number(s.lightingLine) + Number(s.socketLine))} м`,
      ]),
    };
  }
  if (key === 'external') return {
    summary: `наружная отделка ${formatNumber(calculation.inputs.external.facadeArea)} м² фасада`,
    details: joinParts(['Фасадные материалы, крепёж и монтажные работы', calculation.inputs.external.metalArea > 0 && project.settings.external.legacyMetalType === 'metal-st15' && 'профлист ST-15', calculation.exterior?.plinthArea > 0 && `цоколь ${formatNumber(calculation.exterior.plinthArea)} м²`])
  };
  if (key === 'delivery') return {
    summary: `${formatNumber(project.settings.delivery.distance)} км, ${pluralRu(project.settings.delivery.trips, 'рейс', 'рейса', 'рейсов')}`,
    details: 'Доставка материалов и погрузочно-разгрузочные работы'
  };
  return { summary: `${lineCount} поз.`, details: 'Позиции, включённые в текущую смету проекта' };
}

export function buildCommercialScope(project, calculation, options = {}) {
  const clientSections = new Map(buildClientEstimate(calculation, options).sections.map(section => [section.key, section]));
  return calculation.sections.map(section => ({ ...section, lines: section.lines.filter(line =>
    Number(line.qty) > 0 &&
    (options.includeLabor !== false || line.kind !== 'labor' || isEstimateCutting(line)) &&
    (options.includeAccessories !== false || !isEstimateAccessory(line))
  ) })).filter((section) => section.lines.length).map((section) => {
    const description = scopeDescription(section.key, project, calculation, section.lines.length, section.lines);
    const estimateGroups = section.key === 'sip' ? [...new Set(section.lines.map((line) => line.estimateGroup).filter(Boolean))] : [];
    const groups = [...new Set(section.lines.map(line => line.estimateGroup).filter(Boolean))];
    const materials = section.lines.filter(line => line.kind !== 'labor');
    const labor = section.lines.filter(line => line.kind === 'labor');
    const breakdown = [materials.length && `Материалы и оборудование: ${formatMoney(sectionAmount(materials))}.`,
      labor.length && `Работы: ${formatMoney(sectionAmount(labor))}.`].filter(Boolean).join(' ');
    const exclusions = [options.includeLabor === false && 'Монтажные работы исключены; технологический раскрой сохраняется, если он рассчитан.',
      options.includeAccessories === false && 'Крепёж и сопутствующие расходные материалы исключены.'].filter(Boolean).join(' ');
    return {
      key: section.key,
      title: section.title,
      ...description,
      details: exclusions ? `Комплектация по выбранным параметрам проекта. ${exclusions}` : description.details,
      expanded: `${groups.length && !description.blocks ? `Учтённые части раздела: ${groups.join('; ')}. ` : ''}${breakdown}`,
      coverage: [...sectionCoverage(section.lines), ...estimateGroups],
      total: formatMoney(sectionAmount(clientSections.get(section.key)?.lines || section.lines))
    };
  });
}
