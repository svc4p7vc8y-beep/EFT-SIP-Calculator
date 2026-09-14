import test from 'node:test';
import assert from 'node:assert/strict';
import { platformRoofFrame } from '../src/react/planner/platform-roof-frame.js';

const house = { w: 10, h: 10 };
for (const [side, x, y, w, h] of [['bottom', 2, 10, 6, 3], ['top', 2, -3, 6, 3], ['left', -3, 2, 3, 6], ['right', 10, 2, 3, 6]]) {
  for (const shape of ['shed', 'continuation', 'gable']) {
    test(`${side} ${shape}: rafters stay within roof and use requested spacing`, () => {
      const platform = { x, y, w, h, roof: { mode: 'cold', shape } };
      const frame = platformRoofFrame(platform, house, 0.6);
      const {x1,y1,x2,y2} = frame.bounds;
      assert.ok(frame.rafters.length > 2);
      for (const segment of frame.rafters) for (const point of segment) {
        assert.ok(point.x >= x1-1e-8 && point.x <= x2+1e-8);
        assert.ok(point.y >= y1-1e-8 && point.y <= y2+1e-8);
      }
      assert.equal(Boolean(frame.ridge), shape === 'gable');
      assert.ok(platformRoofFrame(platform, house, 0.3).rafters.length > frame.rafters.length);
      if (frame.ridge) assert.ok(frame.rafters.every(pair => pair.some(point =>
        Math.abs(point.x-frame.ridge[0].x) < 1e-8 && Math.abs(point.x-frame.ridge[1].x) < 1e-8 ||
        Math.abs(point.y-frame.ridge[0].y) < 1e-8 && Math.abs(point.y-frame.ridge[1].y) < 1e-8)));
    });
  }
}
test('unroofed and zero-size platforms have no frame', () => {
  assert.equal(platformRoofFrame({w:4,h:3}, house), null);
  assert.equal(platformRoofFrame({w:0,h:3,roof:{mode:'warm'}}, house), null);
});
