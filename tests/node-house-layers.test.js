import test from 'node:test';
import assert from 'node:assert/strict';
import { NODE_HOUSE_LAYERS, layerForNode } from '../src/react/screens/node-house-layers.js';

test('3D node layers cover foundation, floor, walls and roof without changing node data', () => {
  assert.deepEqual(NODE_HOUSE_LAYERS.map(([key]) => key), ['foundation', 'floor', 'walls', 'roof']);
  const cases = [
    [{ type: 'PILE_BINDING' }, 'foundation'],
    [{ type: 'FLOOR_PANEL' }, 'floor'],
    [{ type: 'SIP_SPLINE', section: 'СИП' }, 'walls'],
    [{ type: 'RAFTER_TO_MAUERLAT' }, 'roof'],
    [{ section: 'Кровля' }, 'roof'],
    [{}, 'walls'],
  ];
  for (const [node, expected] of cases) {
    const before = structuredClone(node);
    assert.equal(layerForNode(node), expected);
    assert.deepEqual(node, before);
  }
});
