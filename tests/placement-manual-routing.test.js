import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { electricalRouteLength3d, proposeElectricalCircuitRoutes, resolvedElectricalRoutes } from '../src/react/state/placement-electrical.js';
import { appendManualRouteWaypoint, finishManualRoute, manualRouteSnap, nearestRouteNode } from '../src/react/state/placement-manual-routing.js';
import { electricalDrawingAnchors, nearestPointGuide, sharedElectricalRouteLanes } from '../src/react/state/placement-schematic.js';
import { placementWallFaces } from '../src/react/state/placement-walls.js';

const plan = createDefaultProject().plan;

test('moving an electrical point shows the nearest other point even across a long room', () => {
  const position = { x: 1, y: 1 };
  const anchors = [{ id: 'moving', x: 1, y: 1 }, { id: 'far', x: 8, y: 9 }, { id: 'farther', x: 14, y: 14 }];
  const guide = nearestPointGuide(position, anchors, 'moving');
  assert.deepEqual(guide.from, { x: 8, y: 9 });
  assert.deepEqual(guide.to, position);
  assert.ok(guide.distance > 10);
  assert.deepEqual(position, { x: 1, y: 1 });
  assert.deepEqual(anchors[1], { id: 'far', x: 8, y: 9 });
});

test('manual route cursor skips its own point and guides to another electrical point', () => {
  const guide = nearestPointGuide({ x: 2, y: 2 }, [{ x: 2, y: 2 }, { x: 5, y: 2 }]);
  assert.deepEqual(guide?.from, { x: 5, y: 2 });
});

test('electrical point near a wall takes precedence over wall snapping', () => {
  const face = placementWallFaces(plan)[0];
  const anchor = { x: (face.a.x + face.b.x) / 2 + face.normal.x * .08, y: (face.a.y + face.b.y) / 2 + face.normal.y * .08 };
  const clicked = { x: anchor.x + .04, y: anchor.y + .03 };
  assert.equal(nearestRouteNode(clicked, [{ item: { id: 'socket' }, anchor }], .12)?.item.id, 'socket');
  const snapped = manualRouteSnap(plan, clicked, [], 'floor', .12, [anchor]);
  assert.deepEqual(snapped.position, { x: Math.round(anchor.x * 100) / 100, y: Math.round(anchor.y * 100) / 100 });
  assert.equal(snapped.snappedTo, 'point');
});

test('manual cable follows explicit horizontal and vertical turns without an invented elbow', () => {
  const snapped = manualRouteSnap(plan, { x: 2.54, y: 10.44 }, [], 'floor');
  assert.equal(snapped.snappedTo, '');
  assert.deepEqual(snapped.position, { x: 2.54, y: 10.44 });
  const start = [{ x: 1, y: 9, z: 0, surface: 'floor' }];
  const turn = appendManualRouteWaypoint(start, snapped, plan);
  const points = appendManualRouteWaypoint(turn, { position: { x: 3.21, y: 11.08 }, surface: 'floor' }, plan);
  const target = { x: 4.33, y: 12.09, z: 0, surface: 'device' };
  assert.equal(finishManualRoute(points, target), null);
  const lastTurn = appendManualRouteWaypoint(points, { position: { x: 4.33, y: 11.08 }, surface: 'floor' }, plan);
  const complete = finishManualRoute(lastTurn, target);
  assert.deepEqual(complete.map(({ x, y }) => [x, y]), [[1, 9], [2.54, 9], [2.54, 11.08], [4.33, 11.08], [4.33, 12.09]]);
  assert.equal(complete.filter(point => point.waypoint).length, 3);
  assert.equal(complete.some(point => point.manualElbow), false);
});

test('nearby electrical points align the manual cursor and show both parallel guides', () => {
  const snap = manualRouteSnap(plan, { x: 2.56, y: 10.46 }, [], 'ceiling', .12, [{ x: 2.5, y: 1 }, { x: 8, y: 10.4 }]);
  assert.deepEqual(snap.position, { x: 2.5, y: 10.4 });
  assert.deepEqual(snap.guides.map(guide => guide.axis), ['x', 'y']);
  assert.equal(snap.snappedTo, 'alignment');
});

test('clicking a wall makes the incoming manual leg perpendicular to that wall', () => {
  const face = placementWallFaces(plan)[0];
  const tangent = { x: face.b.x - face.a.x, y: face.b.y - face.a.y };
  const middle = { x: (face.a.x + face.b.x) / 2, y: (face.a.y + face.b.y) / 2 };
  const from = { x: middle.x + face.normal.x * .8, y: middle.y + face.normal.y * .8, z: 0, surface: 'floor' };
  const clicked = { x: middle.x + tangent.x * .15, y: middle.y + tangent.y * .15 };
  const snap = manualRouteSnap(plan, clicked, [], 'floor');
  const points = appendManualRouteWaypoint([from], snap, plan);
  const leg = { x: points[1].x - from.x, y: points[1].y - from.y };
  assert.equal(snap.surface, 'wall');
  assert.ok(Math.abs(leg.x * tangent.x + leg.y * tangent.y) < .05);
});

