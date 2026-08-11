import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTerraceRoof, normalizeTerracePlatform, terraceAttachmentSide } from '../src/calculations/terrace-model.js';

test('legacy terrace receives project defaults without losing geometry', () => {
  const platform = normalizeTerracePlatform({ id: 't1', x: 0, y: 8, w: 10, h: 2 });
  assert.equal(platform.w, 10);
  assert.equal(platform.foundation.mode, 'shared');
  assert.equal(platform.binding.mode, 'shared');
  assert.equal(platform.roof.mode, 'none');
});

test('foundation without piles also disables binding', () => {
  const platform = normalizeTerracePlatform({ foundation: { mode: 'none' }, binding: { mode: 'shared' } });
  assert.equal(platform.binding.mode, 'none');
});

test('automatic shed roof uses projection, height difference and overhangs', () => {
  const platform = normalizeTerracePlatform({
    x: 0, y: 8, w: 10, h: 2,
    roof: { mode: 'cold', shape: 'shed', frontOverhang: 0.3, sideOverhang: 0.3, highHeight: 2.6, lowHeight: 2.2, wastePercent: 10 }
  });
  assert.equal(terraceAttachmentSide(platform, { w: 10, h: 8 }), 'bottom');
  const result = calculateTerraceRoof(platform, { w: 10, h: 8 });
  assert.equal(result.netArea, 24.75);
  assert.equal(result.purchaseArea, 27.22);
});

test('manual roof area is preserved and receives waste', () => {
  const result = calculateTerraceRoof({
    x: 10, y: 0, w: 2, h: 8,
    roof: { mode: 'cold', areaMode: 'manual', manualArea: 20, wastePercent: 15 }
  }, { w: 10, h: 8 });
  assert.equal(result.side, 'right');
  assert.equal(result.netArea, 20);
  assert.equal(result.purchaseArea, 23);
});
