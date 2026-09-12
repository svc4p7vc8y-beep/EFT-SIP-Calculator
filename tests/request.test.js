import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject, REACT_PROJECT_VERSION } from '../src/react/state/project-model.js';
import { addCatalogItem, addCustomRequestItem, normalizeRequest, requestFileName, requestTotals } from '../src/react/state/request-model.js';
import { createRequestWorkbook } from '../src/react/export/xlsx.js';

test('old projects receive an empty manual request without changing their price lists', () => {
  const project = createDefaultProject();
  const old = structuredClone(project);
  delete old.request;
  old.appVersion = 126;
  const restored = migrateProject(old);
  assert.equal(restored.appVersion, REACT_PROJECT_VERSION);
  assert.equal(restored.request.documentType, 'commercial');
  assert.deepEqual(restored.request.items, []);
  assert.deepEqual(restored.priceMat, project.priceMat);
  assert.deepEqual(restored.priceLab, project.priceLab);
});

test('catalog positions are copied into a request and remain independent from the shared price', () => {
  const project = createDefaultProject();
  const request = normalizeRequest(project.request, project.meta);
  const material = project.priceMat.find((item) => item.price > 0);
  const labor = project.priceLab.find((item) => item.price > 0);
  addCatalogItem(request, material);
  addCatalogItem(request, material);
  addCatalogItem(request, labor);
  assert.equal(request.items[0].qty, 2);
  request.items[0].price += 500;
  assert.equal(project.priceMat.find((item) => item.id === material.id).price, material.price);
  const totals = requestTotals(request);
  assert.equal(totals.materials, request.items[0].qty * request.items[0].price);
  assert.equal(totals.labor, request.items[1].qty * request.items[1].price);
  assert.equal(totals.total, totals.materials + totals.labor);
});

test('custom rows, document mode and workbook export survive normalization', async () => {
  const project = createDefaultProject();
  const request = normalizeRequest({ ...project.request, documentType: 'internal', number: 'З-12/7' }, project.meta);
  const custom = addCustomRequestItem(request);
  Object.assign(custom, { name: 'Доставка на объект', qty: 2, price: 3500 });
  const restored = normalizeRequest(JSON.parse(JSON.stringify(request)), project.meta);
  assert.equal(restored.documentType, 'internal');
  assert.equal(requestFileName(restored), 'Внутренняя_заявка_ЭФТ_З-12_7');
  assert.equal(requestTotals(restored).total, 7000);
  const workbook = createRequestWorkbook(project, restored);
  assert.equal(workbook.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.ok((await workbook.arrayBuffer()).byteLength > 500);
});
