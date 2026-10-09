import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFirstFloorWallGeometry, compareWallGeometry, wallLocalToWorld, wallWorldToLocal } from '../src/react/calculations/wall-geometry-adapter.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';

function house() {
  const p = createDefaultProject();
  Object.assign(p.plan, { house: { w: 6, h: 3, contourDefined: true }, wallHeight: 2.5,
    rooms: [], walls: [], openings: [], wallGaps: [], platforms: [], pileRows: [], piles: [], bindingLines: [] });
  Object.assign(p.settings.productionCutting, { kerfMm: 3, endAllowanceMm: 0 });
  p.services.sipWalls = true; p.services.roof = false;
  return p;
}
const adapt = (p, options = {}) => buildFirstFloorWallGeometry({ plan: p.plan, sip: p.settings.sip,
  roof: p.settings.roof, services: p.services, productionSettings: p.settings.productionCutting, ...options });
const run = p => calculateProductionCutting(p, calculateProject(p));

test('adapter preserves outer dimensions and fabrication lengths for all EFT thicknesses', () => {
  for (const thickness of [124, 174, 224]) {
    const p = house(); p.settings.sip.wallThickness = thickness;
    const before = structuredClone(p), model = adapt(p), report = run(p);
    assert.equal(model.supported, true);
    assert.deepEqual(model.bounds, { x: 0, y: 0, width: 6000, length: 3000 });
    assert.deepEqual(model.walls.map(w => w.length), [6000, 3000 - 2 * thickness, 6000, 3000 - 2 * thickness]);
    assert.equal(report.geometryDiagnostics.comparison.status, 'matched');
    assert.deepEqual(p, before);
    assert.equal(model.corners.length, 4);
    assert.equal(model.walls[0].axisStart[1], thickness / 2);
  }
});

test('local/world transforms are reversible for translated and reversed contours', () => {
  for (const reverse of [false, true]) {
    const p = house(), points = [{ x: 2, y: 4 }, { x: 8, y: 4 }, { x: 8, y: 7 }, { x: 2, y: 7 }];
    p.plan.house.points = reverse ? points.reverse() : points;
    const model = adapt(p);
    assert.equal(model.supported, true);
    for (const wall of model.walls) {
      assert.deepEqual(wallWorldToLocal(wall, wallLocalToWorld(wall, 750, 850, 42)), [750, 850, 42]);
      assert.deepEqual(wallLocalToWorld(wall, wall.length).slice(0, 2), wall.end);
      assert.ok(wall.axisStart[0] >= 2000 && wall.axisStart[0] <= 8000);
      assert.ok(wall.axisStart[1] >= 4000 && wall.axisStart[1] <= 7000);
    }
    assert.equal(run(p).geometryDiagnostics.comparison.status, 'matched');
  }
});

test('four slope directions retain the existing sloped wall geometry without estimate dependence', () => {
  for (const direction of ['front', 'back', 'left', 'right']) {
    const p = house(); p.services.roof = true;
    Object.assign(p.settings.roof, { shape: 'flat', flatSlopeMode: 'structural', flatSlopePercent: 5,
      flatSlopeDirection: direction, gableType: 'sip', type: 'sip' });
    const model = adapt(p), heights = model.walls.flatMap(w => [w.heightStart, w.heightEnd]);
    assert.equal(Math.max(...heights), ['left', 'right'].includes(direction) ? 2800 : 2650);
    assert.equal(Math.min(...heights), 2500);
    assert.ok(model.walls.some(w => w.heightStart !== w.heightEnd));
    assert.equal(run(p).geometryDiagnostics.comparison.status, 'matched');
    assert.ok(adapt(p, { topFloor: false }).walls.every(w => w.heightStart === 2500 && w.heightEnd === 2500));
    p.services.roof = false;
    assert.ok(adapt(p).walls.every(w => w.heightStart === 2500 && w.heightEnd === 2500));
  }
});

test('external opening has a unique parent and local coordinates after corner trimming', () => {
  const p = house();
  p.plan.openings = [{ id: 'w', type: 'window', outer: true, x: 6, y: 1.5, orientation: 'v', width: 1, height: 1.2 }];
  const opening = adapt(p).openings[0];
  assert.equal(opening.wallId, 'Э1-С2');
  assert.equal(opening.x, 826);
  assert.equal(opening.sill, 850);
  assert.equal(opening.topClearance, 450);
  assert.equal(opening.status, 'assigned');
  assert.equal(run(p).geometryDiagnostics.comparison.status, 'matched');
  p.settings.productionCutting.openingSills['1:w'] = 900;
  p.settings.productionCutting.wallAdditions['Э1-С2@6000,0:6000,3000'] = 100;
  assert.equal(adapt(p).openings[0].topClearance, 500);
  assert.equal(run(p).geometryDiagnostics.comparison.status, 'matched');
});

