const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const ceil = (value) => Math.ceil(Math.max(0, n(value)));
const reserve = (value, factor) => Math.ceil(Math.max(0, n(value)) * factor * 10) / 10;
const rank = { rough: 0, prefinish: 1, complete: 2 };

export const ENGINEERING_STAGES = [
  { value: 'rough', label: 'Черновая · трассы и закладные' },
  { value: 'prefinish', label: 'Предчистовая · точки готовы, без приборов' },
  { value: 'complete', label: 'Полная · приборы и пуск' },
];

export const VENTILATION_SOLUTIONS = [
  { value: 'natural', label: 'Бюджетная · КИВ + вытяжка мокрых зон' },
  { value: 'decentralized', label: 'С рекуперацией · комнатные рекуператоры' },
  { value: 'supply', label: 'Компактная · общий приток с подогревом + вытяжка' },
];

export const DEFAULT_ENGINEERING = {
  assemblyVersion: 1,
  reserve: 1.1,
  includeDesign: true,
  cableRoute: 120,
  electricPoints: 50,
  waterPipe: 100,
  waterPoints: 5,
  sewerLength: 20,
  sewerPoints: 5,
  ventDuct: 25,
  ventGrilles: 5,
  electricStage: 'prefinish',
  electricAuto: true,
  socketPoints: 24,
  switchPoints: 9,
  lightPoints: 12,
  powerPoints: 5,
  electricCircuits: 7,
  electricPanel: true,
  electricGrounding: true,
  waterStage: 'prefinish',
  waterAuto: true,
  waterSource: 'well',
  wellRings: 6,
  wellRoute: 15,
  wellPump: true,
  wellAutomation: true,
  frostProtection: true,
  waterFilter: true,
  sewerStage: 'prefinish',
  sewerAuto: true,
  sewerSystem: 'rings',
  externalSewerLength: 10,
  septicRings: 4,
  fanStack: true,
  ventilationStage: 'complete',
  ventilationAuto: true,
  ventilationSolution: 'natural',
  supplyDevices: 4,
  extractFans: 2,
  roofPassages: 2,
  transferGrilles: 3,
};

function descriptor(catalogId, qty, group, key, extra = {}) {
  if (!(n(qty) > 0)) return null;
  return { catalogId, qty, group, key, ...extra };
}

export function normalizeEngineering(settings = {}, inputs = {}, metrics = {}) {
  const s = { ...DEFAULT_ENGINEERING, ...settings };
  const linked = inputs || {};
  const hasLinked = (key) => linked[key] !== undefined && linked[key] !== null;
  const hasRoomArea = metrics?.roomArea !== undefined && metrics?.roomArea !== null;
  const hasWetRooms = inputs?.wetRooms !== undefined && inputs?.wetRooms !== null;
  const totalElectric = Math.max(1, Math.round(n(linked.electricPoints, s.electricPoints)));
  const wetRooms = Math.max(1, Math.round(n(inputs.wetRooms, s.extractFans)));
  const roomArea = Math.max(1, n(metrics.roomArea, s.supplyDevices * 25));
  const socketPoints = s.electricAuto ? ceil(totalElectric * 0.48) : ceil(s.socketPoints);
  const switchPoints = s.electricAuto ? ceil(totalElectric * 0.18) : ceil(s.switchPoints);
  const lightPoints = s.electricAuto ? ceil(totalElectric * 0.24) : ceil(s.lightPoints);
  const powerPoints = s.electricAuto ? Math.max(1, totalElectric - socketPoints - switchPoints - lightPoints) : ceil(s.powerPoints);
  return {
    ...s,
    reserve: Math.max(1, n(s.reserve, 1.1)),
    cableRoute: s.electricAuto ? n(linked.cableRoute, s.cableRoute) : n(s.cableRoute),
    electricPoints: totalElectric,
    socketPoints,
    switchPoints,
    lightPoints,
    powerPoints,
    electricCircuits: s.electricAuto ? Math.max(3, ceil(totalElectric / 8)) : ceil(s.electricCircuits),
    waterPipe: s.waterAuto ? n(linked.waterPipe, s.waterPipe) : n(s.waterPipe),
    waterPoints: s.waterAuto && hasLinked('waterPoints') ? ceil(linked.waterPoints) : ceil(s.waterPoints),
    sewerLength: s.sewerAuto ? n(linked.sewerLength, s.sewerLength) : n(s.sewerLength),
    sewerPoints: s.sewerAuto && hasLinked('sewerPoints') ? ceil(linked.sewerPoints) : ceil(s.sewerPoints),
    ventDuct: s.ventilationAuto ? n(linked.ventDuct, s.ventDuct) : n(s.ventDuct),
    ventGrilles: s.ventilationAuto && hasLinked('ventGrilles') ? ceil(linked.ventGrilles) : ceil(s.ventGrilles),
    supplyDevices: s.ventilationAuto && hasRoomArea ? Math.max(1, ceil(roomArea / 25)) : ceil(s.supplyDevices),
    extractFans: s.ventilationAuto && hasWetRooms ? wetRooms : ceil(s.extractFans),
    roofPassages: s.ventilationAuto && hasWetRooms ? Math.max(1, ceil(wetRooms / 2)) : ceil(s.roofPassages),
    transferGrilles: s.ventilationAuto && hasWetRooms ? Math.max(1, wetRooms) : ceil(s.transferGrilles),
    wellRings: Math.max(1, ceil(s.wellRings)),
    septicRings: Math.max(1, ceil(s.septicRings)),
    wellRoute: Math.max(0, n(s.wellRoute)),
    externalSewerLength: Math.max(0, n(s.externalSewerLength)),
  };
}

