import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Printer, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { EFT_NODE_TYPES, getEftNodeRule } from '../data/eft-node-library.js';
import { useProject } from '../state/ProjectContext.jsx';
import { useTeam } from '../cloud/TeamContext.jsx';
import { nodeRuleKey } from '../cloud/node-rule-scope.js';
import NodeJointSketch from './NodeJointSketch.jsx';
import { groupNodesAtAnchors, nextNodeAtAnchor } from './node-house-layers.js';

const NodeHouse3D = lazy(() => import('./NodeHouse3D.jsx'));

const formatNumber = (value, digits = 1) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number(value) || 0);
const weightSuffix = (quantity, kgEach) => Number(kgEach) > 0 ? ` (${formatNumber((Number(quantity) || 0) * Number(kgEach), 3)} кг)` : '';
const unassignedContext = {
  RAFTER_TO_MAUERLAT: 'В действующей смете указаны гвозди от 80 мм для стропильных узлов; точный диаметр и длина не заданы.',
  RAFTER_TO_RIDGE: 'В действующей смете указаны гвозди от 80 мм для стропильных узлов; точный диаметр и длина не заданы.',
  RAFTER_TIE: 'В действующей смете указаны гвозди от 80 мм для стропильных узлов; точный диаметр и длина не заданы.',
  ROOF_LATH: 'В смете используется общая позиция MAT-068 для обрешётки; конкретный типоразмер не определён.',
  PILE_BINDING: 'В смете используется позиция MAT-069 «глухари»; конкретный типоразмер не определён.',
};

const fastenerOverrideFrom = (value, fallback = {}) => {
  const size = value.trim().replace(/[xх]/gi, '×');
  if (!size) return undefined;
  const [diameterMm, lengthMm] = size.split('×').map(Number);
  return {
    ...fallback,
    size,
    diameterMm: Number.isFinite(diameterMm) ? diameterMm : fallback.diameterMm,
    lengthMm: Number.isFinite(lengthMm) ? lengthMm : fallback.lengthMm,
  };
};

const planPoints = (plan) => {
  if (Array.isArray(plan?.house?.points) && plan.house.points.length >= 3) return plan.house.points;
  const width = Number(plan?.house?.w) || 1;
  const height = Number(plan?.house?.h) || 1;
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
};

function SourceLabel({ source }) {
  if (!source) return <>Не указан</>;
  const type = source.type === 'EFT_BOOK' ? 'Книга EFT' : source.type === 'EFT_PROJECT_RULE' ? 'Норма проекта EFT' : source.type === 'UNCONFIRMED' ? 'Не подтверждено' : 'Справочник';
  return <>{type}{source.pages ? ` · стр. ${source.pages}` : ''}</>;
}

