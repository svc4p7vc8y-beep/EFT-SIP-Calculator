import test from 'node:test';
import assert from 'node:assert/strict';
import { roofOutline } from '../src/react/planner/roof-outline.js';

test('roof outline preserves the internal corner of an L-shaped house with overhangs', () => {
  const shape = [{x:0,y:0},{x:10,y:0},{x:10,y:4},{x:4,y:4},{x:4,y:8},{x:0,y:8}];
  const result = roofOutline(shape, .5, .5);
  assert.deepEqual(result, [{x:-.5,y:-.5},{x:10.5,y:-.5},{x:10.5,y:4.5},{x:4.5,y:4.5},{x:4.5,y:8.5},{x:-.5,y:8.5}]);
  assert.deepEqual(roofOutline([...shape].reverse(), .5, .5).reverse(), result);
});
