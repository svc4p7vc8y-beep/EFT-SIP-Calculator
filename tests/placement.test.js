import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { applianceSupplyKind, normalizePlacement, placementSummary, PLACEMENT_GROUPS, PLACEMENT_PRESETS } from '../src/react/state/placement-model.js';
import { dimensionMetres, snapToFacade } from '../src/react/state/placement-geometry.js';
import { perimeterPlacementDimensions } from '../src/react/state/placement-dimensions.js';
import { buildPlacementSheets } from '../src/react/export/placement-sheets.js';
import { electricalSettingOutDimension, nearestPlacementDimension, nearestWallDimension, placementWallBands, placementWallFaces, projectToWallFace, snapPlacementToWall, wallFacePoint } from '../src/react/state/placement-walls.js';
import { electricalBill, proposeElectricalCircuitRoutes, resolvedElectricalRoutes } from '../src/react/state/placement-electrical.js';
import { networkBill, resolvedNetworkRoutes } from '../src/react/state/placement-networks.js';
import { connectionPortsFor } from '../src/react/state/placement-connections.js';
import { projectToRoomEdge, roomEdgeDisplay, roomEdgePosition, roomItemPlane, roomOpeningOnEdge, roomUnfoldLayout, roomWallDisplayPoint, roomWallPlanPoint } from '../src/react/state/placement-room.js';

test('room unfolding keeps every wall edge length and projects all four shared edges consistently', () => {
  const room = createDefaultProject().plan.rooms[0];
  const points = room.points;
  for (let index = 0; index < 4; index++) {
    const a = points[index], b = points[(index + 1) % 4];
    const edge = roomEdgeDisplay(room, index);
    assert.ok(Math.abs(edge.length - Math.hypot(b.x - a.x, b.y - a.y)) < 1e-9);
    const middle = roomEdgePosition(room, index, edge.length / 2);
    const display = roomWallDisplayPoint(room, index, middle, 0, 2.5);
    const restored = roomWallPlanPoint(room, index, display.x, display.y, 2.5);
    assert.ok(Math.hypot(restored.position.x - middle.x, restored.position.y - middle.y) < .02);
    assert.equal(restored.elevation, 0);
  }
  assert.deepEqual([0, 1, 2, 3].map(index => roomEdgeDisplay(room, index).side), ['top', 'right', 'bottom', 'left']);
});
test('wall openings use plan centre, orientation, width and installation height', () => {
  const room = { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }] };
  const window = { id: 'window', type: 'window', x: 1.5, y: 0, orientation: 'h', width: 1, height: 1.2, sillHeight: .8 };
  const top = roomOpeningOnEdge(room, 0, window, 2.5);
  assert.deepEqual([top.x, top.y, top.width, top.height], [1, .5, 1, 1.2]);
  assert.equal(roomOpeningOnEdge(room, 1, window, 2.5), null);
  const bottom = roomOpeningOnEdge(room, 2, { ...window, y: 3, type: 'door', width: .9, height: 2.05, sillHeight: undefined }, 2.5);
  assert.ok(Math.abs(bottom.x - 1.05) < 1e-9);
  assert.equal(bottom.y, 0);
  assert.ok(Math.abs(bottom.width - .9) < 1e-9);
  const right = roomOpeningOnEdge(room, 1, { ...window, x: 4, y: 1.5, orientation: 'v' }, 2.5);
  assert.deepEqual([right.x, right.y, right.width, right.height], [.8, 1, 1.2, 1]);
  assert.equal(roomOpeningOnEdge(room, 0, { ...window, include: false }, 2.5), null);
});
test('concave room unfolds each true edge without changing its length or putting items on two planes', () => {
  const room = { points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 5 }, { x: 0, y: 5 }] };
  const layout = roomUnfoldLayout(room, 2.5);
  assert.equal(layout.edges.length, room.points.length);
  assert.deepEqual(layout.edges.map(edge => edge.length), [5, 2, 3, 3, 2, 5]);
  assert.equal(layout.edges.find(edge => edge.index === 3).detached, true);
  for (const edge of layout.edges) {
    const a = room.points[edge.index], b = room.points[(edge.index + 1) % room.points.length];
    const horizontal = edge.side === 'top' || edge.side === 'bottom';
    assert.ok(Math.abs((horizontal ? edge.width : edge.height) - Math.hypot(b.x - a.x, b.y - a.y)) < 1e-9);
    const position = roomEdgePosition(room, edge.index, edge.length / 2);
    const wallPoint = roomWallDisplayPoint(room, edge.index, position, 1.25, 2.5);
    const restored = roomWallPlanPoint(room, edge.index, wallPoint.x, wallPoint.y, 2.5);
    assert.ok(Math.hypot(restored.position.x - position.x, restored.position.y - position.y) < .02);
    assert.equal(restored.elevation, 1.25);
  }
  const nearWall = { x: .12, y: 2, layer: 'electric', kind: 'socket', wallRef: 'wall' };
  assert.equal(roomItemPlane(room, nearWall).plane, 'wall');
  assert.equal(roomItemPlane(room, { ...nearWall, layer: 'furniture', kind: 'bed' }).plane, 'floor');
  assert.equal(roomItemPlane(room, { ...nearWall, displayPlane: 'floor' }).plane, 'floor');
  assert.equal(roomItemPlane(room, { ...nearWall, displayPlane: 'wall' }).edgeIndex, 5);
  assert.equal(roomItemPlane(room, { ...nearWall, x: 1, y: 1, displayPlane: 'wall' }).plane, 'floor');
  const reopened = normalizePlacement({ items: [{ id: 'old', layer: 'electric', kind: 'socket', x: .12, y: 2 }, { id: 'manual', layer: 'electric', kind: 'socket', x: .12, y: 2, displayPlane: 'floor' }] });
  assert.deepEqual(reopened.items.map(item => item.displayPlane), ['auto', 'floor']);
});
import { electricalGroupColor, electricalPlacementClusters, roomNameForPlacement } from '../src/react/state/placement-visibility.js';

