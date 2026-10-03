import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultProject, ensureProjectFloorCount, migrateProject } from '../src/react/state/project-model.js';
import { fitFloorOpening } from '../src/react/planner/geometry.js';

test('stair tool offers an explicit second-floor action and activates drawing afterward', () => {
  const source = readFileSync(new URL('../src/react/screens/PlanScreen.jsx', import.meta.url), 'utf8');
  assert.match(source, /id === "stairOpening" && floorCount < 2[\s\S]*?setStairSetupRequired\(true\)/);
  assert.match(source, /onClick=\{\(\) => addSecondFloor\(true\)\}/);
  assert.match(source, /setTool\(startStairOpening \? "stairOpening" : "select"\)/);
  assert.match(source, /if \(id === "stairOpening"\) scrollToPlanCanvas\(\)/);
});

test('the linked opening survives a save/migration without altering the first-floor plan', () => {
  const project = createDefaultProject();
  const originalRooms = structuredClone(project.plan.rooms);
  ensureProjectFloorCount(project, 2);
  project.upperFloors[0].floorOpening = fitFloorOpening({ x: 2, y: 3, width: 1.2, length: 2.5 }, project.upperFloors[0].house);
  const restored = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.meta.floors, 2);
  assert.deepEqual(restored.upperFloors[0].floorOpening, { x: 2, y: 3, width: 1.2, length: 2.5, direction: 'right' });
  assert.deepEqual(restored.plan.rooms, originalRooms);
});
