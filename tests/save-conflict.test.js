import test from 'node:test';
import assert from 'node:assert/strict';
import { describeProjectSaveConflict } from '../src/react/cloud/save-conflict.js';

test('project save conflict identifies the project and both revisions', () => {
  const message = describeProjectSaveConflict(
    { name: 'Дом Иванова', revision: 7 },
    { currentRevision: 9 },
  );
  assert.match(message, /Дом Иванова/);
  assert.match(message, /Открыта ревизия 7, на сервере уже ревизия 9/);
  assert.match(message, /Сохраните их в файл \.eft\.json/);
});

test('project save conflict remains clear when server omits revision details', () => {
  const message = describeProjectSaveConflict({ name: 'Дом', revision: 2 }, {});
  assert.match(message, /Версия проекта на сервере изменилась/);
  assert.doesNotMatch(message, /NaN/);
});
