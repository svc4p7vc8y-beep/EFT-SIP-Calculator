import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { generateRoofSupportLayout } from '../src/react/calculations/auto-roof-supports.js';
import { productionEstimateLines } from '../src/react/calculations/production-estimate.js';

const report = project => calculateProductionCutting(project, calculateProject(project));

test('terrace tie stays horizontal at the terrace eave bearing, including a taller ridge post', () => {
  const project = createDefaultProject();
  project.plan.platforms = [{ id: 'terrace', x: 1, y: project.plan.house.h, w: 4, h: 2, kind: 'terrace', roof: { mode: 'cold', shape: 'gable', postSection: '100x100' } }];
  const platform = report(project).assembly.platforms[0];
  const eaveZ = Math.min(...platform.posts.map(post => post.b[2]));
  const tieCenterZ = eaveZ - 50;
  assert.ok(platform.posts.some(post => post.b[2] > eaveZ + 100));
  assert.ok(platform.ties.length > 0);
  assert.ok(platform.ties.every(tie => tie.a[2] === tieCenterZ && tie.b[2] === tieCenterZ && tie.plateTopZ === eaveZ));
  assert.ok(platform.ties.every(tie => platform.posts.some(post => post.b[0] === tie.a[0] && post.b[1] === tie.a[1] && post.b[2] >= tie.a[2])));
});

test('terrace purlins run across the roof fall and do not occupy rafter lines', () => {
  const project = createDefaultProject();
  project.plan.openings = [];
  project.settings.roof.structureMode = 'manual';
  project.settings.roof.rafterSystem = 'layered';
  project.plan.platforms = [{ id: 'terrace', x: 1, y: project.plan.house.h, w: 4, h: 2, kind: 'terrace', roof: { mode: 'cold', shape: 'gable' } }];
  const proposal = generateRoofSupportLayout(project, report(project), { variant: 'double', includePlatforms: true, purlinProfile: '100×150', postProfile: '100×150', postCount: 3 });
  assert.deepEqual(proposal.errors, []);
  const terrace = proposal.items.filter(item => item.type === 'purlin' && item.faceId?.startsWith('КП-terrace-'));
  assert.equal(terrace.length, 4);
  assert.ok(terrace.every(item => item.x1 === item.x2 && Math.abs(item.y2 - item.y1) > 1000));
  assert.equal(new Set(terrace.map(item => item.x1)).size, 4);
});

test('switching from saved truss sketch to layered roof hides obsolete trusses and builds purlins', () => {
  const project = createDefaultProject();
  project.plan = { ...project.plan, house: { w: 5, h: 4 }, rooms: [], walls: [], openings: [], platforms: [] };
  project.settings.roof.structureMode = 'manual';
  project.settings.roof.rafterSystem = 'truss';
  const trusses = generateRoofSupportLayout(project, report(project), {});
  assert.ok(trusses.items.length > 0);
  project.settings.productionCutting.roofSupports = trusses.items;
  project.settings.roof.rafterSystem = 'layered';
  const layered = report(project);
  assert.equal(layered.assembly.supports.filter(item => item.trussTemplate).length, 0);
  assert.ok(layered.assembly.supports.some(item => item.autoLayout === 'layered-frame' && item.role === 'purlin'));
  assert.equal(project.settings.productionCutting.roofSupports.length, trusses.items.length);
  project.settings.productionCutting.roofSupports[0].autoLocked = true;
  assert.ok(report(project).assembly.supports.some(item => item.trussTemplate && item.autoLocked));
});

test('saved automatic purlin purchases do not remain in a truss estimate', () => {
  const project = createDefaultProject();
  project.plan = { ...project.plan, house: { w: 5, h: 4 }, rooms: [], walls: [], openings: [], platforms: [] };
  project.settings.roof.structureMode = 'manual';
  project.settings.roof.rafterSystem = 'layered';
  const proposal = generateRoofSupportLayout(project, report(project), { purlinProfile: '100×150', postProfile: '100×150', purlinCatalogId: 'MAT-022', postCatalogId: 'MAT-022', estimateEnabled: true });
  assert.deepEqual(proposal.errors, []);
  project.settings.productionCutting.roofSupports = proposal.items;
  assert.ok(productionEstimateLines(project).length > 0);
  project.settings.roof.rafterSystem = 'truss';
  assert.equal(productionEstimateLines(project).length, 0);
  assert.equal(report(project).assembly.supports.filter(item => item.autoLayout === 'roof-purlins').length, 0);
  assert.ok(!calculateProject(project).lines.some(line => line.id.startsWith('production-support-auto-roof-')));
});
