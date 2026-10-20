import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { normalizePlacement, placementSummary, PLACEMENT_GROUPS, PLACEMENT_PRESETS } from '../src/react/state/placement-model.js';
import { dimensionMetres, snapToFacade } from '../src/react/state/placement-geometry.js';
import { perimeterPlacementDimensions } from '../src/react/state/placement-dimensions.js';
import { buildPlacementSheets } from '../src/react/export/placement-sheets.js';
import { nearestWallDimension, placementWallBands } from '../src/react/state/placement-walls.js';

test('old projects receive an empty placement layer without changing the estimate', () => {
  const old = createDefaultProject();
  old.services.engineeringElectric = true;
  delete old.placement;
  const before = calculateProject(old).totals.total;
  const migrated = migrateProject(old);
  assert.deepEqual(migrated.placement.items, []);
  assert.deepEqual(migrated.placement.networks, { plumbing: [], heating: [], ventilation: [] });
  assert.equal(calculateProject(migrated).totals.total, before);
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
