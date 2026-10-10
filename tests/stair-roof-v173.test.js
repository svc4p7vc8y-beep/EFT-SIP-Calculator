import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, ensureProjectFloorCount, migrateProject } from '../src/react/state/project-model.js';
import { fitFloorOpening } from '../src/react/planner/geometry.js';
import { stairStepGeometry } from '../src/react/planner/stair-steps.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';

test('stair direction survives geometry fitting and project migration, including old projects', () => {
  const project = createDefaultProject();
  ensureProjectFloorCount(project, 2);
  const house = project.upperFloors[0].house;
  const opening = { x: 2, y: 3, width: 1.2, length: 2.5 };
  project.upperFloors[0].floorOpening = fitFloorOpening({ ...opening, direction: 'up' }, house);
  assert.equal(migrateProject(JSON.parse(JSON.stringify(project))).upperFloors[0].floorOpening.direction, 'up');
  project.upperFloors[0].floorOpening = opening;
  assert.equal(migrateProject(JSON.parse(JSON.stringify(project))).upperFloors[0].floorOpening.direction, 'right');
  assert.equal(fitFloorOpening({ ...opening, direction: 'bad' }, house).direction, 'right');
});

test('stair treads rotate with the ascent arrow in all four directions', () => {
  const box = { x: 10, y: 20, width: 120, height: 180 };
  for (const direction of ['right', 'left', 'up', 'down']) {
    const geometry = stairStepGeometry(box, direction);
    assert.equal(geometry.treads.length, 12);
    assert.ok(geometry.head.includes(','));
    assert.equal(geometry.treads[0].x1 === geometry.treads[0].x2, direction === 'right' || direction === 'left');
    if (direction === 'right') assert.ok(geometry.arrow.x2 > geometry.arrow.x1);
    if (direction === 'left') assert.ok(geometry.arrow.x2 < geometry.arrow.x1);
    if (direction === 'up') assert.ok(geometry.arrow.y2 < geometry.arrow.y1);
    if (direction === 'down') assert.ok(geometry.arrow.y2 > geometry.arrow.y1);
  }
});

test('C21 and ST15 differ only in sheet price, not roofing area or installation rate', () => {
  const project = createDefaultProject();
  const c21 = calculateProject(project);
  const c21Sheet = c21.lines.find(line => line.id === 'roof:cover');
  const c21Work = c21.lines.find(line => line.id === 'roof:cover-work');
  assert.equal(c21Sheet.catalogId, 'MAT-041');
  assert.equal(c21Sheet.price, 800);
  project.settings.roof.covering = 'profile-st15';
  const st15 = calculateProject(project);
  const st15Sheet = st15.lines.find(line => line.id === 'roof:cover');
  const st15Work = st15.lines.find(line => line.id === 'roof:cover-work');
  assert.equal(st15Sheet.catalogId, 'MAT-245');
  assert.equal(st15Sheet.price, 950);
  assert.equal(st15Sheet.qty, c21Sheet.qty);
  assert.equal(st15Work.catalogId, 'LAB-031');
  assert.equal(st15Work.price, c21Work.price);
  assert.equal(st15Work.qty, c21Work.qty);
});

test('C21 migration upgrades only the former standard price and adds ST15', () => {
  const legacy = createDefaultProject();
  legacy.appVersion = 172;
  legacy.priceMat.find(item => item.id === 'MAT-041').price = 620;
  legacy.priceMat = legacy.priceMat.filter(item => item.id !== 'MAT-245');
  const migrated = migrateProject(legacy);
  assert.equal(migrated.priceMat.find(item => item.id === 'MAT-041').price, 800);
  assert.equal(migrated.priceMat.find(item => item.id === 'MAT-245').price, 950);
  legacy.priceMat.find(item => item.id === 'MAT-041').price = 777;
  assert.equal(migrateProject(legacy).priceMat.find(item => item.id === 'MAT-041').price, 777);
});
