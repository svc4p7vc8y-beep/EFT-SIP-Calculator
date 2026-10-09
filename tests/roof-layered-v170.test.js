import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { estimatePdfTitle } from '../src/react/export/estimate-pdf-title.js';
import { normalizeTerracePlatform } from '../src/calculations/terrace-model.js';

function roofCase(system, shape = 'gable') {
  const project = createDefaultProject();
  project.settings.roof.structureMode = 'manual';
  project.settings.roof.rafterSystem = system;
  project.settings.roof.shape = shape;
  return calculateProject(project);
}

test('layered roof prices two 100×50 ridge rows and their installation without double counting ridge in rafters', () => {
  const hanging = roofCase('hanging');
  const layered = roofCase('layered');
  const byId = id => layered.lines.find(line => line.id === `roof:${id}`);
  assert.equal(hanging.totals.total, 3750232.2924800003);
  assert.equal(layered.totals.total, 3762634.2924800003);
  assert.ok(layered.totals.total > hanging.totals.total);
  assert.equal(layered.roof.rafterBoardCount, 41);
  assert.equal(layered.roof.layeredRidgeBoardCount, 4);
  assert.equal(byId('rafters').qty, 1.845);
  assert.equal(byId('layered-ridge-boards').catalogId, 'MAT-027');
  assert.equal(byId('layered-ridge-boards').qty, 0.12);
  assert.equal(byId('layered-ridge-boards').price, 26400);
  assert.equal(byId('layered-ridge-work').catalogId, 'LAB-111');
  assert.equal(byId('layered-ridge-work').qty, 20.52);
  assert.equal(byId('layered-ridge-work').price, 750);
  assert.ok(!hanging.lines.some(line => line.id === 'roof:layered-ridge-boards'));
});

test('hip layered roof remains finite and warm roof has no cold timber ridge rows', () => {
  const hip = roofCase('layered', 'hip');
  assert.ok(hip.roof.layeredRidgeLength > 0);
  assert.ok(Number.isFinite(hip.totals.total));
  const project = createDefaultProject();
  project.settings.roof.structureMode = 'manual';
  project.settings.roof.rafterSystem = 'layered';
  project.settings.roof.type = 'sip';
  const warm = calculateProject(project);
  assert.equal(warm.roof.layeredRidgeLength, 0);
  assert.ok(!warm.lines.some(line => line.id === 'roof:layered-ridge-boards'));
});

test('cold gable terrace gets its own two ridge rows only in layered scheme', () => {
  const project = createDefaultProject();
  project.settings.roof.structureMode = 'manual';
  project.settings.roof.rafterSystem = 'layered';
  project.plan.platforms = [normalizeTerracePlatform({ id: 'test-terrace', kind: 'terrace', x: 0, y: project.plan.house.h, w: 6, h: 2, roof: { mode: 'cold', shape: 'gable', ridgeHeight: 1 } })];
  const layered = calculateProject(project);
  const prefix = 'roof:platform-test-terrace-layered-ridge-';
  const boards = layered.lines.find(line => line.id === `${prefix}boards`);
  const work = layered.lines.find(line => line.id === `${prefix}work`);
  assert.ok(boards?.qty > 0);
  assert.ok(work?.qty > 0);
  assert.equal(boards.catalogId, 'MAT-027');
  assert.equal(work.catalogId, 'LAB-111');
  project.settings.roof.rafterSystem = 'hanging';
  const hanging = calculateProject(project);
  assert.ok(!hanging.lines.some(line => line.id.startsWith(prefix)));
});

test('PDF title uses project parameters and strips filename-unsafe characters', () => {
  assert.equal(estimatePdfTitle({ projectNum: '12/7', buildingType: 'Жилой дом', customer: 'Иван: Петров' }), 'Смета_ЭФТ_12_7_Жилой_дом_Иван_Петров');
  assert.equal(estimatePdfTitle({}), 'Смета_ЭФТ');
});