function electricLines(s) {
  const lines = [], factor = s.reserve;
  const points = s.socketPoints + s.switchPoints + s.lightPoints + s.powerPoints;
  const route = reserve(s.cableRoute, factor);
  const prepPoints = s.socketPoints + s.switchPoints + s.powerPoints;
  const powerCircuits = Math.min(s.electricCircuits, Math.max(1, ceil(s.powerPoints / 2)));
  const group = `Электрика · ${ENGINEERING_STAGES.find(item => item.value === s.electricStage)?.label.split(' · ')[0] || ''}`;
  if (s.includeDesign) lines.push(descriptor('ENG-LAB-ELEC-DESIGN', 1, group, 'electric-design'));
  lines.push(
    descriptor('MAT-125', route * 0.45, group, 'electric-cable-light'),
    descriptor('MAT-126', route * 0.55, group, 'electric-cable-power'),
    descriptor('MAT-127', reserve(s.powerPoints * 8, factor), group, 'electric-cable-heavy'),
    descriptor('MAT-130', route, group, 'electric-conduit'),
    descriptor('MAT-134', ceil(route * 2), group, 'electric-clips'),
    descriptor('MAT-136', Math.max(1, ceil(points / 6)), group, 'electric-boxes'),
    descriptor('MAT-133', ceil(points * 3), group, 'electric-terminals'),
    descriptor('ENG-MAT-ELEC-CONSUMABLE', 1, group, 'electric-consumables'),
    descriptor('LAB-071', route, group, 'electric-pull'),
    descriptor('LAB-072', route, group, 'electric-route'),
    descriptor('LAB-073', Math.max(1, ceil(points / 6)), group, 'electric-box-work'),
  );
  if (rank[s.electricStage] >= 1) {
    lines.push(
      descriptor('MAT-135', prepPoints, group, 'electric-podrozetnik'),
      descriptor('MAT-132', s.lightPoints, group, 'electric-light-base'),
      descriptor('LAB-078', prepPoints, group, 'electric-podrozetnik-work'),
    );
    if (s.electricPanel) lines.push(
      descriptor('MAT-142', 1, group, 'electric-panel'),
      descriptor('ENG-MAT-ELEC-PANEL-KIT', 1, group, 'electric-panel-kit'),
      descriptor('MAT-128', 1, group, 'electric-main-breaker'),
      descriptor('MAT-141', 1, group, 'electric-rcd'),
      descriptor('MAT-123', Math.max(1, s.electricCircuits - powerCircuits), group, 'electric-breakers'),
      descriptor('MAT-124', powerCircuits, group, 'electric-power-breakers'),
      descriptor('MAT-137', 1, group, 'electric-voltage-relay'),
      descriptor('ENG-LAB-ELEC-PANEL', 1, group, 'electric-panel-work'),
    );
    if (s.electricGrounding) lines.push(
      descriptor('ENG-MAT-ELEC-GROUND', 1, group, 'electric-ground'),
      descriptor('ENG-LAB-ELEC-GROUND', 1, group, 'electric-ground-work'),
    );
  }
  if (rank[s.electricStage] >= 2) lines.push(
    descriptor('MAT-138', s.socketPoints, group, 'electric-sockets'),
    descriptor('MAT-139', s.powerPoints, group, 'electric-power-sockets'),
    descriptor('MAT-129', s.switchPoints, group, 'electric-switches'),
    descriptor('ENG-MAT-ELEC-FRAME', prepPoints, group, 'electric-frames'),
    descriptor('MAT-140', s.lightPoints, group, 'electric-lights'),
    descriptor('LAB-079', prepPoints, group, 'electric-terminal-work'),
    descriptor('ENG-LAB-ELEC-LIGHT', s.lightPoints, group, 'electric-light-work'),
  );
  return lines;
}

