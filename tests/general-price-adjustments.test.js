import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateAdjustedPrice, adjustedEstimateCalculation, normalizePriceAdjustments, createDefaultPriceAdjustments } from '../src/react/calculations/price-adjustments.js';
import { buildClientEstimate } from '../src/react/calculations/client-estimate.js';

const fixture = () => ({ sections: [
  { key: 'foundation', lines: [{ kind: 'material', qty: 2, price: 500 }, { kind: 'labor', qty: 1, price: 400 }] },
  { key: 'roof', lines: [{ kind: 'material', qty: 1, price: 600 }, { kind: 'labor', qty: 2, price: 100 }] },
], totals: { total: 2200 } });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test('general material and labor percentages apply to every section after local percentages', () => {
  const project = createDefaultProject();
  project.settings.priceAdjustments.general = { materials: -5, labor: -20 };
  project.settings.priceAdjustments.foundation.materials = -10;
  const adjusted = calculateAdjustedPrice(project, fixture());
  assert.deepEqual(adjusted.general, { materials: -5, labor: -20 });
  close(adjusted.groups[0].adjusted.materials, 855);
  close(adjusted.groups[0].adjusted.labor, 320);
  close(adjusted.groups[1].adjusted.materials, 570);
  close(adjusted.groups[1].adjusted.labor, 160);
  close(adjusted.total, 1905);
  close(adjusted.delta, -295);
});

test('old projects keep all section discounts and migrate with zero general discount', () => {
  const project = createDefaultProject();
  delete project.settings.priceAdjustments.general;
  project.settings.priceAdjustments.foundation.materials = -10;
  const restored = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored.settings.priceAdjustments.general, { materials: 0, labor: 0 });
  close(calculateAdjustedPrice(restored, fixture()).total, 2100);
  assert.equal(calculateAdjustedPrice(createDefaultProject(), fixture()).delta, 0);
});

test('general discounts survive JSON save and affect client print rows without changing quantities or price lists', () => {
  const project = createDefaultProject();
  project.settings.priceAdjustments.general = { materials: -7, labor: -13 };
  project.settings.priceAdjustments.sip.materials = -10;
  const restored = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored.settings.priceAdjustments.general, { materials: -7, labor: -13 });
  const base = calculateProject(restored), original = JSON.stringify(base), prices = JSON.stringify(restored.priceMat);
  const derived = adjustedEstimateCalculation(restored, base);
  const printed = buildClientEstimate(derived, { compactAccessories: false });
  close(printed.totals.total, calculateAdjustedPrice(restored, base).total);
  assert.deepEqual(derived.lines.map(line => line.qty), base.lines.map(line => line.qty));
  assert.equal(JSON.stringify(base), original);
  assert.equal(JSON.stringify(restored.priceMat), prices);
});

test('full discount, reset and normalization keep adjusted totals finite', () => {
  const project = createDefaultProject();
  project.settings.priceAdjustments = normalizePriceAdjustments({ general: { materials: -200, labor: -100 }, roof: { materials: 500 } });
  close(calculateAdjustedPrice(project, fixture()).total, 0);
  project.settings.priceAdjustments = createDefaultPriceAdjustments();
  close(calculateAdjustedPrice(project, fixture()).total, 2200);
});
