import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlacement } from '../src/react/state/placement-model.js';
import { CIRCUIT_COLORS, nextCircuitColor, uniqueCircuitColors } from '../src/react/state/placement-circuit-colors.js';
import { electricalGroupColor } from '../src/react/state/placement-visibility.js';

test('legacy circuits receive stable, distinct colors and preserve visibility when reopened', () => {
  const old = { circuits: Array.from({ length: 18 }, (_, index) => ({ id: `group-${index}`, name: `Группа ${index}` })), items: [], routes: [] };
  const saved = JSON.stringify(normalizePlacement(old));
  const reopened = normalizePlacement(JSON.parse(saved));
  const colors = reopened.circuits.map(circuit => electricalGroupColor(circuit.id, reopened.circuits));
  assert.equal(new Set(colors).size, old.circuits.length);
  assert.deepEqual(colors.slice(0, 8), CIRCUIT_COLORS.slice(0, 8));
  assert.deepEqual(colors, normalizePlacement(reopened).circuits.map(circuit => circuit.color));
  assert.deepEqual(reopened.hiddenCircuitLineIds, []);
  assert.deepEqual(reopened.hiddenCircuitPointIds, []);
});

test('saved circuit visibility is independent for routes and points', () => {
  const reopened = normalizePlacement(JSON.parse(JSON.stringify({ circuits: [{ id: 'a', name: 'Свет', color: '#123456' }, { id: 'b', name: 'Розетки', color: '#123456' }], hiddenCircuitLineIds: ['a'], hiddenCircuitPointIds: ['b'] })));
  assert.deepEqual(reopened.hiddenCircuitLineIds, ['a']);
  assert.deepEqual(reopened.hiddenCircuitPointIds, ['b']);
  assert.equal(reopened.circuits[0].color, '#123456');
  assert.notEqual(reopened.circuits[1].color, '#123456');
});

test('new circuit receives an unused color after the preset palette fills', () => {
  const circuits = uniqueCircuitColors(Array.from({ length: CIRCUIT_COLORS.length + 2 }, (_, index) => ({ id: `${index}` })));
  const next = nextCircuitColor(circuits);
  assert.match(next, /^#[0-9a-f]{6}$/);
  assert.equal(circuits.some(circuit => circuit.color === next), false);
});
