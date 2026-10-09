import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createDefaultPriceLists, migrateProject } from '../src/react/state/project-model.js';
import { applySharedPriceCatalog, catalogChanges } from '../src/react/cloud/price-catalog.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { liningCatalogId, liningCatalogVariants } from '../src/react/data/shared-price-variants.js';
import { saunaLines } from '../src/react/calculations/sauna-model.js';
import { enableAutoSauna } from '../src/react/calculations/sauna-auto.js';

test('lining length and grade keep distinct shared prices and ignore old room quotations', () => {
  const catalog = createDefaultPriceLists(); catalog.priceMat.push(...liningCatalogVariants());
  const room = {id:'steam',floor:1,name:'Парная',area:9,wallArea:24,ceilingArea:9,saunaGeometry:{height:2.5},settings:{enabled:true,sauna:enableAutoSauna()}};
  const id = liningCatalogId(2.5, 'a');
  catalog.priceMat.find(row => row.id === id).price = 7654;
  room.settings.sauna.liningStock = {length:2.5,grade:'a',workingWidth:88};
  room.settings.sauna.prices = {liningPack:1};
  const line = saunaLines(room,1.1,[...catalog.priceMat,...catalog.priceLab],true).find(row => row.saunaItemKey === 'liningPack');
  assert.equal(line.catalogId,id);assert.equal(line.projectPrice,7654);assert.equal(line.priceMultiplier,1.25);
  room.settings.sauna.liningStock.grade='extra';
  const other = saunaLines(room,1.1,[...catalog.priceMat,...catalog.priceLab],true).find(row => row.saunaItemKey === 'liningPack');
  assert.notEqual(other.catalogId,line.catalogId);assert.equal(other.qty,line.qty);
});

test('all old projects get the current server prices without changing geometry or raw project data', () => {
  const raw = createDefaultProject(), other = structuredClone(raw), common = createDefaultPriceLists();
  other.priceMat.find(row => row.id === 'MAT-001').price = 17;
  raw.priceMat.find(row => row.id === 'MAT-001').price = 23;
  const snapshot = JSON.stringify(raw);
  common.priceMat.find(row => row.id === 'MAT-001').price = 5200;
  for (const source of [raw, other]) {
    const effective = applySharedPriceCatalog(source, common, 4), calc = calculateProject(effective);
    assert.ok(calc.lines.some(line => line.catalogId === 'MAT-001'));
    assert.ok(calc.lines.filter(line => line.catalogId === 'MAT-001').every(line => line.price === 5200));
    assert.deepEqual(effective.plan, source.plan);
  }
  assert.equal(JSON.stringify(raw), snapshot);
});

test('server catalog supersedes project price overrides while preserving quantity and price multipliers', () => {
  const raw = createDefaultProject(), common = createDefaultPriceLists();
  raw.settings.roof.shape = 'gable';
  raw.settings.roof.snowGuards = { mode: 'first', firstLength: 5, materialPrice: 1, laborPrice: 2 };
  const first = calculateProject(applySharedPriceCatalog(raw, common, 1));
  const snow = first.lines.find(line => line.catalogId === 'MAT-246');
  assert.ok(snow);
  raw.estimateOverrides = [{ lineId: snow.id, catalogId: snow.catalogId, section: snow.section, price: 99, qty: 7 }];
  const shared = applySharedPriceCatalog(raw, common, 2), changed = calculateProject(shared).lines.find(line => line.id === snow.id);
  assert.equal(changed.qty, 7);
  assert.equal(changed.price, common.priceMat.find(row => row.id === snow.catalogId).price);
  assert.equal(raw.estimateOverrides[0].price, 99);
  raw.plan.openings.push({ id: 'pano', type: 'window', windowType: 'panoramic', width: 2, height: 2, outer: true });
  const pano = calculateProject(applySharedPriceCatalog(raw, common, 2)).lines.find(line => line.id === 'openings:opening-1');
  assert.equal(pano.price, common.priceMat.find(row => row.id === pano.catalogId).price * 2);
});

test('zero shared price stays unpriced instead of falling back to a saved manual rate', () => {
  const raw = createDefaultProject(), common = createDefaultPriceLists();
  raw.settings.roof.shape = 'gable';
  raw.settings.roof.snowGuards = { mode: 'first', firstLength: 5, materialPrice: 99999 };
  const previous = calculateProject(applySharedPriceCatalog(raw, common, 1)).lines.find(line => line.catalogId === 'MAT-246');
  common.priceMat.find(row => row.id === previous.catalogId).price = 0;
  const line = calculateProject(applySharedPriceCatalog(raw, common, 2)).lines.find(line => line.id === previous.id);
  assert.equal(line.price, 0); assert.equal(line.pricePending, true);
});

test('JSON restoration and undo snapshots cannot bring back outdated prices; custom rows and requests use catalog IDs', () => {
  const raw = createDefaultProject(), common = createDefaultPriceLists();
  raw.customEstimateLines = [{ id: 'custom', section: 'sip', catalogId: 'MAT-001', name: 'Своя позиция', kind: 'material', qty: 2, unit: 'шт', price: 10 }];
  raw.request.items = [{ id: 'request', catalogId: 'MAT-001', name: 'Свая', kind: 'material', unit: 'шт', qty: 3, price: 9 }];
  common.priceMat.find(row => row.id === 'MAT-001').price = 5100;
  const saved = applySharedPriceCatalog(raw, common, 2);
  common.priceMat.find(row => row.id === 'MAT-001').price = 6200;
  for (const restored of [raw, migrateProject(JSON.parse(JSON.stringify(saved)))]) {
    const effective = applySharedPriceCatalog(restored, common, 3);
    assert.equal(effective.customEstimateLines[0].price, 6200);
    assert.equal(effective.request.items[0].price, 6200);
    assert.equal(effective.request.items[0].qty, 3);
  }
  raw.customEstimateLines[0].catalogId = 'missing';
  assert.equal(applySharedPriceCatalog(raw, common, 3).customEstimateLines[0].pricePending, true);
});

test('unchanged baseline catalog preserves totals and stock quantities, and catalog diff never deletes missing rows', () => {
  const raw = createDefaultProject(), catalog = createDefaultPriceLists();
  const a = calculateProject(raw), b = calculateProject(applySharedPriceCatalog(raw, catalog, 1));
  assert.deepEqual(b.totals, a.totals);
  assert.deepEqual(b.lines.map(row => row.qty), a.lines.map(row => row.qty));
  assert.deepEqual(catalogChanges(catalog, structuredClone(catalog)), []);
  const imported = structuredClone(catalog); imported.priceMat[0].price += 100; imported.priceLab = [];
  assert.equal(catalogChanges(catalog, imported).length, 1);
});
