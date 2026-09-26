import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { eftApi } from "../../shared/team-api.js";
import {
  listKnowledgeArticles,
  replaceKnowledgeArticles,
} from "../storage/knowledge-library.js";
import { readPlanLibrary, writePlanLibrary } from "../storage/plan-library.js";
import { mergeLibraryEntries } from "./library-sync.js";

const TeamContext = createContext(null);
const isProductionCalculator = () =>
  (location.hostname === "calc.eftsip.ru" && import.meta.env.VITE_TEAM_ENABLED === 'true') ||
  new URLSearchParams(location.search).get("cloud") === "1";

export function TeamProvider({ children }) {
  const [session, setSession] = useState({
    ready: false,
    user: null,
    csrf: "",
    error: "",
  });
  const [projects, setProjects] = useState([]);
  const [intakes, setIntakes] = useState([]);
  const [unreadIntakes, setUnreadIntakes] = useState(0);
  const [unreadMail, setUnreadMail] = useState(0);
  const [mailStatus, setMailStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [current, setCurrent] = useState(null);
  const currentRef = useRef(null);
  const saveQueue = useRef(Promise.resolve());
  const [syncState, setSyncState] = useState({
    status: "local",
    message: "Локальное сохранение",
  });
  const syncingLibraries = useRef(false);
  const libraryRevisions = useRef({
    "plan-library": 0,
    "knowledge-library": 0,
  });
  const libraryEdits = useRef({
    "plan-library": 0,
    "knowledge-library": 0,
  });
  const libraryDirty = useRef({
    "plan-library": false,
    "knowledge-library": false,
  });
  const libraryQueues = useRef({
    "plan-library": Promise.resolve(),
    "knowledge-library": Promise.resolve(),
  });

  const readLocalLibrary = useCallback(async (key) =>
    key === "plan-library" ? readPlanLibrary() : listKnowledgeArticles(), []);

  const writeLocalLibrary = useCallback(async (key, payload) => {
    if (key === "plan-library")
      writePlanLibrary(payload || [], localStorage, { notify: false });
    else await replaceKnowledgeArticles(payload || []);
  }, []);

  const saveSharedLibrary = useCallback((key) => {
    const edit = ++libraryEdits.current[key];
    libraryDirty.current[key] = true;
    const run = async () => {
      let payload = await readLocalLibrary(key);
      let revision = libraryRevisions.current[key] || 0;
      try {
        const result = await eftApi("shared", {
          method: "PUT",
          csrf: session.csrf,
          body: { key, revision, payload },
        });
        libraryRevisions.current[key] = Number(result.revision) || revision + 1;
      } catch (error) {
        if (error.code !== "revision_conflict") throw error;
        const remote = await eftApi("shared", { query: { key } });
        payload = mergeLibraryEntries(payload, remote.payload || []);
        await writeLocalLibrary(key, payload);
        revision = Number(remote.revision) || 0;
        const result = await eftApi("shared", {
          method: "PUT",
          csrf: session.csrf,
          body: { key, revision, payload },
        });
        libraryRevisions.current[key] = Number(result.revision) || revision + 1;
      }
      if (libraryEdits.current[key] === edit) {
        libraryDirty.current[key] = false;
        setSyncState({ status: "saved", message: "Общие библиотеки синхронизированы" });
      }
    };
    setSyncState({ status: "saving", message: "Сохраняем общую библиотеку…" });
    const queued = libraryQueues.current[key].catch(() => {}).then(run);
    libraryQueues.current[key] = queued;
    return queued.catch((error) => {
      setSyncState({ status: "error", message: `Библиотеки: ${error.message}` });
      throw error;
    });
  }, [readLocalLibrary, session.csrf, writeLocalLibrary]);

  const refresh = useCallback(async () => {
    if (!session.user) return;
    const requests = [eftApi("projects"), eftApi("intakes")];
    if (session.user.role === "admin") requests.push(eftApi("users"));
    let projectResult, intakeResult, userResult;
    try {
      [projectResult, intakeResult, userResult] = await Promise.all(requests);
    } catch (error) {
      if (error.code === 'authentication_required') {
        currentRef.current = null;
        setCurrent(null);
        setSession({ ready: true, user: null, csrf: '', error: 'Сеанс завершён. Войдите с новым паролем.' });
      }
      throw error;
    }
    setProjects(projectResult.projects || []);
    setIntakes(intakeResult.intakes || []);
    setUnreadIntakes(Number(intakeResult.unread || 0));
    setUsers(userResult?.users || []);
  }, [session.user]);

  const syncLibraries = useCallback(async () => {
    if (!session.user || syncingLibraries.current) return;
    syncingLibraries.current = true;
    try {
      const [remotePlans, remoteKnowledge] = await Promise.all([
        eftApi("shared", { query: { key: "plan-library" } }),
        eftApi("shared", { query: { key: "knowledge-library" } }),
      ]);
      for (const [key, remote] of [
        ["plan-library", remotePlans],
        ["knowledge-library", remoteKnowledge],
      ]) {
        const remoteRevision = Number(remote.revision) || 0;
        const localRevision = libraryRevisions.current[key] || 0;
        if (remoteRevision === 0) {
          const local = await readLocalLibrary(key);
          if (local.length) await saveSharedLibrary(key);
          continue;
        }
        if (remoteRevision !== localRevision) {
          if (libraryDirty.current[key]) {
            await saveSharedLibrary(key);
          } else {
            await writeLocalLibrary(key, remote.payload || []);
            libraryRevisions.current[key] = remoteRevision;
          }
        }
      }
    } finally {
      syncingLibraries.current = false;
    }
  }, [session.user, readLocalLibrary, saveSharedLibrary, writeLocalLibrary]);

  const refreshMailStatus = useCallback(async () => {
    if (!session.user) return;
    const result = await eftApi("mail-status");
    setMailStatus(result.mail || null);
    setUnreadMail(Number(result.mail?.unread || 0));
  }, [session.user]);

  useEffect(() => {
    if (!isProductionCalculator()) {
      setSession({ ready: true, user: null, csrf: "", error: "" });
      return undefined;
    }
    eftApi("session")
      .then((result) =>
        setSession({
          ready: true,
          user: result.user,
          csrf: result.csrf || "",
          error: "",
        }),
      )
      .catch((error) =>
        setSession({ ready: true, user: null, csrf: "", error: error.message }),
      );
    return undefined;
  }, []);

  useEffect(() => {
    if (!session.user) return;
    refresh().catch((error) =>
      setSyncState({ status: "error", message: error.message }),
    );
    syncLibraries().catch((error) =>
      setSyncState({
        status: "error",
        message: `Библиотеки: ${error.message}`,
      }),
    );
    refreshMailStatus().catch(() => {});
  }, [session.user, refresh, syncLibraries, refreshMailStatus]);

  useEffect(() => {
    if (!session.user) return undefined;
    const timer = window.setInterval(() => {
      refresh().catch(() => {});
      syncLibraries().catch((error) =>
        setSyncState({ status: "error", message: `Библиотеки: ${error.message}` }),
      );
    }, 45000);
    return () => window.clearInterval(timer);
  }, [session.user, refresh, syncLibraries]);

  useEffect(() => {
    if (!session.user) return undefined;
    const timer = window.setInterval(() => refreshMailStatus().catch(() => {}), 60000);
    return () => window.clearInterval(timer);
  }, [session.user, refreshMailStatus]);

  useEffect(() => {
    if (!session.user) return undefined;
    const uploadPlans = () => saveSharedLibrary("plan-library").catch(() => {});
    const uploadKnowledge = () => saveSharedLibrary("knowledge-library").catch(() => {});
    window.addEventListener("eft:plan-library-changed", uploadPlans);
    window.addEventListener("eft:knowledge-library-changed", uploadKnowledge);
    return () => {
      window.removeEventListener("eft:plan-library-changed", uploadPlans);
      window.removeEventListener(
        "eft:knowledge-library-changed",
        uploadKnowledge,
      );
    };
  }, [session.user, saveSharedLibrary]);

  const login = useCallback(async (username, password) => {
    const result = await eftApi("login", {
      method: "POST",
      body: { username, password },
    });
    setSession({
      ready: true,
      user: result.user,
      csrf: result.csrf,
      error: "",
    });
  }, []);
  const logout = useCallback(async () => {
    await eftApi("logout", { method: "POST", csrf: session.csrf, body: {} });
    setSession({ ready: true, user: null, csrf: "", error: "" });
    currentRef.current = null;
    setCurrent(null);
  }, [session.csrf]);
  const createProject = useCallback(
    async (payload) => {
      setSyncState({ status: "saving", message: "Создаём общий проект…" });
      const result = await eftApi("projects", {
        method: "POST",
        csrf: session.csrf,
        body: { payload },
      });
      currentRef.current = {
        id: result.project.id,
        revision: result.project.revision,
        name: result.project.name,
      };
      setCurrent(currentRef.current);
      setSyncState({ status: "saved", message: "Общий проект создан" });
      await refresh();
      return result.project;
    },
    [session.csrf, refresh],
  );
  const openProject = useCallback(async (id) => {
    const result = await eftApi("project", { query: { id } });
    currentRef.current = {
      id: result.project.id,
      revision: Number(result.project.revision),
      name: result.project.name,
    };
    setCurrent(currentRef.current);
    setSyncState({
      status: "saved",
      message: `Открыт общий проект · ревизия ${result.project.revision}`,
    });
    return result.project;
  }, []);
  const saveProject = useCallback(
    async (payload, checkpoint = false) => {
      if (!currentRef.current) return null;
      const target = currentRef.current;
      const run = async () => {
        if (currentRef.current === target) setSyncState({
          status: "saving",
          message: checkpoint ? "Создаём версию…" : "Сохраняем в общую базу…",
        });
        try {
          const result = await eftApi("project", {
            method: "PUT",
            csrf: session.csrf,
            body: {
              id: target.id,
              revision: target.revision,
              payload,
              checkpoint,
            },
          });
          Object.assign(target, { revision: result.revision, name: result.name });
          if (currentRef.current === target) {
            setCurrent({ ...target });
            setSyncState({
              status: "saved",
              message: `Общая база · ревизия ${result.revision}`,
            });
          }
          return result;
        } catch (error) {
          if (currentRef.current === target) setSyncState({
            status: "error",
            message:
              error.code === "revision_conflict"
                ? "Конфликт: проект изменён другим сотрудником"
                : error.message,
          });
          throw error;
        }
      };
      saveQueue.current = saveQueue.current.catch(() => {}).then(run);
      return saveQueue.current;
    },
    [session.csrf],
  );
  const createUser = useCallback(
    async (data) => {
      await eftApi("users", { method: "POST", csrf: session.csrf, body: data });
      await refresh();
    },
    [session.csrf, refresh],
  );
  const updateUser = useCallback(async (data) => {
    const result = await eftApi('user-update', { method: 'POST', csrf: session.csrf, body: data });
    if (result.loggedOut) {
      setSession({ ready: true, user: null, csrf: '', error: '' });
      currentRef.current = null;
      setCurrent(null);
    } else await refresh();
    return result;
  }, [session.csrf, refresh]);
  const reserveProjectNumber = useCallback(async () => {
    const result = await eftApi("project-number", {
      method: "POST",
      csrf: session.csrf,
      body: {},
    });
    return result.number;
  }, [session.csrf]);
  const deleteProject = useCallback(async (id, password) => {
    await eftApi("project-delete", {
      method: "POST",
      csrf: session.csrf,
      body: { id, password },
    });
    if (currentRef.current?.id === id) {
      currentRef.current = null;
      setCurrent(null);
    }
    await refresh();
  }, [session.csrf, refresh]);
  const deleteIntake = useCallback(async (id, password) => {
    await eftApi("intake-delete", {
      method: "POST",
      csrf: session.csrf,
      body: { id, password },
    });
    await refresh();
  }, [session.csrf, refresh]);
  const markIntakeRead = useCallback(async (id) => {
    const result = await eftApi("intake-read", {
      method: "POST",
      csrf: session.csrf,
      body: { id },
    });
    setIntakes((items) => items.map((item) => item.id === id ? { ...item, is_read: true } : item));
    if (result.newlyRead) setUnreadIntakes((count) => Math.max(0, count - 1));
  }, [session.csrf]);
  const detachProject = useCallback(() => {
    currentRef.current = null;
    setCurrent(null);
    setSyncState({
      status: "local",
      message: "Новый локальный проект — добавьте его в общие проекты",
    });
  }, []);
  const createFromIntake = useCallback(
    async (payload, intakeId) => {
      const created = await createProject(payload);
      try {
        await eftApi("intake-status", {
          method: "POST",
          csrf: session.csrf,
          body: { id: intakeId, status: "imported", projectId: created.id },
        });
        await refresh();
        return created;
      } catch (error) {
        return { ...created, intakeLinkWarning: error.message };
      }
    },
    [createProject, session.csrf, refresh],
  );

  const value = useMemo(
    () => ({
      ...session,
      required: isProductionCalculator(),
      projects,
      intakes,
      unreadIntakes,
      unreadMail,
      mailStatus,
      users,
      current,
      syncState,
      login,
      logout,
      refresh,
      createProject,
      openProject,
      saveProject,
      createUser,
      updateUser,
      reserveProjectNumber,
      deleteProject,
      deleteIntake,
      markIntakeRead,
      refreshMailStatus,
      createFromIntake,
      detachProject,
    }),
    [
      session,
      projects,
      intakes,
      unreadIntakes,
      unreadMail,
      mailStatus,
      users,
      current,
      syncState,
      login,
      logout,
      refresh,
      createProject,
      openProject,
      saveProject,
      createUser,
      updateUser,
      reserveProjectNumber,
      deleteProject,
      deleteIntake,
      markIntakeRead,
      refreshMailStatus,
      createFromIntake,
      detachProject,
    ],
  );
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const value = useContext(TeamContext);
  if (!value)
    throw new Error("useTeam должен использоваться внутри TeamProvider");
  return value;
}
