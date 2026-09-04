import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';

function engineeringProject() {
  const project = createDefaultProject();
  project.services.engineeringElectric = true;
  project.services.engineeringPlumbing = true;
  project.services.engineeringSewerage = true;
  project.services.engineeringVentilation = true;
  project.settings.engineering.electricAuto = false;
  project.settings.engineering.waterAuto = false;
  project.settings.engineering.sewerAuto = false;
  project.settings.engineering.ventilationAuto = false;
  return project;
}

test('prefinish electrical work prepares socket points without supplying mechanisms', () => {
  const project = engineeringProject();
  project.settings.engineering.electricStage = 'prefinish';
  const result = calculateProject(project);
  const lines = result.sections.find(section => section.key === 'engineering').lines;
  assert.ok(lines.some(line => line.catalogId === 'MAT-135'));
  assert.ok(lines.some(line => line.catalogId === 'ENG-LAB-ELEC-PANEL'));
  assert.ok(!lines.some(line => line.catalogId === 'MAT-138'));
  assert.ok(!lines.some(line => line.catalogId === 'MAT-129'));
  assert.ok(!lines.some(line => line.catalogId === 'MAT-140'));
  assert.match(result.engineering.mode, /detailed/);
});

test('complete electrical work adds sockets switches lights and installation', () => {
  const project = engineeringProject();
  project.settings.engineering.electricStage = 'complete';
  const lines = calculateProject(project).sections.find(section => section.key === 'engineering').lines;
  for (const id of ['MAT-138', 'MAT-129', 'MAT-140', 'LAB-079', 'ENG-LAB-ELEC-LIGHT']) {
    assert.ok(lines.some(line => line.catalogId === id), id);
  }
});

test('each well or septic ring is split into material and labor totaling exactly 10500 rubles', () => {
  const project = engineeringProject();
  project.settings.engineering.waterStage = 'prefinish';
  project.settings.engineering.wellRings = 7;
  project.settings.engineering.sewerStage = 'prefinish';
  project.settings.engineering.sewerSystem = 'rings';
  project.settings.engineering.septicRings = 4;
  const lines = calculateProject(project).sections.find(section => section.key === 'engineering').lines;
  const materials = lines.filter(line => line.catalogId === 'ENG-MAT-WELL-RING');
  const labors = lines.filter(line => line.catalogId === 'ENG-LAB-WELL-RING');
  assert.deepEqual(materials.map(line => line.price), [5000, 5000]);
  assert.deepEqual(labors.map(line => line.price), [5500, 5500]);
  assert.equal(materials.reduce((sum, line) => sum + line.qty * line.price, 0) + labors.reduce((sum, line) => sum + line.qty * line.price, 0), (7 + 4) * 10500);
});

test('well water supply includes pump automation winter inlet and filtration', () => {
  const project = engineeringProject();
  project.settings.engineering.waterStage = 'prefinish';
  const lines = calculateProject(project).sections.find(section => section.key === 'engineering').lines;
  for (const id of ['ENG-MAT-WELL-PUMP', 'ENG-MAT-WELL-AUTOMATION', 'ENG-MAT-PND32', 'ENG-MAT-WATER-INSULATION', 'ENG-MAT-WATER-HEAT-CABLE', 'ENG-MAT-WATER-FILTER']) {
    assert.ok(lines.some(line => line.catalogId === id), id);
  }
  assert.ok(!lines.some(line => line.catalogId === 'ENG-MAT-WATER-TERMINAL'));
});

test('ventilation offers budget valves, room recuperators and a compact supply unit', () => {
  const expected = {
    natural: 'ENG-MAT-VENT-KIV',
    decentralized: 'ENG-MAT-VENT-RECUP',
    supply: 'ENG-MAT-VENT-SUPPLY-UNIT',
  };
  for (const [solution, catalogId] of Object.entries(expected)) {
    const project = engineeringProject();
    project.settings.engineering.ventilationStage = 'complete';
    project.settings.engineering.ventilationSolution = solution;
    const lines = calculateProject(project).sections.find(section => section.key === 'engineering').lines;
    assert.ok(lines.some(line => line.catalogId === catalogId), `${solution}: ${catalogId}`);
  }
});

test('rough ventilation keeps routes and SIP sleeves but omits terminal devices', () => {
  const project = engineeringProject();
  project.settings.engineering.ventilationStage = 'rough';
  const lines = calculateProject(project).sections.find(section => section.key === 'engineering').lines;
  assert.ok(lines.some(line => line.catalogId === 'ENG-MAT-VENT-SLEEVE'));
  assert.ok(lines.some(line => line.catalogId === 'MAT-166'));
  assert.ok(!lines.some(line => ['ENG-MAT-VENT-KIV', 'ENG-MAT-VENT-RECUP', 'ENG-MAT-VENT-SUPPLY-UNIT', 'MAT-168'].includes(line.catalogId)));
});

test('manual subsystem quantities override plan links without disconnecting other systems', () => {
  const project = engineeringProject();
  project.settings.engineering.cableRoute = 42;
  project.settings.engineering.waterPipe = 31;
  project.settings.engineering.ventDuct = 18;
  const result = calculateProject(project);
  assert.equal(result.engineering.settings.cableRoute, 42);
  assert.equal(result.engineering.settings.waterPipe, 31);
  assert.equal(result.engineering.settings.ventDuct, 18);
  assert.equal(project.settings.links.engineeringFromPlan, true);
});

test('active legacy engineering projects keep the old formula until explicitly upgraded', () => {
  const old = createDefaultProject();
  delete old.settings.engineering.assemblyVersion;
  old.appVersion = 116;
  old.services.engineeringElectric = true;
  old.services.engineeringPlumbing = false;
  old.services.engineeringSewerage = false;
  old.services.engineeringVentilation = false;
  const migrated = migrateProject(old);
  assert.equal(migrated.settings.engineering.assemblyVersion, 0);
  const lines = calculateProject(migrated).sections.find(section => section.key === 'engineering').lines;
  assert.equal(lines.length, 3);
  assert.ok(lines.every(line => !String(line.catalogId).startsWith('ENG-')));
});

test('new engineering catalog rows are priced and survive project migration', () => {
  const project = migrateProject(createDefaultProject());
  const engineeringRows = [...project.priceMat, ...project.priceLab].filter(item => item.id.startsWith('ENG-'));
  assert.ok(engineeringRows.length >= 40);
  assert.ok(engineeringRows.every(item => item.price > 0));
  project.settings.engineering.ventilationSolution = 'decentralized';
  const reopened = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(reopened.settings.engineering.ventilationSolution, 'decentralized');
  assert.equal(reopened.settings.engineering.waterPoints, project.settings.engineering.waterPoints);
  assert.equal(reopened.settings.engineering.supplyDevices, project.settings.engineering.supplyDevices);
});

test('the full engineering assembly contains no zero-price rows that can block printing', () => {
  const project = engineeringProject();
  const lines = calculateProject(project).sections.find(section => section.key === 'engineering').lines;
  assert.ok(lines.length > 50);
  assert.deepEqual(lines.filter(line => !(line.price > 0)).map(line => line.name), []);
});
