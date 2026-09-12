export const RESIDENTIAL_PRESET = Object.freeze({
  id: 'residential-eft',
  title: 'Жилой дом — стандарт EFT',
  summary: [
    'SIP-пол и межэтажное перекрытие 224 мм, усиленная раскладка 625 мм',
    'SIP-стены 174 мм и SIP-потолок 174 мм',
    'Двускатная холодная крыша, автоматическая стропильная система',
    'Термобрус, узловой расчёт расходников и нормативные запасы',
  ],
});

export function applyResidentialPreset(project) {
  project.meta.buildingType = 'Жилой дом';
  project.services.sipFloor = true;
  project.services.sipSecondFloor = true;
  project.services.sipWalls = true;
  project.services.sipCeiling = true;
  project.services.roof = true;

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
    connectorType: 'thermal',
    wastePercent: 5,
    consumablesMode: 'node',
    foamScope: 'joints-and-edges',
  });

  project.plan.wallThickness = 0.174;
  (project.upperFloors || []).forEach((floorPlan) => {
    floorPlan.wallThickness = 0.174;
  });

  Object.assign(project.settings.roof, {
    shape: 'gable',
    flatSlopeMode: 'none',
    type: 'cold',
    warmPercent: 0,
    wastePercent: 10,
    eaveOverhang: 0.5,
    gableOverhang: 0.3,
    structureMode: 'auto',
    rafterSystem: 'hanging',
    rafterStep: 0.6,
    rafterSection: '50x150',
    mauerlatLayout: 'perimeter',
    mauerlatFastener: 'sip-screws',
    rafterSupportConnection: 'nails',
    gableType: 'auto',
    gableCount: 2,
  });

  return project;
}
