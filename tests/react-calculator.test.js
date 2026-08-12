import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateFoundation } from '../src/react/calculations/foundation-model.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';

test('React project produces a priced estimate from one shared model', () => {
  const project = createDefaultProject();
  const result = calculateProject(project);
  assert.ok(result.sections.some((section) => section.key === 'foundation'));
  assert.ok(result.sections.some((section) => section.key === 'sip'));
  assert.ok(result.sections.some((section) => section.key === 'roof'));
  assert.ok(result.totals.materials > 0);
  assert.ok(result.totals.labor > 0);
  assert.equal(result.totals.total, result.totals.materials + result.totals.labor);
});

test('warm main roof and terrace roofs are included in SIP cutting once', () => {
  const project = createDefaultProject();
  project.settings.roof.type = 'sip';
  project.plan.platforms[0].roof.mode = 'warm';
  const result = calculateProject(project);
  const roofCutting = result.sip.cutting.find((row) => row.key === 'roof');
  assert.ok(result.roof.warmArea > 0);
  assert.ok(roofCutting.area > 0);
  assert.ok(roofCutting.panels > 0);
  assert.equal(result.lines.filter((line) => line.id === 'sip:panel-roof').length, 1);
});

test('shared terrace foundation removes coincident piles and can be disabled', () => {
  const project = createDefaultProject();
  const shared = calculateFoundation(project.plan, project.settings.piles);
  assert.ok(shared.sharedPiles > 0);
  project.plan.platforms.forEach((platform) => { platform.foundation.mode = 'none'; platform.binding.mode = 'none'; });
  const houseOnly = calculateFoundation(project.plan, project.settings.piles);
  assert.ok(houseOnly.totalPiles < shared.totalPiles);
  assert.equal(houseOnly.platformPiles, 0);
  assert.equal(houseOnly.platformBindingLength, 0);
});

test('migration preserves plan, services and price list independently', () => {
  const project = createDefaultProject();
  project.plan.house.w = 12.4;
  project.services.roof = false;
  project.priceMat[0].price = 12345;
  const restored = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.plan.house.w, 12.4);
  assert.equal(restored.services.roof, false);
  assert.equal(restored.priceMat[0].price, 12345);
});
