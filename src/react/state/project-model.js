import catalog from '../data/default-catalog.json' with { type: 'json' };
import { normalizeTerracePlatform } from '../../calculations/terrace-model.js';
import { DEFAULT_FORMULAS, DEFAULT_LINKS } from '../calculations/calculation-links.js';

export const REACT_PROJECT_VERSION = 47;
// Keep the established storage namespace so upgrading the application does not
// hide the user's autosave or price list. migrateProject upgrades the payload.
export const REACT_AUTOSAVE_KEY = 'eft-react-project-v46';
export const REACT_BACKUPS_KEY = 'eft-react-backups-v46';

const clone = (value) => structuredClone(value);
const today = () => new Date().toISOString().slice(0, 10);

function polygonRoom(id, name, points, extra = {}) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    id,
    name,
    points: points.map(([x, y]) => ({ x, y })),
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
    include: true,
    bearing: false,
    ...extra
  };
}

export function createDefaultPlan() {
  const e = 0.174;
  const plan = {
    house: { w: 8.66, h: 12.975 },
    wallHeight: 2.5,
    wallThickness: 0.174,
    partitionThickness: 0.1,
    zoom: 100,
    showPiles: true,
    showBinding: true,
    showDimensions: true,
    rooms: [
      polygonRoom('room-1', 'Спальня / шкаф', [[e, e], [4.874, e], [4.874, 4.204], [e, 4.204]], { note: 'шкаф' }),
      polygonRoom('room-2', 'Спальня', [[4.874, e], [8.486, e], [8.486, 3.374], [4.874, 3.374]]),
      polygonRoom('room-3', 'Спальня', [[e, 4.204], [3.174, 4.204], [3.174, 8.331], [e, 8.331]]),
      polygonRoom('room-4', 'Коридор', [[4.874, 3.374], [8.486, 3.374], [8.486, 5.4], [4.874, 5.4], [4.874, 9.126], [7.5, 9.126], [7.5, 9.884], [4.874, 9.884], [4.874, 8.331], [3.174, 8.331], [3.174, 4.204], [4.874, 4.204]], { note: 'помещение неправильной формы' }),
      polygonRoom('room-5', 'Котельная', [[4.874, 5.4], [8.486, 5.4], [8.486, 7.025], [4.874, 7.025]]),
      polygonRoom('room-6', 'Санузел', [[4.874, 7.025], [8.486, 7.025], [8.486, 9.126], [4.874, 9.126]]),
      polygonRoom('room-7', 'Кухня-гостиная', [[e, 8.331], [4.874, 8.331], [4.874, 9.884], [7.286, 9.884], [7.286, 12.801], [e, 12.801]], { note: 'подсобка кухни' }),
      polygonRoom('room-8', 'Подсобка кухни', [[7.286, 9.884], [8.486, 9.884], [8.486, 12.801], [7.286, 12.801]])
    ],
    walls: [],
    wallGaps: [],
    openings: [
      { id: 'door-main', type: 'door', doorType: 'entrance', width: 0.96, height: 2.05, hinge: 'right', swing: 'out', x: 8.573, y: 4.45, orientation: 'v', outer: true }
    ],
    dimensions: [],
    platforms: [
      normalizeTerracePlatform({ id: 'terrace-main', kind: 'terrace', x: 0, y: 12.975, w: 8.66, h: 2.425, include: true, steps: 3, stairWidth: 1.6, riser: 0.18, tread: 0.3, stairSide: 'bottom', stairDirection: 'toward' }),
      normalizeTerracePlatform({ id: 'porch-main', kind: 'porch', x: 8.66, y: 3.374, w: 1, h: 2.1, include: true, steps: 3, stairWidth: 1, riser: 0.175, tread: 0.28, stairSide: 'right', stairDirection: 'toward' })
    ],
    pileRows: [
      { id: 'pile-top', name: 'Верхний ряд', x1: 0, y1: 0, x2: 8.66, y2: 0, count: 5, group: 'house' },
      { id: 'pile-mid', name: 'Средний ряд', x1: 0, y1: 6.4875, x2: 8.66, y2: 6.4875, count: 5, group: 'house' },
      { id: 'pile-bottom', name: 'Нижний ряд', x1: 0, y1: 12.975, x2: 8.66, y2: 12.975, count: 5, group: 'house' },
      { id: 'pile-left', name: 'Левый ряд', x1: 0, y1: 0, x2: 0, y2: 12.975, count: 7, group: 'house' },
      { id: 'pile-right', name: 'Правый ряд', x1: 8.66, y1: 0, x2: 8.66, y2: 12.975, count: 7, group: 'house' }
    ],
    piles: []
  };
  return plan;
}