function wellLines(s, group) {
  const lines = [
    descriptor('ENG-MAT-WELL-RING', s.wellRings, group, 'well-rings'),
    descriptor('ENG-LAB-WELL-RING', s.wellRings, group, 'well-ring-work'),
    descriptor('ENG-LAB-WELL-EARTH', Math.round(s.wellRings * 0.95 * 10) / 10, group, 'well-earth'),
    descriptor('ENG-MAT-WELL-SEAL', s.wellRings, group, 'well-seal'),
    descriptor('ENG-MAT-WELL-COVER', 1, group, 'well-cover'),
    descriptor('ENG-MAT-WELL-HATCH', 1, group, 'well-hatch'),
    descriptor('ENG-MAT-WELL-BOTTOM-FILTER', 1, group, 'well-filter-bed'),
    descriptor('ENG-LAB-WELL-HEAD', 1, group, 'well-head-work'),
    descriptor('ENG-MAT-PND32', reserve(s.wellRoute, s.reserve), group, 'well-pnd'),
    descriptor('ENG-LAB-WATER-TRENCH', s.wellRoute, group, 'well-trench'),
  ];
  if (s.frostProtection) lines.push(
    descriptor('ENG-MAT-WATER-INSULATION', reserve(s.wellRoute, s.reserve), group, 'well-insulation'),
    descriptor('ENG-MAT-WATER-HEAT-CABLE', reserve(Math.min(s.wellRoute, 10), s.reserve), group, 'well-heat-cable'),
  );
  if (s.wellPump) lines.push(
    descriptor('ENG-MAT-WELL-PUMP', 1, group, 'well-pump'),
    descriptor('ENG-MAT-WELL-SUSPENSION', 1, group, 'well-suspension'),
    descriptor('ENG-LAB-WELL-PUMP', 1, group, 'well-pump-work'),
  );
  if (s.wellAutomation) lines.push(
    descriptor('ENG-MAT-WELL-AUTOMATION', 1, group, 'well-automation'),
    descriptor('ENG-LAB-WELL-AUTOMATION', 1, group, 'well-automation-work'),
  );
  if (s.waterFilter) lines.push(descriptor('ENG-MAT-WATER-FILTER', 1, group, 'well-water-filter'));
  return lines;
}

function waterLines(s) {
  const group = `Водоснабжение · ${ENGINEERING_STAGES.find(item => item.value === s.waterStage)?.label.split(' · ')[0] || ''}`;
  const lines = [
    descriptor('MAT-159', reserve(s.waterPipe, s.reserve), group, 'water-pipe'),
    descriptor('ENG-MAT-WATER-FITTINGS', s.waterPoints, group, 'water-fittings'),
    descriptor('LAB-089', s.waterPipe, group, 'water-pipe-work'),
    descriptor('ENG-LAB-WATER-ROUGH-POINT', s.waterPoints, group, 'water-points-work'),
  ];
  if (s.includeDesign) lines.push(descriptor('LAB-092', 1, group, 'water-design'));
  if (rank[s.waterStage] >= 1 && s.waterSource === 'well') lines.push(...wellLines(s, 'Водоснабжение · колодец'));
  if (rank[s.waterStage] >= 1) lines.push(descriptor('LAB-081', 1, group, 'water-test'));
  if (rank[s.waterStage] >= 2) lines.push(
    descriptor('ENG-MAT-WATER-TERMINAL', s.waterPoints, group, 'water-terminals'),
    descriptor('ENG-LAB-WATER-TERMINAL', s.waterPoints, group, 'water-terminal-work'),
  );
  return lines;
}

