import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { calculateDeliveryVolume } from '../src/react/calculations/delivery-volume.js';
import { reconcileCutting } from '../src/react/calculations/cutting-reconciliation.js';

const setup = () => {
  const project = createDefaultProject();
  project.plan = { ...project.plan, house: { w: 10, h: 8 }, rooms: [], walls: [], openings: [], wallGaps: [], platforms: [] };
  project.settings.roof.structureMode = 'manual';
  project.settings.roof.rafterSystem = 'layered';
  project.settings.roof.ridgeAxis = 'x';
  return project;
};

test('two main purlins continue as four horizontal upper and lower terrace beams', () => {
  const project = setup();
  project.plan.platforms = [{ id: 'end', x: 10, y: 0, w: 3, h: 8, kind: 'terrace', roof: { mode: 'cold', shape: 'continuation' } }];
  const calculation = calculateProject(project);
  const report = calculateProductionCutting(project, calculation);
  const bridges = calculation.roof.layeredFrame.bridgeItems.filter(item => item.scope === 'terrace');
  assert.deepEqual(calculation.roof.layeredFrame.fractions, [1 / 3, 2 / 3]);
  assert.equal(bridges.length, 4);
  assert.deepEqual(bridges.map(item => item.role).sort(), ['purlin', 'purlin', 'sleeper', 'sleeper']);
  assert.deepEqual([...new Set(bridges.map(item => Math.round(item.a[1])))], [2667, 5333]);
  assert.ok(bridges.every(item => item.a[0] === 10300 && item.b[0] === 13300 && item.a[2] === item.b[2]));
  for (const bridge of bridges) {
    const main = report.assembly.supports.find(item => item.autoLayout === 'layered-frame' && item.role === bridge.role && item.group === bridge.group);
    assert.ok(main);
    assert.equal(bridge.a[1], main.a[1]);
    assert.equal(bridge.a[2], main.a[2]);
  }
  assert.equal(report.assembly.supports.filter(item => item.scope === 'terrace').length, 4);
  assert.equal(productionScene(report, project).beams.filter(item => item.scope === 'terrace').length, 4);
  const terracePlates = report.assembly.roofTimbers.filter(item => item.material === 'Мауэрлат' && item.a[1] === item.b[1]);
  assert.equal(terracePlates.length, 2);
  assert.ok(terracePlates.every(item => Math.max(item.a[0], item.b[0]) === 13000));
  assert.equal(calculation.roof.mauerlatLength, 42.3);
  assert.equal(calculation.roof.mauerlatBoardCount, 8);
  const noTerrace = structuredClone(project);
  noTerrace.plan.platforms = [];
  assert.equal(calculation.roof.mauerlatFastenerPoints, calculateProject(noTerrace).roof.mauerlatFastenerPoints);
  assert.ok(!report.assembly.roofTimbers.some(item => item.roofMemberKind === 'ridge-package'));
  const line = calculation.lines.find(item => item.id === 'roof:layered-bridge-terrace');
  assert.equal(line.catalogId, 'MAT-250');
  assert.equal(line.qty, 12.6);
  assert.equal(line.price, 1261.5);
  const work = calculation.lines.find(item => item.id === 'roof:layered-bridge-terrace-work');
  assert.equal(work.catalogId, 'LAB-111');
  assert.equal(work.qty, 12);
  assert.equal(work.price, 750);
  const cargo = calculateDeliveryVolume(project, calculation).categories.find(item => item.key === 'timber').rows.find(item => item.id === line.id);
  assert.ok(Math.abs(cargo.volume - line.qty * .145 * .15) < 1e-6);
  const reconciliation = reconcileCutting(report, calculation).find(item => item.key === 'Клеёный пакет:145×150');
  assert.ok(reconciliation.matched);
  assert.ok(reconciliation.purchased >= line.qty * .145 * .15);
  assert.ok(report.assembly.issues.some(issue => issue.includes('не подтверждены расчётом')));
});

test('second light replaces unsupported purlin and sleeper spans with four package beams', () => {
  const project = setup();
  project.plan.rooms = [{ id: 'light', x: 2, y: 1, w: 3, h: 6, ceilingMode: 'open-rafter' }];
  const calculation = calculateProject(project);
  const report = calculateProductionCutting(project, calculation);
  const bridges = calculation.roof.layeredFrame.bridgeItems.filter(item => item.scope === 'second-light');
  assert.equal(bridges.length, 4);
  assert.ok(bridges.every(item => item.a[0] === 2000 && item.b[0] === 5000));
  assert.ok(!report.assembly.supports.some(item => item.autoLayout === 'layered-frame' && item.role === 'post' && item.a[0] > 2000 && item.a[0] < 5000));
  assert.ok(!report.assembly.supports.some(item => item.autoLayout === 'layered-frame' && ['purlin', 'sleeper'].includes(item.role)
    && item.scope !== 'second-light' && item.a[0] < 5000 && item.b[0] > 2000));
  assert.equal(calculation.lines.find(item => item.id === 'roof:layered-bridge-second-light')?.qty, 12.6);
  assert.equal(report.assembly.supports.filter(item => item.scope === 'second-light').length, 4);
});

test('continuation follows Y ridge axis and unrelated terraces or trusses receive no derived beams', () => {
  const project = setup();
  project.plan.house = { w: 8, h: 10 };
  project.settings.roof.ridgeAxis = 'y';
  project.plan.platforms = [{ id: 'end', x: 0, y: 10, w: 8, h: 3, kind: 'terrace', roof: { mode: 'cold', shape: 'continuation' } }];
  let bridges = calculateProject(project).roof.layeredFrame.bridgeItems.filter(item => item.scope === 'terrace');
  assert.equal(bridges.length, 4);
  assert.ok(bridges.every(item => item.a[1] === 10300 && item.b[1] === 13300 && item.a[0] === item.b[0]));
  const plates = calculateProductionCutting(project, calculateProject(project)).assembly.roofTimbers
    .filter(item => item.material === 'Мауэрлат' && item.a[0] === item.b[0]);
  assert.equal(plates.length, 2);
  assert.ok(plates.every(item => Math.max(item.a[1], item.b[1]) === 13000));
  project.plan.platforms[0].roof.shape = 'shed';
  assert.equal(calculateProject(project).roof.layeredFrame.bridgeItems.filter(item => item.scope === 'terrace').length, 0);
  project.plan.platforms[0].roof.shape = 'continuation';
  project.settings.roof.rafterSystem = 'truss';
  assert.equal(calculateProject(project).roof.layeredFrame.bridgeItems.length, 0);
});
