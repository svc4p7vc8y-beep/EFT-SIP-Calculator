import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { EFT_NODE_TYPES, getEftNodeRule } from '../data/eft-node-library.js';
import { useProject } from '../state/ProjectContext.jsx';

const formatNumber = (value, digits = 1) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number(value) || 0);
const weightSuffix = (quantity, kgEach) => Number(kgEach) > 0 ? ` (${formatNumber((Number(quantity) || 0) * Number(kgEach), 3)} кг)` : '';

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
  const markerRadius = Math.max(width, height) * 0.038;
  const floorNodes = nodes.map((node, index) => ({ ...node, number: index + 1 }))
    .filter(node => String(node.floor || 1) === floor && (showDisabled || node.enabled !== false));
  const visible = floorNodes.filter(node => type === 'all' || node.type === type);
  const placed = [];
  const markers = visible.map(node => {
    const anchorX = Number(node.x) || 0;
    const anchorY = Number(node.y) || 0;
    let x = anchorX, y = anchorY;
    for (let attempt = 0; placed.some(p => Math.hypot(p.x - x, p.y - y) < markerRadius * 2.5); attempt++) {
      const angle = attempt * 2.4;
      const radius = markerRadius * 2.6 * Math.sqrt(attempt + 1);
      x = anchorX + Math.cos(angle) * radius;
      y = anchorY + Math.sin(angle) * radius;
    }
    const marker = { ...node, x, y, anchorX, anchorY };
    placed.push(marker);
    return marker;
  });
  const allXs = [...xs, ...markers.flatMap(n => [n.x, n.anchorX])];
  const allYs = [...ys, ...markers.flatMap(n => [n.y, n.anchorY])];
  const pad = markerRadius * 1.8;
  const left = Math.min(...allXs) - pad, top = Math.min(...allYs) - pad;
  const selected = markers.find(node => node.id === selectedId);
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
      <p className="node-map-help">Номер на схеме соответствует списку ниже. Линия соединяет сдвинутый маркер с его точкой на плане. Группы крепежа обозначены условно.</p>
      <svg className="node-map" viewBox={`${left} ${top} ${Math.max(...allXs) + pad - left} ${Math.max(...allYs) + pad - top}`} role="group" aria-label="План с маркерами строительных узлов">
        <polygon points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
        {(plan.rooms || []).map(room => <polygon key={room.id} className="node-map-room" points={(room.points?.length ? room.points : [{ x: room.x, y: room.y }, { x: room.x + room.w, y: room.y }, { x: room.x + room.w, y: room.y + room.h }, { x: room.x, y: room.y + room.h }]).map(point => `${point.x},${point.y}`).join(' ')}><title>{room.name}</title></polygon>)}
        {markers.map(node => {
          const { x, y } = node;
          return (
            <g key={node.id} className={`node-map-point ${node.id === selectedId ? 'selected' : ''} ${node.enabled === false ? 'disabled-node' : node.requiresEngineeringReview ? 'review-node' : ''}`} role="button" tabIndex="0" aria-pressed={node.id === selectedId} aria-label={`Узел ${node.number}: ${node.name}`} onClick={() => onSelect(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id); } }}>
              <title>{`№ ${node.number} · ${node.name}\n${node.calculatedQty} шт.${weightSuffix(node.calculatedQty, node.fastener?.kgEach)} крепежа${node.requiresEngineeringReview ? ' · Требует проверки' : ''}`}</title>
              <line x1={node.anchorX} y1={node.anchorY} x2={x} y2={y} />
              <circle cx={x} cy={y} r={markerRadius} />
              <text x={x} y={y} dy="0.34em" textAnchor="middle" fontSize={markerRadius * 0.95}>{node.number}</text>
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

export default function NodeFastenersScreen({ calculation }) {
  const { project, commit, checkpoint } = useProject();
  const report = calculation.nodeFasteners;
  const [selectedId, setSelectedId] = useState(report.nodes[0]?.id || null);
  const selected = useMemo(() => report.nodes.find((node) => node.id === selectedId) || report.nodes[0] || null, [report.nodes, selectedId]);

  const persistReport = () => {
    checkpoint();
    commit((next) => {
      next.construction = structuredClone(report.construction);
      next.nodes = structuredClone(report.nodes);
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

  const reserve = project.settings.nodeFasteners?.reservePercent ?? 10;
  return (
    <section className="screen node-fasteners-screen">
      <header className="screen-header node-screen-header">
        <div><span className="eyebrow">УЗЛОВОЙ РАСЧЁТ EFT</span><h1>Метизы по узлам</h1><p>Геометрия → конструктив → узел → подтверждённая норма → закупка. Неподтверждённые нормы не начисляются молча.</p></div>
        <button className="button" onClick={persistReport}><RefreshCw size={17} /> Рассчитать узлы и метизы</button>
      </header>

      {report.mode !== 'node' ? <div className="node-alert"><AlertTriangle /><div><strong>Для SIP сохранён быстрый режим по площади.</strong><span>Узловая диагностика показана отдельно, но действующую смету старого проекта она не заменяет до переключения режима.</span></div></div> : null}

      <div className="node-stat-grid">
        <div><span>Распознано</span><strong>{report.nodes.length}</strong><small>узлов и групп</small></div>
        <div><span>Типов</span><strong>{Object.keys(report.stats).length}</strong><small>кодов EFT</small></div>
        <div><span>К проверке</span><strong>{report.warnings.filter((item) => item.severity !== 'info').length}</strong><small>предупреждений</small></div>
        <label><span>Запас</span><span className="node-number"><input type="number" min="0" max="100" step="1" value={reserve} onChange={(event) => commit((next) => { next.settings.nodeFasteners.reservePercent = Math.max(0, Number(event.target.value) || 0); return next; })} /><b>%</b></span><small>для сводного заказа</small></label>
      </div>

      <div className="node-layout-grid">
        <section className="panel-card"><div className="node-card-title"><div><h2>Узлы на плане</h2><p>Выберите номер на схеме или название в списке</p></div><button className="button secondary" onClick={addManualNode}><Plus size={16} /> Добавить узел</button></div><NodeMap project={project} floorPlans={calculation.metrics?.floorPlans} nodes={report.nodes} selectedId={selected?.id} onSelect={setSelectedId} /></section>
        <section className="panel-card node-detail-card">
          <h2>Карточка узла</h2>
          {selected ? <>
            <div className="node-detail-heading"><span className="node-marker">{report.nodes.findIndex(node => node.id === selected.id) + 1}</span><div><strong>{selected.name}</strong><small>{selected.floor || 1} этаж · {selected.source === 'manual' ? 'Добавлен вручную' : 'Из расчёта конструкций'}</small></div></div>
            <label>Тип узла<select value={selected.type} onChange={(event) => updateNode(selected, { type: event.target.value })}>{EFT_NODE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.value} — {type.label}</option>)}</select></label>
            <label className="node-check"><input type="checkbox" checked={selected.enabled !== false} onChange={(event) => updateNode(selected, { enabled: event.target.checked })} /> Учитывать узел</label>
            <dl><div><dt>Элементы</dt><dd>{selected.elements.join(' + ') || 'Не описаны'}</dd></div><div><dt>Крепёж</dt><dd>{selected.fastener?.type || 'Не назначен'} {selected.fastener?.size || ''}</dd></div><div><dt>Длина / узлов</dt><dd>{formatNumber(selected.length, 2)} м / {selected.nodeCount}</dd></div><div><dt>Шаг</dt><dd>{selected.spacing ? `${formatNumber(selected.spacing, 3)} м` : 'Не задан'}</dd></div><div><dt>Количество</dt><dd>{selected.calculatedQty} шт.{weightSuffix(selected.calculatedQty, selected.fastener?.kgEach)}</dd></div><div><dt>Источник</dt><dd><SourceLabel source={selected.sourceReference} /></dd></div></dl>
            <label>Ручное количество, шт.<input type="number" min="0" step="1" value={selected.override?.calculatedQtyOverride ?? ''} placeholder={String(selected.calculatedQty)} onChange={(event) => updateNode(selected, { calculatedQtyOverride: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) })} /></label>
            <label>Ручной шаг, м<input type="number" min="0" step="0.05" value={selected.override?.spacingOverride ?? ''} placeholder={selected.spacing ? String(selected.spacing) : 'не задан'} onChange={(event) => updateNode(selected, { spacingOverride: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) })} /></label>
            <label>Ручной размер крепежа<input type="text" inputMode="text" value={selected.override?.fastenerOverride?.size ?? ''} placeholder={selected.fastener?.size || 'например, 8×320'} onChange={(event) => updateNode(selected, { fastenerOverride: fastenerOverrideFrom(event.target.value, selected.fastener) })} /></label>
            <p className="node-formula">{selected.formula}</p>
            {selected.warnings.map((warning) => <div className={`node-warning ${warning.severity}`} key={warning.code}><AlertTriangle size={15} />{warning.message}</div>)}
            {selected.source === 'manual' ? <button className="button danger" onClick={() => removeManualNode(selected)}><Trash2 size={16} /> Удалить ручной узел</button> : null}
          </> : <div className="empty-state">Узлы не обнаружены. Проверьте контур и включённые конструкции.</div>}
        </section>
      </div>

      <section className="panel-card node-table-card"><h2>Расчёт по узлам</h2><div className="table-scroll"><table className="node-table"><thead><tr><th>Раздел</th><th>Узел</th><th>Крепёж</th><th>Узлов</th><th>Длина</th><th>Шаг</th><th>Без запаса</th><th>Запас</th><th>К закупке</th><th>Источник</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.key} className={row.requiresEngineeringReview ? 'review' : ''}><td>{row.section}</td><td><strong>{row.node}</strong><small>{row.type}</small></td><td>{row.fastenerType}<strong>{row.size}</strong></td><td>{row.nodeCount}</td><td>{formatNumber(row.length, 2)} м</td><td>{row.spacing ? `${formatNumber(row.spacing, 3)} м` : '—'}</td><td>{row.calculatedQty} шт.{weightSuffix(row.calculatedQty, row.kgEach)}</td><td>{row.reservePercent}%</td><td><strong>{row.purchaseQty} шт.{weightSuffix(row.purchaseQty, row.kgEach)}</strong>{row.purchasePacks !== null ? <small>{row.purchasePacks} уп. × {row.packSize}</small> : <small>упаковка не задана</small>}</td><td><SourceLabel source={row.source} />{row.requiresEngineeringReview ? <small className="review-label">проверить</small> : null}</td></tr>)}</tbody></table></div></section>

      <section className="panel-card node-order-card"><div className="node-card-title"><div><h2>Сводный заказ</h2><p>Одинаковые технические позиции объединены без привязки к производителю.</p></div></div><div className="node-order-list">{report.purchase.map((item) => <div key={item.key}><span>{item.fastenerType}<strong>{item.size}</strong></span><label>Упаковка, шт.<input type="number" min="0" step="1" value={project.settings.nodeFasteners?.packSizes?.[item.size] ?? ''} placeholder="не задана" onChange={(event) => commit((next) => { const value = Math.max(0, Math.round(Number(event.target.value) || 0)); if (value) next.settings.nodeFasteners.packSizes[item.size] = value; else delete next.settings.nodeFasteners.packSizes[item.size]; return next; })} /></label><span><small>{item.calculatedQty} расчёт · {item.withReserve} с запасом</small><strong>{item.purchaseQty} шт.{weightSuffix(item.purchaseQty, item.kgEach)}</strong></span></div>)}</div></section>

      <section className="panel-card"><h2>Контроль модели</h2>{report.warnings.length ? <div className="node-warning-list">{report.warnings.map((warning, index) => <div className={`node-warning ${warning.severity}`} key={`${warning.nodeId}-${warning.code}-${index}`}><AlertTriangle size={16} /><span><strong>{warning.nodeName}</strong>{warning.message}</span></div>)}</div> : <div className="node-success"><CheckCircle2 /> Ошибок узловой модели не обнаружено.</div>}</section>
    </section>
  );
}