test('electrical points on one vertical axis form a wall-perpendicular row without changing coordinates', () => {
  const rooms = createDefaultProject().plan.rooms;
  const items = [
    { id: 'switch', layer: 'electric', x: .25, y: 1, height: .9, wallRef: 'wall-a' },
    { id: 'socket', layer: 'electric', x: .27, y: 1.01, height: .3, wallRef: 'wall-a' },
    { id: 'junction', layer: 'electric', x: .25, y: 1, height: 2.3, wallRef: 'wall-a' },
    { id: 'other-wall', layer: 'electric', x: .25, y: 1, wallRef: 'wall-b' },
    { id: 'nearby-in-plan', layer: 'electric', x: .25, y: 1.4, wallRef: 'wall-a' },
    { id: 'furniture', layer: 'furniture', x: .25, y: 1.1 },
  ];
  const before = structuredClone(items);
  const clusters = electricalPlacementClusters(items, rooms);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].items.map(item => item.id), ['socket', 'switch', 'junction']);
  assert.ok(Math.abs(Math.hypot(clusters[0].normal.x, clusters[0].normal.y) - 1) < 1e-9);
  assert.equal(clusters[0].normal.x > 0, true);
  assert.notEqual(electricalGroupColor('one', [{ id: 'one' }, { id: 'two' }]), electricalGroupColor('two', [{ id: 'one' }, { id: 'two' }]));
  assert.equal(roomNameForPlacement(items[0], rooms), rooms[0].name);
  assert.deepEqual(items, before);
});

test('old projects receive an empty placement layer without changing the estimate', () => {
  const old = createDefaultProject();
  old.services.engineeringElectric = true;
  delete old.placement;
  const before = calculateProject(old).totals.total;
  const migrated = migrateProject(old);
  assert.deepEqual(migrated.placement.items, []);
  assert.deepEqual(migrated.placement.networks, { plumbing: [], heating: [], sewer: [], ventilation: [] });
  assert.equal(calculateProject(migrated).totals.total, before);
});

