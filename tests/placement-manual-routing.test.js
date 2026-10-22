import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { electricalRouteLength3d, proposeElectricalCircuitRoutes, resolvedElectricalRoutes } from '../src/react/state/placement-electrical.js';
import { appendManualRouteWaypoint, finishManualRoute, manualRouteSnap } from '../src/react/state/placement-manual-routing.js';
import { sharedElectricalRouteLanes } from '../src/react/state/placement-schematic.js';
import { placementWallFaces } from '../src/react/state/placement-walls.js';

const plan = createDefaultProject().plan;

test('manual cable clicks use a 10 cm grid and keep an orthogonal path through each click', () => {
  const snapped = manualRouteSnap(plan, { x: 2.54, y: 10.44 }, [], 'floor');
  assert.equal(snapped.snappedTo, 'grid');
  assert.deepEqual(snapped.position, { x: 2.5, y: 10.4 });
  const start = [{ x: 1, y: 9, z: 0, surface: 'floor' }];
  const points = appendManualRouteWaypoint(start, { position: { x: 2.5, y: 10.4 }, surface: 'floor' }, plan);
  assert.ok(points?.at(-1).waypoint);
  assert.deepEqual([points.at(-1).x, points.at(-1).y], [2.5, 10.4]);
  assert.ok(points.some(point => point.manualElbow));
  for (let index = 1; index < points.length; index += 1) {
    assert.ok(Math.abs(points[index].x - points[index - 1].x) < .001 || Math.abs(points[index].y - points[index - 1].y) < .001);
  }
});

test('manual point sticks to existing cable and shared run renders as separate lanes', () => {
  const existing = { id: 'first', circuitId: 'c1', surface: 'floor', points: [{ x: 1, y: 1, z: 0, surface: 'floor' }, { x: 4, y: 1, z: 0, surface: 'floor' }] };
  const snap = manualRouteSnap(plan, { x: 2.13, y: 1.08 }, [existing], 'floor');
  assert.equal(snap.snappedTo, 'wire');
  assert.deepEqual(snap.position, { x: 2.13, y: 1 });
  const legacy = { id: 'legacy', circuitId: 'c3', auto: true, points: [{ x: 1, y: 2, z: 1.5 }, { x: 4, y: 2, z: 1.5 }] };
  assert.deepEqual(manualRouteSnap(plan, { x: 2.1, y: 2.06 }, [legacy], 'ceiling').position, { x: 2.1, y: 2 });
  const second = { id: 'second', circuitId: 'c2', surface: 'floor', points: [{ x: 2, y: 1, z: 0, surface: 'floor' }, { x: 5, y: 1, z: 0, surface: 'floor' }] };
  const original = JSON.stringify([existing, second]);
  const lanes = sharedElectricalRouteLanes([existing, second]);
  assert.equal(lanes.length, 1);
  assert.deepEqual([lanes[0].start.x, lanes[0].end.x], [2, 4]);
  assert.deepEqual(lanes[0].routes.map(route => route.circuitId), ['c1', 'c2']);
  assert.equal(JSON.stringify([existing, second]), original);
});

test('wall magnet keeps the chosen ceiling surface until wall routing is selected', () => {
  const face = placementWallFaces(plan)[0];
  const at = { x: (face.a.x + face.b.x) / 2, y: (face.a.y + face.b.y) / 2 };
  const ceiling = manualRouteSnap(plan, at, [], 'ceiling');
  const wall = manualRouteSnap(plan, at, [], 'wall');
  assert.equal(ceiling.snappedTo, 'wall');
  assert.equal(ceiling.surface, 'ceiling');
  assert.equal(wall.surface, 'wall');
  assert.equal(wall.wallRef, face.ref);
});

test('a second junction can be fed by the first without another panel branch', () => {
  const items = [
    { id: 'panel', floor: 1, layer: 'electric', kind: 'panel', x: 1, y: 1 },
    { id: 'junction-a', floor: 1, layer: 'electric', kind: 'junction-box', circuitId: 'c1', x: 3, y: 1 },
    { id: 'junction-b', floor: 1, layer: 'electric', kind: 'junction-box', circuitId: 'c1', x: 3.5, y: 1 },
    { id: 'socket', floor: 1, layer: 'electric', kind: 'socket', circuitId: 'c1', junctionItemId: 'junction-b', x: 4, y: 2 },
  ];
  let id = 0;
  const routes = proposeElectricalCircuitRoutes(items, 1, 'c1', 'panel', () => `route-${++id}`, plan);
  const feeds = routes.filter(route => route.purpose === 'feed');
  assert.deepEqual(feeds.map(route => [route.fromItemId, route.targetItemId]), [['panel', 'junction-a'], ['junction-a', 'junction-b']]);
  assert.equal(feeds.reduce((total, route) => total + electricalRouteLength3d(route.points), 0), 2.5);
  assert.equal(routes.find(route => route.targetItemId === 'socket').fromItemId, 'junction-b');
});

test('manual junction-to-junction cable retains its explicit bend on reopen and endpoint move', () => {
  const start = { id: 'a', floor: 1, layer: 'electric', kind: 'junction-box', circuitId: 'c1', x: 2, y: 9, height: 0, heightKnown: true };
  const target = { id: 'b', floor: 1, layer: 'electric', kind: 'junction-box', circuitId: 'c1', x: 4, y: 10, height: 0, heightKnown: true };
  const points = appendManualRouteWaypoint([{ x: 2, y: 9, z: 0, surface: 'device' }], { position: { x: 3, y: 9 }, surface: 'floor' }, plan);
  const complete = finishManualRoute(points, { x: target.x, y: target.y, z: 0, surface: 'device' }, 'floor', plan);
  assert.ok(complete);
  const route = { id: 'manual', floor: 1, circuitId: 'c1', fromItemId: 'a', targetItemId: 'b', purpose: 'manual', surface: 'floor', auto: false, rebuildOnMove: true, points: complete };
  const placement = { items: [start, target], routes: [route] };
  assert.ok(resolvedElectricalRoutes(placement, 1, plan)[0].points.some(point => point.x === 3 && point.y === 9));
  target.x = 4.5;
  const moved = resolvedElectricalRoutes(placement, 1, plan)[0];
  assert.deepEqual([moved.points.at(-1).x, moved.points.at(-1).y], [4.5, 10]);
  assert.ok(moved.points.some(point => point.x === 3 && point.y === 9));
  assert.ok(moved.points.slice(1).every((point, index) => Math.abs(point.x - moved.points[index].x) < .001 || Math.abs(point.y - moved.points[index].y) < .001));
});
