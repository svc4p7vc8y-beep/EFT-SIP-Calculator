import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { EFT_NODE_TYPES, getEftNodeRule } from '../data/eft-node-library.js';
import { useProject } from '../state/ProjectContext.jsx';

const formatNumber = (value, digits = 1) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number(value) || 0);

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

function NodeMap({ project, nodes, selectedId, onSelect }) {
  const points = planPoints(project.plan);
  const xs = points.map((point) => Number(point.x) || 0);
  const ys = points.map((point) => Number(point.y) || 0);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - minX);
  const height = Math.max(1, Math.max(...ys) - minY);
  const pad = Math.max(width, height) * 0.08;
  const markerRadius = Math.max(width, height) * 0.022;
  const visible = nodes.filter((node) => node.enabled !== false && Number(node.floor || 1) === 1).slice(0, 160);
  return (
    <div className="node-map-wrap">
      <svg className="node-map" viewBox={`${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}`} role="img" aria-label="План с маркерами строительных узлов">
        <polygon points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
        {visible.map((node, index) => {
          const jitter = (index % 5) * markerRadius * 0.35;
          const x = Number(node.x) + jitter;
          const y = Number(node.y) + (Math.floor(index / 5) % 3) * markerRadius * 0.35;
          return (
            <g key={node.id} className={node.id === selectedId ? 'selected' : ''} role="button" tabIndex="0" aria-label={`${node.marker}: ${node.name}`} onClick={() => onSelect(node.id)} onKeyDown={(event) => event.key === 'Enter' && onSelect(node.id)}>
              <circle cx={x} cy={y} r={markerRadius} />
              <text x={x} y={y} dy="0.34em" textAnchor="middle" fontSize={markerRadius * 1.25}>{node.marker}</text>
            </g>
          );
        })}
      </svg>
      <div className="node-map-legend"><span><b>C</b> угол</span><span><b>T</b> примыкание</span><span><b>S</b> старт/шов</span><span><b>R</b> стропила</span><span><b>O</b> проём</span></div>
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
        <section className="panel-card"><div className="node-card-title"><div><h2>Узлы на плане</h2><p>Первый этаж · нажмите маркер для подробностей</p></div><button className="button secondary" onClick={addManualNode}><Plus size={16} /> Добавить узел</button></div><NodeMap project={project} nodes={report.nodes} selectedId={selected?.id} onSelect={setSelectedId} /></section>
        <section className="panel-card node-detail-card">
          <h2>Карточка узла</h2>
          {selected ? <>
            <div className="node-detail-heading"><span className="node-marker">{selected.marker}</span><div><strong>{selected.name}</strong><small>{selected.id}</small></div></div>
            <label>Тип узла<select value={selected.type} onChange={(event) => updateNode(selected, { type: event.target.value })}>{EFT_NODE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.value} — {type.label}</option>)}</select></label>
            <label className="node-check"><input type="checkbox" checked={selected.enabled !== false} onChange={(event) => updateNode(selected, { enabled: event.target.checked })} /> Учитывать узел</label>
            <dl><div><dt>Элементы</dt><dd>{selected.elements.join(' + ') || 'Не описаны'}</dd></div><div><dt>Крепёж</dt><dd>{selected.fastener?.type || 'Не назначен'} {selected.fastener?.size || ''}</dd></div><div><dt>Длина / узлов</dt><dd>{formatNumber(selected.length, 2)} м / {selected.nodeCount}</dd></div><div><dt>Шаг</dt><dd>{selected.spacing ? `${formatNumber(selected.spacing, 3)} м` : 'Не задан'}</dd></div><div><dt>Количество</dt><dd>{selected.calculatedQty} шт.</dd></div><div><dt>Источник</dt><dd><SourceLabel source={selected.sourceReference} /></dd></div></dl>
            <label>Ручное количество, шт.<input type="number" min="0" step="1" value={selected.override?.calculatedQtyOverride ?? ''} placeholder={String(selected.calculatedQty)} onChange={(event) => updateNode(selected, { calculatedQtyOverride: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) })} /></label>
            <label>Ручной шаг, м<input type="number" min="0" step="0.05" value={selected.override?.spacingOverride ?? ''} placeholder={selected.spacing ? String(selected.spacing) : 'не задан'} onChange={(event) => updateNode(selected, { spacingOverride: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) })} /></label>
            <label>Ручной размер крепежа<input type="text" inputMode="text" value={selected.override?.fastenerOverride?.size ?? ''} placeholder={selected.fastener?.size || 'например, 8×320'} onChange={(event) => updateNode(selected, { fastenerOverride: fastenerOverrideFrom(event.target.value, selected.fastener) })} /></label>
            <p className="node-formula">{selected.formula}</p>
            {selected.warnings.map((warning) => <div className={`node-warning ${warning.severity}`} key={warning.code}><AlertTriangle size={15} />{warning.message}</div>)}
            {selected.source === 'manual' ? <button className="button danger" onClick={() => removeManualNode(selected)}><Trash2 size={16} /> Удалить ручной узел</button> : null}
          </> : <div className="empty-state">Узлы не обнаружены. Проверьте контур и включённые конструкции.</div>}
        </section>
      </div>

      <section className="panel-card node-table-card"><h2>Расчёт по узлам</h2><div className="table-scroll"><table className="node-table"><thead><tr><th>Раздел</th><th>Узел</th><th>Крепёж</th><th>Узлов</th><th>Длина</th><th>Шаг</th><th>Без запаса</th><th>Запас</th><th>К закупке</th><th>Источник</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.key} className={row.requiresEngineeringReview ? 'review' : ''}><td>{row.section}</td><td><strong>{row.node}</strong><small>{row.type}</small></td><td>{row.fastenerType}<strong>{row.size}</strong></td><td>{row.nodeCount}</td><td>{formatNumber(row.length, 2)} м</td><td>{row.spacing ? `${formatNumber(row.spacing, 3)} м` : '—'}</td><td>{row.calculatedQty}</td><td>{row.reservePercent}%</td><td><strong>{row.purchaseQty} шт.</strong>{row.purchasePacks !== null ? <small>{row.purchasePacks} уп. × {row.packSize}</small> : <small>упаковка не задана</small>}</td><td><SourceLabel source={row.source} />{row.requiresEngineeringReview ? <small className="review-label">проверить</small> : null}</td></tr>)}</tbody></table></div></section>

      <section className="panel-card node-order-card"><div className="node-card-title"><div><h2>Сводный заказ</h2><p>Одинаковые технические позиции объединены без привязки к производителю.</p></div></div><div className="node-order-list">{report.purchase.map((item) => <div key={item.key}><span>{item.fastenerType}<strong>{item.size}</strong></span><label>Упаковка, шт.<input type="number" min="0" step="1" value={project.settings.nodeFasteners?.packSizes?.[item.size] ?? ''} placeholder="не задана" onChange={(event) => commit((next) => { const value = Math.max(0, Math.round(Number(event.target.value) || 0)); if (value) next.settings.nodeFasteners.packSizes[item.size] = value; else delete next.settings.nodeFasteners.packSizes[item.size]; return next; })} /></label><span><small>{item.calculatedQty} расчёт · {item.withReserve} с запасом</small><strong>{item.purchaseQty} шт.</strong></span></div>)}</div></section>

      <section className="panel-card"><h2>Контроль модели</h2>{report.warnings.length ? <div className="node-warning-list">{report.warnings.map((warning, index) => <div className={`node-warning ${warning.severity}`} key={`${warning.nodeId}-${warning.code}-${index}`}><AlertTriangle size={16} /><span><strong>{warning.nodeName}</strong>{warning.message}</span></div>)}</div> : <div className="node-success"><CheckCircle2 /> Ошибок узловой модели не обнаружено.</div>}</section>
    </section>
  );
}