test('existing appliances receive editable network ports once without changing the estimate', () => {
  const project = createDefaultProject();
  const before = calculateProject(project).totals.total;
  project.placement.version = 3;
  project.placement.items.push({ id: 'sink-1', floor: 1, layer: 'furniture', kind: 'kitchen-sink', label: 'Мойка', x: 2, y: 2, width: .8, depth: .6, height: 0 });
  const migrated = migrateProject(project);
  const ports = migrated.placement.items.filter(item => item.linkedApplianceId === 'sink-1');
  assert.equal(migrated.placement.version, 4);
  assert.deepEqual(ports.map(item => [item.layer, item.connectionMedium]), [['plumbing', 'cold'], ['plumbing', 'hot'], ['sewer', 'waste']]);
  assert.equal(ports.every(item => item.heightKnown === false && item.followsAppliance), true);
  assert.equal(calculateProject(migrated).totals.total, before);
  const reopened = migrateProject(JSON.parse(JSON.stringify(migrated)));
  assert.equal(reopened.placement.items.filter(item => item.linkedApplianceId === 'sink-1').length, 3);
  reopened.placement.items = reopened.placement.items.filter(item => item.id !== ports[0].id);
  assert.equal(migrateProject(reopened).placement.items.filter(item => item.linkedApplianceId === 'sink-1').length, 2);
});

test('ports of tank, boiler, bath and dishwasher are distinct route endpoints', () => {
  const examples = [
    ['hydro-tank', 2, ['plumbing']], ['water-heater', 2, ['plumbing']],
    ['boiler', 4, ['heating', 'plumbing']], ['bathtub', 3, ['plumbing', 'sewer']],
    ['dishwasher', 2, ['plumbing', 'sewer']],
  ];
  for (const [kind, count, systems] of examples) {
    const ports = connectionPortsFor({ id: kind, kind, label: kind, floor: 1, x: 2, y: 2, width: .6, depth: .6 });
    assert.equal(ports.length, count);
    assert.deepEqual([...new Set(ports.map(port => port.layer))], systems);
    assert.equal(new Set(ports.map(port => port.id)).size, count);
  }
});

test('unfolded room maps each wall station back inside the original room', () => {
  const room = { id: 'test-room', x: 1, y: 2, w: 4, h: 3 };
  for (let edge = 0; edge < 4; edge += 1) {
    const position = roomEdgePosition(room, edge, 1);
    const projection = projectToRoomEdge(room, edge, position);
    assert.ok(position.x > 1 && position.x < 5 && position.y > 2 && position.y < 5);
    assert.ok(Math.abs(projection.station - 1) < .01);
    assert.ok(Math.abs(projection.distance - .08) < .01);
  }
});

test('network routes preserve wall station, heights and independent sheets after JSON reopen', () => {
  const project = createDefaultProject();
  const estimateBefore = calculateProject(project).totals.total;
  const wall = placementWallFaces(project.plan)[0];
  const first = wallFacePoint(wall, 1), second = wallFacePoint(wall, 3);
  assert.equal(Math.round(projectToWallFace(wall, second).station), 3);
  project.placement.items.push(
    { id: 'water-in', floor: 1, layer: 'plumbing', kind: 'water-source', label: 'Ввод', ...first, height: 1, heightKnown: true, wallRef: wall.ref, width: .2, depth: .16 },
    { id: 'water-out', floor: 1, layer: 'plumbing', kind: 'cold-outlet', label: 'Кухня', ...second, height: .5, heightKnown: true, wallRef: wall.ref, width: .16, depth: .12 },
  );
  project.placement.networks.plumbing.push({ id: 'water-route', floor: 1, medium: 'cold', fromId: 'water-in', toId: 'water-out', auto: true, wallRef: wall.ref, routeLevel: 2, diameterMm: 20, material: 'Труба проекта', accessories: [{ name: 'Кран', quantity: 2, unit: 'шт' }], points: [{ ...first, z: 1 }, { ...second, z: .5 }] });
  const reopened = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(reopened.placement.version, 4);
  assert.equal(networkBill(reopened.placement, 'plumbing', 1).totalLength, 4.5);
  assert.equal(networkBill(reopened.placement, 'plumbing', 1).pipeRows[0].metres, 4.5);
  assert.equal(networkBill(reopened.placement, 'plumbing', 1).components.find(entry => entry.name === 'Кран').quantity, 2);
  assert.equal(buildPlacementSheets(reopened).find(sheet => sheet.discipline === 'plumbing').items.length, 2);
  assert.equal(buildPlacementSheets(reopened).find(sheet => sheet.wall?.ref === wall.ref).routes.length, 1);
  reopened.placement.items.find(item => item.id === 'water-out').x += 1;
  assert.equal(resolvedNetworkRoutes(reopened.placement, 'plumbing', 1)[0].points.at(-1).x, second.x + 1);
  assert.equal(calculateProject(reopened).totals.total, estimateBefore);
});

