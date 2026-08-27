import { resolveRoofAxes } from "../../calculations/roof-orientation.js";

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

export const DEFAULT_LINKS = {
  roofRidgeFromPlan: true,
  engineeringFromPlan: true,
  internalFinishFromPlan: true,
  externalFinishFromPlan: true,
  deliveryVolumeFromPlan: true
};

export const DEFAULT_FORMULAS = {
  roofRidgeExtra: 1,
  cableMetersPerM2: 1.2,
  electricPointsPerM2: 0.5,
  waterPipeMetersPerM2: 0.35,
  waterPointsPerWetRoom: 3,
  sewerMetersPerWetRoom: 5,
  sewerPointsPerWetRoom: 2,
  ventMetersPerWetRoom: 3,
  ventGrillesPerWetRoom: 1,
  cargoM3PerM2: 0.18,
  terraceCargoM3PerM2: 0.08,
  internalPartitionFaces: 2,
  laminateShare: 0.75,
  tileShare: 0.25,
  panelArea: 3.125,
  panelWidth: 1.25,
  panelLength: 2.5,
  sipTimberReservePercent: 5,
  sipTimberStockLength: 6,
  partitionBoardM3PerM2: 0.014,
  foamUnitsPerPanel: 0.5,
  structuralFastenerKgPerM2: 0.045,
  seamScrewKgPerM2: 0.012,
  spiralPackPerPanels: 35,
  foamUnitsPerJointMeter: 0.035,
  sipSeamScrewSpacingM: 0.15,
  sipPanelSupportScrews: 8,
  sipEdgeScrewSpacingM: 0.4,
  sipStructuralScrewSpacingM: 0.6,
  sipSeamScrewKgEach: 0.003,
  sipEdgeScrewKgEach: 0.006,
  sipStructuralScrewKg124: 0.055,
  sipStructuralScrewKg174: 0.068,
  sipStructuralScrewKg224: 0.086,
  pileConcreteM3: 0.01333,
  pileScrewKg: 0.12,
  pileLagScrews: 4,
  rafterLinearMPerM2: 2.456,
  hangingRafterReserve: 1.2,
  layeredRafterReserve: 1.12,
  trussRafterReserve: 1.55,
  gableBoardM3PerM2: 0.015,
  lathM3PerM2: 0.00655,
  roofScrewsPerM2: 8,
  roofFramingNailKgEach: 0.006,
  roofLathNailKgEach: 0.004,
  roofRafterSupportNails: 3,
  roofRafterRidgeNails: 3,
  roofRafterTieNails: 3,
  roofAngleNailsPerBracket: 5,
  roofLathNailsPerCrossing: 2,
  roofTrussPlatesPerFrame: 6,
  ridgeReserve: 1.1,
  mauerlatReserve: 1.05,
  mauerlatAnchorSpacing: 1.2,
  mauerlatScrewSpacing: 0.6,
  mauerlatScrewRows: 2,
  ridgeBeamReserve: 1.05,
  roofTrimReserve: 1.1,
  gutterBracketSpacing: 0.6,
  gutterOutletSpacing: 12,
  downpipeClampSpacing: 1.5,
  rafterInsulationThicknessM: 0.2,
  vaporBarrierRollArea: 70,
  terraceRoofPostSpacing: 3,
  terraceFrameBoardM3PerM2: 0.024,
  terraceDeckReserve: 1.05,
  terraceScrewKgPerM2: 0.12
};

const WET_ROOM = /(сануз|ванн|душ|котель|бойлер|кухн)/i;

