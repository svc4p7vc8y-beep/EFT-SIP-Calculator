export const RESIDENTIAL_PRESET = Object.freeze({
  id: 'residential-eft',
  title: 'Жилой дом — стандарт EFT',
  summary: [
    'SIP-пол и межэтажное перекрытие 224 мм, усиленная раскладка 625 мм',
    'SIP-стены 174 мм и SIP-потолок 174 мм',
    'Двускатная холодная крыша из профлиста, свесы и обрешётка 500 мм',
    'Клеёный пакет досок, равномерные сваи и кровли пристроек',
  ],
});

export function applyResidentialPreset(project) {
  project.meta.buildingType = 'Жилой дом';
  Object.assign(project.services, {
    foundation: true,
    sipFloor: true,
    sipSecondFloor: true,
    sipWalls: true,
    sipCeiling: true,
    partitions: true,
    roof: true,
    terrace: true,
    openings: true,
    delivery: false,
    engineeringElectric: false,
    engineeringPlumbing: false,
    engineeringSewerage: false,
    engineeringVentilation: false,
    engineeringHeating: false,
    internalFinish: false,
    externalFinish: false,
  });

  Object.assign(project.settings.sip, {
    floorThickness: '224',
    floorPanelFamily: 'pps',
    floorPanelWidth: '0.625',
    secondFloorThickness: '224',
    secondFloorPanelFamily: 'pps',
    secondFloorPanelWidth: '0.625',
    wallThickness: '174',
    wallPanelFamily: 'pps',
    ceilingThickness: '174',
    ceilingPanelFamily: 'pps',
    ceilingPanelWidth: '1.25',
    connectorType: 'board-pack',
    partitionType: 'frame',
    partitionFrameSection: '50x100',
    wastePercent: 5,
    consumablesMode: 'node',
    foamScope: 'joints-and-edges',
  });

  project.plan.wallThickness = 0.174;
  Object.assign(project.settings.piles, { autoLayoutMode: 'uniform', autoSyncBinding: true });
  (project.upperFloors || []).forEach((floorPlan) => {
    floorPlan.wallThickness = 0.174;
  });

  Object.assign(project.settings.roof, {
    shape: 'gable',
    flatSlopeMode: 'none',
    type: 'cold',
    warmPercent: 0,
    includeCovering: true,
    covering: 'profile',
    ridgeHeight: 1.8,
    wastePercent: 10,
    eaveOverhang: 0.5,
    gableOverhang: 0.5,
    structureMode: 'auto',
    rafterSystem: 'hanging',
    rafterStep: 0.6,
    rafterSection: '50x150',
    lathStep: 0.5,
    mauerlatLayout: 'perimeter',
    mauerlatFastener: 'sip-screws',
    rafterSupportConnection: 'nails',
    showRoofCover: true,
    showMauerlat: true,
    showRafters: true,
    showLath: true,
    showCounterLath: true,
    includeEaveTrim: false,
    includeVergeTrim: false,
    includeRidgeSeal: false,
    includeGutter: false,
    gableType: 'auto',
    gableCount: 2,
  });

  (project.plan.platforms || []).forEach((platform) => {
    platform.roof ||= {};
    Object.assign(platform.roof, {
      mode: 'cold',
      frontOverhang: 0.5,
      sideOverhang: 0.5,
      gableType: 'auto',
    });
  });

  return project;
}