test('sewer checks only the entered project slope and ventilation requires entered flow', () => {
  const project = createDefaultProject();
  project.placement.items.push(
    { id: 'drain', floor: 1, layer: 'sewer', kind: 'sewer-outlet', x: 1, y: 1, height: .5, width: .16, depth: .12 },
    { id: 'stack', floor: 1, layer: 'sewer', kind: 'sewer-stack', x: 4, y: 1, height: .4, width: .2, depth: .2 },
    { id: 'unit', floor: 1, layer: 'ventilation', kind: 'air-unit', x: 1, y: 2, height: 2, width: .8, depth: .5 },
    { id: 'grille', floor: 1, layer: 'ventilation', kind: 'supply-diffuser', x: 3, y: 2, height: 2, width: .25, depth: .25 },
  );
  project.placement.networks.sewer.push({ id: 's1', floor: 1, medium: 'waste', fromId: 'drain', toId: 'stack', auto: true, slopePermille: 40, diameterMm: 110, material: 'Проект', points: [{ x: 1, y: 1, z: .5 }, { x: 4, y: 1, z: .4 }] });
  project.placement.networks.ventilation.push({ id: 'v1', floor: 1, medium: 'supply-air', fromId: 'unit', toId: 'grille', auto: true, diameterMm: 125, material: 'Проект', points: [{ x: 1, y: 2, z: 2 }, { x: 3, y: 2, z: 2 }] });
  assert(networkBill(project.placement, 'sewer', 1).issues.some(issue => issue.includes('перепад')));
  assert(networkBill(project.placement, 'ventilation', 1).issues.some(issue => issue.includes('расход')));
  project.placement.items.find(item => item.id === 'stack').height = .3;
  assert(!networkBill(project.placement, 'sewer', 1).issues.some(issue => issue.includes('перепад')));
  assert.deepEqual(buildPlacementSheets(project).filter(sheet => ['sewer', 'ventilation'].includes(sheet.discipline)).map(sheet => sheet.discipline), ['sewer', 'ventilation']);
});

test('manual heating waypoints keep their heights while endpoints and paired lines can move', () => {
  const project = createDefaultProject();
  project.placement.items.push(
    { id: 'collector', floor: 1, layer: 'heating', kind: 'heat-manifold', x: 1, y: 1, height: 1, heightKnown: true, width: .5, depth: .2 },
    { id: 'radiator', floor: 1, layer: 'heating', kind: 'radiator-point', x: 4, y: 2, height: .4, heightKnown: true, width: .8, depth: .16 },
  );
  project.placement.networks.heating.push(
    { id: 'supply', floor: 1, medium: 'supply', fromId: 'collector', toId: 'radiator', auto: false, material: 'Проект', diameterMm: 20, points: [{ x: 1, y: 1, z: 1 }, { x: 1, y: 2, z: .8 }, { x: 4, y: 2, z: .4 }] },
    { id: 'return', floor: 1, medium: 'return', fromId: 'radiator', toId: 'collector', auto: true, material: 'Проект', diameterMm: 20, points: [{ x: 4, y: 2, z: .4 }, { x: 1, y: 1, z: 1 }] },
  );
  const reopened = migrateProject(JSON.parse(JSON.stringify(project)));
  const bill = networkBill(reopened.placement, 'heating', 1);
  assert(bill.totals.supply > 4);
  assert(bill.totals.return > 4);
  reopened.placement.items.find(item => item.id === 'collector').x = 2;
  const routes = resolvedNetworkRoutes(reopened.placement, 'heating', 1);
  assert.equal(routes[0].points[0].x, 2);
  assert.equal(routes[0].points[1].z, .8);
  assert.equal(routes[1].points.at(-1).x, 2);
});

