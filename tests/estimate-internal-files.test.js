import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { estimateFileUrl, normalizeEstimateFiles } from '../src/react/state/estimate-files.js';

test('internal document references survive project reopen and do not alter prices', () => {
  const project = createDefaultProject();
  const prices = structuredClone(project.priceMat);
  project.estimateFiles = [{ id: 'local-1', source: 'shared', sourceId: '123e4567-e89b-42d3-a456-426614174000', name: 'Чертёж крыши.pdf', mime: 'application/pdf' }];
  const reopened = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(reopened.estimateFiles, project.estimateFiles);
  assert.deepEqual(reopened.priceMat, prices);
  assert.equal(estimateFileUrl(reopened.estimateFiles[0], 'https://eftsip.ru/api/api.php'), 'https://eftsip.ru/api/api.php?action=file-download&id=123e4567-e89b-42d3-a456-426614174000');
});

test('invalid internal references and duplicate server files are discarded', () => {
  const valid = { id: 'local-1', source: 'questionnaire', sourceId: '123e4567-e89b-42d3-a456-426614174000', name: 'Эскиз.png' };
  const normalized = normalizeEstimateFiles([valid, valid, { ...valid, source: 'other' }, { ...valid, sourceId: '../secret' }]);
  assert.equal(normalized.length, 1);
  assert.equal(estimateFileUrl(normalized[0], 'https://eftsip.ru/api/api.php'), 'https://eftsip.ru/api/api.php?action=attachment&id=123e4567-e89b-42d3-a456-426614174000');
  assert.equal(estimateFileUrl({ source: 'crm', sourceId: '42', name: 'CRM-план.pdf' }, 'https://eftsip.ru/api/api.php'), 'https://crm.eftsip.ru/api/api.php?action=files.download&id=42');
});
