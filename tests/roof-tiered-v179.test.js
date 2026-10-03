import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateTieredRoofGeometry } from '../src/react/calculations/tiered-roof.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { printRoofBounds } from '../src/react/planner/print-diagram-layers.js';

const roofLines = project => calculateProject(project).sections.find(section => section.key === 'roof').lines;

test('two single-slope levels have separate geometry and preserve old gable defaults', () => {
  const project = createDefaultProject();
  const before = calculateProject(project).roof;
  assert.equal(before.mainRoofShape, 'gable');
  assert.equal(roofLines(project).some(line => line.catalogId === 'MAT-247'), false);
  project.settings.roof.shape = 'tiered';
  const after = calculateProject(project).roof;
  assert.equal(after.geometry.shape, 'tiered');
  assert.equal(after.geometry.totalSlopeArea, after.geometry.upperArea + after.geometry.lowerArea);
  assert.equal(after.ridgeBeamLength, 0);
  assert.equal(after.tieredJoinPieces, Math.ceil(after.geometry.junctionLength * 1.1 / 1.25));
  assert.equal(after.tieredGables.zones.length, 5);
  assert.equal(after.tieredGables.zones.find(zone => zone.key === 'inner').internal, true);
  assert.equal(after.mainRoofShape !== before.mainRoofShape, true);
});

test('combined roof splits warm/cold slopes and each gable can be SIP, frame or omitted', () => {
  const project = createDefaultProject();
  project.settings.roof.shape = 'tiered';
  project.settings.roof.type = 'combo';
  project.settings.roof.tiered = {
    ...project.settings.roof.tiered,
    upperShare: 40, warmLevel: 'lower',
    gableTypes: { upperFirst: 'sip', upperSecond: 'frame', lowerFirst: 'none', lowerSecond: 'sip', inner: 'sip' },
    gableAreas: { inner: 9.5 },
  };
  const result = calculateProject(project).roof;
  assert.equal(result.warmSlopeArea, result.geometry.lowerArea);
  assert.equal(result.coldSlopeArea, result.geometry.upperArea);
  assert.equal(result.tieredGables.zones.find(zone => zone.key === 'inner').area, 9.5);
  assert.equal(result.tieredGables.zones.find(zone => zone.key === 'lowerFirst').area, 0);
  assert.ok(result.tieredGables.warmArea > 9.5);
  assert.ok(result.tieredGables.coldArea > 0);
  const joined = roofLines(project).filter(line => ['MAT-247','LAB-131'].includes(line.catalogId));
  assert.deepEqual(joined.map(line => line.price), [708,900]);
  assert.equal(joined[1].qty, result.geometry.junctionLength);
  const osb = roofLines(project).find(line => line.name.includes('ОСБ') && line.kind === 'material');
  assert.ok(osb);
});

test('SIP tiered roof produces separate cutting surfaces; manual gable area requires a drawing', () => {
  const project = createDefaultProject();
  project.settings.roof.shape = 'tiered';
  project.settings.roof.type = 'sip';
  const calculation = calculateProject(project);
  const cutting = calculateProductionCutting(project, calculation);
  assert.ok(cutting.surfaces.some(surface => surface.id === 'КР-В'));
  assert.ok(cutting.surfaces.some(surface => surface.id === 'КР-Н'));
  assert.ok(cutting.surfaces.some(surface => surface.id === 'ФР-inner'));
  project.settings.roof.tiered.gableAreas.inner = 12;
  const overridden = calculateProductionCutting(project, calculateProject(project));
  assert.ok(overridden.issues.some(issue => issue.code === 'GABLE'));
  assert.equal(overridden.surfaces.some(surface => surface.id === 'ФР-inner'), false);
});

test('tiered choices survive migration, snow guards remain selectable and print roof has the right shape', () => {
  const project = createDefaultProject();
  project.settings.roof.shape = 'tiered';
  project.settings.roof.tiered.gableTypes.lowerSecond = 'frame';
  project.settings.roof.snowGuards = { mode: 'both', firstLength: 4, secondLength: 2 };
  const migrated = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(migrated.settings.roof.tiered.gableTypes.lowerSecond, 'frame');
  assert.equal(printRoofBounds(migrated.plan, migrated.settings.roof).shape, 'tiered');
  assert.equal(calculateProject(migrated).roof.snowGuards.kits, 3);
  const legacy = createDefaultProject();
  delete legacy.settings.roof.tiered;
  assert.equal(migrateProject(legacy).settings.roof.tiered.upperShare, 50);
  assert.ok(calculateTieredRoofGeometry({span:10,ridgeLength:8,tiered:{upperShare:40}}).upperSpan < 5);
});

test('combined ordinary gables respect global exclusion and separate side choices', () => {
  const project = createDefaultProject();
  project.settings.roof.type = 'combo';
  project.settings.roof.gableSideTypes = { first: 'sip', second: 'frame' };
  let roof = calculateProject(project).roof;
  assert.ok(roof.warmGableArea > 0 && roof.coldGableArea > 0);
  assert.equal(roof.gableArea, roof.warmGableArea + roof.coldGableArea);
  project.settings.roof.gableType = 'none';
  roof = calculateProject(project).roof;
  assert.equal(roof.gableArea, 0);
});
