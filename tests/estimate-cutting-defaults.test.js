import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClientEstimate, unpricedClientLines } from '../src/react/calculations/client-estimate.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { applyResidentialPreset } from '../src/react/state/residential-preset.js';

test('roof and SIP cutting remain priced and visible with assembly disabled, including compact mode', () => {
  const cut = { id: 'roof:sip-cut', name: 'Раскрой сип-панелей', kind: 'labor', qty: 10, price: 20 };
  const assembly = { id: 'roof:assembly', name: 'Сборка крыши', kind: 'labor', qty: 1, price: 500 };
  const calculation = { lines: [cut, assembly], sections: [{ key: 'roof', title: 'Крыша', lines: [cut, assembly] }] };
  for (const maximumCompact of [false, true]) {
    const result = buildClientEstimate(calculation, { includeLabor: false, maximumCompact });
    assert.deepEqual(result.sections[0].lines.map(row => row.id), [cut.id]);
    assert.equal(result.totals.total, 200);
  }
  assert.deepEqual(unpricedClientLines({ lines: [{ ...cut, price: 0 }, assembly] }, { includeLabor: false }).map(row => row.id), [cut.id]);
});

test('new and residential projects use uniform piles and board pack while saved choices survive migration', () => {
  const project = createDefaultProject();
  assert.equal(project.settings.piles.autoLayoutMode, 'uniform');
  assert.equal(project.settings.sip.connectorType, 'board-pack');
  project.settings.piles.autoLayoutMode = 'nodes';
  project.settings.sip.connectorType = 'thermal';
  const restored = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.settings.piles.autoLayoutMode, 'nodes');
  assert.equal(restored.settings.sip.connectorType, 'thermal');
  applyResidentialPreset(restored);
  assert.equal(restored.settings.piles.autoLayoutMode, 'uniform');
  assert.equal(restored.settings.sip.connectorType, 'board-pack');
});
