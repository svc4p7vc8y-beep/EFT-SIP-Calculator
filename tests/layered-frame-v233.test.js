import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { layeredFrameFractions } from '../src/react/calculations/layered-frame.js';
import { beamFrame } from '../src/react/calculations/beam-frame.js';

const projectFor = (width = 8, length = 10) => {
  const p = createDefaultProject();
  p.plan = { ...p.plan, house: { w: length, h: width }, rooms: [], walls: [], openings: [], wallGaps: [], platforms: [] };
  p.settings.roof.ridgeAxis = 'x';
  p.settings.roof.structureMode = 'manual';
  p.settings.roof.rafterSystem = 'layered';
  return p;
};

test('width thresholds and manual positions yield one, two or three longitudinal supports', () => {
  assert.deepEqual(layeredFrameFractions(6000), [.5]);
  assert.deepEqual(layeredFrameFractions(6001), [1 / 3, 2 / 3]);
  assert.deepEqual(layeredFrameFractions(10000), [1 / 3, 2 / 3]);
  assert.deepEqual(layeredFrameFractions(10001), [.25, .5, .75]);
  assert.deepEqual(layeredFrameFractions(8000, { layeredFrameMode: 'manual', layeredFrameCount: 2, layeredFramePositions: [30, 70] }), [.3, .7]);
  assert.deepEqual(layeredFrameFractions(8000, { layeredFrameMode: 'manual', layeredFrameCount: 2, layeredFramePositions: [70, 30] }), [1 / 3, 2 / 3]);
});

test('10 × 8 m cold layered roof shares two geometric frames between estimate, stock and 3D', () => {
  const p = projectFor(), calculation = calculateProject(p), report = calculateProductionCutting(p, calculation);
  assert.deepEqual(calculation.roof.layeredFrame.fractions, [1 / 3, 2 / 3]);
  const items = report.assembly.supports.filter(item => item.autoLayout === 'layered-frame');
  assert.equal(items.length, calculation.roof.layeredFrame.items);
  assert.equal(items.filter(item => item.role === 'purlin').length, 20);
  assert.equal(items.filter(item => item.role === 'sleeper').length, 20);
  assert.equal(items.filter(item => item.role === 'post').length, 22);
  assert.ok(items.filter(item => item.role === 'post').every(item => item.normal[1] === 1));
  assert.ok(items.filter(item => item.role === 'post').every(item => Math.abs(beamFrame(item.a,item.b,item.normal).depth[1]) === 1));
  assert.ok(items.filter(item => item.role === 'post').every(item => item.a[0] === item.b[0] && item.a[1] === item.b[1]));
  const purlinYs = [...new Set(items.filter(item => item.role === 'purlin').map(item => Math.round(item.a[1])))];
  assert.deepEqual(purlinYs, [2667, 5333]);
  assert.ok(items.filter(item => item.role === 'sleeper').every(item => item.heightMm === 100 && item.profile === '100×150'));
  assert.ok(items.filter(item => item.role === 'post').every(item => item.a[2] < item.b[2]));
  assert.ok(items.every(item => item.loadPath.complete === false));
  const scene = productionScene(report, p);
  assert.equal(scene.beams.filter(item => item.layer === 'supports' && item.id.startsWith('КР-НФ')).length, items.length);
  for (const role of ['purlin', 'sleeper', 'post']) {
    const line = calculation.lines.find(item => item.id === `roof:layered-frame-${role}`);
    assert.ok(line?.qty > 0);
    assert.ok(line.catalogId);
  }
  assert.ok(report.assembly.issues.some(issue => issue.includes('не проверены расчётом')));
});

test('saved legacy 6 m spacing adopts automatic 1 m stations; manual override remains available', () => {
  const p = projectFor(); p.settings.roof.layeredFramePostSpacingMm = 6000;
  delete p.settings.roof.layeredFramePostSpacingMode;
  assert.equal(migrateProject(JSON.parse(JSON.stringify(p))).settings.roof.layeredFramePostSpacingMode, 'auto');
  const auto = calculateProductionCutting(p, calculateProject(p)).assembly.supports.filter(item => item.role === 'post');
  assert.equal(auto.length, 22);
  p.settings.roof.layeredFramePostSpacingMode = 'manual';
  const manual = calculateProductionCutting(p, calculateProject(p)).assembly.supports.filter(item => item.role === 'post');
  assert.equal(manual.length, 6);
});

test('sleeper follows wall plate profile, manual placement survives JSON, saved purlins suppress derived frames', () => {
  const p = projectFor();
  p.settings.roof.mauerlatProfile = '50x150';
  p.settings.roof.layeredFrameMode = 'manual';
  p.settings.roof.layeredFrameCount = 1;
  p.settings.roof.layeredFramePositions = [40];
  const saved = migrateProject(JSON.parse(JSON.stringify(p)));
  const c = calculateProject(saved), r = calculateProductionCutting(saved, c);
  assert.deepEqual(c.roof.layeredFrame.fractions, [.4]);
  assert.ok(r.assembly.supports.filter(item => item.role === 'sleeper').every(item => item.profile === '50×150'));
  assert.equal(c.lines.find(item => item.id === 'roof:layered-frame-sleeper').catalogId, 'MAT-023');
  saved.settings.productionCutting.roofSupports = [{ id: 'manual-purlin', type: 'purlin', profile: '50×150', name: 'Проектный прогон',
    x1: 0, y1: 4000, z1: 4000, x2: 10000, y2: 4000, z2: 4000,
    nodeRef: '', startSupport: '', endSupport: '', foundationRef: '', referenceOnly: false }];
  const manual = calculateProject(saved);
  assert.equal(manual.roof.layeredFrame.items, 0);
  assert.equal(manual.lines.some(item => item.id.startsWith('roof:layered-frame-')), false);
});

test('disabled wall plate, disabled frame and nonrectangular contour never create fictitious priced supports', () => {
  for (const mutate of [
    p => { p.settings.roof.mauerlatLayout = 'none'; },
    p => { p.settings.roof.layeredFrameEnabled = false; },
    p => { p.plan.house.points = [[0,0],[10,0],[10,4],[6,4],[6,8],[0,8]].map(([x,y])=>({x,y})); },
  ]) {
    const p = projectFor(); mutate(p);
    const calculation = calculateProject(p);
    assert.equal(calculation.roof.layeredFrame.items, 0);
    assert.equal(calculation.lines.some(item => item.id.startsWith('roof:layered-frame-')), false);
  }
});