export function createEmptyPlan() {
  return {
    house: { w: 10, h: 8 }, wallHeight: 2.5, wallThickness: 0.174, partitionThickness: 0.1,
    zoom: 100, showPiles: true, showBinding: true, showDimensions: true,
    rooms: [], walls: [], wallGaps: [], openings: [], dimensions: [], platforms: [], piles: [],
    pileRows: [
      { id: 'pile-top', name: 'Верхний ряд', x1: 0, y1: 0, x2: 10, y2: 0, count: 6, group: 'house' },
      { id: 'pile-mid', name: 'Средний ряд', x1: 0, y1: 4, x2: 10, y2: 4, count: 6, group: 'house' },
      { id: 'pile-bottom', name: 'Нижний ряд', x1: 0, y1: 8, x2: 10, y2: 8, count: 6, group: 'house' }
    ]
  };
}

export function createCompactPlan() {
  const e = 0.174;
  const plan = createEmptyPlan();
  plan.house = { w: 10, h: 7 };
  plan.rooms = [
    polygonRoom('compact-kitchen', 'Кухня', [[e, e], [3.2, e], [3.2, 3.2], [e, 3.2]]),
    polygonRoom('compact-bath', 'Санузел', [[3.2, e], [5.2, e], [5.2, 2.45], [3.2, 2.45]]),
    polygonRoom('compact-boiler', 'Котельная', [[5.2, e], [7, e], [7, 2.45], [5.2, 2.45]]),
    polygonRoom('compact-bed1', 'Спальня 1', [[7, e], [9.826, e], [9.826, 3.45], [7, 3.45]]),
    polygonRoom('compact-living', 'Гостиная', [[e, 3.2], [5.2, 3.2], [5.2, 6.826], [e, 6.826]]),
    polygonRoom('compact-hall', 'Холл', [[3.2, 2.45], [7, 2.45], [7, 4.25], [5.2, 4.25], [5.2, 3.2], [3.2, 3.2]]),
    polygonRoom('compact-bed2', 'Спальня 2', [[5.2, 4.25], [9.826, 4.25], [9.826, 6.826], [5.2, 6.826]])
  ];
  plan.pileRows = [
    { id: 'compact-row-1', name: 'Ряд 1', x1: 0, y1: 0, x2: 10, y2: 0, count: 6, group: 'house' },
    { id: 'compact-row-2', name: 'Ряд 2', x1: 0, y1: 3.5, x2: 10, y2: 3.5, count: 6, group: 'house' },
    { id: 'compact-row-3', name: 'Ряд 3', x1: 0, y1: 7, x2: 10, y2: 7, count: 6, group: 'house' }
  ];
  return plan;
}

export function createDefaultProject() {
  const plan = createDefaultPlan();
  return {
    format: 'eft-project',
    schemaVersion: 3,
    appVersion: REACT_PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    meta: { projectNum: '0001', customer: '', address: '', author: '', date: today(), floors: 1 },
    plan,
    services: {
      foundation: true, sipFloor: true, sipWalls: true, sipCeiling: true, partitions: true,
      roof: true, terrace: true, openings: true, delivery: true,
      engineeringElectric: false, engineeringPlumbing: false, engineeringSewerage: false, engineeringVentilation: false,
      internalFinish: false, externalFinish: false
    },
    settings: {
      piles: { spacing: 2.5, boardVolumePerMeter: 0.0225 },
      sip: { floorThickness: '224', wallThickness: '174', ceilingThickness: '224', wastePercent: 5 },
      roof: { type: 'cold', ridgeHeight: 1.8, ridgeLength: 9.66, wastePercent: 10, warmPercent: 0 },
      delivery: { distance: 30, trips: 2, cargoVolume: 40, baseTrip: 7000, perKm: 50, unloadingPerM3: 500 },
      engineering: { cableRoute: 120, electricPoints: 50, waterPipe: 100, waterPoints: 5, sewerLength: 20, sewerPoints: 5, ventDuct: 25, ventGrilles: 5 },
      internal: { wallArea: 300, ceilingArea: 72, laminateArea: 75, tileArea: 30, doors: 5 },
      external: { facadeArea: 130, windArea: 100, insulationArea: 110, woodArea: 40, metalArea: 120, soffitArea: 63, cornerLength: 14 },
      links: clone(DEFAULT_LINKS),
      formulas: clone(DEFAULT_FORMULAS)
    },
    priceMat: clone(catalog.priceMat),
    priceLab: clone(catalog.priceLab),
    estimateOverrides: []
  };
}

