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
    hangingRiegelEnabled: true,
    hangingRiegelHeightPercent: 50,
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
import { ensureProjectFloorCount } from './project-model.js';
import { resizeProjectHouse } from '../planner/geometry.js';
import { releasePlanLinkedQuantityOverrides } from './estimate-edits.js';
import { normalizeResidentialStandards, RESIDENTIAL_SERVICE_KEYS, RESIDENTIAL_SETTING_KEYS } from './residential-standards.js';

const monetarySetting = /price|cost|tariff|rate|baseTrip|perKm|unloadingPerM3/i;
function retainProjectPrices(saved, current) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !current || typeof current !== 'object' || Array.isArray(current)) return saved;
  for (const [key, value] of Object.entries(current)) {
    if (monetarySetting.test(key)) saved[key] = structuredClone(value);
    else if (key in saved) retainProjectPrices(saved[key], value);
  }
  return saved;
}

export function applyResidentialStandard(project, profile, library, { applyGeometry = false } = {}) {
  const standards = normalizeResidentialStandards(library || project.settings.residentialStandards, project);
  const selected = standards.profiles.find((item) => item.id === profile?.id);
  if (!selected) return project;
  const { dimensions, construction, services } = selected;
  if (applyGeometry) {
    if (project.plan.house.w !== dimensions.length || project.plan.house.h !== dimensions.width)
      resizeProjectHouse(project, dimensions.length, dimensions.width);
    project.plan.wallHeight = dimensions.wallHeight;
    ensureProjectFloorCount(project, dimensions.floors);
  }
  for (const key of RESIDENTIAL_SERVICE_KEYS) project.services[key] = services[key];
  for (const key of RESIDENTIAL_SETTING_KEYS) {
    const value = selected.settings?.[key] || construction[key];
    if (value) project.settings[key] = retainProjectPrices(structuredClone(value), project.settings[key]);
  }
  const thickness = Number(project.settings.sip.wallThickness);
  if (Number.isFinite(thickness) && thickness > 0) {
    project.plan.wallThickness = thickness / 1000;
    (project.upperFloors || []).forEach((plan) => { plan.wallThickness = thickness / 1000; });
  }
  project.meta.buildingType = 'Жилой дом';
  project.settings.residentialStandards = { ...standards, activeId: selected.id };
  if (applyGeometry) releasePlanLinkedQuantityOverrides(project);
  return project;
}