function NodeMap({ project, floorPlans, nodes, selectedId, onSelect }) {
  const [floor, setFloor] = useState('1');
  const [type, setType] = useState('all');
  const [showDisabled, setShowDisabled] = useState(false);
  const plan = floorPlans?.[Number(floor) - 1]?.plan || project.plan;
  const points = planPoints(plan);
  const xs = points.map((point) => Number(point.x) || 0);
  const ys = points.map((point) => Number(point.y) || 0);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - minX);
  const height = Math.max(1, Math.max(...ys) - minY);
  const markerRadius = Math.max(width, height) * 0.027;
  const floorNodes = nodes.map((node, index) => ({ ...node, number: index + 1 }))
    .filter(node => String(node.floor || 1) === floor && (showDisabled || node.enabled !== false));
  const visible = floorNodes.filter(node => type === 'all' || node.type === type);
  const markers = groupNodesAtAnchors(visible);
  const allXs = [...xs, ...markers.map(marker => marker.x)];
  const allYs = [...ys, ...markers.map(marker => marker.y)];
  const pad = markerRadius * 1.8;
  const left = Math.min(...allXs) - pad, top = Math.min(...allYs) - pad;
  const selected = visible.find(node => node.id === selectedId);
  return (
    <div className="node-map-wrap">
      <div className="node-map-controls">
        <label>Этаж<select aria-label="Этаж" value={floor} onChange={event => { setFloor(event.target.value); setType('all'); }}>
          {[...new Set(['1', ...nodes.map(node => String(node.floor || 1))])].sort().map(value => <option key={value} value={value}>{value} этаж</option>)}
        </select></label>
        <label>Показать узлы<select aria-label="Показать узлы" value={type} onChange={event => setType(event.target.value)}>
          <option value="all">Все типы ({floorNodes.length})</option>
          {EFT_NODE_TYPES.filter(item => floorNodes.some(node => node.type === item.value)).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select></label>
        <label className="node-map-disabled"><input type="checkbox" checked={showDisabled} onChange={event => setShowDisabled(event.target.checked)} />Показать отключённые</label>
      </div>
      <p className="node-map-help">Точки стоят на координатах узлов. Сводный узел отмечен на одном характерном соединении; количество в карточке относится ко всем таким соединениям. Если в точке несколько узлов, повторное нажатие переключает их.</p>
      <svg className="node-map" viewBox={`${left} ${top} ${Math.max(...allXs) + pad - left} ${Math.max(...allYs) + pad - top}`} role="group" aria-label="План с маркерами строительных узлов">
        <polygon points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
        {(plan.rooms || []).map(room => <polygon key={room.id} className="node-map-room" points={(room.points?.length ? room.points : [{ x: room.x, y: room.y }, { x: room.x + room.w, y: room.y }, { x: room.x + room.w, y: room.y + room.h }, { x: room.x, y: room.y + room.h }]).map(point => `${point.x},${point.y}`).join(' ')}><title>{room.name}</title></polygon>)}
        {markers.map(group => {
          const { x, y } = group;
          const active = group.nodes.find(node => node.id === selectedId);
          const shown = active || group.nodes[0];
          const review = group.nodes.some(node => node.requiresEngineeringReview);
          const disabled = group.nodes.every(node => node.enabled === false);
          const select = () => { const next = nextNodeAtAnchor(group, selectedId); if (next) onSelect(next.id); };
          return (
            <g key={group.key} className={`node-map-point ${active ? 'selected' : ''} ${disabled ? 'disabled-node' : review ? 'review-node' : ''}`} role="button" tabIndex="0" aria-pressed={!!active} aria-label={group.nodes.length > 1 ? `${group.nodes.length} узла в одной точке: ${group.nodes.map(node => node.name).join(', ')}` : `Узел ${shown.number}: ${shown.name}`} onClick={select} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } }}>
              <title>{group.nodes.map(node => `№ ${node.number} · ${node.name}`).join('\n')}</title>
              <circle cx={x} cy={y} r={markerRadius} />
              <text x={x} y={y} dy="0.34em" textAnchor="middle" fontSize={markerRadius * 0.95}>{shown.number}</text>
            </g>
          );
        })}
      </svg>
      <div className="node-map-legend"><span>Зелёный — выбран</span><span>Оранжевый контур — требует проверки</span><span>Пунктир — отключён</span></div>
      <div className="node-map-selection" aria-live="polite">{selected ? `Выбран № ${selected.number}: ${selected.name}. Крепёж: ${selected.fastener?.size || 'не назначен'}, ${selected.calculatedQty} шт.${weightSuffix(selected.calculatedQty, selected.fastener?.kgEach)}` : 'Выберите номер на схеме или строку в списке, чтобы открыть карточку узла.'}</div>
      <div className="node-map-list" aria-label="Список узлов на плане">
        {visible.map(node => <button type="button" key={node.id} aria-pressed={node.id === selectedId} onClick={() => onSelect(node.id)}>
          <b>{node.number}</b><span><strong>{node.name}</strong><small>{node.enabled === false ? 'Отключён' : node.requiresEngineeringReview ? 'Требует проверки' : 'Учитывается'} · {node.fastener?.size || 'Крепёж не назначен'} · {node.calculatedQty} шт.{weightSuffix(node.calculatedQty, node.fastener?.kgEach)}</small></span>
        </button>)}
        {!visible.length ? <p>Нет узлов для выбранного фильтра.</p> : null}
      </div>
    </div>
  );
}

