import test from 'node:test';
import assert from 'node:assert/strict';
import { NODE_HOUSE_LAYERS, groupNodesAtAnchors, layerForNode, nextNodeAtAnchor } from '../src/react/screens/node-house-layers.js';

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

test('coincident nodes stay at their exact anchor and can be selected in turn', () => {
  const nodes = [
    { id: 'a', x: 1.25, y: 2.5, floor: 1, type: 'SIP_SPLINE' },
    { id: 'b', x: 1.25, y: 2.5, floor: 1, type: 'SIP_WALL_T' },
    { id: 'c', x: 1.25, y: 2.5, floor: 1, type: 'RAFTER_TO_MAUERLAT' },
  ];
  const onPlan = groupNodesAtAnchors(nodes);
  assert.equal(onPlan.length, 1);
  assert.deepEqual([onPlan[0].x, onPlan[0].y], [1.25, 2.5]);
  assert.equal(nextNodeAtAnchor(onPlan[0], null)?.id, 'a');
  assert.equal(nextNodeAtAnchor(onPlan[0], 'a')?.id, 'b');
  assert.equal(nextNodeAtAnchor(onPlan[0], 'c')?.id, 'a');
  const in3d = groupNodesAtAnchors(nodes, { separateLayers: true });
  assert.equal(in3d.length, 2);
  assert.deepEqual(in3d.map(group => group.layer), ['walls', 'roof']);
});
