import assert from 'node:assert/strict';
import test from 'node:test';
import source from '../src/react/data/default-catalog.json' with { type: 'json' };
import { productGroups, productsByGroup } from '../src/site/productCatalog.js';

test('public material showcase uses existing priced catalog rows and units', () => {
  const prices = new Map(source.priceMat.map((row) => [row.id, row]));
  for (const group of productGroups) {
    assert.ok(productsByGroup[group.id].length > 0);
    for (const item of productsByGroup[group.id]) {
      const catalogItem = prices.get(item.catalogId);
      assert.ok(catalogItem, item.catalogId);
      assert.equal(item.price, catalogItem.price, item.catalogId);
      assert.equal(item.unit, catalogItem.unit, item.catalogId);
      assert.equal(item.catalogName, catalogItem.name, item.catalogId);
      assert.ok(item.title, item.catalogId);
    }
  }
  assert.equal(productsByGroup.panels.length, 9);
  assert.equal(new Set(productsByGroup.panels.map((item) => item.catalogId)).size, 9);
  assert.deepEqual(productsByGroup.fasteners.slice(0, 5).map((item) => item.catalogId),
    ['MAT-200', 'MAT-201', 'MAT-202', 'MAT-203', 'MAT-081']);
});
