import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedProjectFilename, suggestedProjectFilename } from '../src/react/export/project-file-name.js';

test('project file includes its name and number without a brand prefix', () => {
  const meta = { projectName: 'Дом у озера', projectNum: '0042', date: '2026-10-23' };
  assert.equal(suggestedProjectFilename(meta), 'Дом_у_озера_№0042_2026-10-23.eft.json');
  assert.equal(normalizedProjectFilename('Новый план.eft.json', meta), 'Новый_план.eft.json');
  assert.equal(normalizedProjectFilename('Дом: север/юг?.json', meta), 'Дом_север_юг.eft.json');
  assert.equal(normalizedProjectFilename('', meta), suggestedProjectFilename(meta));
});
