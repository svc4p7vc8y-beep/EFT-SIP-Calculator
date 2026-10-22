import test from 'node:test';
import assert from 'node:assert/strict';
import { electricalBill, resolvedElectricalRoutes } from '../src/react/state/placement-electrical.js';
import { createPlacement, normalizePlacement } from '../src/react/state/placement-model.js';

test('automatic and manual cable plans stay separate across project reopen', () => {
  assert.equal(createPlacement().electricalRouteMode, 'automatic');
  const items = [
    { id: 'panel', floor: 1, layer: 'electric', kind: 'panel', x: 0, y: 0 },
    { id: 'switch', floor: 1, layer: 'electric', kind: 'switch', circuitId: 'lights', x: 2, y: 0 },
    { id: 'lamp', floor: 1, layer: 'electric', kind: 'light', circuitId: 'lights', x: 2, y: 2 },
  ];
  const routes = [
    { id: 'auto', floor: 1, circuitId: 'lights', fromItemId: 'panel', targetItemId: 'lamp', auto: true, points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }] },
    { id: 'manual-switch', floor: 1, circuitId: 'lights', fromItemId: 'panel', targetItemId: 'switch', auto: false, points: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 0 }] },
    { id: 'manual-lamp', floor: 1, circuitId: 'lights', fromItemId: 'switch', targetItemId: 'lamp', auto: false, points: [{ x: 2, y: 0 }, { x: 2, y: 2 }] },
  ];
  const placement = normalizePlacement({ items, circuits: [{ id: 'lights', name: 'Свет' }], routes });
  assert.equal(placement.electricalRouteMode, 'manual');
  assert.deepEqual(resolvedElectricalRoutes(placement, 1).map(route => route.id), ['manual-switch', 'manual-lamp']);
  assert.equal(electricalBill(placement, 1).routeMetres, 6);

  const reopened = normalizePlacement(JSON.parse(JSON.stringify({ ...placement, electricalRouteMode: 'automatic' })));
  assert.deepEqual(resolvedElectricalRoutes(reopened, 1).map(route => route.id), ['auto']);
  assert.equal(electricalBill(reopened, 1).routeMetres, 4);
  reopened.electricalRouteMode = 'manual';
  assert.deepEqual(resolvedElectricalRoutes(reopened, 1).map(route => route.id), ['manual-switch', 'manual-lamp']);
  assert.equal(electricalBill(reopened, 1).routeMetres, 6);
});

test('a manual cable may end at a clicked corner and survives reopening', () => {
  const placement = normalizePlacement({
    electricalRouteMode: 'manual',
    items: [{ id: 'panel', floor: 1, layer: 'electric', kind: 'panel', x: 1, y: 1 }],
    routes: [{ id: 'open-end', floor: 1, circuitId: 'c1', fromItemId: 'panel', targetItemId: '', auto: false,
      points: [{ x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0, waypoint: true }] }],
  });
  const reopened = normalizePlacement(JSON.parse(JSON.stringify(placement)));
  assert.equal(resolvedElectricalRoutes(reopened, 1)[0].targetItemId, '');
  assert.equal(electricalBill(reopened, 1).routeMetres, 1);
});