export function deriveLinkedInputs(project, metrics) {
  const links = { ...DEFAULT_LINKS, ...(project.settings.links || {}) };
  const f = { ...DEFAULT_FORMULAS, ...(project.settings.formulas || {}) };
  const settings = project.settings;
  const roofAxes = resolveRoofAxes(project.plan, settings.roof);
  const floorCount = Math.max(1, Math.min(2, Number(project.meta?.floors) || 1));
  const activePlans = [project.plan, ...(project.upperFloors || []).slice(0, floorCount - 1)];
  const wetRooms = activePlans.flatMap((plan) => plan.rooms || []).filter((room) => room.include !== false && WET_ROOM.test(room.name || '')).length;
  const interiorDoors = activePlans.flatMap((plan) => plan.openings || []).filter((opening) => opening.type === 'door' && !opening.outer).length;
  const platformArea = metrics.platformArea || 0;
  const value = (auto, computed, manual) => round(auto ? computed : manual, 3);
  return {
    links,
    formulas: f,
    wetRooms,
    roof: {
      ridgeAxis: roofAxes.ridgeAxis,
      span: roofAxes.span,
      ridgeBaseLength: roofAxes.ridgeBaseLength,
      ridgeLength: value(links.roofRidgeFromPlan, roofAxes.ridgeBaseLength + f.roofRidgeExtra, settings.roof.ridgeLength)
    },
    engineering: {
      cableRoute: value(links.engineeringFromPlan, metrics.roomArea * f.cableMetersPerM2, settings.engineering.cableRoute),
      electricPoints: Math.round(value(links.engineeringFromPlan, metrics.roomArea * f.electricPointsPerM2, settings.engineering.electricPoints)),
      waterPipe: value(links.engineeringFromPlan, metrics.roomArea * f.waterPipeMetersPerM2, settings.engineering.waterPipe),
      waterPoints: Math.round(value(links.engineeringFromPlan, wetRooms * f.waterPointsPerWetRoom, settings.engineering.waterPoints)),
      sewerLength: value(links.engineeringFromPlan, wetRooms * f.sewerMetersPerWetRoom, settings.engineering.sewerLength),
      sewerPoints: Math.round(value(links.engineeringFromPlan, wetRooms * f.sewerPointsPerWetRoom, settings.engineering.sewerPoints)),
      ventDuct: value(links.engineeringFromPlan, wetRooms * f.ventMetersPerWetRoom, settings.engineering.ventDuct),
      ventGrilles: Math.round(value(links.engineeringFromPlan, wetRooms * f.ventGrillesPerWetRoom, settings.engineering.ventGrilles))
    },
    internal: {
      wallArea: value(links.internalFinishFromPlan, metrics.exteriorWallNetArea + metrics.partitionNetArea * f.internalPartitionFaces, settings.internal.wallArea),
      ceilingArea: value(links.internalFinishFromPlan, metrics.ceilingArea, settings.internal.ceilingArea),
      laminateArea: value(links.internalFinishFromPlan, metrics.roomArea * f.laminateShare, settings.internal.laminateArea),
      tileArea: value(links.internalFinishFromPlan, metrics.roomArea * f.tileShare, settings.internal.tileArea),
      doors: Math.round(value(links.internalFinishFromPlan, interiorDoors, settings.internal.doors))
    },
    external: {
      facadeArea: value(links.externalFinishFromPlan, metrics.exteriorWallNetArea, settings.external.facadeArea),
      windArea: value(links.externalFinishFromPlan, metrics.exteriorWallNetArea, settings.external.windArea),
      insulationArea: value(links.externalFinishFromPlan, metrics.exteriorWallNetArea, settings.external.insulationArea),
      metalArea: value(links.externalFinishFromPlan, metrics.exteriorWallNetArea, settings.external.metalArea),
      soffitArea: value(links.externalFinishFromPlan, metrics.perimeter * 0.6, settings.external.soffitArea)
    },
    delivery: {
      cargoVolume: value(links.deliveryVolumeFromPlan, metrics.roomArea * f.cargoM3PerM2 + platformArea * f.terraceCargoM3PerM2, settings.delivery.cargoVolume)
    }
  };
}

