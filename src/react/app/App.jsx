import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeAlert,
  BellRing,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  ClipboardPaste,
  Cloud,
  FilePlus2,
  FileUp,
  FolderOpen,
  HardHat,
  History,
  Home,
  Layers3,
  BookOpenCheck,
  LibraryBig,
  Mail,
  Menu,
  Moon,
  PaintRoller,
  PanelTop,
  Plus,
  Ruler,
  Save,
  Share2,
  Settings2,
  Sun,
  Tags,
  Trees,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import { useProject } from "../state/ProjectContext.jsx";
import { APP_VERSION } from '../data/app-version.js';
import { normalizedProjectFilename, suggestedProjectFilename } from '../export/project-file-name.js';
import { priceCatalogFingerprint, showLocalPriceChangeNotice } from '../state/price-change-notice.js';
import { isPriceEditorUnlocked, verifyPricePasscode, setPriceEditorUnlocked } from '../security/price-access.js';
import { calculateProject } from "../calculations/estimate-engine.js";
import { calculateAdjustedPrice } from "../calculations/price-adjustments.js";
import {
  createNewBlankProject,
  createProjectWithCurrentPrices,
  createDefaultPriceLists,
  migrateProject,
  REACT_BACKUPS_KEY,
  REACT_PROJECT_VERSION,
  summarizePriceCatalogChanges,
} from "../state/project-model.js";
import { validateImportedProject } from "../state/project-import.js";
import { reserveLocalProjectNumber } from "../storage/project-number.js";
import { createPlanLibraryEntry, readPlanLibrary, writePlanLibrary } from "../storage/plan-library.js";
import { formatMoney } from "../utils/format.js";
import ProjectSummarySidebar from "../components/ProjectSummarySidebar.jsx";
import ProjectSchemePreview from "../components/ProjectSchemePreview.jsx";
import ScreenErrorBoundary from "../components/ScreenErrorBoundary.jsx";
import NewProjectDialog from "../components/NewProjectDialog.jsx";
import TeamLogin from "../components/TeamLogin.jsx";
import { useTeam } from "../cloud/TeamContext.jsx";
import { resolveEftApiUrl } from "../../shared/team-api.js";
import {
  clientBriefSummary,
  createProjectFromClientBrief,
  PENDING_CLIENT_BRIEF_KEY,
  validateClientBrief,
} from "../storage/client-brief.js";

const PlanScreen = lazy(() => import("../screens/PlanScreen.jsx"));
const PlacementScreen = lazy(() => import("../screens/PlacementScreen.jsx"));
const ParametersScreen = lazy(() => import("../screens/ParametersScreen.jsx"));
const Calculators = lazy(() => import("../screens/Calculators.jsx"));
const PriceScreen = lazy(() => import("../screens/PriceScreen.jsx"));
const RequestScreen = lazy(() => import("../screens/RequestScreen.jsx"));
const EstimateScreen = lazy(() => import("../screens/EstimateScreen.jsx"));
const CalculationSettingsScreen = lazy(
  () => import("../screens/CalculationSettingsScreen.jsx"),
);
const KnowledgeLibraryScreen = lazy(
  () => import("../screens/KnowledgeLibraryScreen.jsx"),
);
const SipGuideScreen = lazy(() => import("../screens/SipGuideScreen.jsx"));
const NodeFastenersScreen = lazy(
  () => import("../screens/NodeFastenersScreen.jsx"),
);
const CuttingScreen = lazy(() => import('../screens/CuttingScreen.jsx'));
const TeamWorkspaceScreen = lazy(
  () => import("../screens/TeamWorkspaceScreen.jsx"),
);
const MailScreen = lazy(() => import("../screens/MailScreen.jsx"));
const FilesScreen = lazy(() => import("../screens/FilesScreen.jsx"));

const NAV_ITEMS = [
  { id: "team", label: "Общие проекты", icon: Cloud, group: "team" },
  { id: "mail", label: "Почта", icon: Mail, group: "team" },
  { id: "files", label: "Файлы", icon: FolderOpen, group: "team" },
  { id: "plan", label: "План дома", icon: Ruler, group: "project" },
  { id: "placement", label: "Мебель и инженерия", icon: Layers3, group: "project" },
  { id: "parameters", label: "Параметры", icon: Settings2, group: "project" },
  { id: "piles", label: "Сваи", icon: HardHat, group: "calculate" },
  { id: "sip", label: "СИП", icon: Layers3, group: "calculate" },
  { id: "nodes", label: "Метизы по узлам", icon: Wrench, group: "calculate" },
  { id: "cutting", label: "Раскрой", icon: Ruler, group: "calculate" },
  { id: "roof", label: "Кровля", icon: Home, group: "calculate" },
  { id: "terrace", label: "Терраса", icon: Trees, group: "calculate" },
  { id: "openings", label: "Окна / двери", icon: PanelTop, group: "calculate" },
  { id: "engineering", label: "Инженерия", icon: Wrench, group: "calculate" },
  { id: "external", label: "Внешняя отделка", icon: Home, group: "calculate" },
  {
    id: "internal",
    label: "Внутренняя отделка",
    icon: PaintRoller,
    group: "calculate",
  },
  { id: "delivery", label: "Доставка", icon: Truck, group: "calculate" },
  { id: "price", label: "Прайс-лист", icon: Tags, group: "data" },
  { id: "request", label: "Заявка", icon: ClipboardCheck, group: "data" },
  {
    id: "knowledge",
    label: "Библиотека знаний",
    icon: LibraryBig,
    group: "data",
  },
  {
    id: "sip-guide",
    label: "Справочник SIP",
    icon: BookOpenCheck,
    group: "data",
  },
  { id: "estimate", label: "Смета", icon: Calculator, group: "data" },
];