test('electrical topology routes panel through one junction to switch and controlled light', () => {
  const items = [
    { id: 'panel', floor: 1, layer: 'electric', kind: 'panel', x: 0, y: 0 },
    { id: 'junction', floor: 1, layer: 'electric', kind: 'junction-box', x: 2, y: 0, circuitId: 'c1' },
    { id: 'switch', floor: 1, layer: 'electric', kind: 'switch', x: 2, y: 2, circuitId: 'c1', controlsItemId: 'light', junctionItemId: 'junction' },
    { id: 'light', floor: 1, layer: 'electric', kind: 'light', x: 4, y: 2, circuitId: 'c1' },
  ];
  const routes = proposeElectricalCircuitRoutes(items, 1, 'c1', 'panel', (() => { let n = 0; return () => `r${++n}`; })());
  assert.deepEqual(routes.map(route => [route.fromItemId, route.targetItemId]), [['panel', 'junction'], ['junction', 'switch'], ['junction', 'light']]);
  const placement = { items, circuits: [{ id: 'c1', name: 'Свет', accessories: [{ name: 'Клемма проекта', quantity: 4, unit: 'шт' }] }], routes };
  assert.equal(electricalBill(placement, 1).routeMetres, 8);
  assert.equal(electricalBill(placement, 1).components.find(row => row.name === 'Распределительные коробки').quantity, 1);
  assert.equal(electricalBill(placement, 1).manualComponents.find(row => row.name === 'Клемма проекта').quantity, 4);
  items[1].x = 3;
  assert.equal(resolvedElectricalRoutes(placement, 1)[1].points[0].x, 3);
});

test('socket group forms a junction-to-socket chain, keeps project breaker data and estimate', () => {
  const project = createDefaultProject();
  const before = calculateProject(project).totals.total;
  const items = [
    { id: 'panel', floor: 1, layer: 'electric', kind: 'panel', x: 0, y: 0, width: .45, depth: .16 },
    { id: 'box', floor: 1, layer: 'electric', kind: 'junction-box', x: 2, y: 0, width: .15, depth: .15, circuitId: 'c1' },
    { id: 'socket-a', floor: 1, layer: 'electric', kind: 'socket', x: 3, y: 0, width: .18, depth: .12, circuitId: 'c1' },
    { id: 'socket-b', floor: 1, layer: 'electric', kind: 'socket', x: 4, y: 0, width: .18, depth: .12, circuitId: 'c1' },
  ];
  const routes = proposeElectricalCircuitRoutes(items, 1, 'c1', 'panel', (() => { let id = 0; return () => `r${++id}`; })());
  assert.deepEqual(routes.map(route => [route.fromItemId, route.targetItemId]), [['panel', 'box'], ['box', 'socket-a'], ['socket-a', 'socket-b']]);
  project.placement.items.push(...items);
  project.placement.routes.push(...routes);
  project.placement.circuits.push({ id: 'c1', name: 'Розетки', cable: '3×2,5', breakerAmps: 16, breaker: 'Тип по проекту' });
  const reopened = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(reopened.placement.circuits[0].breakerAmps, 16);
  assert.equal(electricalBill(reopened.placement, 1).routeMetres, 4);
  assert.equal(calculateProject(reopened).totals.total, before);
});

test('a manual link between sockets does not pretend to reach the panel', () => {
  const items = [
    { id: 'panel', floor: 1, layer: 'electric', kind: 'panel', x: 0, y: 0 },
    { id: 'a', floor: 1, layer: 'electric', kind: 'socket', circuitId: 'c1', x: 2, y: 1 },
    { id: 'b', floor: 1, layer: 'electric', kind: 'socket', circuitId: 'c1', x: 3, y: 1 },
  ];
  const manual = { id: 'manual', floor: 1, circuitId: 'c1', auto: false, fromItemId: 'a', targetItemId: 'b', points: [{ x: 2, y: 1 }, { x: 3, y: 1 }] };
  assert.deepEqual(electricalBill({ items, circuits: [{ id: 'c1', name: 'Розетки' }], routes: [manual] }, 1).unconnected.map(item => item.id), ['a', 'b']);
  const feed = { id: 'feed', floor: 1, circuitId: 'c1', auto: false, fromItemId: 'panel', targetItemId: 'a', points: [{ x: 0, y: 0 }, { x: 2, y: 1 }] };
  assert.deepEqual(electricalBill({ items, circuits: [{ id: 'c1', name: 'Розетки' }], routes: [manual, feed] }, 1).unconnected, []);
});

