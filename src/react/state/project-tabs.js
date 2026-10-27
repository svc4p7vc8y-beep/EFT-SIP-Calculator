import { migrateProject } from './project-model.js';
import { recordProductionRegistry } from './production-identities.js';

export const PROJECT_TABS_KEY = 'eft-react-project-tabs-v1';
const HISTORY_LIMIT = 60;

const makeHistory = (project) => ({ past: [], present: migrateProject(project), future: [] });

export function createProjectWorkspace(project, id = 'initial') {
  return { activeId: id, tabs: [{ id, serverId: null, serverName: '', history: makeHistory(project) }] };
}

export function restoreProjectWorkspace(saved, fallback) {
  if (!saved || !Array.isArray(saved.tabs) || !saved.tabs.length) return createProjectWorkspace(fallback);
  const tabs = saved.tabs.filter((tab) => tab?.id && tab.project).map((tab) => ({
    id: String(tab.id),
    serverId: tab.serverId || null,
    libraryId: tab.libraryId || null,
    serverName: String(tab.serverName || ''),
    serverRevision: Number(tab.serverRevision) || 0,
    history: makeHistory(tab.project),
  }));
  if (!tabs.length) return createProjectWorkspace(fallback);
  return { activeId: tabs.some((tab) => tab.id === saved.activeId) ? saved.activeId : tabs[0].id, tabs };
}

export function serializeProjectWorkspace(state, owner) {
  return {
    owner,
    activeId: state.activeId,
    tabs: state.tabs.map(({ id, serverId, libraryId, serverName, serverRevision, history }) => ({
      id, serverId, libraryId, serverName, serverRevision, project: history.present,
    })),
  };
}

function reduceHistory(history, action) {
  if (action.type === 'production-registry') return recordProductionRegistry(history, action.expectedPresent, action.registry, action.requests);
  if (action.type === 'undo' && history.past.length) return {
    past: history.past.slice(0, -1), present: history.past.at(-1), future: [history.present, ...history.future],
  };
  if (action.type === 'redo' && history.future.length) return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: history.future[0], future: history.future.slice(1),
  };
  if (action.type === 'replace') return makeHistory(action.project);
  if (action.type === 'commit') return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: action.update(structuredClone(history.present)), future: [],
  };
  return history;
}

export function projectWorkspaceReducer(state, action) {
  if (action.type === 'hydrate') return restoreProjectWorkspace(action.saved, action.fallback);
  if (action.type === 'open-tab') {
    const existing = state.tabs.find((tab) => (action.serverId && tab.serverId === action.serverId) || (action.libraryId && tab.libraryId === action.libraryId));
    if (existing) return { ...state, activeId: existing.id };
    return {
      activeId: action.id,
      tabs: [...state.tabs, {
        id: action.id, serverId: action.serverId || null, libraryId: action.libraryId || null, serverName: action.serverName || '', serverRevision: action.serverRevision || 0,
        history: makeHistory(action.project),
      }],
    };
  }
  if (action.type === 'activate-tab') {
    return state.tabs.some((tab) => tab.id === action.id) ? { ...state, activeId: action.id } : state;
  }
  if (action.type === 'server-revision') {
    const index = state.tabs.findIndex((tab) => tab.serverId === action.serverId);
    if (index < 0 || (state.tabs[index].serverRevision === action.revision && state.tabs[index].serverName === action.name)) return state;
    const tabs = state.tabs.slice();
    tabs[index] = { ...tabs[index], serverRevision: action.revision, serverName: action.name };
    return { ...state, tabs };
  }
  if (action.type === 'attach-server') {
    const index = state.tabs.findIndex((tab) => tab.id === action.id);
    if (index < 0) return state;
    const tabs = state.tabs.slice();
    tabs[index] = { ...tabs[index], serverId: action.serverId, serverName: action.serverName, serverRevision: action.serverRevision };
    return { ...state, tabs };
  }
  if (action.type === 'attach-library') {
    const index = state.tabs.findIndex((tab) => tab.id === action.id);
    if (index < 0) return state;
    const tabs = state.tabs.slice();
    tabs[index] = { ...tabs[index], libraryId: action.libraryId };
    return { ...state, tabs };
  }
  if (action.type === 'close-tab') {
    if (state.tabs.length === 1) return state;
    const index = state.tabs.findIndex((tab) => tab.id === action.id);
    if (index < 0) return state;
    const tabs = state.tabs.filter((tab) => tab.id !== action.id);
    const activeId = state.activeId === action.id ? tabs[Math.min(index, tabs.length - 1)].id : state.activeId;
    return { tabs, activeId };
  }
  const targetId = action.tabId || state.activeId;
  const index = state.tabs.findIndex((tab) => tab.id === targetId);
  if (index < 0) return state;
  const history = reduceHistory(state.tabs[index].history, action);
  if (history === state.tabs[index].history) return state;
  const tabs = state.tabs.slice();
  tabs[index] = { ...tabs[index], history };
  return { ...state, tabs };
}
