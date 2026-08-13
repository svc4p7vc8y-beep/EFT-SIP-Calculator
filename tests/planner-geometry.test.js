import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allOpeningSegments, boundsOf, dimensionOutsideHouse, movePoints, nearestSegment, planIssues,
  rectanglePoints, unifiedWallSegments
} from '../src/react/planner/geometry.js';

const room = (id, name, x1, y1, x2, y2) => ({
  id, name, points: rectanglePoints({ x: x1, y: y1 }, { x: x2, y: y2 })
});

test('adjacent room walls are merged into one shared wall', () => {
  const plan = {
    house: { w: 10, h: 8 }, wallThickness: 0.174,
    rooms: [room('a', 'A', 0.174, 0.174, 5, 7.826), room('b', 'B', 5, 0.174, 9.826, 7.826)], walls: []
  };
  const walls = unifiedWallSegments(plan);
  const shared = walls.filter((wall) => wall.axis === 'v' && Math.abs(wall.fixed - 5) < 0.01);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].start, 0.174);
  assert.equal(shared[0].end, 7.826);
  assert.equal(walls.length, 1, 'outer room edges are provided by the exterior wall');
});

test('room movement can stage a room outside the house and still snaps to the grid', () => {
  const plan = { house: { w: 10, h: 8 }, wallThickness: 0.174 };
  const moved = movePoints(rectanglePoints({ x: 1, y: 1 }, { x: 4, y: 3 }), -4, 10, plan, { xs: [0.174], ys: [5.826] });
  assert.deepEqual(boundsOf(moved), { x: -3, y: 11, x2: 0, y2: 13, w: 3, h: 2 });
});

test('opening placement selects the closest shared or outside wall', () => {
  const plan = {
    house: { w: 10, h: 8 }, wallThickness: 0.174,
    rooms: [room('a', 'A', 0.174, 0.174, 5, 7.826), room('b', 'B', 5, 0.174, 9.826, 7.826)], walls: []
  };
  const inside = nearestSegment({ x: 5.08, y: 4 }, allOpeningSegments(plan));
  const outside = nearestSegment({ x: 9.95, y: 4 }, allOpeningSegments(plan));
  assert.equal(inside.outer, false);
  assert.equal(inside.fixed, 5);
  assert.equal(outside.outer, true);
  assert.equal(outside.fixed, 10);
});

test('plan diagnostics marks overlaps and rooms outside the house', () => {
  const plan = {
    house: { w: 10, h: 8 }, wallThickness: 0.174,
    rooms: [room('a', 'A', 1, 1, 5, 5), room('b', 'B', 4, 4, 7, 7), room('c', 'C', -1, 2, 0.5, 3)], walls: []
  };
  const issues = planIssues(plan);
  assert.ok(issues.some((issue) => issue.type === 'overlap' && issue.roomIds.includes('a') && issue.roomIds.includes('b')));
  assert.ok(issues.some((issue) => issue.type === 'outside' && issue.roomIds.includes('c')));
});

test('plan diagnostics marks a gap between formerly adjacent rooms', () => {
  const plan = {
    house: { w: 10, h: 8 }, wallThickness: 0.174,
    rooms: [room('a', 'A', 0.174, 0.174, 4.8, 7.826), room('b', 'B', 5, 0.174, 9.826, 7.826)], walls: []
  };
  const issues = planIssues(plan);
  assert.ok(issues.some((issue) => issue.type === 'gap' && issue.roomIds.includes('a')));
  assert.ok(issues.some((issue) => issue.type === 'gap' && issue.roomIds.includes('b')));
});

test('new dimension lines are moved outside the house and keep their measured span', () => {
  const horizontal = dimensionOutsideHouse({ x1: 2, y1: 3, x2: 8, y2: 3.2 }, { w: 10, h: 8 });
  assert.deepEqual(horizontal, { x1: 2, y1: -0.8, x2: 8, y2: -0.8 });
  const vertical = dimensionOutsideHouse({ x1: 7, y1: 2, x2: 7.1, y2: 7 }, { w: 10, h: 8 });
  assert.deepEqual(vertical, { x1: 10.8, y1: 2, x2: 10.8, y2: 7 });
});
