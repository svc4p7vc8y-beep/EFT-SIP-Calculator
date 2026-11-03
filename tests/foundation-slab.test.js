import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFoundationSlab, polygonMetrics } from '../src/react/calculations/foundation-slab.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';

function garageProject() {
  const project = createDefaultProject();
  project.plan.house = { ...project.plan.house, w: 6, h: 4, points: [] };
  project.settings.piles.pileType = 'slab';
  return project;
}

const foundationSection = project => calculateProject(project).sections.find(section => section.key === 'foundation');

test('control garage 6x4 with 150 mm extension matches the approved ZIP example', () => {
  const project = garageProject();
  const slab = calculateFoundationSlab(project.plan, project.settings.foundation);
  assert.equal(slab.areaM2, 27.09);
  assert.equal(slab.perimeterM, 21.2);
  assert.equal(slab.concreteNetM3, 5.418);
  assert.equal(slab.concreteOrderM3, 5.689);
  assert.equal(slab.sandCompactedM3, 4.0635);
  assert.equal(slab.sandPurchaseM3, 4.673);
});

test('concrete work uses net volume while purchased concrete uses the reserve', () => {
  const project = garageProject();
  const result = calculateProject(project);
  const lines = foundationSection(project).lines;
  assert.equal(result.foundation.totalPiles, 0);
  assert.equal(result.foundation.bindingLength, 0);
  assert.equal(lines.find(line => line.id === 'foundation:slab-concrete').qty, 5.689);
  assert.equal(lines.find(line => line.id === 'foundation:slab-concrete-work').qty, 5.418);
  assert.equal(lines.find(line => line.id === 'foundation:slab-concrete').price, 8600);
  assert.equal(lines.find(line => line.id === 'foundation:slab-concrete-work').price, 11000);
  assert.equal(lines.some(line => line.id === 'foundation:piles'), false);
});

test('one metre blind area starts at the outer slab edge', () => {
  const project = garageProject();
  project.settings.foundation.blind = { enabled: true, widthMm: 1000, thicknessMm: 100 };
  const slab = calculateFoundationSlab(project.plan, project.settings.foundation);
  assert.equal(slab.blindAreaM2, 25.2);
  assert.equal(slab.blindConcreteNetM3, 2.52);
  assert.equal(slab.blindConcreteOrderM3, 2.646);
});

test('an L-shaped house keeps its saved contour instead of using a bounding rectangle', () => {
  const project = garageProject();
  project.plan.house.points = [
    { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 },
    { x: 3, y: 2 }, { x: 3, y: 4 }, { x: 0, y: 4 },
  ];
  const slab = calculateFoundationSlab(project.plan, project.settings.foundation);
  assert.equal(slab.active, true);
  assert.ok(slab.areaM2 < 27.09);
  assert.equal(slab.slabPolygon.length, 6);
  assert.equal(polygonMetrics(slab.housePolygon).area, 18);
});

test('changing thickness affects volume but not slab geometry', () => {
  const project = garageProject();
  const thin = calculateFoundationSlab(project.plan, { ...project.settings.foundation, thicknessMm: 150 });
  const thick = calculateFoundationSlab(project.plan, { ...project.settings.foundation, thicknessMm: 300 });
  assert.equal(thin.areaM2, thick.areaM2);
  assert.equal(thick.concreteNetM3, thin.concreteNetM3 * 2);
});

test('legacy projects receive safe slab defaults without changing their foundation type', () => {
  const legacy = createDefaultProject();
  delete legacy.settings.foundation;
  const restored = migrateProject(JSON.parse(JSON.stringify(legacy)));
  assert.equal(restored.settings.piles.pileType, 'screw');
  assert.equal(restored.settings.foundation.extensionMm, 150);
  assert.equal(restored.settings.foundation.structuralApproval, 'not_confirmed');
});

test('unpriced slab materials remain visible and marked as pending', () => {
  const project = garageProject();
  project.settings.foundation.xpsEnabled = true;
  const lines = foundationSection(project).lines;
  for (const id of ['foundation:slab-formwork', 'foundation:slab-stone', 'foundation:slab-xps']) {
    const line = lines.find(item => item.id === id);
    assert.ok(line, id);
    assert.equal(line.pricePending, true);
  }
});

test('slab settings survive save and import while disabled foundation stays out of estimate', () => {
  const project = garageProject();
  project.settings.foundation.extensionMm = 325;
  project.settings.foundation.blind = { enabled: true, widthMm: 850, thicknessMm: 120 };
  const restored = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.settings.foundation.extensionMm, 325);
  assert.equal(restored.settings.foundation.blind.widthMm, 850);
  restored.services.foundation = false;
  assert.equal(foundationSection(restored).lines.some(line => line.source === 'foundation-slab'), false);
});
