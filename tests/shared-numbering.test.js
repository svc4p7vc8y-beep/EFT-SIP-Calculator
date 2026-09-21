import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultProject, createProjectWithCurrentPrices, migrateProject } from '../src/react/state/project-model.js';
import { applyResidentialPreset } from '../src/react/state/residential-preset.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('new residential project starts with clean geometry, standard settings and local creation date', () => {
  const old = createDefaultProject();
  old.meta.customer = 'Старый заказчик';
  old.settings.roof.shape = 'flat';
  const next = applyResidentialPreset(createProjectWithCurrentPrices(old));
  const now = new Date();
  const localDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  assert.equal(next.meta.date, localDate);
  assert.equal(next.meta.customer, '');
  assert.equal(next.settings.roof.shape, 'gable');
  assert.equal(next.settings.sip.floorThickness, '224');
  assert.equal(next.settings.sip.wallThickness, '174');
  assert.equal(next.settings.piles.autoLayoutMode, 'uniform');
  assert.deepEqual(migrateProject(next).settings.roof.shape, 'gable');
});

test('API assigns project and application numbers inside the insert transactions', () => {
  const api = source('../server/beget-api/api.php');
  const bootstrap = source('../server/beget-api/bootstrap.php');
  const migration = source('../server/beget-api/migrate.php');
  assert.match(api, /\$pdo->beginTransaction\(\);\s*\$number = 'EFT-' \. str_pad\(\(string\)eft_next_counter\('application'\)/);
  assert.match(api, /\$pdo->beginTransaction\(\);\s*\$number = eft_next_project_number\(\);/);
  assert.match(api, /INSERT INTO eft_project_versions \(project_id, revision, payload, saved_by, reason\)/);
  assert.match(bootstrap, /SELECT next_value FROM eft_counters WHERE counter_key = \? FOR UPDATE/);
  assert.match(migration, /existingApplications.*COUNT\(\*\) FROM eft_questionnaires/);
});