function sewerLines(s) {
  const group = `Канализация · ${ENGINEERING_STAGES.find(item => item.value === s.sewerStage)?.label.split(' · ')[0] || ''}`;
  const lines = [
    descriptor('ENG-MAT-SEWER50', reserve(s.sewerLength * 0.65, s.reserve), group, 'sewer-pipe-50'),
    descriptor('MAT-158', reserve(s.sewerLength * 0.35, s.reserve), group, 'sewer-pipe-110'),
    descriptor('ENG-MAT-SEWER-FITTINGS', s.sewerPoints, group, 'sewer-fittings'),
    descriptor('ENG-LAB-SEWER-ROUGH-POINT', s.sewerPoints, group, 'sewer-point-work'),
  ];
  if (s.includeDesign) lines.push(descriptor('LAB-091', 1, group, 'sewer-design'));
  if (rank[s.sewerStage] >= 1) {
    lines.push(
      descriptor('MAT-158', reserve(s.externalSewerLength, s.reserve), group, 'sewer-outdoor-pipe'),
      descriptor('LAB-085', s.externalSewerLength, group, 'sewer-outdoor-work'),
      descriptor('LAB-093', Math.round(s.externalSewerLength * 0.7 * 10) / 10, group, 'sewer-trench'),
    );
    if (s.sewerSystem === 'rings') lines.push(
      descriptor('ENG-MAT-WELL-RING', s.septicRings, 'Канализация · септик из колец', 'septic-rings'),
      descriptor('ENG-LAB-WELL-RING', s.septicRings, 'Канализация · септик из колец', 'septic-ring-work'),
      descriptor('ENG-MAT-WELL-SEAL', s.septicRings, 'Канализация · септик из колец', 'septic-seal'),
      descriptor('ENG-MAT-WELL-COVER', 1, 'Канализация · септик из колец', 'septic-cover'),
      descriptor('ENG-MAT-WELL-HATCH', 1, 'Канализация · септик из колец', 'septic-hatch'),
      descriptor('ENG-MAT-SEPTIC-FILTER', 1, 'Канализация · септик из колец', 'septic-filter'),
      descriptor('ENG-LAB-WELL-EARTH', Math.round(s.septicRings * 0.95 * 10) / 10, 'Канализация · септик из колец', 'septic-earth'),
      descriptor('ENG-LAB-WELL-HEAD', 1, 'Канализация · септик из колец', 'septic-head-work'),
    );
    if (s.sewerSystem === 'bio') lines.push(
      descriptor('ENG-MAT-BIO-STATION', 1, 'Канализация · станция очистки', 'sewer-bio'),
      descriptor('ENG-LAB-BIO-STATION', 1, 'Канализация · станция очистки', 'sewer-bio-work'),
    );
    if (s.fanStack) lines.push(
      descriptor('ENG-MAT-SEWER-FAN', 1, group, 'sewer-fan-stack'),
      descriptor('LAB-097', 1, group, 'sewer-fan-stack-work'),
    );
    lines.push(descriptor('LAB-087', 1, group, 'sewer-test'));
  }
  if (rank[s.sewerStage] >= 2) lines.push(descriptor('ENG-LAB-SEWER-TERMINAL', s.sewerPoints, group, 'sewer-terminal-work'));
  return lines;
}

