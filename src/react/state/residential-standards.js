const clone = (value) => structuredClone(value);

export const RESIDENTIAL_SERVICE_KEYS = [
  'foundation', 'sipFloor', 'sipSecondFloor', 'sipWalls', 'sipCeiling',
  'partitions', 'roof', 'terrace', 'openings', 'delivery',
  'engineeringElectric', 'engineeringPlumbing', 'engineeringSewerage',
  'engineeringVentilation', 'engineeringHeating', 'internalFinish', 'externalFinish',
];

// Project-specific prices, manual cutting edits, print layout and link overrides
// are deliberately outside a reusable house configuration.
export const RESIDENTIAL_SETTING_KEYS = [
  'piles', 'sip', 'roof', 'nodeFasteners', 'engineering', 'internal', 'external', 'delivery',
];

const positive = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
};

export function captureResidentialStandard(project, name = 'Жилой дом') {
  const plans = [project.plan, ...(project.upperFloors || [])];
  return {
    id: globalThis.crypto?.randomUUID?.() || `standard-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    dimensions: {
      length: Number(project.plan.house.w) || 10,
      width: Number(project.plan.house.h) || 8,
      wallHeight: Number(project.plan.wallHeight) || 2.5,
      floors: Math.max(1, Math.min(2, Number(project.meta.floors) || plans.length)),
    },
    openings: {
      windows: plans.reduce((count, plan) => count + (plan.openings || []).filter((item) => item.type === 'window').length, 0),
      doors: plans.reduce((count, plan) => count + (plan.openings || []).filter((item) => item.type === 'door').length, 0),
    },
    services: Object.fromEntries(RESIDENTIAL_SERVICE_KEYS.map((key) => [key, project.services[key] === true])),
    construction: Object.fromEntries(['sip', 'roof', 'piles'].map((key) => [key, clone(project.settings[key] || {})])),
    settings: Object.fromEntries(RESIDENTIAL_SETTING_KEYS.map((key) => [key, clone(project.settings[key] || {})])),
  };
}

export function normalizeResidentialStandards(raw, project) {
  const fallback = captureResidentialStandard(project, 'Жилой дом — исходный');
  fallback.id = 'residential-original';
  const source = Array.isArray(raw?.profiles) && raw.profiles.length ? raw.profiles : [fallback];
  const seen = new Set();
  const profiles = source.slice(0, 30).map((item, index) => {
    const id = typeof item?.id === 'string' && item.id && !seen.has(item.id) ? item.id : `residential-${index + 1}`;
    seen.add(id);
    return {
      id,
      name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : `Жилой дом ${index + 1}`,
      dimensions: {
        length: positive(item?.dimensions?.length, fallback.dimensions.length, 3, 100),
        width: positive(item?.dimensions?.width, fallback.dimensions.width, 3, 100),
        wallHeight: positive(item?.dimensions?.wallHeight, fallback.dimensions.wallHeight, 1.8, 8),
        floors: Math.max(1, Math.min(2, Math.round(Number(item?.dimensions?.floors) || 1))),
      },
      openings: {
        windows: Math.max(0, Math.min(200, Math.round(Number(item?.openings?.windows) || 0))),
        doors: Math.max(0, Math.min(200, Math.round(Number(item?.openings?.doors) || 0))),
      },
      services: Object.fromEntries(RESIDENTIAL_SERVICE_KEYS.map((key) => [key, item?.services?.[key] === true])),
      construction: Object.fromEntries(['sip', 'roof', 'piles'].map((key) => [key, item?.construction?.[key] && typeof item.construction[key] === 'object' && !Array.isArray(item.construction[key]) ? clone(item.construction[key]) : clone(fallback.construction[key])])),
      ...(item?.settings && typeof item.settings === 'object' && !Array.isArray(item.settings)
        ? { settings: Object.fromEntries(RESIDENTIAL_SETTING_KEYS.flatMap((key) =>
          item.settings[key] && typeof item.settings[key] === 'object' && !Array.isArray(item.settings[key])
            ? [[key, clone(item.settings[key])]] : [])) }
        : {}),
    };
  });
  return { profiles, activeId: profiles.some((item) => item.id === raw?.activeId) ? raw.activeId : profiles[0].id };
}
