import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  loadInitialProject,
  createDefaultProject,
  REACT_AUTOSAVE_KEY,
  REACT_BACKUPS_KEY,
} from "./project-model.js";
import { useTeam } from "../cloud/TeamContext.jsx";
import { applySharedPriceCatalog } from '../cloud/price-catalog.js';
import { createProjectWorkspace, projectWorkspaceReducer, PROJECT_TABS_KEY, restoreProjectWorkspace, serializeProjectWorkspace } from './project-tabs.js';

const ProjectContext = createContext(null);
export function ProjectProvider({ children }) {
  const team = useTeam();
  const [workspace, dispatch] = useReducer(projectWorkspaceReducer, null, () => {
    const fallback = team.required ? createDefaultProject() : loadInitialProject();
    if (team.required) return createProjectWorkspace(fallback);
    try {
      const saved = JSON.parse(localStorage.getItem(`${PROJECT_TABS_KEY}:local`) || 'null');
      return saved?.owner === 'local' ? restoreProjectWorkspace(saved, fallback) : createProjectWorkspace(fallback);
    } catch { return createProjectWorkspace(fallback); }
  });
  const [hydrated, setHydrated] = useState(!team.required);
  const ownerRef = useRef(team.required ? null : 'local');
  const activeTab = workspace.tabs.find((tab) => tab.id === workspace.activeId) || workspace.tabs[0];
  const history = activeTab.history;
  const [saveState, setSaveState] = useState({
    status: "saved",
    message: "Автосохранение включено",
  });
  const project = useMemo(() => applySharedPriceCatalog(history.present, team.user ? team.priceCatalog.payload : null, team.priceCatalog.revision), [history.present, team.user?.id, team.priceCatalog.payload, team.priceCatalog.revision]);

  useEffect(() => {
    if (team.current?.id && team.current.revision) dispatch({ type: 'server-revision', serverId: team.current.id, revision: team.current.revision, name: team.current.name });
  }, [team.current?.id, team.current?.revision, team.current?.name]);

  useEffect(() => {
    if (!team.ready) return;
    const owner = String(team.user?.id || 'local');
    if (ownerRef.current === owner) return;
    ownerRef.current = owner;
    try {
      const fallback = team.required ? createDefaultProject() : loadInitialProject();
      const saved = JSON.parse(localStorage.getItem(`${PROJECT_TABS_KEY}:${owner}`) || 'null');
      dispatch({ type: 'hydrate', saved: saved?.owner === owner ? saved : null, fallback });
    } catch { dispatch({ type: 'hydrate', saved: null, fallback: team.required ? createDefaultProject() : loadInitialProject() }); }
    setHydrated(true);
  }, [team.ready, team.user?.id]);

  useEffect(() => {
    if (!hydrated) return undefined;
    const timer = window.setTimeout(() => {
      try {
        const snapshot = {
          ...project,
          savedAt: new Date().toISOString(),
        };
        const owner = String(team.user?.id || 'local');
        localStorage.setItem(`${PROJECT_TABS_KEY}:${owner}`, JSON.stringify(serializeProjectWorkspace(workspace, owner)));
        localStorage.setItem(REACT_AUTOSAVE_KEY, JSON.stringify(snapshot));
        setSaveState({
          status: "saved",
          message: `Сохранено ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`,
        });
      } catch (error) {
        setSaveState({
          status: "error",
          message: `Автосохранение недоступно: ${error.message}`,
        });
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [workspace, project, hydrated, team.user?.id]);

  useEffect(() => {
    if (!hydrated || !team.user || !team.current || team.current.id !== activeTab.serverId) return undefined;
    const timer = window.setTimeout(
      () => team.saveProject(project).catch(() => {}),
      1500,
    );
    return () => window.clearTimeout(timer);
  }, [project, hydrated, team.user, team.current?.id, activeTab.serverId]);

  const commit = useCallback(
    (update) => dispatch({ type: "commit", tabId: workspace.activeId, update }),
    [workspace.activeId],
  );
  const recordMarks = useCallback((registry,requests) => dispatch({ type: 'production-registry', tabId: workspace.activeId, expectedPresent: history.present, registry,requests }), [workspace.activeId, history.present]);
  const replace = useCallback(
    (project) => dispatch({ type: "replace", tabId: workspace.activeId, project }),
    [workspace.activeId],
  );
  const undo = useCallback(() => dispatch({ type: "undo", tabId: workspace.activeId }), [workspace.activeId]);
  const redo = useCallback(() => dispatch({ type: "redo", tabId: workspace.activeId }), [workspace.activeId]);
  const openTab = useCallback((nextProject, serverId = null, serverName = '', serverRevision = 0, libraryId = null) => {
    const existing = workspace.tabs.find(tab => (serverId && tab.serverId === serverId) || (libraryId && tab.libraryId === libraryId));
    if (existing) { dispatch({ type: 'activate-tab', id: existing.id }); return existing.id; }
    const id = globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random()}`;
    dispatch({ type: 'open-tab', id, project: nextProject, serverId, libraryId, serverName, serverRevision });
    return id;
  }, [workspace.tabs]);
  const activateTab = useCallback((id) => dispatch({ type: 'activate-tab', id }), []);
  const getTabProject = useCallback((id) => workspace.tabs.find((tab) => tab.id === id)?.history.present || null, [workspace.tabs]);
  const closeTab = useCallback((id) => {
    if (workspace.tabs.length < 2) return false;
    const tab = workspace.tabs.find((item) => item.id === id);
    if (!tab) return false;
    try {
      const existing = JSON.parse(localStorage.getItem(REACT_BACKUPS_KEY) || '[]');
      const snapshot = { ...tab.history.present, backupId: Date.now(), savedAt: new Date().toISOString() };
      localStorage.setItem(REACT_BACKUPS_KEY, JSON.stringify([snapshot, ...existing].slice(0, 10)));
    } catch (error) {
      setSaveState({ status: 'error', message: `Не удалось закрыть вкладку: резервная копия не создана (${error.message})` });
      return false;
    }
    dispatch({ type: 'close-tab', id });
    return true;
  }, [workspace.tabs]);
  const replaceTab = useCallback((id, nextProject) => dispatch({ type: 'replace', tabId: id, project: nextProject }), []);
  const attachServer = useCallback((id, serverId, serverName, serverRevision) => dispatch({ type: 'attach-server', id, serverId, serverName, serverRevision }), []);
  const checkpoint = useCallback(() => {
    try {
      const existing = JSON.parse(
        localStorage.getItem(REACT_BACKUPS_KEY) || "[]",
      );
      const snapshot = {
        ...project,
        backupId: Date.now(),
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(
        REACT_BACKUPS_KEY,
        JSON.stringify([snapshot, ...existing].slice(0, 10)),
      );
      if (team.user && team.current)
        team.saveProject(project, true).catch(() => {});
      setSaveState({ status: "saved", message: "Создана резервная копия" });
      return snapshot;
    } catch (error) {
      setSaveState({
        status: "error",
        message: `Не создана копия: ${error.message}`,
      });
      return null;
    }
  }, [project, team]);
  const value = useMemo(
    () => ({
      project,
      commit,
      recordMarks,
      replace,
      openTab,
      activateTab,
      getTabProject,
      closeTab,
      replaceTab,
      attachServer,
      hydrated,
      tabs: workspace.tabs.map(({ id, serverId, libraryId, serverName, serverRevision, history: tabHistory }) => ({ id, serverId, libraryId, serverName, serverRevision, meta: tabHistory.present.meta, plan: tabHistory.present.plan })),
      activeTabId: workspace.activeId,
      undo,
      redo,
      checkpoint,
      saveState,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    }),
    [workspace, history, project, commit, recordMarks, replace, openTab, activateTab, getTabProject, closeTab, replaceTab, attachServer, hydrated, undo, redo, checkpoint, saveState],
  );
  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context)
    throw new Error("useProject должен использоваться внутри ProjectProvider");
  return context;
}
