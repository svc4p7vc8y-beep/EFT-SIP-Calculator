import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { normalizePlacement, placementSummary } from '../src/react/state/placement-model.js';

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
