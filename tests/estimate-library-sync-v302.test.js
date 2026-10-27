import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateAdjustedPrice, adjustedEstimateCalculation } from '../src/react/calculations/price-adjustments.js';
import { buildClientEstimate } from '../src/react/calculations/client-estimate.js';
import { reconcileInitialLibrary } from '../src/react/cloud/library-sync.js';
import { deleteEmptyPlanLibraryFolder, readPlanLibrary, writePlanLibrary } from '../src/react/storage/plan-library.js';
import { applySharedPriceCatalog } from '../src/react/cloud/price-catalog.js';
import { changeEstimateLine, resetEstimateLine } from '../src/react/state/estimate-edits.js';

test('printed estimate includes row price, quantity and adjusted header total', () => {
  const project = createDefaultProject();
  const baseline = calculateProject(project);
  const line = baseline.sections.find(section => section.lines.some(row => row.kind === 'material')).lines.find(row => row.kind === 'material');
  project.estimateOverrides = [{ lineId: line.id, section: line.section, catalogId: line.catalogId, qty: 3, price: 123 }];
  project.settings.priceAdjustments[line.section].materials = 10;
  const calculation = calculateProject(project);
  const edited = calculation.lines.find(row => row.id === line.id);
  assert.equal(edited.qty, 3);
  assert.equal(edited.price, 123);
  const printed = buildClientEstimate(adjustedEstimateCalculation(project, calculation), { compactAccessories: false });
  const printedLine = printed.sections.flatMap(section => section.lines).find(row => row.id === line.id);
  assert.equal(printedLine.qty, 3);
  assert.ok(Math.abs(printedLine.price - 135.3) < 1e-8);
  assert.ok(Math.abs(printed.totals.total - calculateAdjustedPrice(project, calculation).total) < 1e-6);
  assert.equal(project.priceMat.find(row => row.id === line.catalogId)?.price, baseline.lines.find(row => row.id === line.id)?.price);
});

test('first team synchronization retains local folders and plans and asks for upload', () => {
  const remote = [{ id: 'plan-remote', name: 'Общий', updatedAt: '2026-10-01T10:00:00Z', project: { plan: {} } }];
  const local = [
    { id: 'folder-local', kind: 'folder', name: 'Рабочие', updatedAt: '2026-10-02T10:00:00Z' },
    { id: 'plan-local', name: 'Локальный', folderId: 'folder-local', updatedAt: '2026-10-02T10:00:00Z', project: { plan: {} } },
  ];
  const result = reconcileInitialLibrary(local, remote);
  assert.equal(result.needsUpload, true);
  assert.deepEqual(new Set(result.entries.map(item => item.id)), new Set(['folder-local', 'plan-local', 'plan-remote']));
  assert.equal(reconcileInitialLibrary(remote, remote).needsUpload, false);
});

test('folder deletion keeps a tombstone so another participant does not restore it', () => {
  const stale = [{ id: 'folder-one', kind: 'folder', name: 'Удалить', updatedAt: '2026-10-01T10:00:00Z' }];
  const deleted = deleteEmptyPlanLibraryFolder(stale, stale[0].id);
  assert.ok(deleted[0].deletedAt);
  const merged = reconcileInitialLibrary(stale, deleted).entries;
  assert.equal(merged[0].deletedAt, deleted[0].deletedAt);
});

test('a full browser cache still exposes the new folder for team upload', () => {
  const previousStorage = globalThis.localStorage, previousWindow = globalThis.window;
  const values = new Map(), events = [];
  let full = true;
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => { if (full) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); values.set(key, value); },
    removeItem: key => values.delete(key),
  };
  globalThis.localStorage = storage;
  globalThis.window = { dispatchEvent: event => events.push(event.type) };
  try {
    const folder = [{ id: 'folder-new', kind: 'folder', name: 'Проекты', updatedAt: '2026-10-27T10:00:00Z' }];
    writePlanLibrary(folder);
    assert.deepEqual(readPlanLibrary(), folder);
    assert.ok(events.includes('eft:plan-library-changed'));
    full = false;
    writePlanLibrary(folder);
    assert.deepEqual(readPlanLibrary(), folder);
  } finally {
    globalThis.localStorage = previousStorage;
    globalThis.window = previousWindow;
  }
});

test('a custom catalog row keeps its project-only price through server refresh and print', () => {
  const project = createDefaultProject();
  const catalog = { priceMat: project.priceMat, priceLab: project.priceLab };
  const source = project.priceMat[0];
  const custom = { id: 'custom-price', section: 'sip', name: source.name, kind: 'material', unit: source.unit, qty: 2, catalogId: source.id, price: source.price, custom: true };
  project.customEstimateLines = [custom];
  changeEstimateLine(project, custom, { price: 321 });
  const effective = applySharedPriceCatalog(project, catalog, 2);
  const line = calculateProject(effective).lines.find(item => item.id === custom.id);
  assert.equal(line.price, 321);
  assert.equal(buildClientEstimate(adjustedEstimateCalculation(effective, calculateProject(effective))).sections.flatMap(section => section.lines).find(item => item.id === custom.id).price, 321);
  assert.equal(source.price, catalog.priceMat[0].price);
  resetEstimateLine(project, custom.id);
  assert.equal(applySharedPriceCatalog(project, catalog, 3).customEstimateLines[0].price, source.price);
});
