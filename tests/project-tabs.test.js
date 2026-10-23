import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { createProjectWorkspace, projectWorkspaceReducer, restoreProjectWorkspace, serializeProjectWorkspace } from '../src/react/state/project-tabs.js';

test('each open project keeps its own edits and undo history', () => {
  const first = createDefaultProject();
  first.meta.projectNum = '101';
  const second = createDefaultProject();
  second.meta.projectNum = '202';
  let state = createProjectWorkspace(first, 'first');
  state = projectWorkspaceReducer(state, { type: 'commit', update: (project) => { project.meta.customer = 'Первый'; return project; } });
  state = projectWorkspaceReducer(state, { type: 'open-tab', id: 'second', project: second, serverId: 42, serverName: 'Второй', serverRevision: 3 });
  state = projectWorkspaceReducer(state, { type: 'commit', update: (project) => { project.meta.customer = 'Второй'; return project; } });
  state = projectWorkspaceReducer(state, { type: 'undo' });
  assert.equal(state.tabs[1].history.present.meta.customer, second.meta.customer);
  state = projectWorkspaceReducer(state, { type: 'activate-tab', id: 'first' });
  assert.equal(state.tabs[0].history.present.meta.customer, 'Первый');
  assert.equal(state.tabs[0].history.past.length, 1);
  state = projectWorkspaceReducer(state, { type: 'undo' });
  assert.equal(state.tabs[0].history.present.meta.customer, first.meta.customer);
  assert.equal(state.tabs[1].history.present.meta.projectNum, '202');
});

test('closing a tab selects a neighbor and saved tabs restore project data', () => {
  const first = createDefaultProject();
  first.meta.projectNum = '101';
  const second = createDefaultProject();
  second.meta.projectNum = '202';
  let state = createProjectWorkspace(first, 'first');
  state = projectWorkspaceReducer(state, { type: 'open-tab', id: 'second', project: second, serverId: 42, serverName: 'Второй', serverRevision: 3 });
  const restored = restoreProjectWorkspace(serializeProjectWorkspace(state, 'user-1'), first);
  assert.equal(restored.activeId, 'second');
  assert.equal(restored.tabs[1].serverRevision, 3);
  assert.equal(restored.tabs[1].history.present.meta.projectNum, '202');
  state = projectWorkspaceReducer(restored, { type: 'close-tab', id: 'second' });
  assert.equal(state.activeId, 'first');
  assert.equal(state.tabs.length, 1);
  assert.equal(projectWorkspaceReducer(state, { type: 'close-tab', id: 'first' }), state);
});

test('a library project keeps one dedicated tab through save and reload', () => {
  const first = createDefaultProject();
  const libraryProject = createDefaultProject();
  libraryProject.meta.projectName = 'Дом из библиотеки';
  let state = createProjectWorkspace(first, 'first');
  state = projectWorkspaceReducer(state, { type: 'open-tab', id: 'library', project: libraryProject, libraryId: 'plan-42', serverName: 'Дом из библиотеки' });
  state = projectWorkspaceReducer(state, { type: 'commit', update: project => { project.meta.customer = 'Заказчик'; return project; } });
  state = projectWorkspaceReducer(state, { type: 'open-tab', id: 'duplicate', project: libraryProject, libraryId: 'plan-42' });
  assert.equal(state.tabs.length, 2);
  assert.equal(state.activeId, 'library');
  const restored = restoreProjectWorkspace(serializeProjectWorkspace(state, 'local'), first);
  assert.equal(restored.tabs[1].libraryId, 'plan-42');
  assert.equal(restored.tabs[1].history.present.meta.customer, 'Заказчик');
  assert.equal(restored.tabs[0].history.present.meta.customer, first.meta.customer);
});
