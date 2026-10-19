import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createProjectWithCurrentPrices, migrateProject } from '../src/react/state/project-model.js';
import { applyResidentialStandard } from '../src/react/state/residential-preset.js';
import { captureResidentialStandard, normalizeResidentialStandards } from '../src/react/state/residential-standards.js';

test('named residential standards survive project export, import and new project creation', () => {
  const project = createDefaultProject();
  const another = captureResidentialStandard(project, 'Компактный двухэтажный');
  another.dimensions = { length: 9, width: 7, wallHeight: 2.7, floors: 2 };
  another.services.terrace = false;
  project.settings.residentialStandards.profiles.push(another);
  project.settings.residentialStandards.activeId = another.id;
  const restored = migrateProject(JSON.parse(JSON.stringify(project)));
  const next = createProjectWithCurrentPrices(restored);
  assert.equal(restored.settings.residentialStandards.profiles[1].name, 'Компактный двухэтажный');
  assert.equal(next.settings.residentialStandards.profiles.length, 2);
  assert.equal(next.settings.residentialStandards.activeId, another.id);
});

test('applying a selected residential standard preserves plan geometry unless explicitly requested', () => {
  const project = createDefaultProject();
  const profile = captureResidentialStandard(project, 'Дом 9 × 7');
  profile.dimensions = { length: 9, width: 7, wallHeight: 2.7, floors: 2 };
  profile.openings = { windows: 12, doors: 3 };
  profile.services.roof = false;
  const originalOpenings = structuredClone(project.plan.openings);
  const originalPrices = structuredClone(project.priceMat);
  const originalHouse = structuredClone(project.plan.house);
  const standards = normalizeResidentialStandards({ profiles: [profile], activeId: profile.id }, project);
  applyResidentialStandard(project, profile, standards);
  assert.deepEqual(project.plan.house, originalHouse);
  assert.equal(project.meta.floors, 1);
  assert.equal(project.services.roof, false);
  assert.deepEqual(project.plan.openings, originalOpenings);
  assert.deepEqual(project.priceMat, originalPrices);
  assert.equal(project.settings.residentialStandards.activeId, profile.id);
  applyResidentialStandard(project, profile, standards, { applyGeometry: true });
  assert.equal(project.plan.house.w, 9);
  assert.equal(project.plan.house.h, 7);
  assert.equal(project.plan.wallHeight, 2.7);
  assert.equal(project.meta.floors, 2);
  assert.equal(project.plan.openings.length, originalOpenings.length);
});

test('migration creates a named standard from an older project without changing its geometry', () => {
  const project = createDefaultProject();
  delete project.settings.residentialStandards;
  project.plan.house.w = 11;
  const restored = migrateProject(project);
  assert.equal(restored.plan.house.w, 11);
  assert.equal(restored.settings.residentialStandards.profiles[0].dimensions.length, 11);
});

test('residential standard restores saved house settings without prices or project-specific cutting', () => {
  const project = createDefaultProject();
  project.settings.engineering.electric = { custom: 14 };
  project.settings.delivery.distance = 73;
  project.settings.external.facadeArea = 180;
  const profile = captureResidentialStandard(project, 'Дом с отделкой');
  const standards = normalizeResidentialStandards({ profiles: [profile], activeId: profile.id }, project);
  const print = structuredClone(project.settings.print);
  const priceMat = structuredClone(project.priceMat);
  const cutting = structuredClone(project.settings.productionCutting);
  project.settings.engineering.electric = { custom: 2 };
  project.settings.delivery.distance = 10;
  project.settings.delivery.perKm = 91;
  project.settings.roof.snowGuards.materialPrice = 543;
  project.settings.external.facadeArea = 90;
  applyResidentialStandard(project, profile, standards);
  assert.deepEqual(project.settings.engineering.electric, { custom: 14 });
  assert.equal(project.settings.delivery.distance, 73);
  assert.equal(project.settings.delivery.perKm, 91);
  assert.equal(project.settings.roof.snowGuards.materialPrice, 543);
  assert.equal(project.settings.external.facadeArea, 180);
  assert.deepEqual(project.settings.print, print);
  assert.deepEqual(project.settings.productionCutting, cutting);
  assert.deepEqual(project.priceMat, priceMat);
});
