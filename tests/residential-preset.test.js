import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultProject,
  createProjectWithCurrentPrices,
  summarizePriceCatalogChanges,
} from '../src/react/state/project-model.js';
import { applyResidentialPreset } from '../src/react/state/residential-preset.js';

test('residential preset applies the approved SIP and roof standard while preserving project data', () => {
  const project = createDefaultProject();
  project.meta.customer = 'Проверочный заказчик';
  project.settings.sip.ceilingThickness = '224';
  project.settings.sip.floorPanelWidth = '1.25';
  project.settings.roof.shape = 'flat';
  project.settings.roof.covering = 'soft';
  project.settings.roof.ridgeHeight = 2.35;
  project.settings.engineering.electricMode = 'complete';
  project.estimateOverrides.push({ lineId: 'test-line', price: 123 });
  project.request.items.push({ id: 'request-test', name: 'Позиция', qty: 1, price: 10, unit: 'шт', kind: 'material' });
  const rooms = structuredClone(project.plan.rooms);
  const openings = structuredClone(project.plan.openings);
  const prices = structuredClone(project.priceMat);

  applyResidentialPreset(project);

  assert.equal(project.meta.buildingType, 'Жилой дом');
  assert.equal(project.settings.sip.floorThickness, '224');
  assert.equal(project.settings.sip.floorPanelWidth, '0.625');
  assert.equal(project.settings.sip.secondFloorThickness, '224');
  assert.equal(project.settings.sip.secondFloorPanelWidth, '0.625');
  assert.equal(project.settings.sip.wallThickness, '174');
  assert.equal(project.settings.sip.ceilingThickness, '174');
  assert.equal(project.settings.roof.shape, 'gable');
  assert.equal(project.settings.roof.type, 'cold');
  assert.equal(project.settings.roof.covering, 'soft');
  assert.equal(project.settings.roof.ridgeHeight, 2.35);
  assert.equal(project.settings.engineering.electricMode, 'complete');
  assert.deepEqual(project.plan.rooms, rooms);
  assert.deepEqual(project.plan.openings, openings);
  assert.deepEqual(project.priceMat, prices);
  assert.equal(project.estimateOverrides[0].price, 123);
  assert.equal(project.request.items.length, 1);
});

test('price status counts changed, added and removed catalog rows', () => {
  const project = createDefaultProject();
  assert.deepEqual(summarizePriceCatalogChanges(project), { priceChanged: 0, added: 0, removed: 0, total: 0 });
  project.priceMat[0].price += 1;
  project.priceLab.push({ id: 'LAB-LOCAL', kind: 'labor', cat: 'Свои', name: 'Своя работа', unit: 'шт', price: 100 });
  project.priceMat.splice(1, 1);
  assert.deepEqual(summarizePriceCatalogChanges(project), { priceChanged: 1, added: 1, removed: 1, total: 3 });
});

test('new residential project inherits current manager prices', () => {
  const current = createDefaultProject();
  current.priceMat[0].price += 777;
  const next = applyResidentialPreset(createProjectWithCurrentPrices(current));
  assert.equal(next.priceMat[0].price, current.priceMat[0].price);
  assert.equal(summarizePriceCatalogChanges(next).priceChanged, 1);
  assert.equal(next.settings.sip.ceilingThickness, '174');
});