test('two-way switches create an anchored pair route and remain in the electric bill', () => {
  const items = [
    { id: 'panel', floor: 1, layer: 'electric', kind: 'panel', x: 0, y: 0 },
    { id: 'box', floor: 1, layer: 'electric', kind: 'junction-box', x: 1, y: 0, circuitId: 'c' },
    { id: 'a', floor: 1, layer: 'electric', kind: 'two-way-switch', x: 1, y: 1, circuitId: 'c', pairedSwitchId: 'b', controlsItemId: 'lamp' },
    { id: 'b', floor: 1, layer: 'electric', kind: 'two-way-switch', x: 4, y: 1, circuitId: 'c', pairedSwitchId: 'a', controlsItemId: 'lamp' },
    { id: 'lamp', floor: 1, layer: 'electric', kind: 'light', x: 4, y: 3, circuitId: 'c' },
  ];
  const routes = proposeElectricalCircuitRoutes(items, 1, 'c', 'panel', (() => { let n = 0; return () => `r${++n}`; })());
  assert(routes.some(route => route.fromItemId === 'a' && route.targetItemId === 'b' && route.purpose === 'travellers'));
  assert(routes.some(route => route.fromItemId === 'b' && route.targetItemId === 'lamp'));
  assert.equal(electricalBill({ items, circuits: [{ id: 'c', name: 'Свет' }], routes }, 1).components.find(row => row.name === 'Выключатели и диммеры').quantity, 2);
  items[3].x = 5;
  assert.equal(resolvedElectricalRoutes({ items, routes }, 1).find(route => route.purpose === 'travellers').points.at(-1).x, 5);
});

test('manual electrical waypoints preserve their shape while both endpoints follow devices', () => {
  const placement = { items: [
    { id: 'panel', floor: 1, layer: 'electric', kind: 'panel', x: 0, y: 0 },
    { id: 'socket', floor: 1, layer: 'electric', kind: 'socket', x: 3, y: 2, circuitId: 'c' },
  ], routes: [{ id: 'r', floor: 1, circuitId: 'c', panelItemId: 'panel', fromItemId: 'panel', targetItemId: 'socket', auto: false, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 2 }] }] };
  placement.items[0].x = .5;
  placement.items[1].y = 3;
  const route = resolvedElectricalRoutes(placement, 1)[0];
  assert.deepEqual(route.points, [{ x: .5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 3 }]);
  const reopened = migrateProject({ ...createDefaultProject(), placement });
  assert.equal(resolvedElectricalRoutes(reopened.placement, 1)[0].points.at(-1).y, 3);
});

test('appliance planning defaults add a separate socket or power point without assumed load', () => {
  const byId = id => PLACEMENT_PRESETS.find(preset => preset.id === id);
  assert.equal(applianceSupplyKind(byId('refrigerator')), 'socket');
  assert.equal(applianceSupplyKind(byId('food-disposer')), 'socket');
  assert.equal(applianceSupplyKind(byId('electric-stove')), 'power');
  assert.equal(applianceSupplyKind(byId('bed-nightstands')), '');
});

test('placement survives project import and stays separate from estimate calculations', () => {
  const project = createDefaultProject();
  project.services.engineeringElectric = true;
  const before = calculateProject(project).totals.total;
  project.placement.items.push({ id: 'boiler-1', floor: 1, layer: 'equipment', kind: 'boiler', label: 'Котёл', x: 2, y: 3, width: .7, depth: .5 });
  project.placement.items.push({ id: 'socket-1', floor: 2, layer: 'electric', kind: 'socket', label: 'Розетка', x: 4, y: 5, width: .18, depth: .12, circuitId: 'c1' });
  project.placement.circuits.push({ id: 'c1', name: 'Розетки кухни', cable: '3×2,5' });
  project.placement.routes.push({ id: 'r1', floor: 2, circuitId: 'c1', points: [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 5 }] });
  const opened = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(opened.placement.items[0].label, 'Котёл');
  assert.equal(opened.placement.items[1].floor, 2);
  assert.equal(opened.placement.circuits[0].cable, '3×2,5');
  assert.deepEqual(placementSummary(opened.placement, 2), { furniture: 0, appliance: 0, equipment: 0, electric: 1, routeLength: 7 });
  assert.equal(calculateProject(opened).totals.total, before);
});

test('malformed placement entries are discarded on import', () => {
  const normalized = normalizePlacement({ items: [null, { id: 'bad', layer: 'unknown' }, { id: 'ok', layer: 'furniture', floor: 99, x: '2', y: '3' }], routes: [{ id: 'bad', points: [{ x: 0, y: 0 }] }] });
  assert.equal(normalized.items.length, 1);
  assert.equal(normalized.items[0].floor, 2);
  assert.equal(normalized.routes.length, 0);
});

