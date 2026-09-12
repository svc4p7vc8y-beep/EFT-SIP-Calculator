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

const TeamContext = createContext(null);
const isProductionCalculator = () =>
  location.hostname === "calc.eftsip.ru" ||
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
  const [users, setUsers] = useState([]);
  const [current, setCurrent] = useState(null);
  const currentRef = useRef(null);
  const saveQueue = useRef(Promise.resolve());
  const [syncState, setSyncState] = useState({
    status: "local",
    message: "Локальное сохранение",
  });
  const syncingLibraries = useRef(false);

  const refresh = useCallback(async () => {
    if (!session.user) return;
    const requests = [eftApi("projects"), eftApi("intakes")];
    if (session.user.role === "admin") requests.push(eftApi("users"));
    const [projectResult, intakeResult, userResult] =
      await Promise.all(requests);
    setProjects(projectResult.projects || []);
    setIntakes(intakeResult.intakes || []);
    setUsers(userResult?.users || []);
  }, [session.user]);

  const syncLibraries = useCallback(async () => {
    if (!session.user || syncingLibraries.current) return;
    syncingLibraries.current = true;
    try {
      const [remotePlans, remoteKnowledge, localKnowledge] = await Promise.all([
        eftApi("shared", { query: { key: "plan-library" } }),
        eftApi("shared", { query: { key: "knowledge-library" } }),
        listKnowledgeArticles(),
      ]);
      const localPlans = readPlanLibrary();
      if (remotePlans.revision > 0) writePlanLibrary(remotePlans.payload || []);
      else if (localPlans.length)
        await eftApi("shared", {
          method: "PUT",
          csrf: session.csrf,
          body: { key: "plan-library", payload: localPlans },
        });
      if (remoteKnowledge.revision > 0)
        await replaceKnowledgeArticles(remoteKnowledge.payload || []);
      else if (localKnowledge.length)
        await eftApi("shared", {
          method: "PUT",
          csrf: session.csrf,
          body: { key: "knowledge-library", payload: localKnowledge },
        });
    } finally {
      syncingLibraries.current = false;
    }
  }, [session.user, session.csrf]);

  useEffect(() => {
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
  }, [session.user, refresh, syncLibraries]);

  useEffect(() => {
    if (!session.user) return undefined;
    const uploadPlans = () =>
      eftApi("shared", {
        method: "PUT",
        csrf: session.csrf,
        body: { key: "plan-library", payload: readPlanLibrary() },
      }).catch(() => {});
    const uploadKnowledge = async () =>
      eftApi("shared", {
        method: "PUT",
        csrf: session.csrf,
        body: {
          key: "knowledge-library",
          payload: await listKnowledgeArticles(),
        },
      }).catch(() => {});
    window.addEventListener("eft:plan-library-changed", uploadPlans);
    window.addEventListener("eft:knowledge-library-changed", uploadKnowledge);
    return () => {
      window.removeEventListener("eft:plan-library-changed", uploadPlans);
      window.removeEventListener(
        "eft:knowledge-library-changed",
        uploadKnowledge,
      );
    };
  }, [session.user, session.csrf]);

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
      const run = async () => {
        const target = currentRef.current;
        setSyncState({
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
          currentRef.current = {
            ...target,
            revision: result.revision,
            name: result.name,
          };
          setCurrent(currentRef.current);
          setSyncState({
            status: "saved",
            message: `Общая база · ревизия ${result.revision}`,
          });
          return result;
        } catch (error) {
          setSyncState({
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
      await eftApi("intake-status", {
        method: "POST",
        csrf: session.csrf,
        body: { id: intakeId, status: "imported", projectId: created.id },
      });
      await refresh();
      return created;
    },
    [createProject, session.csrf, refresh],
  );

  const value = useMemo(
    () => ({
      ...session,
      required: isProductionCalculator(),
      projects,
      intakes,
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
      createFromIntake,
      detachProject,
    }),
    [
      session,
      projects,
      intakes,
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
