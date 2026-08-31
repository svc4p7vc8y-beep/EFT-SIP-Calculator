import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_NAME_GROUPS } from '../src/react/data/room-names.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';

test('room name presets are unique and include numbered bedrooms and common rooms', () => {
  const names = ROOM_NAME_GROUPS.flatMap(group => group.names);
  assert.equal(new Set(names).size, names.length);
  for (const name of ['Спальня 1', 'Спальня 2', 'Спальня 3', 'Спальня 4', 'Спальня 5', 'Кухня', 'Кухня-гостиная', 'Санузел', 'Котельная']) assert.ok(names.includes(name));
});

test('preset and custom room names survive project save and do not change quantities or prices', () => {
  const project = createDefaultProject();
  const before = calculateProject(project);
  for (const name of ['Спальня 5', 'Моя комната для творчества']) {
    project.plan.rooms[0].name = name;
    const restored = migrateProject(JSON.parse(JSON.stringify(project)));
    assert.equal(restored.plan.rooms[0].name, name);
    assert.deepEqual(calculateProject(restored).totals, before.totals);
    assert.deepEqual(calculateProject(restored).lines.map(line => line.qty), before.lines.map(line => line.qty));
  }
});