function SharedFastenerEditor({ selected, nodes, team }) {
  const ruleKey = nodeRuleKey(selected);
  const shared = ruleKey ? team.nodeTypeRules?.[ruleKey] : null;
  const initial = shared?.fastener || selected.fastener || {};
  const [type, setType] = useState(initial.type || '');
  const [size, setSize] = useState(initial.size || '');
  const [kgEach, setKgEach] = useState(initial.kgEach ?? '');
  const [note, setNote] = useState(shared?.note || '');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const affected = ruleKey ? nodes.filter(node => nodeRuleKey(node) === ruleKey && !node.override?.fastenerOverride) : [];
  const save = async () => {
    setStatus('');
    if (!type.trim() || !/^(?:M)?\d+(?:[.,]\d+)?[×xх]\d+(?:[.,]\d+)?$/i.test(size.trim()) || !note.trim()) {
      setStatus('Укажите тип, размер в формате 8×320 и источник или основание решения.');
      return;
    }
    setSaving(true);
    try {
      await team.saveNodeTypeRule(ruleKey, { fastener: { type: type.trim(), size: size.trim(), kgEach: kgEach === '' ? null : Number(kgEach) }, note: note.trim() });
      setStatus('Общее правило сохранено на сервере для всех проектов сотрудников.');
    } catch (error) { setStatus(`Ошибка сохранения: ${error.message}`); }
    finally { setSaving(false); }
  };
  const reset = async () => {
    if (!window.confirm(`Удалить общее правило ${ruleKey}? Во всех проектах восстановится правило библиотеки EFT, кроме проектных переопределений.`)) return;
    setSaving(true);
    try { await team.saveNodeTypeRule(ruleKey, null); setStatus('Общее правило удалено; действует библиотека EFT.'); }
    catch (error) { setStatus(`Ошибка сброса: ${error.message}`); }
    finally { setSaving(false); }
  };
  return <div className="node-shared-editor">
    <h3>Крепёж для всех проектов сотрудников</h3>
    <p>Правило действует на тип <b>{selected.type}</b>{ruleKey !== selected.type ? ` при толщине ${selected.panelThickness} мм${selected.type === 'MAUERLAT' ? ` и варианте ${selected.fastenerSelection === 'anchors' ? 'анкеры' : 'саморезы'}` : ''}` : ''} во всех проектах. Проектные переопределения остаются приоритетными. В текущем проекте затронет {affected.length} узл.; количество крепежа не меняется, меняется типоразмер в заказе. Общая смета от этого выбора не пересчитывается автоматически.</p>
    <div className="node-edit-grid"><label>Тип крепежа<input value={type} onChange={event => setType(event.target.value)} placeholder="structural-screw" /></label><label>Типоразмер<input value={size} onChange={event => setSize(event.target.value)} placeholder="8×320" /></label></div>
    {selected.override?.fastenerOverride ? <button type="button" className="button secondary" onClick={() => { setType(selected.fastener?.type || ''); setSize(selected.fastener?.size || ''); setKgEach(selected.fastener?.kgEach ?? ''); }}>Взять крепёж из правки узла</button> : null}
    <label>Масса 1 шт., кг (если подтверждена)<input type="number" min="0" step="0.001" value={kgEach} onChange={event => setKgEach(event.target.value)} /></label>
    <label>Источник / основание общей нормы<textarea rows="2" value={note} onChange={event => setNote(event.target.value)} placeholder="Документ, страница или решение конструктора" /></label>
    <button type="button" className="button" onClick={save} disabled={saving || !ruleKey || !team.user || team.user.role === 'viewer'}>Сохранить для всех проектов</button>
    {shared ? <button type="button" className="button secondary" onClick={reset} disabled={saving || !team.user || team.user.role === 'viewer'}>Сбросить общее правило</button> : null}
    {!ruleKey ? <small>Для этого узла не определён конструктивный вариант; сначала задайте толщину и тип крепления в проекте.</small> : null}
    {!team.user ? <small>Войдите в общий кабинет для серверного сохранения.</small> : null}
    {status ? <p role="status">{status}</p> : null}
  </div>;
}

