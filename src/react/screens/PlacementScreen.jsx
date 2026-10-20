import { useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Plus, RotateCw, Route, Trash2, Undo2, Redo2, X } from 'lucide-react';
import { useProject } from '../state/ProjectContext.jsx';
import { boundsOf, houseContourPoints, roomPoints } from '../planner/geometry.js';
import { createPlacement, PLACEMENT_LAYERS, PLACEMENT_PRESETS, placementSummary } from '../state/placement-model.js';
import './placement.css';

const COLOR = { furniture: '#64748b', appliance: '#9a663c', equipment: '#6657a6', electric: '#c78825' };
const createId = () => globalThis.crypto?.randomUUID?.() || `place-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const round = value => Math.round(value * 100) / 100;
const pathData = points => points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ') + ' Z';
const routeData = points => points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ');
const valueOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index], b = polygon[previous];
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function Field({ label, value, onChange, min, max, step = .01, suffix }) {
  return <label className="placement-field"><span>{label}</span><span className="placement-input-wrap"><input type="number" value={value} min={min} max={max} step={step} onChange={event => onChange(event.target.value)}/>{suffix ? <small>{suffix}</small> : null}</span></label>;
}

export default function PlacementScreen() {
  const { project, commit, undo, redo, canUndo, canRedo } = useProject();
  const placement = project.placement || createPlacement();
  const floorCount = Math.max(1, Math.min(2, Number(project.meta?.floors) || 1));
  const [floor, setFloor] = useState(1);
  const activeFloor = Math.min(floor, floorCount);
  const [layer, setLayer] = useState('furniture');
  const [visible, setVisible] = useState({ furniture: true, appliance: true, equipment: true, electric: true });
  const [presetId, setPresetId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedCircuitId, setSelectedCircuitId] = useState(null);
  const [drawingRoute, setDrawingRoute] = useState(false);
  const [routePoints, setRoutePoints] = useState([]);
  const [dragPosition, setDragPosition] = useState(null);
  const svgRef = useRef(null);
  const plan = activeFloor === 1 ? project.plan : project.upperFloors?.[activeFloor - 2] || project.plan;
  const contour = useMemo(() => houseContourPoints(plan), [plan]);
  const rooms = useMemo(() => (plan.rooms || []).filter(room => room.include !== false), [plan]);
  const drawingBounds = useMemo(() => boundsOf([...contour, ...rooms.flatMap(roomPoints)]), [contour, rooms]);
  const viewBox = `${drawingBounds.x * 100 - 65} ${drawingBounds.y * 100 - 65} ${Math.max(5, drawingBounds.w) * 100 + 130} ${Math.max(5, drawingBounds.h) * 100 + 130}`;
  const items = useMemo(() => placement.items.filter(item => item.floor === activeFloor), [placement.items, activeFloor]);
  const routes = useMemo(() => placement.routes.filter(route => route.floor === activeFloor), [placement.routes, activeFloor]);
  const selected = items.find(item => item.id === selectedId);
  const selectedCircuit = placement.circuits.find(item => item.id === selectedCircuitId);
  const activePreset = PLACEMENT_PRESETS.find(item => item.id === presetId);
  const summary = placementSummary(placement, activeFloor);

  const change = update => commit(next => {
    if (!next.placement) next.placement = createPlacement();
    update(next.placement);
    return next;
  });
  const updateItem = patch => {
    if (!selected) return;
    change(data => { const item = data.items.find(candidate => candidate.id === selected.id); if (item) Object.assign(item, patch); });
  };
  const pointFromEvent = event => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: round(point.x / 100), y: round(point.y / 100) };
  };
  const insidePlan = point => point && (pointInPolygon(point, contour) || rooms.some(room => pointInPolygon(point, roomPoints(room))));
  const onCanvasClick = event => {
    const point = pointFromEvent(event);
    if (!insidePlan(point)) return;
    if (drawingRoute) { setRoutePoints(current => [...current, point]); return; }
    if (!activePreset) { setSelectedId(null); return; }
    const id = createId();
    change(data => data.items.push({ id, floor: activeFloor, layer: activePreset.layer, kind: activePreset.id, label: activePreset.label, x: point.x, y: point.y, width: activePreset.width, depth: activePreset.depth, rotation: 0, height: activePreset.height || 0, circuitId: activePreset.layer === 'electric' && activePreset.id !== 'panel' ? selectedCircuitId || '' : '' }));
    setSelectedId(id);
  };
  const addCircuit = () => {
    const id = createId();
    change(data => data.circuits.push({ id, name: `Группа ${data.circuits.length + 1}`, cable: '', breaker: '', note: '' }));
    setSelectedCircuitId(id);
    setLayer('electric');
  };
  const updateCircuit = patch => change(data => { const circuit = data.circuits.find(item => item.id === selectedCircuitId); if (circuit) Object.assign(circuit, patch); });
  const finishRoute = () => {
    if (routePoints.length >= 2 && selectedCircuitId) change(data => data.routes.push({ id: createId(), floor: activeFloor, circuitId: selectedCircuitId, points: routePoints }));
    setRoutePoints([]);
    setDrawingRoute(false);
  };
  const beginDrag = (event, item) => {
    if (activePreset || drawingRoute) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(item.id);
    setDragPosition({ id: item.id, x: item.x, y: item.y });
  };
  const moveDrag = event => {
    if (!dragPosition) return;
    const point = pointFromEvent(event);
    if (insidePlan(point)) setDragPosition({ id: dragPosition.id, ...point });
  };
  const endDrag = event => {
    if (!dragPosition) return;
    event.stopPropagation();
    const item = items.find(candidate => candidate.id === dragPosition.id);
    if (item && (item.x !== dragPosition.x || item.y !== dragPosition.y)) change(data => { const target = data.items.find(candidate => candidate.id === item.id); if (target) Object.assign(target, { x: dragPosition.x, y: dragPosition.y }); });
    setDragPosition(null);
  };

  return <main className="placement-screen">
    <header className="placement-heading"><div><span className="placement-eyebrow">План проекта · размещение</span><h1>Мебель и инженерия</h1><p>Расставляйте предметы и электрические точки поверх плана. Стены, комнаты и действующая смета не меняются.</p></div><div className="placement-heading-actions"><button onClick={undo} disabled={!canUndo} title="Отменить"><Undo2 size={17}/> Отменить</button><button onClick={redo} disabled={!canRedo} title="Повторить"><Redo2 size={17}/> Повторить</button></div></header>
    <div className="placement-toolbar"><div className="placement-floor-tabs" aria-label="Этаж">{Array.from({ length: floorCount }, (_, index) => <button key={index} className={activeFloor === index + 1 ? 'active' : ''} onClick={() => { setFloor(index + 1); setSelectedId(null); setRoutePoints([]); }}>Этаж {index + 1}</button>)}</div><div className="placement-summary"><span>Мебель <b>{summary.furniture}</b></span><span>Техника <b>{summary.appliance}</b></span><span>Оборудование <b>{summary.equipment}</b></span><span>Электроточки <b>{summary.electric}</b></span><span>Трассы по плану <b>{summary.routeLength} м</b></span></div></div>
    <div className="placement-workspace">
      <aside className="placement-sidebar"><h2>Слои и каталог</h2><div className="placement-layers">{PLACEMENT_LAYERS.map(entry => <div className={`placement-layer-row ${layer === entry.id ? 'active' : ''}`} key={entry.id}><button className="placement-layer-select" disabled={entry.future} onClick={() => { setLayer(entry.id); setPresetId(null); setDrawingRoute(false); setRoutePoints([]); }}>{entry.label}{entry.future ? <small>позже</small> : null}</button>{!entry.future ? <button className="placement-eye" aria-label={`${visible[entry.id] ? 'Скрыть' : 'Показать'} ${entry.label}`} title={`${visible[entry.id] ? 'Скрыть' : 'Показать'} ${entry.label}`} onClick={() => setVisible(old => ({ ...old, [entry.id]: !old[entry.id] }))}>{visible[entry.id] ? <Eye size={16}/> : <EyeOff size={16}/>}</button> : null}</div>)}</div>
        <div className="placement-palette-heading"><h3>{PLACEMENT_LAYERS.find(entry => entry.id === layer)?.label}</h3><small>Выберите предмет, затем место на плане</small></div><div className="placement-palette">{PLACEMENT_PRESETS.filter(entry => entry.layer === layer).map(entry => <button key={entry.id} className={presetId === entry.id ? 'active' : ''} onClick={() => { setPresetId(current => current === entry.id ? null : entry.id); setDrawingRoute(false); setRoutePoints([]); }}><span className={`placement-palette-mark ${entry.layer}`}/><span>{entry.label}<small>{Math.round(entry.width * 100)} × {Math.round(entry.depth * 100)} см</small></span></button>)}</div>
        {layer === 'electric' ? <div className="placement-circuits"><div className="placement-palette-heading"><h3>Группы</h3><button onClick={addCircuit} title="Добавить группу"><Plus size={17}/></button></div>{placement.circuits.length ? placement.circuits.map(circuit => <button key={circuit.id} className={selectedCircuitId === circuit.id ? 'active' : ''} onClick={() => { setSelectedCircuitId(circuit.id); setPresetId(null); }}>{circuit.name}</button>) : <p>Добавьте группу для розеток и света.</p>}{selectedCircuit ? <div className="placement-circuit-form"><label>Название<input value={selectedCircuit.name} onChange={event => updateCircuit({ name: event.target.value })}/></label><label>Кабель, по проекту<input value={selectedCircuit.cable || ''} onChange={event => updateCircuit({ cable: event.target.value })} placeholder="Например, 3×2,5"/></label><label>Защита, по проекту<input value={selectedCircuit.breaker || ''} onChange={event => updateCircuit({ breaker: event.target.value })} placeholder="Заполняется после проверки"/></label><button className={drawingRoute ? 'active' : ''} onClick={() => { setDrawingRoute(!drawingRoute); setPresetId(null); setRoutePoints([]); }}><Route size={16}/> {drawingRoute ? 'Отменить трассу' : 'Нарисовать трассу'}</button>{drawingRoute ? <button onClick={finishRoute} disabled={routePoints.length < 2}>Сохранить трассу ({routePoints.length} узла)</button> : null}</div> : null}</div> : null}
        {layer === 'electric' && selectedCircuit ? <button className="placement-remove-circuit" onClick={() => { change(data => { data.circuits = data.circuits.filter(circuit => circuit.id !== selectedCircuit.id); data.routes = data.routes.filter(route => route.circuitId !== selectedCircuit.id); data.items.forEach(item => { if (item.circuitId === selectedCircuit.id) item.circuitId = ''; }); }); setSelectedCircuitId(null); setDrawingRoute(false); setRoutePoints([]); }}><Trash2 size={15}/> Удалить группу и её трассы</button> : null}
        {layer === 'electric' && routes.length ? <div className="placement-route-list"><h3>Трассы этажа</h3>{routes.map((route, index) => <div key={route.id}><span>{placement.circuits.find(circuit => circuit.id === route.circuitId)?.name || `Трасса ${index + 1}`}</span><button title="Удалить трассу" aria-label={`Удалить трассу ${index + 1}`} onClick={() => change(data => { data.routes = data.routes.filter(item => item.id !== route.id); })}><Trash2 size={15}/></button></div>)}</div> : null}
      </aside>
      <section className="placement-canvas-panel"><div className="placement-canvas-title"><strong>План этажа {activeFloor}</strong><span>{drawingRoute ? 'Нажимайте точки маршрута и сохраните трассу' : activePreset ? `Разместите: ${activePreset.label}` : 'Выберите объект или инструмент слева'}</span></div><div className="placement-canvas-scroll"><svg ref={svgRef} className={`placement-canvas ${activePreset || drawingRoute ? 'placing' : ''}`} viewBox={viewBox} role="img" aria-label={`План этажа ${activeFloor} для расстановки мебели и инженерии`} onClick={onCanvasClick}>
        <defs><pattern id="placement-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#dbe5e7" strokeWidth="1"/></pattern></defs>
        <rect x={drawingBounds.x * 100} y={drawingBounds.y * 100} width={drawingBounds.w * 100} height={drawingBounds.h * 100} fill="url(#placement-grid)"/>
        <path d={pathData(contour)} fill="#f9fbf9" stroke="#40545e" strokeWidth="5" vectorEffect="non-scaling-stroke"/>
        {rooms.map(room => { const points = roomPoints(room); const box = boundsOf(points); return <g key={room.id}><path d={pathData(points)} fill="rgba(219,233,230,.22)" stroke="#a8bcb9" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/><text x={(box.x + box.w / 2) * 100} y={(box.y + box.h / 2) * 100} textAnchor="middle" className="placement-room-label">{room.name}</text></g>; })}
        {(plan.walls || []).filter(wall => wall.include !== false).map(wall => <line key={wall.id} x1={wall.x1 * 100} y1={wall.y1 * 100} x2={wall.x2 * 100} y2={wall.y2 * 100} stroke="#77918f" strokeWidth="4" vectorEffect="non-scaling-stroke"/>)}
        {(plan.openings || []).filter(opening => opening.include !== false).map(opening => <line key={opening.id} x1={(opening.x - (opening.orientation === 'h' ? opening.width / 2 : 0)) * 100} y1={(opening.y - (opening.orientation === 'v' ? opening.width / 2 : 0)) * 100} x2={(opening.x + (opening.orientation === 'h' ? opening.width / 2 : 0)) * 100} y2={(opening.y + (opening.orientation === 'v' ? opening.width / 2 : 0)) * 100} stroke={opening.type === 'window' ? '#468fba' : '#b77d52'} strokeWidth="7" vectorEffect="non-scaling-stroke"/>)}
        {routes.filter(route => visible.electric).map(route => <g key={route.id} onClick={event => event.stopPropagation()}><path d={routeData(route.points)} fill="none" stroke="#d79b43" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" strokeDasharray="8 4"/><title>{placement.circuits.find(circuit => circuit.id === route.circuitId)?.name || 'Трасса'}</title></g>)}
        {drawingRoute && routePoints.length ? <path d={routeData(routePoints)} fill="none" stroke="#e39c29" strokeWidth="4" vectorEffect="non-scaling-stroke"/> : null}
        {items.filter(item => visible[item.layer]).map(item => {
          const x = (dragPosition?.id === item.id ? dragPosition.x : item.x) * 100;
          const y = (dragPosition?.id === item.id ? dragPosition.y : item.y) * 100;
          const electrical = item.layer === 'electric';
          const displayWidth = electrical ? Math.max(item.width * 100, 50) : item.width * 100;
          const displayDepth = electrical ? Math.max(item.depth * 100, 50) : item.depth * 100;
          return <g key={item.id} transform={`translate(${x} ${y}) rotate(${item.rotation || 0})`} className={`placement-object ${selectedId === item.id ? 'selected' : ''}`} onPointerDown={event => beginDrag(event, item)} onPointerMove={moveDrag} onPointerUp={endDrag} onClick={event => { event.stopPropagation(); setSelectedId(item.id); setPresetId(null); }}>
            {electrical ? <rect x="-50" y="-50" width="100" height="100" fill="transparent" stroke="none"/> : null}
            <rect x={-displayWidth / 2} y={-displayDepth / 2} width={displayWidth} height={displayDepth} rx={electrical ? 12 : 5} fill={electrical ? '#fff8e9' : '#fff'} stroke={COLOR[item.layer]} strokeWidth={selectedId === item.id ? 4 : 2} vectorEffect="non-scaling-stroke"/>
            <text textAnchor="middle" dominantBaseline="middle" className={`placement-object-label ${electrical ? 'electric' : ''}`}>{electrical ? ({ socket: 'Р', switch: 'В', light: 'С', power: 'Сил', panel: 'Щ' }[item.kind] || 'Э') : (item.label || item.kind).slice(0, 15)}</text>
            <title>{item.label || item.kind}</title>
          </g>;
        })}
      </svg></div><div className="placement-canvas-note">Предметы перетаскиваются. Размеры указаны в метрах. Схема сохраняется с проектом и пока не меняет смету.</div></section>
      <aside className="placement-inspector"><div className="placement-inspector-heading"><h2>Свойства</h2>{selected ? <button onClick={() => setSelectedId(null)} aria-label="Закрыть свойства"><X size={17}/></button> : null}</div>{selected ? <div className="placement-inspector-fields"><span className="placement-type">{PLACEMENT_LAYERS.find(entry => entry.id === selected.layer)?.label} · этаж {selected.floor}</span><label>Название<input value={selected.label || ''} onChange={event => updateItem({ label: event.target.value })}/></label><div className="placement-field-grid"><Field label="X" value={selected.x} onChange={value => updateItem({ x: valueOr(value, selected.x) })} step={.05} suffix="м"/><Field label="Y" value={selected.y} onChange={value => updateItem({ y: valueOr(value, selected.y) })} step={.05} suffix="м"/><Field label="Ширина" value={selected.width} onChange={value => updateItem({ width: Math.max(.05, valueOr(value, selected.width)) })} min={.05} suffix="м"/><Field label="Глубина" value={selected.depth} onChange={value => updateItem({ depth: Math.max(.05, valueOr(value, selected.depth)) })} min={.05} suffix="м"/></div><Field label="Высота установки" value={selected.height || 0} onChange={value => updateItem({ height: Math.max(0, valueOr(value, selected.height)) })} min={0} suffix="м"/><button className="placement-rotate" onClick={() => updateItem({ rotation: ((selected.rotation || 0) + 90) % 360 })}><RotateCw size={16}/> Повернуть на 90°</button>{selected.layer === 'electric' && selected.kind !== 'panel' ? <label>Электрическая группа<select value={selected.circuitId || ''} onChange={event => updateItem({ circuitId: event.target.value })}><option value="">Не назначена</option>{placement.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}</select></label> : null}<label>Примечание<textarea rows="3" value={selected.note || ''} onChange={event => updateItem({ note: event.target.value })} placeholder="Модель, подключение или уточнение проекта"/></label><button className="placement-delete" onClick={() => { change(data => { data.items = data.items.filter(item => item.id !== selected.id); }); setSelectedId(null); }}><Trash2 size={16}/> Удалить объект</button></div> : <div className="placement-empty-inspector"><p>Выберите объект на плане, чтобы изменить размеры, место и свойства.</p><p>Мебель и техника служат основой для будущих схем воды, отопления и вентиляции.</p></div>}</aside>
    </div>
  </main>;
}
