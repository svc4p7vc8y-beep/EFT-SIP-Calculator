import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { calculateDeliveryVolume } from '../src/react/calculations/delivery-volume.js';
import { reconcileCutting } from '../src/react/calculations/cutting-reconciliation.js';
import { gluedRidgeLayout } from '../src/react/calculations/roof-glued-ridge.js';
import { calculateTerraceRoof, resolveTerracePlatform } from '../src/calculations/terrace-model.js';

const report = project => calculateProductionCutting(project, calculateProject(project));

test('continuation follows main type, overhang and pitch while a manual terrace keeps its values', () => {
  const platform = { x: 1, y: 7, w: 4, h: 2, roof: { mode: 'cold', shape: 'continuation', frontOverhang: .2, sideOverhang: .1 } };
  const main = { type: 'sip', eaveOverhang: .6, gableOverhang: .4, rafterStep: .7, ridgeHeight: 2.1 };
  const inherited = resolveTerracePlatform(platform, main);
  assert.deepEqual([inherited.roof.mode, inherited.roof.frontOverhang, inherited.roof.sideOverhang, inherited.roof.rafterStep, inherited.roof.ridgeHeight], ['warm', .6, .4, .7, 2.1]);
  assert.equal(calculateTerraceRoof(platform, { w: 8, h: 7 }, { mainRoof: main }).mode, 'warm');
  const manual = resolveTerracePlatform({ ...platform, roof: { ...platform.roof, inheritMainRoof: false } }, main);
  assert.deepEqual([manual.roof.mode, manual.roof.frontOverhang, manual.roof.sideOverhang], ['cold', .2, .1]);
  assert.equal(resolveTerracePlatform({ ...platform, roof: { ...platform.roof, mode: 'none' } }, main).roof.mode, 'none');
});

test('three, four and five-board package prices migrate without replacing project prices', () => {
  const project = createDefaultProject();
  assert.deepEqual(['MAT-250', 'MAT-251', 'MAT-252'].map(id => project.priceMat.find(row => row.id === id)?.price), [1261.5, 1682, 2102.5]);
  project.priceMat.find(row => row.id === 'MAT-250').price = 1400;
  assert.equal(migrateProject(JSON.parse(JSON.stringify(project))).priceMat.find(row => row.id === 'MAT-250').price, 1400);
});

test('gable end pairs land on four extended mauerlat ends and are included in purchasing', () => {
  const project = createDefaultProject();
  project.settings.roof.gableOverhang = 0;
  const base = calculateProject(project);
  project.settings.roof.gableOverhang = .3;
  const changed = calculateProject(project), assembly = report(project).assembly;
  assert.equal(changed.roof.rafterStructure.pairCount, base.roof.rafterStructure.pairCount + 2);
  assert.ok(Math.abs(changed.roof.mauerlatLength - base.roof.mauerlatLength - 1.5) < .001);
  assert.equal(changed.roof.mauerlatFastenerPoints, base.roof.mauerlatFastenerPoints);
  assert.equal(assembly.rafters.length, changed.roof.rafterStructure.legCount);
  const bearing = assembly.rafters.filter(item => item.a[0] < assembly.bounds.x || item.a[0] > assembly.bounds.x + assembly.bounds.width);
  assert.equal(bearing.length, 4);
  assert.ok(bearing.every(item => item.bearingStatus === 'geometry-only'));
  assert.ok(assembly.issues.some(issue => issue.includes('консоли')));
});

test('terrace outer tie uses post section and adds one material line', () => {
  const project = createDefaultProject();
  project.plan.platforms = [{ id: 't', x: 1, y: project.plan.house.h, w: 4, h: 2, kind: 'terrace', roof: { mode: 'cold', shape: 'shed', postSection: '100x100' } }];
  const calculation = calculateProject(project), assembly = report(project).assembly;
  const tie = calculation.lines.find(line => line.id === 'roof:platform-t-outer-tie-100x100');
  assert.ok(tie?.qty > 0);
  const platform = assembly.platforms[0];
  assert.equal(platform.ties.length, platform.posts.length - 1);
  assert.ok(platform.posts.every(item => Math.abs(item.a[1] - (project.plan.house.h + 2) * 1000) < 1));
  assert.ok(productionScene(report(project), project).beams.some(item => item.id === 'platform:t:tie:1'));
});

