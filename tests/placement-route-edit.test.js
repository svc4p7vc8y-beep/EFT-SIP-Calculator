import test from 'node:test';
import assert from 'node:assert/strict';
import { insertRoutePoint, pointOnRouteSegment, shiftRouteSegment } from '../src/react/state/placement-route-edit.js';

test('clicking a route segment inserts a point on the line with interpolated height', () => {
  const source = [{ x: 1, y: 2, z: .9 }, { x: 3, y: 2, z: 2.1 }];
  const point = pointOnRouteSegment(source, 0, { x: 2.12, y: 2.24 });
  assert.deepEqual(point, { x: 2.12, y: 2, z: 1.57 });
  assert.deepEqual(insertRoutePoint(source, 0, point), [source[0], point, source[1]]);
  assert.equal(pointOnRouteSegment(source, 0, { x: 1.01, y: 2 }), null);
  assert.deepEqual(source, [{ x: 1, y: 2, z: .9 }, { x: 3, y: 2, z: 2.1 }]);
});

test('dragging horizontal and vertical segments creates orthogonal elbows and fixes route endpoints', () => {
  const horizontal = [{ x: 1, y: 2, z: .9 }, { x: 3, y: 2, z: .9 }];
  const shiftedHorizontal = shiftRouteSegment(horizontal, 0, .4);
  assert.deepEqual(shiftedHorizontal, [horizontal[0], { x: 1, y: 2.4, z: .9 }, { x: 3, y: 2.4, z: .9 }, horizontal[1]]);
  const vertical = [{ x: 2, y: 1, z: 2 }, { x: 2, y: 3, z: 2 }];
  const shiftedVertical = shiftRouteSegment(vertical, 0, -.35);
  assert.deepEqual(shiftedVertical, [vertical[0], { x: 1.65, y: 1, z: 2 }, { x: 1.65, y: 3, z: 2 }, vertical[1]]);
  assert.equal(shiftRouteSegment([{ x: 0, y: 0 }, { x: 1, y: 1 }], 0, .2), null);
});
