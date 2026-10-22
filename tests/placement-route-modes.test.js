import test from 'node:test';
import assert from 'node:assert/strict';
import { connectSelectedElectricalPoints, electricalBill, reassignElectricalPoint, resolvedElectricalRoutes } from '../src/react/state/placement-electrical.js';
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

test('selected circuit takes clicked points from another circuit and removes their old links', () => {
  const placement = normalizePlacement({ electricalRouteMode: 'automatic',
    circuits: [{ id: 'old', name: 'Старая' }, { id: 'new', name: 'Новая' }],
    items: [
      { id: 'panel', floor: 1, layer: 'electric', kind: 'panel', x: 0, y: 0 },
      { id: 'switch', floor: 1, layer: 'electric', kind: 'switch', circuitId: 'old', x: 1, y: 0 },
      { id: 'lamp', floor: 1, layer: 'electric', kind: 'light', circuitId: 'old', x: 1, y: 1 },
    ],
    routes: [
      { id: 'old-feed', floor: 1, circuitId: 'old', fromItemId: 'panel', targetItemId: 'switch', auto: true, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
      { id: 'old-light', floor: 1, circuitId: 'old', fromItemId: 'switch', targetItemId: 'lamp', auto: false, points: [{ x: 1, y: 0 }, { x: 1, y: 1 }] },
    ],
  });
  assert.equal(reassignElectricalPoint(placement, 'switch', 'new'), 'old');
  assert.equal(reassignElectricalPoint(placement, 'lamp', 'new'), 'old');
  assert.equal(placement.routes.length, 0);
  assert.equal(connectSelectedElectricalPoints(placement, 1, 'new', 'panel', 'switch', () => 'new-feed')?.id, 'new-feed');
  assert.equal(connectSelectedElectricalPoints(placement, 1, 'new', 'switch', 'lamp', () => 'new-light')?.id, 'new-light');
  const reopened = normalizePlacement(JSON.parse(JSON.stringify(placement)));
  assert.deepEqual(reopened.items.filter(item => item.kind !== 'panel').map(item => item.circuitId), ['new', 'new']);
  assert.deepEqual(resolvedElectricalRoutes(reopened, 1).map(route => [route.fromItemId, route.targetItemId, route.circuitId]), [
    ['panel', 'switch', 'new'], ['switch', 'lamp', 'new'],
  ]);
});
