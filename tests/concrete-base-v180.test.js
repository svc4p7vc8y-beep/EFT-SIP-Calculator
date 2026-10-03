import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateConcreteBase } from '../src/react/calculations/foundation-model.js';

const foundationLines = project => calculateProject(project).sections.find(section => section.key === 'foundation')?.lines || [];

test('prepared concrete includes only the priced beam, waterproofing, anchors and work', () => {
  const project = createDefaultProject();
  const pileLines = foundationLines(project);
  assert.ok(pileLines.length > 0);
  assert.equal(pileLines.some(line => line.source === 'concrete-base'), false);
  project.services.foundation = false;
  const result = calculateProject(project);
  const lines = foundationLines(project);
  assert.deepEqual(lines.map(line => line.catalogId), ['MAT-018', 'MAT-249', 'MAT-248', 'LAB-132']);
  assert.deepEqual(lines.map(line => line.qty), [0.72, 3, 37, 43.27]);
  assert.equal(lines.reduce((sum, line) => sum + line.qty * line.price, 0), 57792);
  assert.equal(lines.some(line => line.price <= 0), false);
  assert.equal(result.foundation.concreteBase.anchorSpacingM, 1.2);
});

test('concrete length and anchor count can be overridden independently and saved', () => {
  const project = createDefaultProject();
  project.services.foundation = false;
  project.settings.piles.concreteBase = { enabled: true, length: 12, anchorSpacingM: 0.8, anchorCount: null };
  let result = calculateConcreteBase(project.plan, project.settings.piles.concreteBase, true);
  assert.equal(result.beamCount, 3);
  assert.equal(result.stripRolls, 1);
  assert.equal(result.anchorCount, 15);
  project.settings.piles.concreteBase.anchorCount = 19;
  const restored = migrateProject(JSON.parse(JSON.stringify(project)));
  result = calculateProject(restored).foundation.concreteBase;
  assert.equal(result.anchorCount, 19);
  assert.equal(result.length, 12);
  assert.equal(foundationLines(restored).find(line => line.catalogId === 'MAT-248').qty, 19);
  restored.settings.piles.concreteBase.enabled = false;
  assert.equal(foundationLines(restored).length, 0);
});

test('legacy projects receive editable concrete defaults without altering existing project prices', () => {
  const old = createDefaultProject();
  old.version = 179;
  delete old.settings.piles.concreteBase;
  old.priceOverrides = { 'MAT-018': 12345 };
  const restored = migrateProject(JSON.parse(JSON.stringify(old)));
  assert.equal(restored.settings.piles.concreteBase.anchorSpacingM, 1.2);
  assert.equal(restored.priceOverrides['MAT-018'], 12345);
});