function normalizePlan(plan) {
  const fallback = createDefaultPlan();
  if (!plan?.house || !Array.isArray(plan.rooms)) return fallback;
  return {
    ...fallback,
    ...plan,
    house: { ...fallback.house, ...plan.house },
    rooms: plan.rooms.map((room, index) => ({ include: true, bearing: false, id: room.id || `room-${index + 1}`, ...room })),
    platforms: (plan.platforms || []).map(normalizeTerracePlatform),
    openings: plan.openings || [],
    pileRows: plan.pileRows?.length ? plan.pileRows : fallback.pileRows,
    piles: plan.piles || []
  };
}

function normalizeCatalog(items, defaults) {
  if (!Array.isArray(items)) return clone(defaults);
  const defaultById = new Map(defaults.map((item) => [item.id, item]));
  const normalized = items.map((item) => {
    const fallback = defaultById.get(item.id);
    return Number(item.price) === 0 && Number(fallback?.price) > 0 ? { ...item, price: fallback.price } : item;
  });
  const existingIds = new Set(normalized.map((item) => item.id));
  return normalized.concat(defaults.filter((item) => !existingIds.has(item.id)).map(clone));
}

export function migrateProject(raw) {
  const base = createDefaultProject();
  if (!raw || typeof raw !== 'object') return base;
  const params = Array.isArray(raw.params) ? raw.params.map((entry) => Number(entry?.val) || 0) : [];
  const meta = raw.meta || {
    projectNum: raw.projectNum || '', customer: raw.cust || '', address: raw.addr || '', author: raw.author || '', date: raw.date || today(), floors: Number(raw.floors) || 1
  };
  const plan = normalizePlan(raw.plan);
  if (params[3]) plan.wallHeight = params[3];
  return {
    ...base,
    ...raw,
    format: 'eft-project', schemaVersion: 3, appVersion: REACT_PROJECT_VERSION,
    meta: { ...base.meta, ...meta },
    plan,
    services: { ...base.services, ...(raw.services || {}) },
    settings: {
      ...base.settings,
      ...(raw.settings || {}),
      piles: { ...base.settings.piles, ...(raw.settings?.piles || {}) },
      sip: { ...base.settings.sip, ...(raw.settings?.sip || {}) },
      roof: { ...base.settings.roof, ...(raw.settings?.roof || {}) },
      delivery: { ...base.settings.delivery, ...(raw.settings?.delivery || {}) },
      engineering: { ...base.settings.engineering, ...(raw.settings?.engineering || {}) },
      internal: { ...base.settings.internal, ...(raw.settings?.internal || {}) },
      external: { ...base.settings.external, ...(raw.settings?.external || {}) },
      links: { ...base.settings.links, ...(raw.settings?.links || {}) },
      formulas: { ...base.settings.formulas, ...(raw.settings?.formulas || {}) }
    },
    priceMat: normalizeCatalog(raw.priceMat, base.priceMat),
    priceLab: normalizeCatalog(raw.priceLab, base.priceLab),
    estimateOverrides: Array.isArray(raw.estimateOverrides) ? raw.estimateOverrides : []
  };
}

export function loadInitialProject() {
  try {
    const saved = localStorage.getItem(REACT_AUTOSAVE_KEY);
    return saved ? migrateProject(JSON.parse(saved)) : createDefaultProject();
  } catch {
    return createDefaultProject();
  }
}
