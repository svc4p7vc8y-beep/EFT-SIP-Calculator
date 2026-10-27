import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { createPlanLibraryEntry, createPlanLibraryFolder, movePlanLibraryEntry, copyPlanLibraryEntry, trashPlanLibraryEntry, restorePlanLibraryEntryFromTrash, deleteEmptyPlanLibraryFolder, normalizePlanLibrary, restorePlanLibraryEntry } from '../src/react/storage/plan-library.js';
import { createDefaultProject } from '../src/react/state/project-model.js';

test('plan library keeps full construction settings and a price snapshot without duplicating the price list', () => {
  const project = createDefaultProject();
  project.meta.projectNum = 'LIB-01';
  project.settings.sip.partitionFrameSection = '50x150';
  project.settings.roof.form = 'hip';
  project.settings.piles.spacing = 1.8;
  project.services.roof = false;
  const calculation = calculateProject(project);
  const entry = createPlanLibraryEntry(project, 'Дом заказчика', calculation);
  assert.equal(entry.name, 'Дом заказчика');
  assert.equal(entry.project.settings.sip.partitionFrameSection, '50x150');
  assert.equal(entry.project.settings.roof.form, 'hip');
  assert.equal(entry.project.settings.piles.spacing, 1.8);
  assert.equal(entry.project.services.roof, false);
  assert.equal(entry.priceSnapshot.total, calculation.totals.total);
  assert.equal(entry.project.priceMat, undefined);
  assert.equal(entry.project.priceLab, undefined);
});

test('opening a library plan restores its configuration but keeps the current protected price lists', () => {
  const saved = createDefaultProject();
  saved.settings.sip.partitionFrameSection = '50x150';
  saved.plan.house.w = 11;
  const entry = createPlanLibraryEntry(saved, 'Сохранённый', calculateProject(saved));
  const current = createDefaultProject();
  current.priceMat[0].price = 123456;
  const restored = restorePlanLibraryEntry(current, entry);
  assert.equal(restored.plan.house.w, 11);
  assert.equal(restored.settings.sip.partitionFrameSection, '50x150');
  assert.equal(restored.priceMat[0].price, 123456);
});

test('old sketches appear in the new library and remain loadable', () => {
  const project = createDefaultProject();
  const entries = normalizePlanLibrary([], [{ id: 'old', name: 'Старый план', plan: project.plan }]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].legacy, true);
  assert.equal(entries[0].plan.house.w, project.plan.house.w);
  const restored = restorePlanLibraryEntry(project, entries[0]);
  assert.doesNotThrow(() => calculateProject(restored));
  assert.equal(restored.plan.house.w, project.plan.house.w);
});

test('library folders preserve projects through move, copy, trash and restore', () => {
  const project = createDefaultProject();
  const original = createPlanLibraryEntry(project, 'Исходный', calculateProject(project));
  let entries = createPlanLibraryFolder([original], 'Заказы');
  const folder = entries.find(item => item.kind === 'folder');
  entries = movePlanLibraryEntry(entries, original.id, folder.id);
  assert.equal(entries.find(item => item.id === original.id).folderId, folder.id);
  entries = copyPlanLibraryEntry(entries, original.id);
  const copy = entries.find(item => item.name.endsWith('копия'));
  assert.notEqual(copy.id, original.id);
  assert.deepEqual(copy.project.plan, original.project.plan);
  copy.project.plan.house.w = 11;
  assert.notEqual(entries.find(item => item.id === original.id).project.plan.house.w, 11);
  entries = trashPlanLibraryEntry(entries, original.id);
  assert.throws(() => movePlanLibraryEntry(entries, original.id, ''), /не найден/);
  entries = restorePlanLibraryEntryFromTrash(entries, original.id);
  assert.equal(entries.find(item => item.id === original.id).folderId, folder.id);
  assert.throws(() => deleteEmptyPlanLibraryFolder(entries, folder.id), /переместите/);
  assert.equal(normalizePlanLibrary(entries).length, 3);
});
