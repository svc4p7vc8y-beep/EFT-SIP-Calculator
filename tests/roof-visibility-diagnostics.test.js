import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { blockedSurfaceReasons, blockedSurfaceSummary, missingMainRoofReason } from '../src/react/calculations/production-diagnostics.js';
import { isAxisAlignedRectangleContour } from '../src/react/calculations/roof-contour.js';

const project = () => {
  const value = createDefaultProject();
  value.plan = { ...value.plan, house: { w: 8, h: 6 }, rooms: [], walls: [], openings: [], wallGaps: [], platforms: [] };
  value.settings.roof.shape = 'gable';
  return value;
};
const render = value => {
  const calculation = calculateProject(value);
  const report = calculateProductionCutting(value, calculation);
  return { calculation, report, scene: productionScene(report, value) };
};

test('a fully warm combined gable produces main SIP faces and visible roof panels', () => {
  const value = project();
  value.settings.roof.type = 'combo';
  value.settings.roof.warmPercent = 100;
  const { report, scene } = render(value);
  assert.equal(report.assembly.roofModel.faces.filter(face => face.group === 'main').length, 2);
  assert.ok(report.assembly.roofModel.faces.filter(face => face.group === 'main').every(face => face.warm));
  assert.ok(scene.panels.some(part => part.layer === 'roof'));
  assert.equal(missingMainRoofReason(report, value, scene), '');
});

test('a partially warm combined roof still shows its cold rafters', () => {
  const value = project();
  value.settings.roof.type = 'combo';
  value.settings.roof.warmPercent = 50;
  const { report, scene } = render(value);
  assert.ok(report.assembly.rafters.length > 0);
  assert.ok(scene.beams.some(item => item.layer === 'rafters'));
  assert.equal(missingMainRoofReason(report, value, scene), '');
});

test('extra vertices on straight walls do not erase the main gable roof', () => {
  const value = project();
  value.plan.house = { w: 7, h: 8, contourDefined: true, points: [
    { x: 0, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 4.571 },
    { x: 7, y: 8 }, { x: 4.732, y: 8 }, { x: 0, y: 8 },
  ] };
  value.settings.roof.type = 'cold';
  value.settings.roof.ridgeAxis = 'x';
  const before = structuredClone(value.plan.house.points);
  const { report, scene } = render(value);
  assert.ok(isAxisAlignedRectangleContour(value.plan.house.points));
  assert.equal(report.assembly.roofModel.faces.filter(face => face.group === 'main').length, 2);
  assert.ok(report.assembly.rafters.filter(item => !item.faceId).length > 0);
  assert.ok(scene.beams.filter(item => item.layer === 'rafters').length > 0);
  assert.equal(missingMainRoofReason(report, value, scene), '');
  assert.deepEqual(value.plan.house.points, before);
  assert.equal(isAxisAlignedRectangleContour([[0,0],[7,0],[7,8],[4,8],[4,4],[0,4]]), false);
});

test('a red wall identifies its blocking opening or panel-size issue', () => {
  const value = project();
  value.plan.openings = [{ id: 'narrow-window', type: 'window', outer: true, x: .6, y: 0, width: 1, height: 1.2 }];
  const { report, scene } = render(value);
  const red = scene.previews.find(item => item.surfaceId === 'Э1-С1');
  assert.ok(red);
  assert.ok(blockedSurfaceReasons(report, red.surfaceId)[0].includes('250 мм'));
  assert.ok(blockedSurfaceSummary(report, red.surfaceId).includes('Э1-С1'));
});