test('expanded library has unique entries and each one belongs to a visible group', () => {
  const ids = PLACEMENT_PRESETS.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of PLACEMENT_PRESETS) {
    assert(PLACEMENT_GROUPS.some(group => group.id === item.group && group.layer === item.layer), item.id);
    assert(item.width > 0 && item.depth > 0, item.id);
  }
  assert(PLACEMENT_PRESETS.some(item => item.id === 'facade-socket' && item.surface === 'facade'));
  assert(PLACEMENT_PRESETS.some(item => item.id === 'facade-light' && item.surface === 'facade'));
  for (const id of ['hydro-tank', 'expansion-tank', 'gas-stove', 'electric-stove']) assert(PLACEMENT_PRESETS.some(item => item.id === id), id);
});

test('facade points snap outside the contour and dimensions survive import', () => {
  const contour = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }];
  const snapped = snapToFacade({ x: .2, y: 3 }, contour);
  assert.equal(snapped.anchorX, 0);
  assert(snapped.x < 0);
  assert.equal(snapped.y, 3);
  const project = createDefaultProject();
  project.placement.showAutoDimensions = true;
  project.placement.dimensions.push({ id: 'd1', floor: 1, points: [{ x: 1, y: 1 }, { x: 3, y: 1 }], label: 'Проход' });
  const reopened = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(reopened.placement.showAutoDimensions, true);
  assert.equal(reopened.placement.dimensions[0].label, 'Проход');
  assert.equal(dimensionMetres(reopened.placement.dimensions[0].points), 2);
});

test('automatic placement dimensions use the exterior datum and object centres', () => {
  const contour = [{ x: 2, y: 3 }, { x: 10, y: 3 }, { x: 10, y: 9 }, { x: 2, y: 9 }];
  const result = perimeterPlacementDimensions(contour, [{ x: 5.25, y: 6.4 }, { x: 8, y: 6.4 }]);
  assert.deepEqual(result.horizontal.map(station => station.distance), [0, 3.25, 6, 8]);
  assert.deepEqual(result.vertical.map(station => station.distance), [0, 3.4, 6]);
});

test('placement dimensions start at the nearest finished wall face on either side of a partition', () => {
  const plan = { house: { w: 10, h: 8 }, wallThickness: .2, partitionThickness: .1, rooms: [], walls: [{ id: 'middle', x1: 5, y1: .2, x2: 5, y2: 7.8, include: true }] };
  assert.equal(placementWallBands(plan).partitions.length, 1);
  const left = nearestWallDimension(plan, { x: 4, y: 4 });
  const right = nearestWallDimension(plan, { x: 6, y: 4 });
  const outside = nearestWallDimension(plan, { x: .5, y: 4 });
  assert.equal(left.wallType, 'partition');
  assert.equal(right.wallType, 'partition');
  assert.equal(Math.round(left.from.x * 100), 495);
  assert.equal(Math.round(right.from.x * 100), 505);
  assert.equal(Math.round(left.distance * 100), 95);
  assert.equal(Math.round(right.distance * 100), 95);
  assert.equal(outside.wallType, 'outer');
  assert.equal(Math.round(outside.distance * 100), 30);
});

test('facade dimensions use the nearest corner or opening edge on the same facade', () => {
  const plan = { house: { w: 10, h: 8 }, wallThickness: .174, rooms: [], walls: [], openings: [
    { id: 'north-window', type: 'window', outer: true, orientation: 'h', x: 3, y: .087, width: 2 },
    { id: 'south-window', type: 'window', outer: true, orientation: 'h', x: 7, y: 7.913, width: 1 },
    { id: 'east-door', type: 'door', outer: true, orientation: 'v', x: 9.913, y: 3, width: 1 },
  ] };
  const facade = (x, y) => ({ surface: 'facade', x, y: y - .28, anchorX: x, anchorY: y });
  const corner = nearestPlacementDimension(plan, facade(1, 0));
  assert.equal(corner.reference, 'угла');
  assert.deepEqual(corner.from, { x: 0, y: 0 });
  assert.equal(corner.distance, 1);
  const window = nearestPlacementDimension(plan, facade(5.7, 0));
  assert.equal(window.reference, 'окна');
  assert(Math.abs(window.from.x - 5) < .001);
  assert(Math.abs(window.distance - .7) < .001);
  assert.equal(window.to.y, 0);
  const otherFacade = nearestPlacementDimension(plan, facade(8.5, 0));
  assert.equal(otherFacade.reference, 'угла');
  assert(Math.abs(otherFacade.distance - 1.5) < .001);
  const door = nearestPlacementDimension(plan, { surface: 'facade', x: 10.28, y: 4.4, anchorX: 10, anchorY: 4.4 });
  assert.equal(door.reference, 'двери');
  assert(Math.abs(door.distance - .4) < .001);
  assert.equal(door.from.x, 10);
  assert.equal(nearestPlacementDimension(plan, { x: 4, y: 4 }).wallType, 'outer');
});

