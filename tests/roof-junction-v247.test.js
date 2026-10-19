import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { partitionRuns } from '../src/react/planner/geometry.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';

const report = project => calculateProductionCutting(project, calculateProject(project));

test('face junctions start enabled, preserve an explicit off choice, and meet exterior SIP at the inner face', () => {
  const project = createDefaultProject();
  assert.equal(project.plan.partitionJunctions, 'butt');
  const old = structuredClone(project); delete old.plan.partitionJunctions;
  assert.equal(migrateProject(old).plan.partitionJunctions, 'butt');
  project.plan.partitionJunctions = 'axes';
  assert.equal(migrateProject(structuredClone(project)).plan.partitionJunctions, 'axes');
  Object.assign(project.plan, { house: { w: 6, h: 4, contourDefined: true }, rooms: [],
    walls: [{ id: 'p', x1: 3, y1: 0, x2: 3, y2: 2 }], openings: [], wallGaps: [], platforms: [] });
  const saved = structuredClone(project.plan.walls);
  project.plan.partitionJunctions = 'butt';
  assert.equal(partitionRuns(project.plan)[0][0].y, .174);
  const cutting = report(project);
  const exterior = cutting.surfaces.find(surface => surface.exterior && surface.partitionSeams?.includes(3000));
  assert.ok(exterior);
  assert.ok(cutting.parts.filter(part => part.surfaceId === exterior.id)
    .every(part => !(part.x < 3000 && part.x + part.width > 3000)));
  assert.ok(productionScene(cutting, project).panels.some(panel => panel.layer === 'partitions'));
  assert.deepEqual(project.plan.walls, saved);
});

test('main and detailed laths end at the last rafter, and the takeoff uses that length', () => {
  const project = createDefaultProject();
  for (const detailed of [false, true]) {
    project.settings.productionCutting.roofDesign.enabled = detailed;
    const calculation = calculateProject(project), assembly = report(project).assembly;
    const mainRafters = assembly.rafters.filter(rafter => rafter.id.startsWith('КР-СТ') || rafter.faceId?.startsWith('КР-С'));
    const mainLaths = assembly.laths.filter(lath => lath.id.startsWith('КР-ОБ') || lath.faceId?.startsWith('КР-С'));
    const ends = mainRafters.map(rafter => rafter.a[0]);
    assert.ok(mainLaths.length > 0);
    assert.ok(mainLaths.every(lath => [lath.a[0], lath.b[0]].every(x =>
      x >= Math.min(...ends) - .01 && x <= Math.max(...ends) + .01)));
    if (!detailed) {
      assert.equal(calculation.roof.mainLathRequiredLength, 463);
      assert.equal(mainLaths.reduce((sum, lath) => sum + lath.length, 0), 463000);
    }
  }
});

test('cold roof places a rafter on each side of both SIP gables in simple and detailed views', () => {
  const project = createDefaultProject();
  Object.assign(project.plan, { house: { w: 10, h: 8 }, rooms: [], walls: [], openings: [], wallGaps: [], platforms: [] });
  project.settings.roof.gableType = 'sip';
  for (const detailed of [false, true]) {
    project.settings.productionCutting.roofDesign.enabled = detailed;
    const calculation = calculateProject(project), assembly = report(project).assembly;
    const stations = assembly.rafters.filter(rafter => rafter.name === 'Первый скат').map(rafter => rafter.a[0]);
    assert.equal(assembly.rafters.length, calculation.roof.rafterStructure.legCount);
    for (const station of [-25, 199, 9801, 10025]) assert.ok(stations.some(x => Math.abs(x - station) < .01), `${station} mm`);
    const visibleRafters = productionScene(report(project), project).beams.filter(beam => beam.layer === 'rafters');
    assert.ok(visibleRafters.length >= assembly.rafters.length);
    assert.ok(assembly.laths.every(lath => [lath.a[0], lath.b[0]].every(x =>
      x >= Math.min(...stations) - .01 && x <= Math.max(...stations) + .01)));
  }
});
