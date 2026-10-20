import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createNewBlankProject, migrateProject } from '../src/react/state/project-model.js';

test('new project keeps the current price lists but starts with an empty drawing', () => {
  const current = createDefaultProject();
  current.priceMat[0].price = 12345;
  const originalRooms = current.plan.rooms.length;
  const created = createNewBlankProject(current, {
    projectName: '  Дом в Сосновке  ', customer: '  Иванов  ', address: '  Лесная улица  ',
    buildingType: 'Жилой дом', length: 12, width: 9,
  });
  assert.equal(created.meta.projectName, 'Дом в Сосновке');
  assert.equal(created.meta.customer, 'Иванов');
  assert.equal(created.meta.address, 'Лесная улица');
  assert.deepEqual([created.plan.house.w, created.plan.house.h], [12, 9]);
  assert.equal(created.plan.house.contourDefined, false);
  assert.deepEqual(created.plan.rooms, []);
  assert.deepEqual(created.plan.openings, []);
  assert.equal(created.priceMat[0].price, 12345);
  assert.equal(current.plan.rooms.length, originalRooms);
  assert.equal(migrateProject(JSON.parse(JSON.stringify(created))).meta.projectName, 'Дом в Сосновке');
});

test('unknown dimensions leave a clean nominal drawing sheet', () => {
  const created = createNewBlankProject(createDefaultProject(), { projectName: 'Новый дом' });
  assert.equal(created.plan.house.contourDefined, false);
  assert.deepEqual([created.plan.house.w, created.plan.house.h], [10, 8]);
});