function ventilationLines(s) {
  const stageName = ENGINEERING_STAGES.find(item => item.value === s.ventilationStage)?.label.split(' · ')[0] || '';
  const group = `Вентиляция · ${stageName}`;
  const devicePoints = s.supplyDevices + s.extractFans;
  const duct = reserve(s.ventDuct, s.reserve);
  const lines = [
    descriptor('ENG-MAT-VENT-SLEEVE', devicePoints, group, 'vent-sleeves'),
    descriptor('ENG-LAB-VENT-SIP-HOLE', devicePoints, group, 'vent-sip-holes'),
    descriptor('MAT-166', duct, group, 'vent-duct'),
    descriptor('MAT-169', ceil(duct * 1.5), group, 'vent-holders'),
    descriptor('MAT-175', Math.max(1, ceil(duct / 3)), group, 'vent-connectors'),
    descriptor('MAT-170', Math.max(1, ceil(duct / 5)), group, 'vent-elbows'),
    descriptor('MAT-171', Math.max(1, ceil(duct / 12)), group, 'vent-sealant'),
    descriptor('LAB-103', s.ventDuct, group, 'vent-duct-work'),
    descriptor('ENG-LAB-VENT-PREP-POINT', devicePoints, group, 'vent-prep-work'),
  ];
  if (s.includeDesign) lines.push(descriptor('LAB-104', 1, group, 'vent-design'));
  if (rank[s.ventilationStage] >= 1) lines.push(
    descriptor('MAT-174', s.ventGrilles, group, 'vent-grilles'),
    descriptor('ENG-MAT-VENT-TRANSFER', s.transferGrilles, group, 'vent-transfer'),
    descriptor('ENG-MAT-VENT-DAMPER', s.extractFans, group, 'vent-dampers'),
    descriptor('MAT-173', s.roofPassages, group, 'vent-roof-passages'),
    descriptor('LAB-102', s.roofPassages, group, 'vent-roof-work'),
    descriptor('LAB-106', s.ventGrilles + s.transferGrilles, group, 'vent-grille-work'),
  );
  if (rank[s.ventilationStage] >= 2) {
    if (s.ventilationSolution === 'natural') lines.push(
      descriptor('ENG-MAT-VENT-KIV', s.supplyDevices, 'Вентиляция · КИВ + вытяжка', 'vent-kiv'),
      descriptor('LAB-107', s.supplyDevices, 'Вентиляция · КИВ + вытяжка', 'vent-kiv-work'),
    );
    if (s.ventilationSolution === 'decentralized') lines.push(
      descriptor('ENG-MAT-VENT-RECUP', s.supplyDevices, 'Вентиляция · комнатные рекуператоры', 'vent-recuperators'),
      descriptor('ENG-LAB-VENT-RECUP', s.supplyDevices, 'Вентиляция · комнатные рекуператоры', 'vent-recuperator-work'),
      descriptor('ENG-MAT-VENT-FILTERS', s.supplyDevices, 'Вентиляция · комнатные рекуператоры', 'vent-filters'),
    );
    if (s.ventilationSolution === 'supply') lines.push(
      descriptor('ENG-MAT-VENT-SUPPLY-UNIT', 1, 'Вентиляция · общий приток', 'vent-supply-unit'),
      descriptor('ENG-LAB-VENT-SUPPLY-UNIT', 1, 'Вентиляция · общий приток', 'vent-supply-unit-work'),
      descriptor('ENG-MAT-VENT-SILENCER', 2, 'Вентиляция · общий приток', 'vent-silencers'),
      descriptor('ENG-MAT-VENT-FILTERS', 1, 'Вентиляция · общий приток', 'vent-filters'),
    );
    lines.push(
      descriptor('MAT-168', s.extractFans, group, 'vent-fans'),
      descriptor('LAB-105', s.extractFans, group, 'vent-fan-work'),
      descriptor('LAB-100', 1, group, 'vent-balance'),
    );
  }
  return lines;
}

export function calculateEngineering(project, inputs, metrics) {
  const s = normalizeEngineering(project.settings?.engineering, { ...inputs?.engineering, wetRooms: inputs?.wetRooms }, metrics);
  const lines = [
    ...(project.services?.engineeringElectric ? electricLines(s) : []),
    ...(project.services?.engineeringPlumbing ? waterLines(s) : []),
    ...(project.services?.engineeringSewerage ? sewerLines(s) : []),
    ...(project.services?.engineeringVentilation ? ventilationLines(s) : []),
  ].filter(Boolean);
  const warnings = [];
  if (project.services?.engineeringVentilation) warnings.push('Расходы воздуха, баланс притока/вытяжки, шум и защиту от обмерзания нужно подтвердить схемой по СП 60.13330.2020. Котельная рассчитывается отдельно по паспорту оборудования.');
  if (project.services?.engineeringPlumbing && s.waterSource === 'well') warnings.push('Глубину колодца и модель насоса подтвердите по пробному бурению, дебиту, уровню воды, глубине промерзания и анализу воды.');
  if (project.services?.engineeringSewerage && s.sewerSystem === 'rings') warnings.push('Септик из колец применяйте только после проверки грунта, уровня грунтовых вод, санитарных расстояний и требуемой герметичности камер.');
  if (project.services?.engineeringElectric) warnings.push('Сечения кабелей, защита групп и заземление проверяются по выделенной мощности и однолинейной схеме; в SIP трассы не должны нарушать силовые узлы.');
  return { mode: 'detailed', settings: s, lines, warnings };
}
