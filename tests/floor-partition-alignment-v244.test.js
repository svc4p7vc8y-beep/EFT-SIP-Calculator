import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';

const fixture = () => {
  const project = createDefaultProject();
  project.plan = { ...project.plan, house: { w: 6, h: 4 }, rooms: [],
    walls: [{ id: 'p', x1: 2.2, y1: .174, x2: 2.2, y2: 3.826 }],
    openings: [], wallGaps: [], platforms: [], partitionJunctions: 'butt' };
  return project;
};
const run = project => calculateProductionCutting(project, calculateProject(project));

test('optional floor alignment places long SIP joints under a full-span partition and reaches 3D', () => {
  const project = fixture(), savedPlan = JSON.stringify(project.plan);
  const before = run(project);
  assert.ok(before.parts.some(part => part.surfaceId === 'Э1-ПОЛ' && part.x < 2200 && part.x + part.width > 2200));
  project.settings.productionCutting.floorPartitionAlignment = true;
  const report = run(project), floor = report.surfaces.find(surface => surface.id === 'Э1-ПОЛ');
  assert.equal(floor.floorPartitionCuts.length, 1);
  assert.ok(report.parts.filter(part => part.surfaceId === floor.id).every(part => !(part.x < 2200 && part.x + part.width > 2200)));
  assert.ok(report.members.some(member => member.surfaceId === floor.id && member.floorPartitionSeam && member.source.includes('соединительная лага')));
  assert.equal(productionScene(report, project).panels.filter(panel => panel.surfaceId === floor.id).length,
    report.parts.filter(part => part.surfaceId === floor.id).length);
  assert.equal(JSON.stringify(project.plan), savedPlan);
  assert.equal(migrateProject(JSON.parse(JSON.stringify(project))).settings.productionCutting.floorPartitionAlignment, true);
});

test('short partitions and manual floor grids keep their geometry and request a joint review', () => {
  const project = fixture();
  project.plan.walls[0].y2 = 2;
  project.settings.productionCutting.floorPartitionAlignment = true;
  let report = run(project);
  assert.equal(report.surfaces.find(surface => surface.id === 'Э1-ПОЛ').floorPartitionCuts.length, 0);
  assert.ok(report.issues.some(issue => issue.code === 'FLOOR_PARTITION_ALIGNMENT'));
  project.plan.walls[0].y2 = 3.826;
  const key = report.surfaces.find(surface => surface.id === 'Э1-ПОЛ').layoutKey;
  project.settings.productionCutting.layouts[key] = { originX: 0 };
  report = run(project);
  assert.equal(report.surfaces.find(surface => surface.id === 'Э1-ПОЛ').floorPartitionCuts, undefined);
  assert.ok(report.issues.some(issue => issue.code === 'FLOOR_PARTITION_ALIGNMENT'));
});

test('butt joint retiles exterior SIP panels at the partition contact on plan and in 3D', () => {
  const project = fixture();
  const report = run(project), wall = report.surfaces.find(surface => surface.id === 'Э1-С1');
  assert.ok(wall.partitionSeams.includes(2200));
  const parts = report.parts.filter(part => part.surfaceId === wall.id);
  assert.ok(parts.length > 0);
  assert.ok(parts.every(part => !(part.x < 2200 && part.x + part.width > 2200)));
  assert.equal(productionScene(report, project).panels.filter(panel => panel.surfaceId === wall.id).length, parts.length);
});