test('ambiguous, distant and corner-crossing openings are diagnosed rather than silently relocated', () => {
  const p = house();
  p.plan.openings = [{ id: 'corner', type: 'window', outer: true, x: 0, y: 0, width: .8, height: 1 }];
  let model = adapt(p);
  assert.equal(model.openings[0].wallId, null);
  assert.equal(model.openings[0].status, 'unresolved');
  assert.ok(model.issues.some(i => i.code === 'OPENING_WALL'));
  p.plan.openings[0].x = 20;
  assert.equal(adapt(p).openings[0].status, 'unresolved');
  Object.assign(p.plan.openings[0], { x: 6, y: .2, orientation: 'v' });
  model = adapt(p);
  assert.equal(model.openings[0].status, 'invalid');
  assert.ok(model.issues.some(i => i.code === 'OPENING_SIZE'));
});

test('legacy interior opening without outer flag is not assigned to a nearby exterior wall', () => {
  const p = house(); p.services.partitions = true;
  p.plan.walls = [{ id: 'inner', x1: 1, y1: 1, x2: 5, y2: 1 }];
  p.plan.openings = [{ id: 'door', type: 'door', x: 3, y: 1, orientation: 'h', width: .8, height: 2 }];
  assert.equal(adapt(p).openings.length, 0);
});

test('gaps, excluded openings and overlapping openings preserve input and production bindings', () => {
  const p = house();
  p.plan.wallGaps = [{ id: 'gap', outer: true, x: 2, y: 0, orientation: 'h', width: .5 }];
  p.plan.openings = [{ id: 'excluded', type: 'window', include: false }];
  assert.equal(adapt(p).openings.length, 1);
  assert.equal(run(p).geometryDiagnostics.comparison.status, 'matched');
  p.plan.wallGaps = [];
  p.plan.openings = ['a', 'b'].map(id => ({ id, type: 'window', outer: true, x: 2, y: 0, orientation: 'h', width: 1, height: 1 }));
  const before = structuredClone(p), model = adapt(p);
  assert.ok(model.issues.some(i => i.code === 'OPENING_OVERLAP'));
  assert.ok(model.openings.every(o => o.status === 'invalid'));
  assert.deepEqual(p, before);
});

test('cold slope infill is reported as a distinction, not silently used to change SIP surfaces', () => {
  const p = house(); p.services.roof = true;
  Object.assign(p.settings.roof, { shape: 'flat', flatSlopeMode: 'structural', flatSlopePercent: 5,
    flatSlopeDirection: 'back', gableType: 'cold', type: 'cold' });
  const report = run(p), comparison = report.geometryDiagnostics.comparison;
  assert.equal(comparison.status, 'differences');
  assert.ok(comparison.differences.length > 0);
  assert.ok(comparison.differences.every(d => d.reason && d.field.startsWith('height')));
  assert.ok(report.surfaces.filter(s => /^Э1-С/.test(s.id)).every(s => s.heightStart === 2500 && s.heightEnd === 2500));
});

test('disabled wall production and zero wall height do not create false missing-surface diagnostics', () => {
  const p = house(); p.services.sipWalls = false;
  assert.equal(run(p).geometryDiagnostics.comparison.status, 'matched');
  p.services.sipWalls = true; p.plan.wallHeight = 0;
  assert.equal(run(p).geometryDiagnostics.comparison.status, 'matched');
  p.plan.wallHeight = 2.5; p.plan.house.h = .2;
  assert.ok(adapt(p).issues.some(i => i.code === 'WALL_SIZE'));
});

test('nonrectangular and degenerate contours explicitly stay outside stage 1', () => {
  const p = house();
  for (const points of [
    [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 5, y: 3 }, { x: 0, y: 3 }],
    [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 3 }],
  ]) {
    p.plan.house.points = points;
    const model = adapt(p);
    assert.equal(model.supported, false);
    assert.deepEqual(model.walls, []);
    assert.equal(compareWallGeometry(model, []).status, 'outside-scope');
  }
  delete p.plan.house.points; p.plan.house.contourDefined = false;
  assert.equal(adapt(p).supported, false);
});

test('comparison detects drift without modifying production output or the estimate', () => {
  const p = house(), calculation = calculateProject(p), before = structuredClone(calculation), report = calculateProductionCutting(p, calculation);
  assert.deepEqual(calculation, before);
  const surfaces = structuredClone(report.surfaces);
  surfaces.find(s => s.id === 'Э1-С2').width += 10;
  const snapshot = structuredClone(surfaces), comparison = compareWallGeometry(adapt(p), surfaces);
  assert.equal(comparison.status, 'differences');
  assert.equal(comparison.differences[0].field, 'length');
  assert.deepEqual(surfaces, snapshot);
});

test('derived geometry is price-independent and survives legacy JSON round trips without new saved fields', () => {
  const p = house(), model = adapt(p), serialized = JSON.stringify(p);
  const restored = migrateProject(JSON.parse(serialized));
  assert.deepEqual(adapt(restored), model);
  p.priceMat.forEach(row => { row.price *= 2; });
  assert.deepEqual(adapt(p), model);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model);
  assert.equal('geometryDiagnostics' in p, false);
});
