import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';

const example = (axis = 'x', detailed = false) => {
  const project = createDefaultProject();
  project.plan.house.w = 10;
  project.plan.house.h = 8;
  project.settings.roof.ridgeAxis = axis;
  project.settings.productionCutting.roofDesign.enabled = detailed;
  return project;
};
const run = project => {
  const calculation = calculateProject(project);
  const report = calculateProductionCutting(project, calculation);
  return { calculation, report, scene: productionScene(report, project) };
};

for (const axis of ['x', 'y']) for (const detailed of [false, true]) {
  test(`hanging gable rigels join each pair at the selected height: ${axis}, planes ${detailed}`, () => {
    const project = example(axis, detailed);
    const { calculation, report, scene } = run(project);
    const rigels = report.assembly.roofTimbers.filter(item => item.roofMemberKind === 'hanging-riegel');
    const line = calculation.lines.find(item => item.id === 'roof:hanging-rigels');
    assert.equal(rigels.length, calculation.roof.hangingRiegel.count);
    assert.equal(line.catalogId, 'MAT-026');
    assert.equal(line.qty, calculation.roof.hangingRiegel.volume);
    assert.equal(scene.beams.filter(item => item.name === 'Ригель').length, rigels.length);
    assert.ok(rigels.length > 0);
    for (const item of rigels) {
      assert.equal(item.profile, '25×150');
      assert.equal(item.structuralStatus, 'unverified');
      assert.equal(item.rafterIds.length, 2);
      assert.equal(item.worldA[2], item.worldB[2]);
      assert.ok(Math.abs(item.length / 1000 - calculation.roof.hangingRiegel.length) < .002);
      assert.ok(item.rafterIds.every(id => report.assembly.rafters.some(rafter => rafter.id === id)));
    }
  });
}

test('manual height moves and shortens rigels and changes the priced quantity', () => {
  const project = example();
  const middle = run(project);
  project.settings.roof.hangingRiegelHeightPercent = 70;
  const raised = run(project);
  assert.equal(middle.calculation.roof.hangingRiegel.length, 4);
  assert.equal(raised.calculation.roof.hangingRiegel.length, 2.4);
  assert.ok(raised.calculation.roof.hangingRiegel.volume < middle.calculation.roof.hangingRiegel.volume);
  assert.ok(raised.report.assembly.roofTimbers.filter(item => item.name === 'Ригель').every(item => item.heightPercent === 70));
  const reopened = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(reopened.settings.roof.hangingRiegelHeightPercent, 70);
  assert.equal(calculateProject(reopened).roof.hangingRiegel.length, 2.4);
});

test('rigels can be disabled and do not appear in other roof systems', () => {
  for (const setting of [{ hangingRiegelEnabled: false }, { type: 'sip' }, { shape: 'hip' }, { structureMode: 'manual', rafterSystem: 'layered' }]) {
    const project = example();
    Object.assign(project.settings.roof, setting);
    const { calculation, report } = run(project);
    assert.equal(calculation.roof.hangingRiegel.count, 0);
    assert.equal(calculation.lines.some(item => item.id === 'roof:hanging-rigels'), false);
    assert.equal(report.assembly.roofTimbers.some(item => item.name === 'Ригель'), false);
  }
});

test('old project gets a safe default and long rigels remain flagged as unplaceable', () => {
  const raw = createDefaultProject();
  delete raw.settings.roof.hangingRiegelEnabled;
  delete raw.settings.roof.hangingRiegelHeightPercent;
  const project = migrateProject(JSON.parse(JSON.stringify(raw)));
  const { calculation, report } = run(project);
  assert.equal(project.settings.roof.hangingRiegelHeightPercent, 50);
  assert.equal(calculation.roof.hangingRiegel.count, 15);
  assert.equal(calculation.roof.hangingRiegel.boardCount, 0);
  assert.ok(report.issues.some(item => item.code === 'MEMBER_SIZE'));
  assert.ok(report.assembly.issues.some(item => item.includes('несущая способность требуют расчёта')));
});
