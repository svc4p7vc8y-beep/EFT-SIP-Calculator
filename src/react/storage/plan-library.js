import { migrateProject, REACT_PROJECT_VERSION } from '../state/project-model.js';

export const PLAN_LIBRARY_KEY = 'eft-react-plan-library-v103';
export const LEGACY_SKETCHES_KEY = 'eft-react-plan-sketches-v47';

const clone = (value) => structuredClone(value);

function compactProject(project) {
  const snapshot = clone(project);
  delete snapshot.priceMat;
  delete snapshot.priceLab;
  delete snapshot.savedAt;
  return snapshot;
}

export function createPlanLibraryEntry(project, name, calculation, existing = {}) {
  const savedAt = new Date().toISOString();
  return {
    id: existing.id || `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: String(name || existing.name || 'План дома').trim() || 'План дома',
    savedAt,
    project: compactProject(project),
    priceSnapshot: {
      materials: Number(calculation?.totals?.materials) || 0,
      labor: Number(calculation?.totals?.labor) || 0,
      total: Number(calculation?.totals?.total) || 0,
    },
  };
}

export function normalizePlanLibrary(entries = [], legacyEntries = []) {
  const current = Array.isArray(entries) ? entries : [];
  const legacy = Array.isArray(legacyEntries) ? legacyEntries : [];
  return [...current, ...legacy.map((item) => ({
    id: item.id || `legacy-${Date.now().toString(36)}`,
    name: item.name || 'Старый эскиз',
    savedAt: item.savedAt || '',
    legacy: true,
    plan: clone(item.plan),
    priceSnapshot: { materials: 0, labor: 0, total: 0 },
  }))].filter((item) => item?.id && (item.project?.plan || item.plan));
}

export function readPlanLibrary(storage = localStorage) {
  try {
    const storedCurrent = storage.getItem(PLAN_LIBRARY_KEY);
    const current = JSON.parse(storedCurrent || '[]');
    const legacy = JSON.parse(storage.getItem(LEGACY_SKETCHES_KEY) || '[]');
    return normalizePlanLibrary(current, storedCurrent ? [] : legacy);
  } catch {
    return [];
  }
}

export function writePlanLibrary(entries, storage = localStorage) {
  const persistent = (entries || []).filter((item) => !item.preset).slice(0, 20);
  storage.setItem(PLAN_LIBRARY_KEY, JSON.stringify(persistent));
  storage.removeItem?.(LEGACY_SKETCHES_KEY);
  return persistent;
}

export function restorePlanLibraryEntry(currentProject, entry) {
  if (!entry?.project) {
    const next = clone(currentProject);
    next.plan = clone(entry.plan);
    return next;
  }
  return migrateProject({
    ...clone(currentProject),
    ...clone(entry.project),
    format: 'eft-project',
    appVersion: REACT_PROJECT_VERSION,
    priceMat: clone(currentProject.priceMat),
    priceLab: clone(currentProject.priceLab),
  });
}
