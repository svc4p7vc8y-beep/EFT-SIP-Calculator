import { useEffect, useMemo, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Printer, Plus, Trash2 } from 'lucide-react';
import { useProject } from '../state/ProjectContext.jsx';
import { normalizeProductionCutting } from '../state/production-cutting.js';
import { calculateProductionCutting, polygonBounds } from '../calculations/production-cutting.js';
import { SIP_GUIDE_ENTRIES } from '../data/sip-guide.js';
import '../styles/cutting.css';

const n = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(Number(value) || 0);
const pathFor = (shape, flipY) => shape.map(ring => ring.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${flipY == null ? p[1] : flipY - p[1]}`).join(' ') + 'Z').join(' ');
const sources = SIP_GUIDE_ENTRIES.filter(entry => ['sip-floor-ceiling-fasteners', 'sip-openings', 'sip-seam-screws', 'sip-roof'].includes(entry.id));

function NumberInput({ label, value, onChange, placeholder = 'Введите значение, мм', min = 0, max = 100000, suffix = 'мм' }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  return <label>{label}<span className="cut-input"><input aria-label={label} type="number" min={min} max={max} step="any" value={draft} placeholder={placeholder} onChange={event => setDraft(event.target.value)} onBlur={() => { if (String(draft) !== String(value ?? '')) onChange(draft); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><small>{suffix}</small></span></label>;
}

function Layout({ surface, parts, selected, onSelect }) {
  if (!surface?.geometry?.length) return <p className="cut-empty">Контур отсутствует. Добавьте геометрию на плане.</p>;
  const bounds = polygonBounds(surface.geometry.flat()), pad = Math.max(bounds.width, bounds.height) * 0.055;
  const flip = surface.horizontal ? null : bounds.y * 2 + bounds.height;
  return <svg className="cut-layout" viewBox={`${bounds.x - pad} ${bounds.y - pad} ${bounds.width + 2 * pad} ${bounds.height + 2 * pad}`} role="img" aria-label={`Раскладка: ${surface.name}`}>
    {surface.planStart ? <text x={bounds.x + bounds.width / 2} y={bounds.y - pad * 0.35} textAnchor="middle" fontSize={pad * 0.26}>На плане, мм: ({surface.planStart.map(n).join('; ')}) → ({surface.planEnd.map(n).join('; ')})</text> : null}
    {surface.geometry.map((shape, i) => <path key={i} d={pathFor(shape, flip)} fill="#f6f7ef" stroke="#88917c" strokeWidth="1" vectorEffect="non-scaling-stroke" fillRule="evenodd" />)}
    {parts.map(part => <g key={part.id} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={`Деталь ${part.id}, ${n(part.width)} на ${n(part.height)} мм`} onClick={() => onSelect?.(part.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.(part.id); } }}>
      <path d={pathFor(part.shape, flip)} fill={selected === part.id ? '#92ba67' : part.upperCourse ? '#f0d6a1' : '#deead1'} stroke="#517239" strokeWidth="1" vectorEffect="non-scaling-stroke" fillRule="evenodd" />
      <text x={part.x + part.width / 2} y={flip == null ? part.y + part.height / 2 : flip - part.y - part.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(part.width * 0.12, bounds.width * 0.018)}>{part.id.replace(`${surface.id}-`, '')}</text>
      <title>{part.id}: {n(part.width)} × {n(part.height)} × {part.thickness} мм</title>
    </g>)}
    <text x={bounds.x + bounds.width / 2} y={bounds.y + bounds.height + pad * 0.75} textAnchor="middle" fontSize={pad * 0.32}>{n(bounds.width)} мм</text>
    <text x={bounds.x - pad * 0.35} y={bounds.y + bounds.height / 2} textAnchor="middle" fontSize={pad * 0.32} transform={`rotate(-90 ${bounds.x - pad * 0.35} ${bounds.y + bounds.height / 2})`}>{n(bounds.height)} мм</text>
  </svg>;
}

function PanelTable({ parts, onSelect }) {
  return <div className="cut-table-wrap"><table><thead><tr><th>Марка</th><th>Заготовка Ш × Д, мм</th><th>Толщина</th><th>Площадь, м²</th><th>Положение X / Y, мм</th></tr></thead><tbody>{parts.map(part => <tr key={part.id}><td>{onSelect ? <button onClick={() => onSelect(part.id)}>{part.id}</button> : part.id}{part.upperCourse ? ' · добор' : ''}</td><td>{n(part.width)} × {n(part.height)}</td><td>{part.thickness}</td><td>{n(part.area / 1e6)}</td><td>{n(part.x)} / {n(part.y)}</td></tr>)}</tbody></table></div>;
}

function MemberTable({ members }) {
  return <div className="cut-table-wrap"><table><thead><tr><th>Марка / конструкция</th><th>Элемент</th><th>Сечение, мм</th><th>Чистая / заготовка, мм</th><th>Смежные панели</th></tr></thead><tbody>{members.map(part => <tr key={part.id}><td>{part.id}<small>{part.surface}</small></td><td>{part.material}<small>{part.source}</small></td><td>{part.profile}</td><td>{n(part.length)} / {n(part.cutLength)}</td><td>{part.panels.join(', ') || 'По ручной спецификации'}</td></tr>)}</tbody></table></div>;
}

function StockSheets({ report }) {
  return <div className="cut-stock-grid">{report.panelStock.sheets.map(sheet => <article key={sheet.id} className="cut-stock"><h3>{sheet.id} · {sheet.thickness} мм · {sheet.family}</h3><p>{n(sheet.width)} × {n(sheet.height)} мм</p><svg viewBox={`-30 -30 ${sheet.width + 60} ${sheet.height + 60}`} role="img" aria-label={`Карта заготовки ${sheet.id}`}><rect width={sheet.width} height={sheet.height} fill="#f7f4e9" stroke="#859471" />{sheet.parts.map(part => <g key={part.id}><rect x={part.x} y={part.y} width={part.width} height={part.height} fill="#dbe8d1" stroke="#54713c" strokeWidth="1" vectorEffect="non-scaling-stroke" /><text x={part.x + part.width / 2} y={part.y + part.height / 2} fontSize="35" textAnchor="middle">{part.id}</text></g>)}</svg><small>{sheet.parts.map(part => `${part.id}: X ${n(part.x)}, Y ${n(part.y)}, ${n(part.width)}×${n(part.height)}`).join('; ')}</small></article>)}</div>;
}

function PrintReport({ project, report, scope }) {
  const surfaces = scope === 'all' ? report.surfaces : report.surfaces.filter(s => s.id === scope);
  const members = scope === 'all' ? report.members : report.members.filter(m => m.surfaceId === scope);
  return <div className="production-print">
    <h1>ЭФТ · Раскрой домокомплекта</h1><p>Проект № {project.meta.projectNum || 'Не задан'} · {project.meta.customer || 'Заказчик не указан'} · {project.meta.address || 'Адрес не указан'}</p>
    <p>{new Date().toLocaleDateString('ru-RU')} · {scope === 'all' ? 'Полный комплект' : 'Выбранная конструкция'} · Все размеры в мм. Шаг каркаса {n(report.settings.frameStepMm)}. Пропил: {report.settings.kerfMm === '' ? 'НЕ ЗАДАН' : n(report.settings.kerfMm)}. Припуск на торец: {report.settings.endAllowanceMm === '' ? 'НЕ ЗАДАН' : n(report.settings.endAllowanceMm)}.</p>
    <h2>{report.issues.length ? 'Предварительный комплект — есть незаполненные данные' : 'Геометрическая деталировка — на проверку технологу'}</h2>
    {report.issues.length ? <ul>{report.issues.map((item, i) => <li key={i}>{item.message}</li>)}</ul> : null}
    <p>Паз, выборка утеплителя, угловые и Т-образные сопряжения, несущие перемычки и состав клеёного пакета — по утверждённым узлам. Размер заготовки панели указан по габариту; внутренние вырезы показаны на карте. Отходы внутри вырезов повторно не используются автоматически.</p>
    <p>Примечания: {report.settings.notes || 'Не заполнены. Укажите номер альбома узлов и требования к обработке.'}</p><p>Подготовил: __________________ Проверил: __________________ В производство: __________________</p>
    {surfaces.map(surface => { const parts = report.parts.filter(part => part.surfaceId === surface.id); return <section className="cut-print-surface" key={surface.id}><h2>{surface.name} · SIP {surface.thickness} мм</h2>{surface.blocked ? <p>Раскрой этой конструкции не сформирован: заполните данные проёмов.</p> : null}<Layout surface={surface} parts={parts} /><p>Начало координат — левый нижний угол развёртки стены; для перекрытия — координаты плана. Доборный ряд выделен светло-коричневым.</p><PanelTable parts={parts} /><h3>Контуры деталей и вырезов</h3>{parts.map(part => <p key={part.id}><b>{part.id}</b>: {part.shape.map((ring, i) => `${i ? 'вырез' : 'контур'} [${ring.map(([x, y]) => `${n(x - part.x)};${n(y - part.y)}`).join(' / ')}]`).join(' · ')}</p>)}</section>; })}
    <section className="cut-print-surface"><h2>Шпонки и соединительные элементы</h2><MemberTable members={members} /></section>
    {scope === 'all' ? <><section className="cut-print-surface"><h2>Карты исходных панелей</h2><p>Прямоугольные заготовки; поворот и повторное использование фигурных отходов не применяются. Количество заготовок не заменяет закупку в смете.</p><StockSheets report={report} /></section><section className="cut-print-surface"><h2>Раскрой хлыстов {n(report.settings.stockLengthMm)} мм</h2>{report.timberStock.bars.map(bar => <p key={bar.id}><b>{bar.id} · {bar.material} {bar.profile}</b>: {bar.parts.map(part => `${part.id} — ${n(part.length)} мм (от ${n(part.start)})`).join('; ')}. Остаток {n(report.settings.stockLengthMm - bar.used)} мм.</p>)}</section></> : null}
    <p>Источник принципов соединений: «Как собрать СИП-дом самому?», Курмановы, печатные стр. 34–64 (перекрытия), 107–123 (проёмы), 12, 34, 60, 78, 143–144 (швы и кромки). Числовые настройки взяты из проекта; рекомендации книги не заменяют рабочие узлы.</p>
  </div>;
}

export default function CuttingScreen({ calculation }) {
  const { project, commit } = useProject();
  const [tab, setTab] = useState('panels'), [surfaceId, setSurfaceId] = useState(''), [selectedId, setSelectedId] = useState(''), [printScope, setPrintScope] = useState(null);
  const settings = normalizeProductionCutting(project.settings.productionCutting);
  const result = useMemo(() => { try { return { report: calculateProductionCutting(project, calculation) }; } catch (error) { return { error: error.message }; } }, [project, calculation]);
  const report = result.report;
  const surface = report?.surfaces.find(item => item.id === surfaceId) || report?.surfaces[0];
  const parts = report?.parts.filter(item => item.surfaceId === surface?.id) || [];
  const selected = parts.find(item => item.id === selectedId) || parts[0];
  const update = patch => commit(next => { next.settings.productionCutting = normalizeProductionCutting({ ...next.settings.productionCutting, ...patch }); return next; });
  const print = scope => { flushSync(() => setPrintScope(scope)); document.body.classList.add('print-production'); window.print(); };
  useEffect(() => { const cleanup = () => { document.body.classList.remove('print-production'); setPrintScope(null); }; window.addEventListener('afterprint', cleanup); return () => { window.removeEventListener('afterprint', cleanup); document.body.classList.remove('print-production'); }; }, []);
  return <section className="screen cutting-screen">
    <div className="screen-header"><div><span className="eyebrow">ПРОИЗВОДСТВО ДОМОКОМПЛЕКТА</span><h1>Раскрой</h1><p>Панели, доборы по высоте, шпонки и соединительные элементы из текущего проекта.</p></div><button className="secondary-button" disabled={!report?.parts.length} onClick={() => print('all')}><Printer size={18} />Печать комплекта</button></div>
    <div className="cut-summary"><div><small>Детали панелей</small><strong>{report?.parts.length || 0}</strong></div><div><small>Доборы по высоте</small><strong>{report?.upperCourseCount || 0}</strong></div><div><small>Соединители</small><strong>{report?.members.length || 0}</strong></div><div><small>Панели-заготовки</small><strong>{report?.panelStock.sheets.length || 0}</strong></div></div>
    <div className="cut-tabs" role="group" aria-label="Разделы раскроя">{[['panels', 'Панели и развёртки'], ['members', 'Шпонки и брус'], ['stock', 'Карты заготовок'], ['settings', 'Исходные данные']].map(([key, title]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{title}</button>)}</div>
    {result.error ? <p className="cut-notice" role="alert">Не удалось построить раскрой: {result.error}. Проверьте размеры в исходных данных.</p> : null}
    {report?.issues.length ? <details className="cut-notice"><summary>Требуется заполнить / проверить: {report.issues.length}</summary><ul>{report.issues.map((item, i) => <li key={i}>{item.message}</li>)}</ul><button onClick={() => setTab('settings')}>Перейти к исходным данным</button></details> : <p className="cut-note">Геометрическая деталировка сформирована. Рабочие узлы и обработку проверяет технолог перед передачей в производство.</p>}
    {tab === 'settings' ? <div className="cut-card"><h2>Настройки производства</h2><p>Размер панели {n(report?.panelWidth)} × {n(report?.panelLength)} мм берётся из формул проекта. Эта ведомость не меняет сметные количества и цены.</p><div className="cut-fields">
      <NumberInput label="Шаг силового каркаса" value={settings.frameStepMm} min={100} max={2500} onChange={value => update({ frameStepMm: value })} />
      <NumberInput label="Ширина пропила" value={settings.kerfMm} max={20} placeholder="Укажите пропил станка" onChange={value => update({ kerfMm: value })} />
      <NumberInput label="Припуск на каждый торец бруса" value={settings.endAllowanceMm} max={100} placeholder="0 — без припуска" onChange={value => update({ endAllowanceMm: value })} />
      <NumberInput label="Длина хлыста" value={settings.stockLengthMm} min={500} max={15000} onChange={value => update({ stockLengthMm: value })} />
      <NumberInput label="Ширина соединительной шпонки" value={settings.splineWidthMm} min={20} max={300} onChange={value => update({ splineWidthMm: value })} />
      <NumberInput label="Толщина торцевой доски" value={settings.edgeWidthMm} min={20} max={300} onChange={value => update({ edgeWidthMm: value })} />
    </div><label className="cut-check"><input type="checkbox" checked={settings.staggered} onChange={event => update({ staggered: event.target.checked })} />Шахматная раскладка пола и потолка</label>
    <h2>Отметки окон и проёмов</h2><p>Ширина и высота берутся с плана. Для дверей начальная отметка — 0; для окон заполните расстояние от пола до низа проёма.</p><div className="cut-fields">{report?.openings.map(opening => <NumberInput key={opening.key} label={`${opening.name} · ${opening.width}×${opening.height}`} value={opening.sill} placeholder="Низ проёма от пола" onChange={value => update({ openingSills: { ...settings.openingSills, [opening.key]: value } })} />)}</div>{!report?.openings.length ? <p className="cut-empty">Проёмов для SIP-раскроя пока нет. Добавьте окна и двери на плане.</p> : null}
    <h2>Добавочная высота стен</h2><p>При высоте больше длины панели автоматически формируется доборный ряд. Здесь можно задать производственный добор сверх высоты плана; он не увеличивает смету.</p><button onClick={() => update({ wallAdditions: {} })}>Сбросить добавочные высоты</button><div className="cut-fields">{report?.walls.map(wall => <NumberInput key={wall.key} label={`${wall.name} · база ${wall.baseHeight} мм`} value={settings.wallAdditions[wall.key] ?? 0} placeholder="Добавочная высота" max={10000} onChange={value => update({ wallAdditions: { ...settings.wallAdditions, [wall.key]: value } })} />)}</div>
    <h2>Специальные соединительные элементы</h2><p>Для ригелей, угловых закладных, Т-стыков, отдельных досок клеёного пакета и деталей пристроек.</p>{settings.manualParts.map((part, index) => <div className="cut-manual" key={part.id}><label>Название<input value={part.name || ''} placeholder="Например: закладная угла У-1" onChange={event => update({ manualParts: settings.manualParts.map((p, i) => i === index ? { ...p, name: event.target.value } : p) })} /></label><label>Сечение<input value={part.profile || ''} placeholder="145×90, по проекту" onChange={event => update({ manualParts: settings.manualParts.map((p, i) => i === index ? { ...p, profile: event.target.value } : p) })} /></label><NumberInput label="Чистая длина" value={part.length} onChange={value => update({ manualParts: settings.manualParts.map((p, i) => i === index ? { ...p, length: value } : p) })} /><NumberInput label="Количество" value={part.quantity} min={1} max={1000} suffix="шт." placeholder="Количество деталей" onChange={value => update({ manualParts: settings.manualParts.map((p, i) => i === index ? { ...p, quantity: value } : p) })} /><button aria-label={`Удалить деталь ${index + 1}`} onClick={() => update({ manualParts: settings.manualParts.filter((_, i) => i !== index) })}><Trash2 size={18} /></button></div>)}<button onClick={() => update({ manualParts: [...settings.manualParts, { id: crypto.randomUUID(), name: '', profile: '', length: '', quantity: 1 }] })}><Plus size={16} />Добавить деталь</button>
    <label className="cut-notes">Указания производству<textarea value={settings.notes} placeholder="Номер альбома узлов, глубина выборки утеплителя, пазы, допуски, маркировка и требования к упаковке…" onChange={event => update({ notes: event.target.value })} /></label>
    <h2>Основание по книге</h2><p>«Как собрать СИП-дом самому?», А. С. Курманов, К. С. Курманов, Е. В. Курманова. Применены принципы обрамления и соединений из сохранённой карты книги. Размеры пазов и несущих деталей указываются по рабочим узлам проекта.</p>{sources.map(source => <p key={source.id}><b>Стр. {source.pages} · {source.section}.</b> {source.summary}</p>)}</div> : null}
    {tab === 'panels' && report ? <div className="cut-card"><div className="cut-toolbar"><label>Конструкция<select aria-label="Конструкция" value={surface?.id || ''} onChange={event => { setSurfaceId(event.target.value); setSelectedId(''); }}>{report.surfaces.map(item => <option value={item.id} key={item.id}>{item.name}{item.blocked ? ' · нужны данные' : ''}</option>)}</select></label><button disabled={!surface} onClick={() => print(surface.id)}><Printer size={16} />Печать конструкции</button></div>
      {surface?.blocked ? <p className="cut-empty">Развёртка ожидает отметки и размеры проёмов. Откройте «Исходные данные».</p> : <Layout surface={surface} parts={parts} selected={selected?.id} onSelect={setSelectedId} />}
      <p className="cut-note">Нажмите на деталь для размеров. Зелёный — выбранная деталь; светло-коричневый — добор по высоте. Оси X/Y — вдоль стены и от пола, для перекрытий — координаты плана.</p>
      {selected ? <div className="cut-detail"><div><h2>{selected.id}</h2><p>{n(selected.width)} × {n(selected.height)} × {selected.thickness} мм · {n(selected.area / 1e6)} м²</p><p>Контур и вырезы относительно левого нижнего угла детали (X; Y), мм:</p>{selected.shape.map((ring, i) => <p key={i}><b>{i ? `Вырез ${i}` : 'Контур'}:</b> {ring.map(([x, y]) => `${n(x - selected.x)}; ${n(y - selected.y)}`).join(' → ')}</p>)}</div><Layout surface={{ ...surface, geometry: [selected.shape] }} parts={[selected]} selected={selected.id} /></div> : null}<PanelTable parts={parts} onSelect={setSelectedId} />{!parts.length ? <p className="cut-empty">Детали пока не сформированы. Заполните контур и исходные данные.</p> : null}</div> : null}
    {tab === 'members' && report ? <div className="cut-card"><h2>Ведомость шпонок, бруса и обрамления</h2><p>Ш — общий шов панелей, Т — открытая кромка или обрамление проёма. Клеёный пакет указан как сборочный элемент; его состав задайте в специальных деталях. Длина заготовки включает два торцевых припуска.</p><MemberTable members={report.members} />{!report.members.length ? <p className="cut-empty">Нет соединительных элементов. Сначала сформируйте панели или добавьте ручную деталь.</p> : null}</div> : null}
    {tab === 'stock' && report ? <div className="cut-card"><h2>Карты исходных панелей</h2><p>Раскладка прямоугольных заготовок с пропилом. Заготовки разных толщин и семейств разделены. Фигурные отходы и вырезы не используются повторно автоматически; запас из сметы не считается изготовленной деталью.</p><StockSheets report={report} /><h2>Раскрой хлыстов</h2><div className="cut-bars">{report.timberStock.bars.map(bar => <article key={bar.id}><b>{bar.id} · {bar.material} {bar.profile}</b><div className="cut-bar">{bar.parts.map(part => <span key={part.id} style={{ left: `${part.start / settings.stockLengthMm * 100}%`, width: `${part.length / settings.stockLengthMm * 100}%` }} title={`${part.id}: ${part.length} мм`} />)}</div><small>{bar.parts.map(part => `${part.id}: ${n(part.length)} мм`).join(' · ')} · Остаток {n(settings.stockLengthMm - bar.used)} мм</small></article>)}</div></div> : null}
    {printScope && report ? createPortal(<PrintReport project={project} report={report} scope={printScope} />, document.body) : null}
  </section>;
}
