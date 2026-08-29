import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import {
  Calculator, ChevronLeft, ChevronRight, ClipboardPaste, FilePlus2, FileUp, HardHat, History, Home, Layers3,
  Menu, Moon, PaintRoller, PanelTop, Ruler, Save, Settings2, Sun, Tags, Trees,
  Truck, Wrench, X
} from 'lucide-react';
import { useProject } from '../state/ProjectContext.jsx';
import { calculateProject } from '../calculations/estimate-engine.js';
import { calculateAdjustedPrice } from '../calculations/price-adjustments.js';
import { createProjectWithCurrentPrices, migrateProject, REACT_BACKUPS_KEY, REACT_PROJECT_VERSION } from '../state/project-model.js';
import { formatMoney } from '../utils/format.js';
import ProjectSummarySidebar from '../components/ProjectSummarySidebar.jsx';
import {
  clientBriefSummary,
  createProjectFromClientBrief,
  validateClientBrief,
} from '../storage/client-brief.js';

const PlanScreen = lazy(() => import('../screens/PlanScreen.jsx'));
const ParametersScreen = lazy(() => import('../screens/ParametersScreen.jsx'));
const Calculators = lazy(() => import('../screens/Calculators.jsx'));
const PriceScreen = lazy(() => import('../screens/PriceScreen.jsx'));
const EstimateScreen = lazy(() => import('../screens/EstimateScreen.jsx'));
const CalculationSettingsScreen = lazy(() => import('../screens/CalculationSettingsScreen.jsx'));

const NAV_ITEMS = [
  { id: 'plan', label: 'План дома', icon: Ruler, group: 'project' },
  { id: 'parameters', label: 'Параметры', icon: Settings2, group: 'project' },
  { id: 'piles', label: 'Сваи', icon: HardHat, group: 'calculate' },
  { id: 'sip', label: 'СИП', icon: Layers3, group: 'calculate' },
  { id: 'roof', label: 'Кровля', icon: Home, group: 'calculate' },
  { id: 'terrace', label: 'Терраса', icon: Trees, group: 'calculate' },
  { id: 'openings', label: 'Окна / двери', icon: PanelTop, group: 'calculate' },
  { id: 'engineering', label: 'Инженерия', icon: Wrench, group: 'calculate' },
  { id: 'finishing', label: 'Отделка', icon: PaintRoller, group: 'calculate' },
  { id: 'delivery', label: 'Доставка', icon: Truck, group: 'calculate' },
  { id: 'price', label: 'Прайс-лист', icon: Tags, group: 'data' },
  { id: 'estimate', label: 'Смета', icon: Calculator, group: 'data' }
];

