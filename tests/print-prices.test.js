import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { unpricedClientLines } from '../src/react/calculations/client-estimate.js';
import { changeEstimateLine } from '../src/react/state/estimate-edits.js';

test('soft roofing and garage gates have provisional prices and can print', () => {
  const project = createDefaultProject();
  project.settings.roof.covering = 'soft';
  project.plan.openings.push({ id: 'garage-1', type: 'door', doorType: 'garage', width: 2.5, height: 2.2, x: 4, y: 0, orientation: 'h', outer: true });
  const result = calculateProject(project);
  for (const id of ['MAT-199', 'MAT-189', 'LAB-110', 'LAB-113']) {
    assert.ok(result.lines.some(line => line.catalogId === id && line.price > 0), id);
  }
  assert.deepEqual(unpricedClientLines(result), []);
});

test('positive catalog prices unblock printing despite legacy pending flags', () => {
  const project = createDefaultProject();
  project.settings.roof.type = 'sip';
  for (const id of ['MAT-204', 'MAT-205']) {
    Object.assign(project.priceMat.find(item => item.id === id), { price: 123.45, pricePending: true });
  }
  const result = calculateProject(project);
  assert.deepEqual(unpricedClientLines(result), []);
  assert.ok(result.lines.filter(line => ['MAT-204', 'MAT-205'].includes(line.catalogId)).every(line => !line.pricePending && line.price === 123.45));
});

test('project price overrides unblock print without changing the catalog', () => {
  const project = createDefaultProject();
  const item = project.priceMat.find(item => item.id === 'MAT-204');
  Object.assign(item, { price: 0, pricePending: true });
  const missing = unpricedClientLines(calculateProject(project));
  assert.ok(missing.length > 0);
  missing.forEach(line => changeEstimateLine(project, line, { price: 29.5 }));
  assert.deepEqual(unpricedClientLines(calculateProject(project)), []);
  assert.equal(item.price, 0);
  const restored = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(unpricedClientLines(calculateProject(restored)), []);
  assert.ok(calculateProject(restored).lines.filter(line => line.catalogId === 'MAT-204').every(line => line.price === 29.5));
});

test('migration fills only empty prices and retains manager prices', () => {
  const project = createDefaultProject();
  project.appVersion = 111;
  Object.assign(project.priceMat.find(item => item.id === 'MAT-204'), { price: 0, pricePending: true });
  Object.assign(project.priceMat.find(item => item.id === 'MAT-205'), { price: 167.5, pricePending: true });
  const restored = migrateProject(project);
  const tape = restored.priceMat.find(item => item.id === 'MAT-204');
  const plate = restored.priceMat.find(item => item.id === 'MAT-205');
  assert.equal(tape.price, 25);
  assert.equal(tape.priceEstimated, true);
  assert.equal(plate.price, 167.5);
  assert.ok(!tape.pricePending && !plate.pricePending);
  assert.deepEqual(migrateProject(restored), restored);
});

test('print validation ignores excluded labor and accessories, not missing panels', () => {
  const lines = [
    { id: 'panel', name: 'СИП-панель', kind: 'material', qty: 1, price: 0 },
    { id: 'screws', name: 'Саморезы', kind: 'material', qty: 1, price: 0 },
    { id: 'labor', name: 'Монтаж', kind: 'labor', qty: 1, price: 0 },
    { id: 'unused', name: 'Без количества', kind: 'material', qty: 0, price: 0 },
    { id: 'invalid', name: 'Повреждённая цена', kind: 'material', qty: 1, price: NaN },
  ];
  assert.deepEqual(unpricedClientLines({ lines }, { includeLabor: false, includeAccessories: false }).map(line => line.id), ['panel', 'invalid']);
});

test('estimated prices change only costs, not quantities or geometry', () => {
  const project = createDefaultProject();
  project.settings.roof.type = 'sip';
  const before = structuredClone(project);
  before.priceMat.filter(item => ['MAT-204', 'MAT-205'].includes(item.id)).forEach(item => { item.price = 0; });
  const oldResult = calculateProject(before);
  const result = calculateProject(project);
  assert.deepEqual(result.lines.map(({ id, qty }) => ({ id, qty })), oldResult.lines.map(({ id, qty }) => ({ id, qty })));
  const expected = result.lines.filter(line => ['MAT-204', 'MAT-205'].includes(line.catalogId)).reduce((sum, line) => sum + line.qty * line.price, 0);
  assert.ok(Math.abs(result.totals.total - oldResult.totals.total - expected) < 0.02);
  assert.deepEqual(unpricedClientLines(result), []);
});