test('layered terrace ridge uses one priced three-board package and a visible beam', () => {
  const project = createDefaultProject();
  Object.assign(project.settings.roof, { structureMode: 'manual', rafterSystem: 'layered' });
  project.plan.platforms = [{ id: 't', x: 1, y: project.plan.house.h, w: 4, h: 2, kind: 'terrace', roof: { mode: 'cold', shape: 'gable' } }];
  const calculation = calculateProject(project), assembly = report(project).assembly;
  assert.equal(calculation.lines.find(line => line.id === 'roof:platform-t-glued-ridge')?.catalogId, 'MAT-250');
  assert.ok(!calculation.lines.some(line => line.id === 'roof:platform-t-layered-ridge-boards'));
  assert.ok(assembly.roofTimbers.some(item => item.roofMemberKind === 'ridge-package' && item.group === 'terrace:t'));
  const cargo = calculateDeliveryVolume(project, calculation).categories.find(category => category.key === 'timber').rows.find(line => line.id === 'roof:platform-t-glued-ridge');
  assert.ok(Math.abs(cargo.volume - cargo.qty * .145 * .15) < 1e-6);
  assert.ok(reconcileCutting(report(project), calculation).some(row => row.key === 'Клеёный пакет:145×150' && row.matched));
});

test('layered second light uses main purlin axes without an extra ridge package', () => {
  const project = createDefaultProject();
  Object.assign(project.settings.roof, { structureMode: 'manual', rafterSystem: 'layered' });
  project.plan.rooms = [{ id: 'light', x: 2, y: 4, w: 3, h: 5, ceilingMode: 'open-rafter' }];
  const calculation = calculateProject(project), assembly = report(project).assembly;
  assert.ok(!calculation.lines.some(line => line.id === 'roof:second-light-glued-ridge'));
  assert.ok(calculation.roof.layeredFrame.bridgeItems.some(item => item.scope === 'second-light'));
  assert.ok(!assembly.roofTimbers.some(item => item.roofMemberKind === 'ridge-package' && item.group === 'main'));
  assert.ok(assembly.roofTimbers.filter(item => item.material === 'Коньковая доска · ряд').length >= 2);
});

test('layered continuation follows the purlins and omits a duplicate ridge package', () => {
  const project = createDefaultProject();
  Object.assign(project.settings.roof, { structureMode: 'manual', rafterSystem: 'layered' });
  const house = project.plan.house;
  project.plan.platforms = [{ id: 'end', x: house.w, y: 2, w: 3, h: 8, kind: 'terrace', roof: { mode: 'cold', shape: 'continuation' } }];
  const calculation = calculateProject(project);
  const layout = gluedRidgeLayout(project, true, calculation.roof.terraceRoofs);
  assert.equal(layout.terraces.length, 1);
  assert.ok(Math.min(layout.terraces[0].a[0], layout.terraces[0].b[0]) >= house.w + project.settings.roof.gableOverhang - 1e-6);
  assert.ok(calculation.roof.layeredFrame.bridgeItems.some(item => item.scope === 'terrace' && item.platformId === 'end'));
  assert.ok(!calculation.lines.some(line => line.id === 'roof:platform-end-glued-ridge'));
  assert.ok(!report(project).assembly.roofTimbers.some(item => item.roofMemberKind === 'ridge-package' && item.group === 'terrace:end'));
});

test('hanging roof keeps a single ridge package over an open room and terrace', () => {
  const project = createDefaultProject();
  Object.assign(project.settings.roof, { structureMode: 'manual', rafterSystem: 'hanging' });
  project.plan.rooms = [{ id: 'light', x: 2, y: 4, w: 3, h: 5, ceilingMode: 'open-rafter' }];
  project.plan.platforms = [{ id: 'end', x: project.plan.house.w, y: 2, w: 3, h: 8, kind: 'terrace', roof: { mode: 'cold', shape: 'continuation' } }];
  const calculation = calculateProject(project), assembly = report(project).assembly;
  assert.equal(calculation.roof.layeredFrame.bridgeItems?.length || 0, 0);
  assert.equal(calculation.lines.find(line => line.id === 'roof:second-light-glued-ridge')?.catalogId, 'MAT-250');
  assert.equal(calculation.lines.find(line => line.id === 'roof:platform-end-glued-ridge')?.catalogId, 'MAT-250');
  assert.equal(assembly.roofTimbers.filter(item => item.roofMemberKind === 'ridge-package').length, 2);
});
