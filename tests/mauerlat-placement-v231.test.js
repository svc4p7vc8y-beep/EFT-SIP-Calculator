import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionLevels } from '../src/react/calculations/production-levels.js';
import { productionScene } from '../src/react/calculations/production-scene.js';

const run = (project) => {
  const calculation = calculateProject(project);
  const report = calculateProductionCutting(project, calculation);
  return { calculation, report, scene: productionScene(report, project) };
};

test('old files retain lying 100 × 150 wall plate; board choice changes only its catalog volume', () => {
  const project = createDefaultProject();
  delete project.settings.roof.mauerlatProfile;
  const old = migrateProject(JSON.parse(JSON.stringify(project)));
  const timber = run(old);
  const timberLine = timber.calculation.lines.find(line => line.id === 'roof:mauerlat-timber');
  assert.equal(timberLine.catalogId, 'MAT-018');
  assert.equal(timberLine.qty, 0.72);
  assert.equal(timber.calculation.roof.mauerlatLength, 44.17);
  assert.equal(timber.report.assembly.roofTimbers.filter(item => item.name === 'Мауэрлат').length, 4);
  const plateTop = productionLevels(old, 1).roofBase + Number(old.settings.sip.ceilingThickness);
  for (const item of timber.report.assembly.roofTimbers.filter(item => item.name === 'Мауэрлат')) {
    assert.equal(item.profile, '100×150');
    assert.equal(item.plateTopZ, plateTop + 100);
    assert.equal(item.worldA[2], plateTop + 50);
  }
  const boardProject = structuredClone(old);
  boardProject.settings.roof.mauerlatProfile = '50x150';
  const board = run(boardProject);
  const boardLine = board.calculation.lines.find(line => line.id === 'roof:mauerlat-timber');
  assert.equal(boardLine.catalogId, 'MAT-023');
  assert.equal(boardLine.qty, 0.36);
  assert.equal(board.calculation.roof.mauerlatLength, timber.calculation.roof.mauerlatLength);
  assert.equal(board.calculation.totals.total, timber.calculation.totals.total - 9504);
  assert.ok(board.scene.beams.filter(item => item.name === 'Мауэрлат').every(item => item.profile === '50×150' && item.flat));
});

for (const shape of ['gable', 'hip', 'flat', 'tiered']) {
  test(`${shape} shows the plate at the ceiling edge and never accepts a cut deeper than 50 mm`, () => {
    const project = createDefaultProject();
    project.settings.roof.type = 'cold';
    project.settings.roof.shape = shape;
    const { calculation, report, scene } = run(project);
    assert.ok(calculation.roof.mauerlatLength > 0);
    const plates = report.assembly.roofTimbers.filter(item => item.name === 'Мауэрлат');
    assert.equal(plates.length, 4);
    assert.equal(scene.beams.filter(item => item.name === 'Мауэрлат').length, 4);
    const accepted = report.assembly.rafters.filter(item => item.bearingStatus === 'geometry-only');
    assert.ok(accepted.every(item => item.bearingNotchMm >= 0 && item.bearingNotchMm <= 50));
    if (shape === 'flat' || shape === 'tiered') {
      assert.ok(report.assembly.issues.some(issue => String(issue).includes('Опирание на мауэрлат не подтверждено')));
    } else {
      assert.ok(accepted.length > 0);
    }
  });
}