function downloadProject(project) {
  const payload = { ...project, savedAt: new Date().toISOString(), appVersion: REACT_PROJECT_VERSION, schemaVersion: 4 };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Проект_ЭФТ_${project.meta.projectNum || 'без_номера'}_${project.meta.date}.eft.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function Screen({ active }) {
  if (active === 'plan') return <PlanScreen />;
  if (active === 'parameters') return <ParametersScreen />;
  if (active === 'price') return <PriceScreen />;
  if (active === 'estimate') return <EstimateScreen />;
  if (active === 'calculation-settings') return <CalculationSettingsScreen />;
  return <Calculators type={active} />;
}

export function App() {
  const { project, replace, undo, redo, canUndo, canRedo, checkpoint, saveState } = useProject();
  const [active, setActive] = useState('plan');
  const [theme, setTheme] = useState(() => localStorage.getItem('eft-react-theme') || 'light');
  const [menuOpen, setMenuOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [briefPreview, setBriefPreview] = useState(null);
  const [notice, setNotice] = useState('Готово');
  const fileRef = useRef(null);
  const briefFileRef = useRef(null);
  const calculation = useMemo(() => calculateProject(project), [project]);
  const adjustedPrice = useMemo(
    () => calculateAdjustedPrice(project, calculation),
    [project, calculation],
  );

  const changeTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('eft-react-theme', next);
  };

  const importProject = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      replace(migrateProject(JSON.parse(await file.text())));
      setNotice(`Открыт проект: ${file.name}`);
    } catch (error) {
      setNotice(`Не удалось открыть проект: ${error.message}`);
    } finally {
      event.target.value = '';
    }
  };

  const importClientBrief = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const brief = validateClientBrief(JSON.parse(await file.text()));
      setBriefPreview({ fileName: file.name, brief, summary: clientBriefSummary(brief) });
    } catch (error) {
      setNotice(`Не удалось открыть заявку: ${error.message}`);
    } finally {
      event.target.value = '';
    }
  };

  const applyClientBrief = () => {
    if (!briefPreview) return;
    checkpoint();
    replace(createProjectFromClientBrief(project, briefPreview.brief));
    setActive('parameters');
    setNotice(`Создан черновик по заявке: ${briefPreview.fileName}`);
    setBriefPreview(null);
  };

  const newProject = () => {
    if (!window.confirm('Создать новый проект? Текущий проект сначала будет сохранён резервной копией.')) return;
    checkpoint();
    replace(createProjectWithCurrentPrices(project));
    setActive('plan');
    setNotice('Создан новый проект');
  };

  const saveProject = () => {
    checkpoint();
    downloadProject(project);
    setNotice('Проект сохранён на компьютер и в резервные копии');
  };

  const backups = useMemo(() => {
    if (!backupOpen) return [];
    try { return JSON.parse(localStorage.getItem(REACT_BACKUPS_KEY) || '[]'); } catch { return []; }
  }, [backupOpen]);

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
          <div><strong>ЭнергоЭффективные Технологии</strong><span>React-конструктор СИП-домов</span></div>
          <span className="version-badge">Версия {REACT_PROJECT_VERSION}</span>
        </div>
        <div className="header-totals" aria-label="Итоги проекта">
          <div><span>Материалы</span><strong>{formatMoney(calculation.totals.materials)}</strong></div>
          <div><span>Работы</span><strong>{formatMoney(calculation.totals.labor)}</strong></div>
          <div className="grand"><span>Итого</span><strong>{formatMoney(calculation.totals.total)}</strong></div>
          <div className="adjusted"><span>Изменённая цена</span><strong>{formatMoney(adjustedPrice.total)}</strong></div>
        </div>
        <div className="header-actions">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Открыть меню"><Menu /></button>
          <button className="icon-button" onClick={undo} disabled={!canUndo} aria-label="Отменить"><ChevronLeft /></button>
          <button className="icon-button" onClick={redo} disabled={!canRedo} aria-label="Повторить"><ChevronRight /></button>
          <button className="icon-button" onClick={changeTheme} aria-label="Сменить тему">{theme === 'light' ? <Moon /> : <Sun />}</button>
          <button className={`icon-button ${active === 'calculation-settings' ? 'active' : ''}`} onClick={() => setActive('calculation-settings')} aria-label="Настройка расчётов" title="Настройки"><Settings2 /></button>
          <button className="icon-button" onClick={newProject} aria-label="Новый проект"><FilePlus2 /></button>
          <button className="icon-button" onClick={saveProject} aria-label="Сохранить проект"><Save /></button>
          <button className="icon-button" onClick={() => fileRef.current?.click()} aria-label="Открыть проект"><FileUp /></button>
          <button className="icon-button brief-import-button" onClick={() => briefFileRef.current?.click()} aria-label="Импортировать заявку клиента" title="Заявка клиента"><ClipboardPaste /></button>
          <button className="icon-button" onClick={() => setBackupOpen(true)} aria-label="Резервные копии"><History /></button>
          <input ref={fileRef} className="visually-hidden" type="file" accept=".json,.eft.json" onChange={importProject} />
          <input ref={briefFileRef} className="visually-hidden" type="file" accept=".eft-brief.json,application/json" onChange={importClientBrief} />
        </div>
      </header>
      <div className="app-layout">
        <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
          <div className="sidebar-mobile-head"><strong>Разделы</strong><button onClick={() => setMenuOpen(false)}><X /></button></div>
          <nav aria-label="Разделы калькулятора">
            {NAV_ITEMS.map(({ id, label, icon: Icon, group }, index) => (
              <div key={id} className={index && NAV_ITEMS[index - 1].group !== group ? 'nav-separator' : ''}>
                <button className={active === id ? 'active' : ''} onClick={() => { setActive(id); setMenuOpen(false); }}>
                  <Icon /><span>{label}</span>
                </button>
              </div>
            ))}
          </nav>
          <div className={`sidebar-status ${saveState.status}`}><span className="status-dot" />{notice}<small>{saveState.message}</small></div>
        </aside>
        {menuOpen ? <button className="sidebar-backdrop" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} /> : null}
        <main className="workspace">
          <Suspense fallback={<div className="screen-loader">Загружаю раздел…</div>}>
            <Screen active={active} />
          </Suspense>
        </main>
        <ProjectSummarySidebar project={project} calculation={calculation} onNavigate={setActive} />
      </div>
      {briefPreview ? <div className="modal-backdrop" role="presentation" onMouseDown={() => setBriefPreview(null)}><section className="modal client-brief-modal" role="dialog" aria-modal="true" aria-labelledby="brief-title" onMouseDown={(event) => event.stopPropagation()}><header><div><h2 id="brief-title">Заявка клиента</h2><p>{briefPreview.fileName}</p></div><button className="icon-button" onClick={() => setBriefPreview(null)} aria-label="Закрыть"><X /></button></header><dl className="brief-summary"><div><dt>Клиент</dt><dd>{briefPreview.summary.customer}</dd></div><div><dt>Связь</dt><dd>{briefPreview.summary.contact}</dd></div><div><dt>Адрес</dt><dd>{briefPreview.summary.address}</dd></div><div><dt>Размер дома</dt><dd>{briefPreview.summary.dimensions}</dd></div><div><dt>Этажей</dt><dd>{briefPreview.summary.floors}</dd></div><div><dt>Площадь</dt><dd>{briefPreview.summary.area}</dd></div><div className="wide"><dt>Что посчитать</dt><dd>{briefPreview.summary.scope}</dd></div></dl><div className="brief-warning"><strong>Будет создан новый черновик.</strong><span>Текущий проект сохранится в резервной копии. Цены и расчётные правила останутся прежними. Размеры создадут пустой прямоугольный план; помещения, окна, двери и террасу нужно проверить и нанести вручную.</span></div><footer><button className="button secondary" onClick={() => setBriefPreview(null)}>Отмена</button><button className="button" onClick={applyClientBrief}>Создать черновик</button></footer></section></div> : null}
      {backupOpen ? <div className="modal-backdrop" role="presentation" onMouseDown={() => setBackupOpen(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="backup-title" onMouseDown={(event) => event.stopPropagation()}><header><div><h2 id="backup-title">Резервные копии</h2><p>Создаются при нажатии на дискету и перед новым проектом. Хранятся в этом браузере.</p></div><button className="icon-button" onClick={() => setBackupOpen(false)} aria-label="Закрыть"><X /></button></header>{backups.length ? <div className="backup-list">{backups.map((backup) => <button key={backup.backupId || backup.savedAt} onClick={() => { replace(backup); setBackupOpen(false); setNotice('Восстановлена резервная копия'); }}><span><strong>Проект № {backup.meta?.projectNum || 'без номера'}</strong><small>{backup.meta?.customer || 'Заказчик не указан'}</small></span><time>{new Date(backup.savedAt).toLocaleString('ru-RU')}</time></button>)}</div> : <div className="empty-state">Резервных копий пока нет. Нажмите дискету после важного изменения.</div>}<footer><button className="button secondary" onClick={() => setBackupOpen(false)}>Закрыть</button></footer></section></div> : null}
    </div>
  );
}
