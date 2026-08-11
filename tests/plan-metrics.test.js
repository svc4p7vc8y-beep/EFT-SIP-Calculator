import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlanMetrics, calculateSipCutting, chooseDimensionSides, roofGeometry } from '../src/calculations/plan-metrics.js';

test('shared and partially overlapping room walls count once', () => {
  const plan = {
    house: { w: 10, h: 8 }, wallThickness: 0.2, wallHeight: 2.5,
    rooms: [
      { x: 0.2, y: 0.2, w: 4.8, h: 7.6 },
      { x: 5, y: 0.2, w: 4.8, h: 3.8 },
      { x: 5, y: 4, w: 4.8, h: 3.8 }
    ],
    walls: [], openings: []
  };
  const metrics = calculatePlanMetrics(plan);
  assert.equal(metrics.partitionLength, 12.4);
});

test('outer openings reduce exterior walls and interior doors reduce partitions', () => {
  const plan = {
    house: { w: 6, h: 4 }, wallThickness: 0.2, wallHeight: 2.5,
    rooms: [
      { x: 0.2, y: 0.2, w: 2.8, h: 3.6 },
      { x: 3, y: 0.2, w: 2.8, h: 3.6 }
    ],
    walls: [],
    openings: [
      { type: 'window', width: 1.2, height: 1.2, outer: true },
      { type: 'door', width: 0.8, height: 2, outer: false }
    ]
  };
  const metrics = calculatePlanMetrics(plan);
  assert.equal(metrics.partitionLength, 3.6);
  assert.equal(metrics.partitionNetArea, 7.4);
  assert.equal(metrics.exteriorWallNetArea, 48.56);
});

test('SIP cutting covers floor, walls, ceiling, partitions and roof', () => {
  const rows = calculateSipCutting({ floor: 50, walls: 80, ceiling: 50, partitions: 30, roof: 70 });
  assert.deepEqual(rows.map((row) => row.key), ['floor', 'walls', 'ceiling', 'partitions', 'roof']);
  assert.ok(rows.every((row) => row.panels > 0));
  assert.ok(rows.every((row) => row.cutMeters > 0));
});

test('ridge height determines slope and gable areas', () => {
  const geometry = roofGeometry({ span: 8, ridgeLength: 10, ridgeHeight: 3 });
  assert.equal(geometry.slopeLength, 5);
  assert.equal(geometry.slopeArea, 50);
  assert.equal(geometry.totalSlopeArea, 100);
  assert.equal(geometry.gableArea, 24);
  assert.equal(geometry.slopeCoefficient, 1.25);
});

test('house dimensions move to the free perimeter side', () => {
  const leftTerrace = chooseDimensionSides({
    house: { w: 10, h: 8 },
    platforms: [{ x: -3, y: 0, w: 3, h: 8, steps: 3, tread: 0.3, stairSide: 'left' }]
  });
  assert.equal(leftTerrace.vertical, 'right');
  assert.equal(leftTerrace.horizontal, 'top');

  const topTerrace = chooseDimensionSides({
    house: { w: 10, h: 8 },
    platforms: [{ x: 0, y: -2, w: 10, h: 2, steps: 2, tread: 0.3, stairSide: 'top' }]
  });
  assert.equal(topTerrace.horizontal, 'bottom');
});