test('manual click near existing cable stays at the clicked place; shared runs retain their lanes', () => {
  const existing = { id: 'first', circuitId: 'c1', surface: 'floor', points: [{ x: 1, y: 1, z: 0, surface: 'floor' }, { x: 4, y: 1, z: 0, surface: 'floor' }] };
  const snap = manualRouteSnap(plan, { x: 2.13, y: 1.08 }, [existing], 'floor');
  assert.equal(snap.snappedTo, '');
  assert.deepEqual(snap.position, { x: 2.13, y: 1.08 });
  const legacy = { id: 'legacy', circuitId: 'c3', auto: true, points: [{ x: 1, y: 2, z: 1.5 }, { x: 4, y: 2, z: 1.5 }] };
  assert.deepEqual(manualRouteSnap(plan, { x: 2.1, y: 2.06 }, [legacy], 'ceiling').position, { x: 2.1, y: 2.06 });
  const second = { id: 'second', circuitId: 'c2', surface: 'floor', points: [{ x: 2, y: 1, z: 0, surface: 'floor' }, { x: 5, y: 1, z: 0, surface: 'floor' }] };
  const original = JSON.stringify([existing, second]);
  const lanes = sharedElectricalRouteLanes([existing, second]);
  assert.equal(lanes.length, 1);
  assert.deepEqual([lanes[0].start.x, lanes[0].end.x], [2, 4]);
  assert.deepEqual(lanes[0].routes.map(route => route.circuitId), ['c1', 'c2']);
  assert.equal(JSON.stringify([existing, second]), original);
});

test('clicking a wall selects its wall surface, while a room click remains on the chosen plane', () => {
  const face = placementWallFaces(plan)[0];
  const at = { x: (face.a.x + face.b.x) / 2, y: (face.a.y + face.b.y) / 2 };
  const ceiling = manualRouteSnap(plan, at, [], 'ceiling');
  const wall = manualRouteSnap(plan, at, [], 'wall');
  assert.equal(ceiling.snappedTo, 'wall');
  assert.equal(ceiling.surface, 'wall');
  assert.equal(wall.surface, 'wall');
  assert.equal(wall.wallRef, face.ref);
  assert.equal(manualRouteSnap(plan, { x: 2.54, y: 10.44 }, [], 'floor').surface, 'floor');
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

test('manual junction-to-junction cable keeps only user turns after reopen and endpoint move', () => {
  const start = { id: 'a', floor: 1, layer: 'electric', kind: 'junction-box', circuitId: 'c1', x: 2, y: 9, height: 0, heightKnown: true };
  const target = { id: 'b', floor: 1, layer: 'electric', kind: 'junction-box', circuitId: 'c1', x: 4, y: 10, height: 0, heightKnown: true };
  const points = appendManualRouteWaypoint([{ x: 2, y: 9, z: 0, surface: 'device' }], { position: { x: 3, y: 9 }, surface: 'floor' }, plan);
  const turned = appendManualRouteWaypoint(points, { position: { x: 4, y: 9 }, surface: 'floor' }, plan);
  const complete = finishManualRoute(turned, { x: target.x, y: target.y, z: 0, surface: 'device' }, 'floor', plan);
  assert.ok(complete);
  const route = { id: 'manual', floor: 1, circuitId: 'c1', fromItemId: 'a', targetItemId: 'b', purpose: 'manual', surface: 'floor', auto: false, rebuildOnMove: true, points: complete };
  const placement = { items: [start, target], routes: [route] };
  assert.ok(resolvedElectricalRoutes(placement, 1, plan)[0].points.some(point => point.x === 3 && point.y === 9));
  target.y = 10.5;
  const moved = resolvedElectricalRoutes(placement, 1, plan)[0];
  assert.deepEqual([moved.points.at(-1).x, moved.points.at(-1).y], [4, 10.5]);
  assert.ok(moved.points.some(point => point.x === 3 && point.y === 9));
  assert.equal(moved.points.length, 4);
  assert.deepEqual(moved.points.map(({ x, y }) => [x, y]), [[2, 9], [3, 9], [4, 9], [4, 10.5]]);
});

test('manual cable ends at the displayed symbol of a tightly packed point', () => {
  const items = [
    { id: 'panel', floor: 1, layer: 'electric', kind: 'panel', x: 1, y: 1 },
    { id: 'switch', floor: 1, layer: 'electric', kind: 'switch', circuitId: 'c1', x: 2, y: 2, height: .9 },
    { id: 'socket', floor: 1, layer: 'electric', kind: 'socket', circuitId: 'c1', x: 2, y: 2, height: .3 },
  ];
  const anchor = electricalDrawingAnchors(items, []).get('switch');
  assert.notDeepEqual(anchor, { x: 2, y: 2 });
  const route = { id: 'manual', floor: 1, circuitId: 'c1', fromItemId: 'panel', targetItemId: 'switch', purpose: 'manual', auto: false, rebuildOnMove: true,
    points: [{ x: 1, y: 1, z: 0 }, { x: 1.5, y: 1.6, z: 0, waypoint: true }, { x: 2, y: 2, z: .9 }] };
  const [resolved] = resolvedElectricalRoutes({ items, routes: [route] }, 1, { rooms: [] });
  assert.deepEqual([resolved.points.at(-1).x, resolved.points.at(-1).y], [anchor.x, anchor.y]);
  assert.deepEqual([resolved.points[1].x, resolved.points[1].y], [1.5, 1.6]);
  assert.equal(resolved.points.length, 3);
});