export default function NodeFastenersScreen({ calculation }) {
  const { project, commit, checkpoint } = useProject();
  const team = useTeam();
  const report = calculation.nodeFasteners;
  const [selectedId, setSelectedId] = useState(report.nodes[0]?.id || null);
  const [viewMode, setViewMode] = useState('3d');
  const detailRef = useRef(null);
  const selected = useMemo(() => report.nodes.find((node) => node.id === selectedId) || report.nodes[0] || null, [report.nodes, selectedId]);
  const checkNode = (id) => {
    setSelectedId(id);
    requestAnimationFrame(() => { detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); detailRef.current?.focus({ preventScroll: true }); });
  };

  const persistReport = () => {
    checkpoint();
    commit((next) => {
      next.construction = structuredClone(report.construction);
      next.settings.nodeFasteners.lastCalculatedAt = new Date().toISOString();
      return next;
    });
  };

  const updateNode = (node, patch) => commit((next) => {
    const index = next.nodes.findIndex((item) => item.id === node.id);
    const saved = index >= 0 ? next.nodes[index] : { id: node.id, type: node.type, source: node.source };
    const updated = { ...saved, ...patch };
    if (index >= 0) next.nodes[index] = updated;
    else next.nodes.push(updated);
    return next;
  });

  const addManualNode = () => commit((next) => {
    const id = `node-manual-${Date.now()}`;
    next.nodes.push({
      id,
      type: 'SIP_WALL_T',
      source: 'manual',
      floor: 1,
      x: (Number(next.plan.house?.w) || 0) / 2,
      y: (Number(next.plan.house?.h) || 0) / 2,
      length: 0,
      nodeCount: 1,
      calculatedQtyOverride: 0,
      enabled: true,
      requiresEngineeringReview: true,
    });
    setSelectedId(id);
    return next;
  });

  const removeManualNode = (node) => commit((next) => {
    next.nodes = next.nodes.filter((item) => item.id !== node.id);
    setSelectedId(null);
    return next;
  });

  const resetNode = (node) => commit((next) => {
    next.nodes = next.nodes.filter((item) => item.id !== node.id);
    return next;
  });

  const printOrder = () => {
    document.body.classList.add('print-node-order');
    const cleanup = () => document.body.classList.remove('print-node-order');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1500);
  };

  const reserve = project.settings.nodeFasteners?.reservePercent ?? 10;
  return (
    <section className="screen node-fasteners-screen">
      <header className="screen-header node-screen-header">
        <div><span className="eyebrow">УЗЛОВОЙ РАСЧЁТ EFT</span><h1>Метизы по узлам</h1><p>Геометрия → конструктив → узел → подтверждённая норма → закупка. Неподтверждённые нормы не начисляются молча.</p></div>
        <div className="node-header-actions"><button className="button secondary" onClick={printOrder}><Printer size={17} /> Печать заказа</button><button className="button" onClick={persistReport}><RefreshCw size={17} /> Рассчитать узлы и метизы</button></div>
      </header>

      {report.mode !== 'node' ? <div className="node-alert"><AlertTriangle /><div><strong>Для SIP сохранён быстрый режим по площади.</strong><span>Узловая диагностика показана отдельно, но действующую смету старого проекта она не заменяет до переключения режима.</span></div></div> : null}

      <div className="node-stat-grid">
        <div><span>Распознано</span><strong>{report.nodes.length}</strong><small>узлов и групп</small></div>
        <div><span>Типов</span><strong>{Object.keys(report.stats).length}</strong><small>кодов EFT</small></div>
        <div><span>К проверке</span><strong>{report.warnings.filter((item) => item.severity !== 'info').length}</strong><small>предупреждений</small></div>
        <label><span>Запас</span><span className="node-number"><input type="number" min="0" max="100" step="1" value={reserve} onChange={(event) => commit((next) => { next.settings.nodeFasteners.reservePercent = Math.max(0, Number(event.target.value) || 0); return next; })} /><b>%</b></span><small>для сводного заказа</small></label>
      </div>

      <div className="node-layout-grid">
        <section className="panel-card"><div className="node-card-title"><div><h2>Узлы на плане</h2><p>Выберите точку в 3D или номер в списке</p></div><button className="button secondary" onClick={addManualNode}><Plus size={16} /> Добавить узел</button></div><div className="node-view-switch"><button type="button" aria-pressed={viewMode === '3d'} onClick={() => setViewMode('3d')}>3D-дом</button><button type="button" aria-pressed={viewMode === '2d'} onClick={() => setViewMode('2d')}>2D-план</button></div>{viewMode === '3d' ? <><Suspense fallback={<p>Загрузка 3D-модели…</p>}><NodeHouse3D project={project} floorPlans={calculation.metrics?.floorPlans} nodes={report.nodes} selectedId={selected?.id} onSelect={setSelectedId} /></Suspense><div className="node-map-list" aria-label="Список узлов 3D-модели">{report.nodes.map((node, index) => <button type="button" key={node.id} aria-pressed={node.id === selected?.id} onClick={() => setSelectedId(node.id)}><b>{index + 1}</b><span><strong>{node.name}</strong><small>{node.fastener?.size || 'Типоразмер не назначен'} · {node.calculatedQty} шт.</small></span></button>)}</div></> : <NodeMap project={project} floorPlans={calculation.metrics?.floorPlans} nodes={report.nodes} selectedId={selected?.id} onSelect={setSelectedId} />}</section>
        <section className="panel-card node-detail-card" ref={detailRef} tabIndex="-1">
          <h2>Карточка узла</h2>
          {selected ? <>
            <div className="node-detail-heading"><span className="node-marker">{report.nodes.findIndex(node => node.id === selected.id) + 1}</span><div><strong>{selected.name}</strong><small>{selected.floor || 1} этаж · {selected.source === 'manual' ? 'Добавлен вручную' : 'Из расчёта конструкций'}</small></div></div>
            <NodeJointSketch node={selected} />
            <label>Название узла<input type="text" value={selected.override?.nameOverride ?? (selected.source === 'manual' ? selected.name : '')} placeholder={selected.name} onChange={(event) => updateNode(selected, { nameOverride: event.target.value || undefined })} /></label>
            <div className="node-edit-grid"><label>Раздел<input type="text" value={selected.override?.sectionOverride ?? (selected.source === 'manual' ? selected.section : '')} placeholder={selected.section} onChange={(event) => updateNode(selected, { sectionOverride: event.target.value || undefined })} /></label><label>Маркер<input type="text" maxLength="3" value={selected.override?.markerOverride ?? ''} placeholder={selected.marker} onChange={(event) => updateNode(selected, { markerOverride: event.target.value || undefined })} /></label></div>
            <label>Тип узла<select value={selected.type} onChange={(event) => updateNode(selected, { type: event.target.value })}>{EFT_NODE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.value} — {type.label}</option>)}</select></label>
            <label className="node-check"><input type="checkbox" checked={selected.enabled !== false} onChange={(event) => updateNode(selected, { enabled: event.target.checked })} /> Учитывать узел</label>
            <dl><div><dt>Элементы</dt><dd>{selected.elements.join(' + ') || 'Не описаны'}</dd></div><div><dt>Крепёж</dt><dd>{selected.fastener?.type || 'Не назначен'} {selected.fastener?.size || ''}</dd></div><div><dt>Длина / узлов</dt><dd>{formatNumber(selected.length, 2)} м / {selected.nodeCount}</dd></div><div><dt>Шаг</dt><dd>{selected.spacing ? `${formatNumber(selected.spacing, 3)} м` : 'Не задан'}</dd></div><div><dt>Количество</dt><dd>{selected.calculatedQty} шт.{weightSuffix(selected.calculatedQty, selected.fastener?.kgEach)}</dd></div><div><dt>Источник</dt><dd><SourceLabel source={selected.sourceReference} /></dd></div></dl>
            <label>Ручное количество, шт.<input type="number" min="0" step="1" value={selected.override?.calculatedQtyOverride ?? ''} placeholder={String(selected.calculatedQty)} onChange={(event) => updateNode(selected, { calculatedQtyOverride: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) })} /></label>
            <div className="node-edit-grid"><label>Ручной шаг, м<input type="number" min="0" step="0.05" value={selected.override?.spacingOverride ?? ''} placeholder={selected.spacing ? String(selected.spacing) : 'не задан'} onChange={(event) => updateNode(selected, { spacingOverride: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) })} /></label><label>Крепежей на узел<input type="number" min="0" step="1" value={selected.override?.qtyPerNodeOverride ?? ''} placeholder={selected.qtyPerNode ?? 'не задано'} onChange={(event) => updateNode(selected, { qtyPerNodeOverride: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) })} /></label></div>
            <div className="node-edit-grid"><label>Длина, м<input type="number" min="0" step="0.01" value={selected.override?.lengthOverride ?? ''} placeholder={String(selected.length || 0)} onChange={(event) => updateNode(selected, { lengthOverride: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) })} /></label><label>Число узлов<input type="number" min="1" step="1" value={selected.override?.nodeCountOverride ?? ''} placeholder={String(selected.nodeCount || 1)} onChange={(event) => updateNode(selected, { nodeCountOverride: event.target.value === '' ? undefined : Math.max(1, Math.round(Number(event.target.value) || 1)) })} /></label></div>
            <label>Ручной размер крепежа (только этот узел)<input type="text" inputMode="text" value={selected.override?.fastenerOverride?.size ?? ''} placeholder={selected.fastener?.size || 'например, 8×320'} onChange={(event) => updateNode(selected, { fastenerOverride: fastenerOverrideFrom(event.target.value, selected.fastener) })} /></label>
            <div className="node-edit-grid"><label>Тип крепежа<input type="text" value={selected.override?.fastenerOverride?.type ?? ''} placeholder={selected.fastener?.type || 'structural-screw'} onChange={(event) => updateNode(selected, { fastenerOverride: { ...selected.fastener, ...selected.override?.fastenerOverride, type: event.target.value || selected.fastener?.type } })} /></label><label>Масса 1 шт., кг<input type="number" min="0" step="0.001" value={selected.override?.fastenerOverride?.kgEach ?? ''} placeholder={selected.fastener?.kgEach ?? 'не задана'} onChange={(event) => updateNode(selected, { fastenerOverride: { ...selected.fastener, ...selected.override?.fastenerOverride, kgEach: event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0) } })} /></label></div>
            <div className="node-edit-grid"><label>Запас узла, %<input type="number" min="0" step="1" value={selected.override?.reservePercent ?? ''} placeholder={String(reserve)} onChange={(event) => updateNode(selected, { reservePercent: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) })} /></label><label>Упаковка, шт.<input type="number" min="0" step="1" value={selected.override?.packSize ?? ''} placeholder="из сводного заказа" onChange={(event) => updateNode(selected, { packSize: event.target.value === '' ? undefined : Math.max(0, Math.round(Number(event.target.value) || 0)) })} /></label></div>
            <div className="node-edit-grid"><label>Этаж<input type="number" min="1" step="1" value={selected.override?.floorOverride ?? ''} placeholder={String(selected.floor || 1)} onChange={(event) => updateNode(selected, { floorOverride: event.target.value === '' ? undefined : Math.max(1, Math.round(Number(event.target.value) || 1)) })} /></label><label>Толщина SIP, мм<input type="number" min="0" step="1" value={selected.override?.panelThicknessOverride ?? ''} placeholder={selected.panelThickness ?? '—'} onChange={(event) => updateNode(selected, { panelThicknessOverride: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) })} /></label></div>
            <div className="node-edit-grid"><label>Координата X, м<input type="number" step="0.01" value={selected.override?.xOverride ?? ''} placeholder={String(selected.x || 0)} onChange={(event) => updateNode(selected, { xOverride: event.target.value === '' ? undefined : Number(event.target.value) || 0 })} /></label><label>Координата Y, м<input type="number" step="0.01" value={selected.override?.yOverride ?? ''} placeholder={String(selected.y || 0)} onChange={(event) => updateNode(selected, { yOverride: event.target.value === '' ? undefined : Number(event.target.value) || 0 })} /></label></div>
            <label>Формула / пояснение<textarea rows="3" value={selected.override?.formulaOverride ?? ''} placeholder={selected.formula} onChange={(event) => updateNode(selected, { formulaOverride: event.target.value || undefined })} /></label>
            <label>Элементы узла через запятую<input type="text" value={selected.override?.elementsOverride?.join(', ') ?? ''} placeholder={selected.elements.join(', ') || 'SIP, TIMBER'} onChange={(event) => updateNode(selected, { elementsOverride: event.target.value ? event.target.value.split(',').map((item) => item.trim()).filter(Boolean) : undefined })} /></label>
            <label>Источник / примечание<textarea rows="2" value={selected.override?.sourceReferenceOverride?.note ?? ''} placeholder={selected.sourceReference?.note || 'Укажите основание ручной нормы'} onChange={(event) => updateNode(selected, { sourceReferenceOverride: event.target.value ? { ...(selected.sourceReference || {}), type: selected.sourceReference?.type || 'EFT_PROJECT_RULE', note: event.target.value } : undefined })} /></label>
            <label className="node-check"><input type="checkbox" checked={selected.requiresEngineeringReview === true} onChange={(event) => updateNode(selected, { requiresEngineeringReview: event.target.checked })} /> Требуется инженерная проверка</label>
            {!selected.fastener?.size ? <div className="node-warning warning"><AlertTriangle size={16} /><span><strong>Типоразмер не назначен автоматически</strong>{unassignedContext[selected.type] || 'В исходных данных нет подтверждённой нормы крепежа для этого узла.'} Введите правило только после технической проверки.</span></div> : null}
            <p className="node-formula">Источник крепежа: {selected.fastenerScope === 'project' ? 'правка проекта' : selected.fastenerScope === 'shared' ? 'общее серверное правило' : 'библиотека EFT'}. {selected.fastenerScope === 'shared' ? team.nodeTypeRules?.[nodeRuleKey(selected)]?.note : ''}</p>
            <SharedFastenerEditor key={nodeRuleKey(selected) || selected.type} selected={selected} nodes={report.nodes} team={team} />
            <p className="node-formula">{selected.formula}</p>
            {selected.warnings.map((warning) => <div className={`node-warning ${warning.severity}`} key={warning.code}><AlertTriangle size={15} />{warning.message}</div>)}
            <div className="node-detail-actions">{selected.source !== 'manual' && selected.override ? <button className="button secondary" onClick={() => resetNode(selected)}><RotateCcw size={16} /> Сбросить правки узла</button> : null}{selected.source === 'manual' ? <button className="button danger" onClick={() => removeManualNode(selected)}><Trash2 size={16} /> Удалить ручной узел</button> : null}</div>
          </> : <div className="empty-state">Узлы не обнаружены. Проверьте контур и включённые конструкции.</div>}
        </section>
      </div>

      <section className="panel-card node-table-card"><h2>Расчёт по узлам</h2><div className="table-scroll"><table className="node-table"><thead><tr><th>Раздел</th><th>Узел</th><th>Крепёж</th><th>Узлов</th><th>Длина</th><th>Шаг</th><th>Без запаса</th><th>Запас</th><th>К закупке</th><th>Источник</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.key} className={row.requiresEngineeringReview ? 'review' : ''}><td>{row.section}</td><td><strong>{row.node}</strong><small>{row.type}</small></td><td>{row.fastenerType}<strong>{row.size}</strong></td><td>{row.nodeCount}</td><td>{formatNumber(row.length, 2)} м</td><td>{row.spacing ? `${formatNumber(row.spacing, 3)} м` : '—'}</td><td>{row.calculatedQty} шт.{weightSuffix(row.calculatedQty, row.kgEach)}</td><td>{row.reservePercent}%</td><td><strong>{row.purchaseQty} шт.{weightSuffix(row.purchaseQty, row.kgEach)}</strong>{row.purchasePacks !== null ? <small>{row.purchasePacks} уп. × {row.packSize}</small> : <small>упаковка не задана</small>}</td><td><SourceLabel source={row.source} />{row.requiresEngineeringReview ? <button type="button" className="review-label" onClick={() => checkNode(row.nodeIds[0])}>Проверить</button> : null}</td></tr>)}</tbody></table></div></section>

      <section className="panel-card node-order-card"><div className="node-card-title"><div><h2>Сводный заказ</h2><p>Одинаковые технические позиции объединены без привязки к производителю. Правки автоматически сохраняются в общем проекте и доступны сотрудникам.</p></div><button className="button secondary" onClick={printOrder}><Printer size={16} /> Печать / PDF</button></div><div className="node-order-list">{report.purchase.map((item) => <div key={item.key}><span>{item.fastenerType}<strong>{item.size}</strong></span><label>Упаковка, шт.<input type="number" min="0" step="1" value={project.settings.nodeFasteners?.packSizes?.[item.size] ?? ''} placeholder="не задана" onChange={(event) => commit((next) => { const value = Math.max(0, Math.round(Number(event.target.value) || 0)); if (value) next.settings.nodeFasteners.packSizes[item.size] = value; else delete next.settings.nodeFasteners.packSizes[item.size]; return next; })} /></label><span><small>{item.calculatedQty} расчёт · {item.withReserve} с запасом</small><strong>{item.purchaseQty} шт.{weightSuffix(item.purchaseQty, item.kgEach)}</strong></span></div>)}</div></section>

      {report.withoutSize?.length ? <section className="panel-card node-order-card"><h2>Без утверждённого типоразмера</h2><p>Эти количества рассчитаны для узлов, но не включены в сводный заказ. Сверьте их с общими строками сметы и назначьте размер крепежа в карточке узла только после инженерной проверки.</p><div className="node-warning-list">{report.withoutSize.map((row) => <div className="node-warning warning" key={row.key}><AlertTriangle size={16} /><span><strong>{row.node}</strong>{row.calculatedQty} шт. · {row.fastenerType} · размер не подтверждён</span><button type="button" onClick={() => checkNode(row.nodeIds[0])}>Проверить</button></div>)}</div></section> : null}

      <section className="node-order-print-sheet" aria-hidden="true"><header><span>ЭФТ · Сводный заказ метизов</span><h1>Проект {project.meta?.projectNum || 'без номера'} · {project.meta?.customer || 'заказчик не указан'}</h1><p>Сформировано: {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}</p></header><table><thead><tr><th>Тип</th><th>Размер</th><th>Расчёт</th><th>С запасом</th><th>К закупке</th><th>Масса</th></tr></thead><tbody>{report.purchase.map((item) => <tr key={item.key}><td>{item.fastenerType}</td><td>{item.size}</td><td>{item.calculatedQty} шт.</td><td>{item.withReserve} шт.</td><td>{item.purchaseQty} шт.{item.purchasePacks !== null ? ` (${item.purchasePacks} уп.)` : ''}</td><td>{item.purchaseKg ? `${formatNumber(item.purchaseKg, 3)} кг` : '—'}</td></tr>)}</tbody></table>{report.withoutSize?.length ? <div><h2>Не включено в заказ: размер не подтверждён</h2>{report.withoutSize.map((row) => <p key={row.key}>{row.node}: {row.calculatedQty} шт. · {row.fastenerType}</p>)}</div> : null}<footer>Расчёт EFT · Неподтверждённые узлы требуют проверки конструктора.</footer></section>

      <section className="panel-card"><h2>Контроль модели</h2>{report.warnings.length ? <div className="node-warning-list">{report.warnings.map((warning, index) => <div className={`node-warning ${warning.severity}`} key={`${warning.nodeId}-${warning.code}-${index}`}><AlertTriangle size={16} /><span><strong>{warning.nodeName}</strong>{warning.message}</span><button type="button" onClick={() => checkNode(warning.nodeId)}>Проверить</button></div>)}</div> : <div className="node-success"><CheckCircle2 /> Ошибок узловой модели не обнаружено.</div>}</section>
    </section>
  );
}
