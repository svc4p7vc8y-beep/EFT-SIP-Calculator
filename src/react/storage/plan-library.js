import {
  migrateProject,
  REACT_PROJECT_VERSION,
} from "../state/project-model.js";

export const PLAN_LIBRARY_KEY = "eft-react-plan-library-v103";
export const LEGACY_SKETCHES_KEY = "eft-react-plan-sketches-v47";
let volatilePlanLibrary = null;

const clone = (value) => structuredClone(value);

function compactProject(project) {
  const snapshot = clone(project);
  delete snapshot.priceMat;
  delete snapshot.priceLab;
  delete snapshot.savedAt;
  return snapshot;
}

export function createPlanLibraryEntry(
  project,
  name,
  calculation,
  existing = {},
) {
  const savedAt = new Date().toISOString();
  return {
    id:
      existing.id ||
      `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: String(name || existing.name || "План дома").trim() || "План дома",
    savedAt,
    updatedAt: savedAt,
    folderId: existing.folderId || "",
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
  return [
    ...current,
    ...legacy.map((item) => ({
      id: item.id || `legacy-${Date.now().toString(36)}`,
      name: item.name || "Старый эскиз",
      savedAt: item.savedAt || "",
      legacy: true,
      plan: clone(item.plan),
      priceSnapshot: { materials: 0, labor: 0, total: 0 },
    })),
  ].filter((item) => item?.id && (item.kind === 'folder' || item.project?.plan || item.plan));
}

export function createPlanLibraryFolder(entries, name, parentId = '') {
  const title = String(name || '').trim();
  if (!title) throw new Error('Введите название папки.');
  if (parentId && !entries.some(item => item.kind === 'folder' && item.id === parentId && !item.deletedAt))
    throw new Error('Родительская папка не найдена.');
  const now = new Date().toISOString();
  const folder = { id: `folder-${crypto.randomUUID()}`, kind: 'folder', name: title, parentId, createdAt: now, updatedAt: now };
  return [folder, ...entries];
}

export function movePlanLibraryEntry(entries, entryId, folderId = '') {
  if (folderId && !entries.some(item => item.kind === 'folder' && item.id === folderId && !item.deletedAt))
    throw new Error('Папка назначения не найдена.');
  const entry = entries.find(item => item.id === entryId && item.kind !== 'folder' && !item.deletedAt);
  if (!entry) throw new Error('План не найден.');
  return entries.map(item => item.id === entryId ? { ...item, folderId, updatedAt: new Date().toISOString() } : item);
}

export function copyPlanLibraryEntry(entries, entryId) {
  const entry = entries.find(item => item.id === entryId && item.kind !== 'folder' && !item.deletedAt);
  if (!entry) throw new Error('План не найден.');
  const now = new Date().toISOString();
  return [{ ...clone(entry), id: `plan-${crypto.randomUUID()}`, name: `${entry.name} · копия`, savedAt: now, updatedAt: now }, ...entries];
}

export function trashPlanLibraryEntry(entries, entryId) {
  const entry = entries.find(item => item.id === entryId && item.kind !== 'folder' && !item.deletedAt);
  if (!entry) throw new Error('План не найден.');
  const now = new Date().toISOString();
  return entries.map(item => item.id === entryId ? { ...item, deletedAt: now, updatedAt: now } : item);
}

export function restorePlanLibraryEntryFromTrash(entries, entryId) {
  const entry = entries.find(item => item.id === entryId && item.kind !== 'folder' && item.deletedAt);
  if (!entry) throw new Error('План не найден в корзине.');
  const folderId = entries.some(item => item.id === entry.folderId && item.kind === 'folder') ? entry.folderId : '';
  return entries.map(item => item.id === entryId ? { ...item, folderId, deletedAt: null, updatedAt: new Date().toISOString() } : item);
}

export function deleteEmptyPlanLibraryFolder(entries, folderId) {
  const folder = entries.find(item => item.id === folderId && item.kind === 'folder' && !item.deletedAt);
  if (!folder) throw new Error('Папка не найдена.');
  if (entries.some(item => !item.deletedAt && (item.folderId === folderId || item.parentId === folderId)))
    throw new Error('Сначала переместите планы и вложенные папки.');
  const now = new Date().toISOString();
  return entries.map(item => item.id === folderId ? { ...item, deletedAt: now, updatedAt: now } : item);
}

export function readPlanLibrary(storage = localStorage) {
  if (typeof localStorage !== 'undefined' && storage === localStorage && volatilePlanLibrary)
    return clone(volatilePlanLibrary);
  try {
    const storedCurrent = storage.getItem(PLAN_LIBRARY_KEY);
    const current = JSON.parse(storedCurrent || "[]");
    const legacy = JSON.parse(storage.getItem(LEGACY_SKETCHES_KEY) || "[]");
    return normalizePlanLibrary(current, storedCurrent ? [] : legacy);
  } catch {
    return [];
  }
}

export function writePlanLibrary(entries, storage = localStorage, { notify = true } = {}) {
  const persistent = (entries || [])
    .filter((item) => !item.preset || item.deletedAt);
  try {
    storage.setItem(PLAN_LIBRARY_KEY, JSON.stringify(persistent));
    storage.removeItem?.(LEGACY_SKETCHES_KEY);
    if (typeof localStorage !== 'undefined' && storage === localStorage) volatilePlanLibrary = null;
  } catch (error) {
    if (typeof localStorage === 'undefined' || storage !== localStorage || error?.name !== 'QuotaExceededError') throw error;
    // The authenticated team's server remains durable storage when the
    // browser's small localStorage quota cannot hold another full plan.
    volatilePlanLibrary = clone(persistent);
  }
  if (typeof localStorage !== "undefined" && storage === localStorage) {
    window.dispatchEvent(new CustomEvent("eft:plan-library-synced"));
    if (notify) window.dispatchEvent(new CustomEvent("eft:plan-library-changed"));
  }
  return persistent;
}

export function restorePlanLibraryEntry(currentProject, entry) {
  if (!entry?.project) {
    return migrateProject({
      ...clone(currentProject),
      plan: clone(entry.plan),
      format: "eft-project",
      appVersion: REACT_PROJECT_VERSION,
      priceMat: clone(currentProject.priceMat),
      priceLab: clone(currentProject.priceLab),
    });
  }
  return migrateProject({
    ...clone(currentProject),
    ...clone(entry.project),
    format: "eft-project",
    appVersion: REACT_PROJECT_VERSION,
    priceMat: clone(currentProject.priceMat),
    priceLab: clone(currentProject.priceLab),
  });
}