test('worker sheets separate disciplines per floor and number saved positions', () => {
  const project = createDefaultProject();
  project.meta.floors = 2;
  project.placement.items.push({ id: 'bed-1', floor: 1, layer: 'furniture', kind: 'bed', x: 2, y: 3, width: 2, depth: 1.6 });
  project.placement.items.push({ id: 'socket-1', floor: 1, layer: 'electric', kind: 'socket', x: 4, y: 3, width: .18, depth: .12 });
  project.placement.items.push({ id: 'boiler-1', floor: 2, layer: 'equipment', kind: 'boiler', x: 3, y: 2, width: .7, depth: .5 });
  const sheets = buildPlacementSheets(project);
  assert.equal(sheets.length, 4);
  assert.deepEqual(sheets.map(sheet => sheet.items.map(entry => entry.mark)), [['Р-01'], ['Э-01'], ['Р-01'], []]);
  assert.equal(sheets[0].items[0].item.id, 'bed-1');
  assert.equal(sheets[1].items[0].item.id, 'socket-1');
  assert.equal(sheets[2].items[0].item.id, 'boiler-1');
});

test('electrical wall snap and left/right datum use finished faces without moving the plan', () => {
  const plan = { house: { w: 10, h: 8 }, wallThickness: .2, partitionThickness: .1, rooms: [], walls: [{ id: 'middle', x1: 5, y1: .2, x2: 5, y2: 7.8, include: true }] };
  const left = snapPlacementToWall(plan, { x: .31, y: 3 }, { width: .18, depth: .12 });
  assert.deepEqual(left, { x: .29, y: 3 });
  const right = electricalSettingOutDimension(plan, { x: 7, y: 3, dimensionSide: 'right' });
  assert.equal(right.side, 'right');
  assert.equal(Math.round(right.from.x * 100), 980);
  assert.equal(Math.round(right.distance * 100), 280);
  assert.equal(plan.walls[0].x1, 5);
});

test('routes follow moved panel and points; BOM survives reopen without changing the estimate', () => {
  const project = createDefaultProject();
  const before = calculateProject(project).totals.total;
  project.placement.items.push({ id: 'panel', floor: 1, layer: 'electric', kind: 'panel', x: 1, y: 1, width: .45, depth: .16 });
  project.placement.items.push({ id: 'socket', floor: 1, layer: 'electric', kind: 'socket', x: 4, y: 3, width: .18, depth: .12, circuitId: 'c1', showHeight: true, showName: true, labelOffsetX: .8, labelOffsetY: -.6, dimensionSide: 'left' });
  project.placement.circuits.push({ id: 'c1', name: 'Розетки', cable: '3×2,5' });
  project.placement.routes.push({ id: 'r1', floor: 1, circuitId: 'c1', auto: true, panelItemId: 'panel', targetItemId: 'socket', points: [{ x: 1, y: 1 }, { x: 4, y: 3 }] });
  const reopened = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(electricalBill(reopened.placement, 1).routeMetres, 5);
  assert.equal(electricalBill(reopened.placement, 1).components.find(row => row.name === 'Подрозетники').quantity, 1);
  assert.equal(reopened.placement.items[1].showName, true);
  assert.equal(reopened.placement.items[1].dimensionSide, 'left');
  reopened.placement.items[0].x = 2;
  assert.equal(resolvedElectricalRoutes(reopened.placement, 1)[0].points[0].x, 2);
  assert.equal(electricalBill(reopened.placement, 1).routeMetres, 4);
  reopened.placement.routes.push({ id: 'manual', floor: 1, circuitId: 'c1', panelItemId: 'panel', points: [{ x: 1, y: 1 }, { x: 2, y: 4 }] });
  assert.equal(resolvedElectricalRoutes(reopened.placement, 1)[1].points[0].x, 2);
  assert.equal(calculateProject(reopened).totals.total, before);
});
