import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createDefaultPriceLists, migrateProject } from '../src/react/state/project-model.js';
import { addEstimateGroup, addEstimateLine, changeEstimateLine, removeEmptyEstimateGroup, renameEstimateGroup } from '../src/react/state/estimate-edits.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { buildClientEstimate } from '../src/react/calculations/client-estimate.js';
import { applySharedPriceCatalog } from '../src/react/cloud/price-catalog.js';

test('user-created estimate group is editable, priced, included in totals and survives project JSON', () => {
  const project = createDefaultProject();
  const before = calculateProject(project).totals.total;
  const group = addEstimateGroup(project);
  renameEstimateGroup(project, group.id, 'Дополнительная отделка');
  const material = addEstimateLine(project, group.id);
  changeEstimateLine(project, material, { name: 'Подоконник по проекту', qty: 3, price: 1200 });
  const labor = addEstimateLine(project, group.id);
  changeEstimateLine(project, labor, { name: 'Установка подоконника', kind: 'labor', qty: 3, price: 400 });
  assert.equal(removeEmptyEstimateGroup(project, group.id), false);
  const restored = migrateProject(JSON.parse(JSON.stringify(project)));
  const result = calculateProject(restored);
  const section = result.sections.find((item) => item.key === group.id);
  assert.equal(section.title, 'Дополнительная отделка');
  assert.deepEqual(section.lines.map((item) => item.price), [1200, 400]);
  assert.equal(result.totals.total - before, 4800);
  assert.equal(buildClientEstimate(result).sections.find((item) => item.key === group.id)?.lines.length, 2);
  assert.equal(result.totals.materials + result.totals.labor, result.totals.total);
});

test('server catalog leaves standalone project rates editable while bound rows follow server price', () => {
  const project = createDefaultProject();
  const group = addEstimateGroup(project);
  const own = addEstimateLine(project, group.id);
  changeEstimateLine(project, own, { name: 'Авторская позиция', price: 730, qty: 2 });
  const bound = addEstimateLine(project, group.id);
  changeEstimateLine(project, bound, { catalogId: 'MAT-001', name: 'Позиция прайса', price: 3, qty: 2 });
  const catalog = createDefaultPriceLists();
  const first = applySharedPriceCatalog(project, catalog, 1);
  assert.equal(first.customEstimateLines.find((line) => line.id === own.id).price, 730);
  assert.equal(first.customEstimateLines.find((line) => line.id === bound.id).price, catalog.priceMat.find((row) => row.id === 'MAT-001').price);
  catalog.priceMat.find((row) => row.id === 'MAT-001').price = 6789;
  const refreshed = applySharedPriceCatalog(migrateProject(JSON.parse(JSON.stringify(first))), catalog, 2);
  const rows = calculateProject(refreshed).sections.find((item) => item.key === group.id).lines;
  assert.equal(rows.find((line) => line.id === own.id).price, 730);
  assert.equal(rows.find((line) => line.id === bound.id).price, 6789);
});

test('old projects without custom groups migrate; an empty group does not change the client estimate', () => {
  const old = createDefaultProject();
  delete old.customEstimateGroups;
  assert.deepEqual(migrateProject(old).customEstimateGroups, []);
  const group = addEstimateGroup(old);
  const result = calculateProject(old);
  assert.ok(result.sections.some((section) => section.key === group.id));
  assert.ok(!buildClientEstimate(result).sections.some((section) => section.key === group.id));
  assert.equal(removeEmptyEstimateGroup(old, group.id), true);
});