function createProjectFile(project, requestedName) {
  const payload = {
    ...project,
    savedAt: new Date().toISOString(),
    appVersion: REACT_PROJECT_VERSION,
    schemaVersion: 4,
  };
  const contents = JSON.stringify(payload, null, 2);
  const filename = normalizedProjectFilename(requestedName, project.meta);
  return new File([contents], filename, { type: "application/json" });
}

async function downloadProject(project, requestedName) {
  const file = createProjectFile(project, requestedName);
  const blob = new Blob([file], {
    type: "application/json;charset=utf-8",
  });
  const filename = file.name;
  if (typeof window.showSaveFilePicker === 'function') {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: 'Проект EFT', accept: { 'application/json': ['.json'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function Screen({ active, calculation, teamProps, onNavigate, onOpenLibraryPlan, planCommand, onPlanCommandHandled }) {
  if (active === "team") return <TeamWorkspaceScreen {...teamProps} />;
  if (active === "mail") return <MailScreen />;
  if (active === "files") return <FilesScreen onOpenLibraryPlan={onOpenLibraryPlan} />;
  if (active === "plan") return <PlanScreen onNavigate={onNavigate} planCommand={planCommand} onPlanCommandHandled={onPlanCommandHandled} />;
  if (active === "placement") return <PlacementScreen onNavigate={onNavigate} />;
  if (active === "parameters") return <ParametersScreen />;
  if (active === "price") return <PriceScreen />;
  if (active === "request") return <RequestScreen />;
  if (active === "estimate") return <EstimateScreen />;
  if (active === "knowledge") return <KnowledgeLibraryScreen />;
  if (active === "sip-guide") return <SipGuideScreen />;
  if (active === "nodes")
    return <NodeFastenersScreen calculation={calculation} />;
  if (active === 'cutting') return <CuttingScreen calculation={calculation} onNavigate={onNavigate} />;
  if (active === "calculation-settings") return <CalculationSettingsScreen />;
  return <Calculators type={active} onNavigate={onNavigate} />;
}

export function App() {
  const {
    project,
    commit,
    replace,
    undo,
    redo,
    canUndo,
    canRedo,
    checkpoint,
    saveState,
    tabs,
    activeTabId,
    openTab,
    rememberOpenedProject,
    activateTab,
    getTabProject,
    closeTab,
    replaceTab,
    attachServer,
    hydrated,
  } = useProject();
  const team = useTeam();
  const [active, setActive] = useState(() => (team.required ? "team" : "plan"));
  const [theme, setTheme] = useState(
    () => localStorage.getItem("eft-react-theme") || "light",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('eft-sidebar-collapsed') !== 'false');
  useEffect(() => { localStorage.setItem('eft-sidebar-collapsed', String(sidebarCollapsed)); }, [sidebarCollapsed]);
  const [planCommand, setPlanCommand] = useState(null);
  const runPlanCommand = (kind, details = {}) => { setActive('plan'); setMenuOpen(false); setPlanCommand({kind,...details,id:Date.now()}); };
  const [backupOpen, setBackupOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  const [saveFileOpen, setSaveFileOpen] = useState(false);
  const [closingTabId, setClosingTabId] = useState(null);
  const [closingTabBusy, setClosingTabBusy] = useState(false);
  const [closingTabError, setClosingTabError] = useState('');
  const [saveFileBusy, setSaveFileBusy] = useState(false);
  const [applyProjectBusy, setApplyProjectBusy] = useState(false);
  const [saveFileError, setSaveFileError] = useState('');
  const [briefPreview, setBriefPreview] = useState(null);
  const [teamFocus, setTeamFocus] = useState("projects");
  const [notice, setNotice] = useState("Готово");
  const [dismissedPriceFingerprint, setDismissedPriceFingerprint] = useState(() => localStorage.getItem('eft-dismissed-price-notice') || '');
  const [appUpdateReady, setAppUpdateReady] = useState(false);
  useEffect(() => {
    const ready = () => setAppUpdateReady(true);
    window.addEventListener('eft:app-update-ready', ready);
    return () => window.removeEventListener('eft:app-update-ready', ready);
  }, []);
  const fileRef = useRef(null);
  const briefFileRef = useRef(null);
  const calculation = useMemo(() => calculateProject(project, { nodeTypeRules: team.nodeTypeRules }), [project, team.nodeTypeRules]);
  const adjustedPrice = useMemo(
    () => calculateAdjustedPrice(project, calculation),
    [project, calculation],
  );
  const estimatePriceModified = adjustedPrice.delta !== 0 ||
    (project.estimateOverrides || []).length > 0 ||
    (project.customEstimateLines || []).length > 0;
  const priceChanges = useMemo(
    () => summarizePriceCatalogChanges(project),
    [project.priceMat, project.priceLab],
  );
  const priceFingerprint = useMemo(() => priceCatalogFingerprint(project), [project.priceMat, project.priceLab]);
  const selectedTab = tabs.find((item) => item.id === activeTabId);

  useEffect(() => {
    if (!hydrated || !team.ready) return;
    if (selectedTab) team.activateProjectSession(selectedTab.serverId, selectedTab.serverRevision, selectedTab.serverName);
  }, [hydrated, team.ready, team.user?.id, activeTabId, selectedTab?.serverId, selectedTab?.serverRevision]);

  const saveBeforeSwitch = async () => {
    if (!team.user || !team.current || team.current.id !== tabs.find((tab) => tab.id === activeTabId)?.serverId) return;
    try { await team.saveProject(project); }
    catch (error) { setNotice(`Проект остался во вкладке, но не сохранён на сервере: ${error.message}`); }
  };

  const switchProjectTab = async (id) => {
    if (id === activeTabId) return;
    await saveBeforeSwitch();
    const tab = tabs.find((item) => item.id === id);
    if (!tab) return;
    team.activateProjectSession(tab.serverId, tab.serverRevision, tab.serverName);
    activateTab(id);
    setActive('plan');
    setNotice(`Открыта вкладка проекта № ${tab.meta?.projectNum || '—'}`);
  };

  const closeProjectTab = (id) => {
    if (tabs.length < 2) return;
    setClosingTabError('');
    setClosingTabId(id);
  };

  const confirmCloseProjectTab = async (saveToLibrary) => {
    const id = closingTabId;
    const tab = tabs.find((item) => item.id === id);
    const tabProject = getTabProject(id);
    if (!tab || !tabProject) return;
    setClosingTabBusy(true);
    setClosingTabError('');
    try {
      if (saveToLibrary) {
        const entries = readPlanLibrary();
        const compactSnapshot = createPlanLibraryEntry(tabProject, '', null).project;
        const existing = entries.find(entry => entry.id === tab.libraryId)
          || entries.find(entry => !entry.deletedAt && entry.project && JSON.stringify(entry.project) === JSON.stringify(compactSnapshot));
        const name = existing?.name || tab.serverName || tab.meta?.projectName || tab.meta?.customer || `Проект № ${tab.meta?.projectNum || '—'}`;
        const calculationForTab = calculateProject(tabProject, { nodeTypeRules: team.nodeTypeRules });
        const saved = createPlanLibraryEntry(tabProject, name, calculationForTab, existing);
        if (!existing || JSON.stringify(existing.project) !== JSON.stringify(saved.project))
          writePlanLibrary(existing ? entries.map(entry => entry.id === existing.id ? saved : entry) : [saved, ...entries]);
      }
      const index = tabs.findIndex((item) => item.id === id);
      const next = tabs.filter((item) => item.id !== id)[Math.min(index, tabs.length - 2)];
      if (!closeTab(id, { skipBackup: true })) throw new Error('Не удалось закрыть вкладку проекта.');
      if (id === activeTabId && next) {
        team.activateProjectSession(next.serverId, next.serverRevision, next.serverName);
        setActive('plan');
      }
      setClosingTabId(null);
      setNotice(saveToLibrary ? 'Проект сохранён в библиотеке, вкладка закрыта.' : 'Вкладка закрыта без новой копии.');
    } catch (error) { setClosingTabError(error.message || 'Не удалось закрыть вкладку.'); }
    finally { setClosingTabBusy(false); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("clientBrief") !== "pending") return;
    try {
      const brief = validateClientBrief(
        JSON.parse(localStorage.getItem(PENDING_CLIENT_BRIEF_KEY) || "null"),
      );
      setBriefPreview({
        fileName: "Анкета с отдельной страницы",
        brief,
        summary: clientBriefSummary(brief),
      });
    } catch (error) {
      setNotice(`Не удалось открыть заявку: ${error.message}`);
    } finally {
      localStorage.removeItem(PENDING_CLIENT_BRIEF_KEY);
      params.delete("clientBrief");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    }
  }, []);

  const changeTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("eft-react-theme", next);
  };

  const importProject = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = migrateProject(validateImportedProject(JSON.parse(await file.text())));
      await saveBeforeSwitch();
      team.detachProject();
      openTab(imported, null, file.name);
      rememberOpenedProject(imported);
      setActive('plan');
      setNotice(`Проект «${file.name}» открыт в новой вкладке`);
    } catch (error) {
      setNotice(`Не удалось открыть проект: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  };

  const importClientBrief = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const brief = validateClientBrief(JSON.parse(await file.text()));
      setBriefPreview({
        fileName: file.name,
        brief,
        summary: clientBriefSummary(brief),
      });
    } catch (error) {
      setNotice(`Не удалось открыть заявку: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  };

  const applyClientBrief = async () => {
    if (!briefPreview) return;
    await saveBeforeSwitch();
    const nextProject = createProjectFromClientBrief(
      project,
      briefPreview.brief,
    );
    try {
      if (!team.user) nextProject.meta.projectNum = await reserveLocalProjectNumber(project.meta.projectNum);
      if (nextProject.request) nextProject.request.number = `КП-${nextProject.meta.projectNum}`;
    } catch (error) {
      setNotice(`Не удалось получить номер проекта: ${error.message}`);
      return;
    }
    if (team.user) {
      (briefPreview.intakeId
        ? team.createFromIntake(nextProject, briefPreview.intakeId)
        : team.createProject(nextProject))
        .then((created) => {
          openTab(created.payload, created.id, created.name, created.revision);
          rememberOpenedProject(created.payload);
          setActive("parameters");
          setNotice(
            created.intakeLinkWarning
              ? `Проект создан, но связь с анкетой не установлена: ${created.intakeLinkWarning}`
              : `Заявка ${briefPreview.fileName} импортирована в общий проект`,
          );
        })
        .catch((error) =>
          setNotice(
            `Проект не создан: ${error.message}`,
          ),
        );
    } else {
      team.detachProject();
      openTab(nextProject);
      rememberOpenedProject(nextProject);
      setActive("parameters");
      setNotice(`Создан черновик по заявке: ${briefPreview.fileName}`);
    }
    setBriefPreview(null);
  };

  const newProject = () => {
    setNewProjectOpen(true);
  };

  const createNewProject = async (details) => {
    try {
      const next = createNewBlankProject(project, details);
      await saveBeforeSwitch();
      if (team.user) {
        const created = await team.createProject(next);
        openTab(created.payload, created.id, created.name, created.revision);
        rememberOpenedProject(created.payload);
      } else {
        const number = await reserveLocalProjectNumber(project.meta.projectNum);
        next.meta.projectNum = number;
        if (next.request) next.request.number = `КП-${number}`;
        team.detachProject();
        openTab(next);
        rememberOpenedProject(next);
      }
    } catch (error) {
      setNotice(`Проект не создан: ${error.message}`);
      throw error;
    }
    setActive("plan");
    setMenuOpen(false);
    setPlanCommand({ kind: 'newProject', id: Date.now() });
    setNotice(`Создан чистый проект${team.user ? ' и сохранён в общей истории' : ''}. Нарисуйте контур дома.`);
    setNewProjectOpen(false);
  };

  const saveProject = () => {
    setSaveFileName(suggestedProjectFilename(project.meta));
    setSaveFileError('');
    setSaveFileOpen(true);
    setMenuOpen(false);
  };
  const applyTeamProjectChanges = async () => {
    if (applyProjectBusy || !selectedTab?.serverId || team.current?.id !== selectedTab.serverId) return;
    setApplyProjectBusy(true);
    try {
      const result = await team.saveProject(project, true);
      checkpoint();
      await team.refresh().catch(() => {});
      setNotice(`Изменения применены в общем проекте · ревизия ${result.revision}`);
    } catch (error) { setNotice(`Не удалось применить изменения: ${error.message}`); }
    finally { setApplyProjectBusy(false); }
  };
  const confirmSaveProject = async () => {
    if (saveFileBusy) return;
    setSaveFileBusy(true);
    setSaveFileError('');
    try {
      await downloadProject(project, saveFileName);
      checkpoint();
      setSaveFileOpen(false);
      setNotice('Файл проекта сохранён; резервная копия обновлена.');
    } catch (error) {
      if (error?.name !== 'AbortError') setSaveFileError('Не удалось сохранить файл. Проверьте доступ к выбранной папке и повторите попытку.');
    } finally {
      setSaveFileBusy(false);
    }
  };

  const shareProject = async () => {
    const file = createProjectFile(project, suggestedProjectFilename(project.meta));
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: file.name });
        setNotice('Файл проекта передан для отправки.');
      } else {
        await downloadProject(project, file.name);
        setNotice('Файл проекта сохранён. Его можно отправить из выбранной папки.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setNotice(`Не удалось поделиться файлом: ${error.message}`);
    }
  };

  const openTeamProject = async (id, destination = 'plan') => {
    try {
      const existing = tabs.find((tab) => tab.serverId === id);
      if (existing) {
        await switchProjectTab(existing.id);
        const opened = getTabProject(existing.id);
        if (opened) rememberOpenedProject(opened);
        setActive(destination);
        return;
      }
      await saveBeforeSwitch();
      const result = await team.openProject(id);
      const opened = migrateProject(validateImportedProject(result.payload));
      openTab(opened, result.id, result.name, result.revision);
      rememberOpenedProject(opened);
      setActive(destination);
      setNotice(`Открыт общий проект «${result.name}»`);
    } catch (error) {
      setNotice(`Не удалось открыть общий проект: ${error.message}`);
    }
  };

  const restoreTeamVersion = async (projectId, versionId) => {
    checkpoint();
    const restored = await team.restoreProjectVersion(projectId, versionId);
    const existing = tabs.find((tab) => tab.serverId === projectId);
    if (existing) {
      replaceTab(existing.id, restored.payload);
      activateTab(existing.id);
    } else openTab(restored.payload, restored.id, restored.name, restored.revision);
    setActive("plan");
    setNotice(`Восстановлена версия общего проекта как ревизия ${restored.revision}`);
    return restored;
  };

  const importTeamIntake = (item) => {
    try {
      const brief = validateClientBrief({
        ...item.payload,
        serverAttachments: item.attachments || [],
      });
      setBriefPreview({
        fileName: item.public_number,
        brief,
        summary: clientBriefSummary(brief),
        intakeId: item.id,
      });
    } catch (error) {
      setNotice(`Анкета требует ручной проверки: ${error.message}`);
    }
  };

  const backups = useMemo(() => {
    if (!backupOpen) return [];
    try {
      return JSON.parse(localStorage.getItem(REACT_BACKUPS_KEY) || "[]");
    } catch {
      return [];
    }
  }, [backupOpen]);

  if (!team.ready || (team.required && !team.user)) return <TeamLogin />;
  if (team.user && !team.priceCatalog.payload) return <div className="screen"><h1>Загрузка общего прайса</h1><p>{team.priceCatalog.error || 'Получаем актуальные цены с сервера…'}</p><button className="button secondary" onClick={() => team.refreshPriceCatalog().catch(() => {})}>Повторить</button><button className="button secondary" onClick={team.logout}>Выйти</button></div>;

  return (
    <div
      className="app"
      data-theme={theme}
      style={{
        "--eft-watermark": `url("${new URL("./icons/eft-logo.png", document.baseURI).href}")`,
      }}
    >
      <header className="app-header">
        <div className="brand">
          <img src="./icons/eft-logo.png" alt="Логотип ЭФТ" />
          <div>
            <strong>ЭнергоЭффективные Технологии</strong>
            <span>React-конструктор СИП-домов</span>
          </div>
          <span className="version-badge" title={`Сборка ${import.meta.env.VITE_BUILD_REVISION?.slice(0, 7) || 'локальная'}; формат файла проекта ${REACT_PROJECT_VERSION}`}>Версия {APP_VERSION}{import.meta.env.VITE_BUILD_REVISION ? ` · ${import.meta.env.VITE_BUILD_REVISION.slice(0, 7)}` : ''}</span>
        </div>
        <div className="header-totals" aria-label="Итоги проекта">
          <div>
            <span>Материалы</span>
            <strong>{team.user && team.priceCatalog.status !== 'ready' ? '—' : formatMoney(calculation.totals.materials)}</strong>
          </div>
          <div>
            <span>Работы</span>
            <strong>{team.user && team.priceCatalog.status !== 'ready' ? '—' : formatMoney(calculation.totals.labor)}</strong>
          </div>
          <div className="grand">
            <span>Итого</span>
            <strong>{team.user && team.priceCatalog.status !== 'ready' ? '—' : formatMoney(calculation.totals.total)}</strong>
          </div>
          <div className={`adjusted${estimatePriceModified ? ' is-modified' : ''}`}>
            <span>Изменённая цена</span>
            <strong>{team.user && team.priceCatalog.status !== 'ready' ? '—' : formatMoney(adjustedPrice.total)}</strong>
          </div>
        </div>
        <div className="mobile-quick-actions" aria-label="Действия с планом">
          <button onClick={() => setActive('calculation-settings')} aria-label="Настройки"><Settings2/><span>Настройки</span></button>
          <button onClick={() => runPlanCommand('openLibrary')} aria-label="Открыть библиотеку"><LibraryBig/><span>Библиотека</span></button>
          <button onClick={() => runPlanCommand('saveLibrary')} aria-label="Сохранить в библиотеку"><Save/><span>Сохранить</span></button>
        </div>
        <div className="header-actions">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenuOpen(true)}
            aria-label="Открыть меню"
          >
            <Menu />
          </button>
          <button
            className="icon-button"
            onClick={undo}
            disabled={!canUndo}
            aria-label="Отменить"
          >
            <ChevronLeft />
          </button>
          <button
            className="icon-button"
            onClick={redo}
            disabled={!canRedo}
            aria-label="Повторить"
          >
            <ChevronRight />
          </button>
          <button
            className="icon-button"
            onClick={changeTheme}
            aria-label="Сменить тему"
          >
            {theme === "light" ? <Moon /> : <Sun />}
          </button>
          <button
            className={`icon-button ${active === "calculation-settings" ? "active" : ""}`}
            onClick={() => setActive("calculation-settings")}
            aria-label="Настройка расчётов"
            title="Настройки"
          >
            <Settings2 />
          </button>
          <button
            className="icon-button"
            onClick={newProject}
            aria-label="Новый проект"
          >
            <FilePlus2 />
          </button>
          <button
            className="icon-button"
            onClick={saveProject}
            aria-label="Сохранить проект"
          >
            <Save />
          </button>
          <button className="icon-button" onClick={shareProject} aria-label="Поделиться файлом проекта" title="Поделиться файлом проекта"><Share2 /></button>
          <button
            className="icon-button"
            onClick={() => fileRef.current?.click()}
            aria-label="Открыть проект"
          >
            <FileUp />
          </button>
          <a
            className="icon-button questionnaire-link"
            href="./EFT_client_questionnaire.html"
            target="_blank"
            rel="noreferrer"
            aria-label="Открыть анкету будущего дома"
            title="Анкета будущего дома"
          >
            <ClipboardList />
          </a>
          <button
            className="icon-button brief-import-button"
            onClick={() => briefFileRef.current?.click()}
            aria-label="Импортировать заявку клиента"
            title="Заявка клиента"
          >
            <ClipboardPaste />
          </button>
          <button
            className="icon-button"
            onClick={() => setBackupOpen(true)}
            aria-label="История проектов"
          >
            <History />
          </button>
          <input
            ref={fileRef}
            className="visually-hidden"
            type="file"
            accept=".json,.eft.json"
            onChange={importProject}
          />
          <input
            ref={briefFileRef}
            className="visually-hidden"
            type="file"
            accept=".eft-brief.json,application/json"
            onChange={importClientBrief}
          />
        </div>
      </header>
      <div className="project-tabbar no-print" role="tablist" aria-label="Открытые проекты">
        <span className="project-tabbar-label">ПРОЕКТЫ</span>
        <div className="project-tabbar-scroll">
          {tabs.map((tab) => <div key={tab.id} className={`project-tab ${tab.id === activeTabId ? 'active' : ''}`}>
            <button role="tab" aria-selected={tab.id === activeTabId} className="project-tab-select" onClick={() => switchProjectTab(tab.id)} title={tab.serverName || tab.meta?.projectName || tab.meta?.customer || `Проект № ${tab.meta?.projectNum || '—'}`}>
              <ProjectSchemePreview plan={tab.plan} compact label={`Схема проекта № ${tab.meta?.projectNum || '—'}`} />
              <span className="project-tab-name">{tab.serverName || tab.meta?.projectName || tab.meta?.customer || `Проект № ${tab.meta?.projectNum || '—'}`}</span>
              <small>{tab.serverId ? `№ ${tab.meta?.projectNum || '—'} · общий` : `№ ${tab.meta?.projectNum || '—'} · локальный`}</small>
            </button>
            {tabs.length > 1 ? <button className="project-tab-close" onClick={() => closeProjectTab(tab.id)} aria-label={`Закрыть вкладку ${tab.serverName || tab.meta?.projectNum || ''}`}><X /></button> : null}
          </div>)}
        </div>
        <button className="project-tab-add" onClick={newProject} title="Новый проект в отдельной вкладке" aria-label="Новая вкладка проекта"><Plus /><span>Новый проект</span></button>
        {team.user ? <button className="project-tab-admin" onClick={() => { setTeamFocus('projects'); setActive('team'); }}><FolderOpen /><span>{team.user.role === 'admin' ? 'Админка' : 'Общие проекты'}</span></button> : null}
      </div>
      <div className={`app-layout${['plan', 'placement'].includes(active) ? ' plan-app-layout' : ''}${active === 'placement' ? ' placement-app-layout' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
          <button className="sidebar-desktop-toggle" onClick={() => setSidebarCollapsed(value => !value)} title={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'} aria-label={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'} aria-expanded={!sidebarCollapsed}>{sidebarCollapsed ? <ChevronRight/> : <ChevronLeft/>}<span>{sidebarCollapsed ? 'Развернуть' : 'Свернуть'}</span></button>
          <div className="sidebar-mobile-head">
            <strong>Просмотр проекта</strong>
            <button onClick={() => setMenuOpen(false)}>
              <X />
            </button>
          </div>
          <details className="sidebar-mobile-more"><summary>Остальные разделы</summary><nav aria-label="Остальные разделы калькулятора">
            {NAV_ITEMS.filter(item => !['plan', 'placement', 'estimate'].includes(item.id)).map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} onClick={() => { setActive(id); setMenuOpen(false); }}><Icon/><span>{label}</span></button>)}
          </nav></details>
          <details className="sidebar-mobile-more"><summary>Файлы и создание</summary><div className="sidebar-mobile-project-actions">
            <button onClick={newProject}><FilePlus2/>Новый проект</button>
            <button onClick={saveProject}><Save/>Сохранить файл проекта</button>
            <button onClick={() => { setMenuOpen(false); shareProject(); }}><Share2/>Поделиться файлом проекта</button>
            <button onClick={() => {fileRef.current?.click();setMenuOpen(false);}}><FileUp/>Открыть файл проекта</button>
            <button onClick={() => setBackupOpen(true)}><History/>История проектов</button>
          </div></details>
          <nav aria-label="Разделы калькулятора">
            {NAV_ITEMS.map(({ id, label, icon: Icon, group }, index) => (
              <div
                key={id}
                className={
                  index && NAV_ITEMS[index - 1].group !== group
                    ? "nav-separator"
                    : ""
                }
              >
                <button
                  className={active === id ? "active" : ""}
                  title={sidebarCollapsed ? label : undefined}
                  aria-label={label}
                  onClick={() => {
                    setActive(id);
                    if (id === "team") setTeamFocus("projects");
                    setMenuOpen(false);
                  }}
                >
                  <Icon />
                  <span>{label}</span>
                  {id === "price" && priceChanges.total ? (
                    <span
                      className="nav-alert-badge"
                      aria-label={`Изменений прайса: ${priceChanges.total}`}
                    >
                      {priceChanges.total}
                    </span>
                  ) : null}
                  {id === "mail" && team.unreadMail ? <span className="nav-alert-badge" aria-label={`Непрочитанных писем: ${team.unreadMail}`}>{team.unreadMail}</span> : null}
                </button>
              </div>
            ))}
          </nav>
          {team.user ? (
            <button
              className={`intake-indicator ${team.unreadIntakes ? "has-new" : ""}`}
              onClick={() => { setTeamFocus("intakes"); setActive("team"); setMenuOpen(false); }}
              aria-label={`Новые заявки: ${team.unreadIntakes}`}
            >
              <BellRing />
              <span>{team.unreadIntakes ? `Новые заявки: ${team.unreadIntakes}` : "Новых заявок нет"}</span>
            </button>
          ) : null}
          <div className={`sidebar-status ${saveState.status}`}>
            <span className="status-dot" />
            {notice}
            <small>{saveState.message}</small>
          </div>
        </aside>
        {menuOpen ? (
          <button
            className="sidebar-backdrop"
            aria-label="Закрыть меню"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
        <main className="workspace">
          {selectedTab?.serverId && team.user?.role !== 'viewer' ? <div className="team-apply-bar no-print"><span>Общий проект · {selectedTab.serverName || project.meta.customer || `№ ${project.meta.projectNum}`}</span><button className="button primary" onClick={applyTeamProjectChanges} disabled={applyProjectBusy || team.current?.id !== selectedTab.serverId}>{applyProjectBusy ? 'Применяю…' : 'Применить изменения'}</button></div> : null}
          {team.projectSaveConflict && team.current ? <div className="notice no-print" role="alert">{team.projectSaveConflict} <button className="button secondary" onClick={saveProject}>Скачать копию проекта</button><button className="button secondary" onClick={() => { setTeamFocus('projects'); setActive('team'); }}>Открыть общие проекты</button></div> : null}
          {team.user && team.priceCatalog.status !== 'ready' ? <div className="notice no-print" role="alert">Не удалось подтвердить актуальные цены: {team.priceCatalog.error}. Планы доступны; смета станет доступна после обновления прайса. <button className="button secondary" onClick={() => team.refreshPriceCatalog().catch(() => {})}>Обновить прайс</button></div> : null}
          {appUpdateReady ? <div className="notice no-print" role="status">Доступна новая версия калькулятора. Сохраните проект, затем обновите страницу. <button className="button secondary" onClick={() => { const url = new URL(window.location.href); url.searchParams.set('refresh', String(Date.now())); window.location.assign(url.href); }}>Обновить версию</button></div> : null}
          {team.refreshError || team.mailError ? <div className="notice no-print" role="alert">
            {team.refreshError ? `Общие проекты и анкеты могут быть неактуальны: ${team.refreshError}. ` : ""}
            {team.mailError ? `Статус почты может быть неактуален: ${team.mailError}.` : ""}
            <button className="button secondary" onClick={() => { team.refresh().catch(() => {}); team.refreshMailStatus().catch(() => {}); }}>Повторить</button>
          </div> : null}
          {showLocalPriceChangeNotice(team.user, priceChanges, priceFingerprint, dismissedPriceFingerprint) ? (
            <div><button
              className="price-change-banner no-print"
              onClick={() => setActive("price")}
            >
              <BadgeAlert />
              <span>
                <strong>Прайс-лист изменён</strong>
                <small>
                  {priceChanges.priceChanged
                    ? `Цены: ${priceChanges.priceChanged}. `
                    : ""}
                  {priceChanges.added
                    ? `Добавлено: ${priceChanges.added}. `
                    : ""}
                  {priceChanges.removed
                    ? `Удалено: ${priceChanges.removed}.`
                    : ""}{" "}
                  Нажмите, чтобы проверить.
                </small>
              </span>
            </button><button className="button secondary no-print" onClick={() => {
              if (!isPriceEditorUnlocked()) {
                const code = window.prompt('Введите код доступа к прайс-листу');
                if (code === null) return;
                if (!verifyPricePasscode(code)) { window.alert('Неверный код'); return; }
                setPriceEditorUnlocked(true);
              }
              if (window.confirm('Восстановить базовый прайс? Изменённые цены и добавленные позиции будут сброшены. Действие можно отменить.')) commit(next => ({ ...next, ...createDefaultPriceLists() }));
            }}>Сбросить прайс</button><button className="button secondary no-print" onClick={() => { localStorage.setItem('eft-dismissed-price-notice', priceFingerprint); setDismissedPriceFingerprint(priceFingerprint); }}>Скрыть уведомление</button></div>
          ) : null}
          <ScreenErrorBoundary key={active} onBack={() => setActive("plan")}>
            <Suspense
              fallback={<div className="screen-loader">Загружаю раздел…</div>}
            >
              {team.user && team.priceCatalog.status !== 'ready' && !['plan','parameters','team','files','mail','knowledge','sip-guide','price','cutting'].includes(active) ? <div className="notice">Для расчёта и печати необходимо получить актуальный серверный прайс.</div> : <Screen
                active={active}
                planCommand={planCommand}
                onPlanCommandHandled={() => setPlanCommand(null)}
                onOpenLibraryPlan={entryId => runPlanCommand('openLibraryEntry', { entryId })}
                calculation={calculation}
                onNavigate={setActive}
                teamProps={{
                  project,
                  onOpenProject: openTeamProject,
                  onRestoreVersion: restoreTeamVersion,
                  onEditProject: (id) => openTeamProject(id, 'parameters'),
                  onCreatedProject: (created) => {
                    replaceTab(activeTabId, created.payload);
                    attachServer(activeTabId, created.id, created.name, created.revision);
                  },
                  onImportIntake: importTeamIntake,
                  focusTab: teamFocus,
                }}
              />}
            </Suspense>
          </ScreenErrorBoundary>
        </main>
        {['plan', 'placement'].includes(active) || (team.user && team.priceCatalog.status !== 'ready') ? null : <ProjectSummarySidebar
          project={project}
          calculation={calculation}
          onNavigate={setActive}
        />}
      </div>
      <nav className="mobile-bottom-nav" aria-label="Основные разделы">
        {[
          ['plan','План',Home],['placement','Инженерия',Layers3],['estimate','Смета',Calculator],['menu','Разделы',Menu],
        ].map(([id,label,Icon])=><button key={id} className={active===id?'active':''} aria-label={label} aria-current={active===id?'page':undefined} onClick={()=>id==='menu'?setMenuOpen(true):(setActive(id),setMenuOpen(false))}><Icon/><span>{label}</span></button>)}
      </nav>
      {saveFileOpen ? <div className="modal-backdrop project-save-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saveFileBusy) setSaveFileOpen(false); }}>
        <form className="modal project-save-dialog" role="dialog" aria-modal="true" aria-label="Сохранить проект как" onSubmit={event => { event.preventDefault(); confirmSaveProject(); }}>
          <header><div><h2>Сохранить проект как</h2><p>Укажите имя файла. В поддерживаемом браузере затем выберите папку сохранения.</p></div><button type="button" className="icon-button" aria-label="Закрыть" onClick={() => setSaveFileOpen(false)} disabled={saveFileBusy}><X/></button></header>
          <label>Название файла<input autoFocus value={saveFileName} onChange={event => setSaveFileName(event.target.value)} aria-label="Название файла проекта"/></label>
          {saveFileError ? <p role="alert">{saveFileError}</p> : null}
          <footer><button type="button" className="button secondary" onClick={() => setSaveFileOpen(false)} disabled={saveFileBusy}>Отмена</button><button type="submit" className="button" disabled={saveFileBusy}>{saveFileBusy ? 'Сохранение…' : 'Выбрать место и сохранить'}</button></footer>
        </form>
      </div> : null}
      {closingTabId ? <div className="modal-backdrop project-save-backdrop">
        <section className="modal project-save-dialog" role="dialog" aria-modal="true" aria-labelledby="close-project-tab-title">
          <header><div><h2 id="close-project-tab-title">Закрыть вкладку проекта?</h2><p>Можно сохранить текущую версию в библиотеке или закрыть вкладку без новой копии. Уже сохранённые планы останутся в библиотеке.</p></div><button type="button" className="icon-button" aria-label="Отмена" onClick={() => setClosingTabId(null)} disabled={closingTabBusy}><X/></button></header>
          <p><strong>{tabs.find(tab => tab.id === closingTabId)?.serverName || tabs.find(tab => tab.id === closingTabId)?.meta?.projectName || `Проект № ${tabs.find(tab => tab.id === closingTabId)?.meta?.projectNum || '—'}`}</strong></p>
          {closingTabError ? <p role="alert">{closingTabError}</p> : null}
          <footer><button type="button" className="button secondary" onClick={() => setClosingTabId(null)} disabled={closingTabBusy}>Отмена</button><button type="button" className="button secondary" onClick={() => confirmCloseProjectTab(false)} disabled={closingTabBusy}>Закрыть без новой копии</button><button type="button" className="button primary" onClick={() => confirmCloseProjectTab(true)} disabled={closingTabBusy}>{closingTabBusy ? 'Сохранение…' : 'Сохранить в библиотеку и закрыть'}</button></footer>
        </section>
      </div> : null}
      {newProjectOpen ? (
        <NewProjectDialog
          onClose={() => setNewProjectOpen(false)}
          onCreate={createNewProject}
        />
      ) : null}
      {briefPreview ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setBriefPreview(null)}
        >
          <section
            className="modal client-brief-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="brief-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2 id="brief-title">Заявка клиента</h2>
                <p>{briefPreview.fileName}</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setBriefPreview(null)}
                aria-label="Закрыть"
              >
                <X />
              </button>
            </header>
            <dl className="brief-summary">
              <div>
                <dt>Клиент</dt>
                <dd>{briefPreview.summary.customer}</dd>
              </div>
              <div>
                <dt>Тип строения</dt>
                <dd>{briefPreview.summary.buildingType}</dd>
              </div>
              <div>
                <dt>Связь</dt>
                <dd>{briefPreview.summary.contact}</dd>
              </div>
              <div>
                <dt>Адрес</dt>
                <dd>{briefPreview.summary.address}</dd>
              </div>
              <div>
                <dt>Размер строения</dt>
                <dd>{briefPreview.summary.dimensions}</dd>
              </div>
              <div>
                <dt>Этажей</dt>
                <dd>{briefPreview.summary.floors}</dd>
              </div>
              <div>
                <dt>Площадь</dt>
                <dd>{briefPreview.summary.area}</dd>
              </div>
              <div>
                <dt>Готовность</dt>
                <dd>{briefPreview.summary.readiness}</dd>
              </div>
              <div className="wide">
                <dt>Что посчитать</dt>
                <dd>{briefPreview.summary.scope}</dd>
              </div>
            </dl>
            {briefPreview.brief?.serverAttachments?.length ? <div className="brief-attachments"><strong>Приложенные файлы</strong>{briefPreview.brief.serverAttachments.map((file) => <a key={file.id} href={`${resolveEftApiUrl()}?action=attachment&id=${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">{file.original_name}</a>)}</div> : null}
            <div className="brief-warning">
              <strong>Будет создан новый черновик.</strong>
              <span>
                Текущий проект сохранится в резервной копии. Цены и расчётные
                правила останутся прежними. Размеры создадут пустой
                прямоугольный план; помещения, окна, двери и террасу нужно
                проверить и нанести вручную.
              </span>
            </div>
            <footer>
              <button
                className="button secondary"
                onClick={() => setBriefPreview(null)}
              >
                Отмена
              </button>
              <button className="button" onClick={applyClientBrief}>
                Создать черновик
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {backupOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setBackupOpen(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2 id="backup-title">История проектов и резервные копии</h2>
                <p>
                  Проект попадает сюда при открытии, создании и сохранении.
                  Хранятся в этом браузере.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setBackupOpen(false)}
                aria-label="Закрыть"
              >
                <X />
              </button>
            </header>
            {backups.length ? (
              <div className="backup-list">
                {backups.map((backup) => (
                  <button
                    key={backup.backupId || backup.savedAt}
                    onClick={() => {
                      openTab(backup);
                      rememberOpenedProject(backup);
                      setActive('plan');
                      setBackupOpen(false);
                      setNotice("Проект из истории открыт в новой вкладке");
                    }}
                  >
                    <span>
                      <strong>
                        Проект № {backup.meta?.projectNum || "без номера"}
                      </strong>
                      <small>
                        {backup.meta?.customer || "Заказчик не указан"}
                      </small>
                    </span>
                    <time>
                      {new Date(backup.savedAt).toLocaleString("ru-RU")}
                    </time>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                Резервных копий пока нет. Нажмите дискету после важного
                изменения.
              </div>
            )}
            <footer>
              <button
                className="button secondary"
                onClick={() => setBackupOpen(false)}
              >
                Закрыть
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