export function calculationFlowRows(project, calculation) {
  const { metrics, inputs } = calculation;
  const f = inputs.formulas;
  const floorMetricRows = metrics.floorPlans || [];
  const exteriorWallFormula = floorMetricRows
    .map(
      ({ floor, plan, metrics: floorMetrics }) =>
        `${floor} эт.: ${floorMetrics.perimeter} × ${plan.wallHeight} − ${floorMetrics.exteriorOpeningsArea}`,
    )
    .join("; ");
  const partitionFormula = floorMetricRows
    .map(
      ({ floor, plan, metrics: floorMetrics }) =>
        `${floor} эт.: ${floorMetrics.partitionLength} × ${plan.wallHeight} − ${floorMetrics.interiorOpeningsArea}`,
    )
    .join("; ");
  return [
    { group: 'Геометрия', source: 'Контуры всех этажей', formula: floorMetricRows.map(({ floor, metrics: floorMetrics }) => `${floor} эт.: ${floorMetrics.floorArea} м²`).join('; '), result: metrics.totalFloorArea, unit: 'м²', target: 'Пол 1 этажа, межэтажное перекрытие и пол 2 этажа' },
    { group: 'Геометрия', source: 'Лестничный проём между этажами', formula: `${metrics.secondFloorOpeningWidth || 0} × ${metrics.secondFloorOpeningLength || 0}`, result: metrics.secondFloorOpeningArea || 0, unit: 'м²', target: 'Вычет из межэтажного SIP-перекрытия; обозначение и полезная площадь обоих этажей' },
    { group: 'Геометрия', source: 'Комнаты «Второй свет»', formula: `${metrics.floorArea} − ${metrics.openCeilingArea}`, result: metrics.ceilingArea, unit: 'м²', target: 'Горизонтальный СИП-потолок' },
    { group: 'Геометрия', source: 'Комнаты плана', formula: 'Сумма площадей включённых комнат', result: metrics.roomArea, unit: 'м²', target: 'Отделка и инженерия' },
    { group: 'Геометрия', source: 'Периметр × высота − окна/двери', formula: exteriorWallFormula, result: metrics.exteriorWallNetArea, unit: 'м²', target: 'СИП-стены обоих этажей, фасад' },
    { group: 'Геометрия', source: 'Уникальные перегородки каждого этажа', formula: partitionFormula, result: metrics.partitionNetArea, unit: 'м²', target: 'Перегородки обоих этажей, внутренняя отделка' },
    { group: 'Фундамент', source: 'Свайные ряды + пристройки', formula: 'Объединение совпадающих точек', result: calculation.foundation.totalPiles, unit: 'шт', target: 'Сваи, оголовки, крепёж, работы' },
    { group: 'Фундамент', source: 'Нарисованные линии обвязки', formula: `ceil(${calculation.foundation.bindingLength} м × ${calculation.foundation.bindingLayers} слоя ÷ 6 м)`, result: calculation.foundation.boardCount, unit: 'досок по 6 м', target: `Доска обвязки 50×150 · ${calculation.foundation.boardVolume} м³` },
    { group: 'СИП', source: 'Пол + межэтажное перекрытие + наружные стены + потолок', formula: `ceil(чистая площадь ÷ ${f.panelArea} × запас)`, result: calculation.sip.cutting.reduce((sum, row) => sum + row.panels, 0), unit: 'панелей', target: 'Закупка целых СИП-панелей' },
    { group: 'СИП', source: 'Контуры, проёмы и раскладка 1250/625 мм', formula: 'подрезка негабаритных границ + контуры проёмов + продольный роспуск рабочих панелей', result: calculation.sip.cutting.reduce((sum, row) => sum + row.cutMeters, 0), unit: 'м реза', target: 'Раскрой СИП без резки запасных панелей' },
    { group: 'СИП', source: 'Межпанельные швы', formula: `длина швов + ${f.sipTimberReservePercent}%; ceil(Σ ÷ ${f.sipTimberStockLength} м)`, result: calculation.sip.joinery.totalJointPurchaseLength, unit: 'м закупки', target: 'Термобрус / пакет досок / цельный брус' },
    { group: 'СИП', source: 'Низ, верх, наружные углы и контуры проёмов', formula: `открытые торцы + ${f.sipTimberReservePercent}%; ceil(Σ ÷ ${f.sipTimberStockLength} м)`, result: calculation.sip.joinery.totalEndBoardPurchaseLength, unit: 'м закупки', target: 'Торцевая доска по толщине панели' },
    { group: 'Кровля', source: 'Габарит дома и направление конька', formula: `${inputs.roof.ridgeAxis === 'y' ? 'ширина' : 'длина'} дома + ${f.roofRidgeExtra}`, result: inputs.roof.ridgeLength, unit: 'м', target: 'Конёк и площадь скатов', auto: inputs.links.roofRidgeFromPlan },
    { group: 'Кровля', source: 'Выбранная схема мауэрлата', formula: `${calculation.roof.mauerlatLayout === 'perimeter' ? 'наружный периметр' : calculation.roof.mauerlatLayout === 'supports' ? 'две опорные стены' : 'отключён'} × ${f.mauerlatReserve}; ceil(Σ ÷ 6 м)`, result: calculation.roof.mauerlatPurchaseLength, unit: 'м.п.', target: `Мауэрлат 100×150 · ${calculation.roof.mauerlatBoardCount || 0} брусьев по 6 м` },
    { group: 'Кровля', source: 'Крепление мауэрлата к стенам', formula: calculation.roof.mauerlatFastener === 'sip-screws' ? `${calculation.roof.mauerlatFastenerPoints || 0} точек × ${calculation.roof.mauerlatScrewRows || 0} ряда` : calculation.roof.mauerlatFastener === 'anchors' ? `по сегментам с шагом до ${calculation.roof.mauerlatFastenerSpacing || 0} м` : 'крепление отключено', result: calculation.roof.mauerlatFastener === 'sip-screws' ? calculation.roof.mauerlatScrewCount : calculation.roof.mauerlatAnchors, unit: 'шт', target: calculation.roof.mauerlatFastener === 'anchors' ? 'Анкер-шпильки М12' : 'Конструкционные саморезы по толщине SIP-стены' },
    { group: 'Кровля', source: 'Стропильная схема', formula: `ceil(${calculation.roof.rafterStructure?.frameLength || 0} ÷ (${calculation.roof.rafterStructure?.step || 0} + 0,05)) + 1 = ${calculation.roof.rafterStructure?.pairCount || 0} пар; пиломатериал ceil(Σ ÷ 6)`, result: calculation.roof.rafterBoardCount, unit: 'досок по 6 м', target: `Стропила ${(calculation.roof.rafterStructure?.section || '50x150').replace('x', '×')}` },
    { group: 'Кровля', source: 'Узлы стропил по СП 31-105-2002', formula: `опоры ${calculation.roof.rafterSupportNodeCount || 0} + конёк + затяжки; минимум ${f.roofRafterSupportNails}/${f.roofRafterRidgeNails}/${f.roofRafterTieNails} гвоздя`, result: calculation.roof.framingNailCount || 0, unit: 'гвоздей', target: 'Крепление стропил от 80 мм; уголки при выбранном усиленном узле' },
    { group: 'Кровля', source: 'Пересечения обрешётки со стропилами', formula: `${calculation.roof.lathCrossingCount || 0} × ${f.roofLathNailsPerCrossing}`, result: calculation.roof.lathNailCount || 0, unit: 'гвоздей/саморезов', target: 'Крепление обрешётки' },
    { group: 'Кровля', source: 'Линия конька', formula: `длина конька × ${f.ridgeBeamReserve}`, result: calculation.roof.ridgeBeamPurchaseLength, unit: 'м.п.', target: 'Коньковая доска и обязательная коньковая планка' },
    { group: 'Кровля', source: 'Карнизы и торцы скатов', formula: `карнизы 2L; торцы 4 × длина ската; запас ${f.roofTrimReserve}`, result: (project.settings.roof.includeEaveTrim === false ? 0 : calculation.roof.mainEaveTrimPurchaseLength) + (project.settings.roof.includeVergeTrim === false ? 0 : calculation.roof.mainVergeTrimPurchaseLength), unit: 'м.п.', target: 'Выбранные доборные планки с монтажом' },
    { group: 'Кровля', source: 'Площадь скатов и шаг обрешётки', formula: `${calculation.roof.geometry?.totalSlopeArea || 0} ÷ ${calculation.roof.lathStep || 0.35} + карнизные ряды; ceil(Σ ÷ 6)`, result: calculation.roof.mainLathBoardCount || 0, unit: 'досок по 6 м', target: 'Обрешётка 25×100 и её монтаж' },
    { group: 'Кровля', source: 'Карнизы основной крыши', formula: project.settings.roof.includeGutter === true ? `жёлоб ${calculation.roof.gutterLength || 0} м; выпусков ${calculation.roof.gutterOutlets || 0}; трубы ${calculation.roof.downpipeLength || 0} м` : 'водосточная система отключена', result: calculation.roof.gutterLength || 0, unit: 'м.п.', target: 'Комплект водостока и монтаж' },
    { group: 'Кровля', source: 'Фронтоны основной крыши и пристроек', formula: 'Σ основание × высота ÷ 2 × количество', result: calculation.roof.gableArea, unit: 'м²', target: 'Каркасные или SIP-фронтоны, облицовка и работы' },
    { group: 'Кровля', source: 'Наружный край кровель террас', formula: `ceil(длина ÷ ${f.terraceRoofPostSpacing}) + 1`, result: calculation.roof.terracePostCount, unit: 'столбов', target: 'Брус 100×100 или 150×100 по толщине стен' },
    { group: 'Кровля', source: 'Зоны второго света', formula: `площадь зоны × коэффициент ската`, result: calculation.roof.insulatedRafterArea, unit: 'м²', target: 'Стропила, минвата и пароизоляция' },
    { group: 'Террасы', source: 'Площадки плана', formula: 'Σ ширина × глубина', result: calculation.terrace.area, unit: 'м²', target: 'Настил, каркас, лестницы, кровля' },
    { group: 'Проёмы', source: 'Окна и двери всех этажей', formula: 'Количество и индивидуальные размеры', result: calculation.metrics.floorPlans.reduce((sum, item) => sum + (item.plan.openings || []).length, 0), unit: 'шт', target: 'Вычеты стен, изделия, монтаж' },
    { group: 'Инженерия', source: 'Площадь + названия мокрых комнат', formula: `${metrics.roomArea} м²; мокрых комнат: ${inputs.wetRooms}`, result: inputs.engineering.cableRoute, unit: 'м кабеля', target: 'Электрика, вода, канализация, вентиляция', auto: inputs.links.engineeringFromPlan },
    { group: 'Отделка', source: 'Стены, перегородки, пол и двери плана', formula: `наружные стены + перегородки × ${f.internalPartitionFaces}`, result: inputs.internal.wallArea, unit: 'м²', target: 'Внутренняя и наружная отделка', auto: inputs.links.internalFinishFromPlan && inputs.links.externalFinishFromPlan },
    { group: 'Доставка', source: 'Дом + террасы', formula: `${metrics.roomArea} × ${f.cargoM3PerM2} + ${metrics.platformArea} × ${f.terraceCargoM3PerM2}`, result: inputs.delivery.cargoVolume, unit: 'м³', target: 'Разгрузка и число рейсов', auto: inputs.links.deliveryVolumeFromPlan }
  ];
}
