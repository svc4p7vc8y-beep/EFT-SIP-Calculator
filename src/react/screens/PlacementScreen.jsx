import { useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Plus, RotateCw, Route, Trash2, Undo2, Redo2, X, Ruler, Search, Printer } from 'lucide-react';
import { createPortal } from 'react-dom';
import PlacementWorkerSheets from './PlacementWorkerSheets.jsx';
import { useProject } from '../state/ProjectContext.jsx';
import { boundsOf, houseContourPoints, roomPoints } from '../planner/geometry.js';
import { createPlacement, findPlacementPreset, PLACEMENT_GROUPS, PLACEMENT_LAYERS, PLACEMENT_PRESETS, placementSummary } from '../state/placement-model.js';
import { dimensionMetres, pointInPolygon, snapToFacade } from '../state/placement-geometry.js';
import { CatalogSymbol, PlacementSymbol } from './PlacementClassicSymbol.jsx';
import PlacementPerimeterDimensions from './PlacementPerimeterDimensions.jsx';
import './placement.css';

const createId = () => globalThis.crypto?.randomUUID?.() || `place-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const round = value => Math.round(value * 100) / 100;
const pathData = points => points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ') + ' Z';
const routeData = points => points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ');
const valueOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const measureText = value => `${Number(value).toFixed(2)} м`;

function Field({ label, value, onChange, min, max, step = .01, suffix, disabled }) {
  return <label className="placement-field"><span>{label}</span><span className="placement-input-wrap"><input type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={event => onChange(event.target.value)}/>{suffix ? <small>{suffix}</small> : null}</span></label>;
}

function DimensionLine({ points, label, preview = false }) {
  if (!points || points.length !== 2) return null;
  const [a, b] = points;
  const dx = (b.x - a.x) * 100, dy = (b.y - a.y) * 100;
  const length = Math.hypot(dx, dy);
  if (length < 2) return null;
  const nx = -dy / length * 22, ny = dx / length * 22;
  const x1 = a.x * 100 + nx, y1 = a.y * 100 + ny;
  const x2 = b.x * 100 + nx, y2 = b.y * 100 + ny;
  return <g className={`placement-dimension ${preview ? 'preview' : ''}`} pointerEvents="none">
    <line x1={a.x * 100} y1={a.y * 100} x2={x1 + nx * .3} y2={y1 + ny * .3}/>
    <line x1={b.x * 100} y1={b.y * 100} x2={x2 + nx * .3} y2={y2 + ny * .3}/>
    <line x1={x1} y1={y1} x2={x2} y2={y2} markerStart="url(#placement-arrow)" markerEnd="url(#placement-arrow)"/>
    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7} textAnchor="middle">{label || measureText(dimensionMetres(points))}</text>
  </g>;
}

export default function PlacementScreen() {
  const { project, commit, undo, redo, canUndo, canRedo } = useProject();
  const placement = project.placement || createPlacement();
  const floorCount = Math.max(1, Math.min(2, Number(project.meta?.floors) || 1));
  const [floor, setFloor] = useState(1);
  const activeFloor = Math.min(floor, floorCount);
  const [layer, setLayer] = useState('furniture');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState({ furniture: true, appliance: true, equipment: true, electric: true });
  const [presetId, setPresetId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedCircuitId, setSelectedCircuitId] = useState(null);
  const [drawingRoute, setDrawingRoute] = useState(false);
  const [routePoints, setRoutePoints] = useState([]);
  const [drawingDimension, setDrawingDimension] = useState(false);
  const [dimensionStart, setDimensionStart] = useState(null);
  const [dragPosition, setDragPosition] = useState(null);
  const [printing, setPrinting] = useState(false);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const plan = activeFloor === 1 ? project.plan : project.upperFloors?.[activeFloor - 2] || project.plan;
  const contour = useMemo(() => houseContourPoints(plan), [plan]);
  const rooms = useMemo(() => (plan.rooms || []).filter(room => room.include !== false), [plan]);
  const drawingBounds = useMemo(() => boundsOf([...contour, ...rooms.flatMap(roomPoints)]), [contour, rooms]);
  const margin = placement.showAutoDimensions ? 140 : 65;
  const viewBox = `${drawingBounds.x * 100 - margin} ${drawingBounds.y * 100 - margin} ${Math.max(5, drawingBounds.w) * 100 + margin * 2} ${Math.max(5, drawingBounds.h) * 100 + margin * 2}`;
  const items = useMemo(() => placement.items.filter(item => item.floor === activeFloor), [placement.items, activeFloor]);
  const routes = useMemo(() => placement.routes.filter(route => route.floor === activeFloor), [placement.routes, activeFloor]);
  const dimensions = useMemo(() => (placement.dimensions || []).filter(item => item.floor === activeFloor), [placement.dimensions, activeFloor]);
  const selected = items.find(item => item.id === selectedId);
  const selectedCircuit = placement.circuits.find(item => item.id === selectedCircuitId);
  const activePreset = findPlacementPreset(presetId);
  const summary = placementSummary(placement, activeFloor);
  const groups = PLACEMENT_GROUPS.filter(group => group.layer === layer);
  const catalogItems = PLACEMENT_PRESETS.filter(item => item.layer === layer && (category === 'all' || item.group === category) && (!query || item.label.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))));

  const change = update => commit(next => {
    if (!next.placement) next.placement = createPlacement();
    update(next.placement);
    return next;
  });
  const updateItem = patch => {
    if (!selected) return;
    change(data => { const item = data.items.find(candidate => candidate.id === selected.id); if (item) Object.assign(item, patch); });
  };
  const facadePosition = position => {
    const snapped = snapToFacade(position, contour);
    return snapped ? { x: snapped.x, y: snapped.y, anchorX: snapped.anchorX, anchorY: snapped.anchorY } : position;
  };
  const pointFromEvent = event => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: round(point.x / 100), y: round(point.y / 100) };
  };
  const insidePlan = point => point && (pointInPolygon(point, contour) || rooms.some(room => pointInPolygon(point, roomPoints(room))));
  const onCanvasClick = event => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    const point = pointFromEvent(event);
    if (!point) return;
    if (drawingDimension) {
      if (!dimensionStart) setDimensionStart(point);
      else if (dimensionMetres([dimensionStart, point]) > .01) {
        change(data => { if (!data.dimensions) data.dimensions = []; data.dimensions.push({ id: createId(), floor: activeFloor, points: [dimensionStart, point], label: '' }); });
        setDimensionStart(null);
        setDrawingDimension(false);
      }
      return;
    }
    if (drawingRoute) { if (insidePlan(point)) setRoutePoints(current => [...current, point]); return; }
    if (!activePreset) { setSelectedId(null); return; }
    const location = activePreset.surface === 'facade' ? snapToFacade(point, contour) : insidePlan(point) ? point : null;
    if (!location || (activePreset.surface === 'facade' && location.distance > 1.5)) return;
    const id = createId();
    change(data => data.items.push({
      id, floor: activeFloor, layer: activePreset.layer, kind: activePreset.id, label: activePreset.label,
      x: location.x, y: location.y, width: activePreset.width, depth: activePreset.depth,
      rotation: 0, height: activePreset.height || 0, surface: activePreset.surface || 'interior',
      ...(activePreset.surface === 'facade' ? { anchorX: location.anchorX, anchorY: location.anchorY } : {}),
      circuitId: activePreset.layer === 'electric' && activePreset.id !== 'panel' ? selectedCircuitId || '' : '',
    }));
    setSelectedId(id);
    setPresetId(null);
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
    if (drawingRoute || drawingDimension) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = { id: item.id, pointerId: event.pointerId, start: point, origin: { x: item.x, y: item.y }, last: { x: item.x, y: item.y }, surface: item.surface };
    setSelectedId(item.id);
    setPresetId(null);
  };
  const moveDrag = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const proposed = { x: round(drag.origin.x + point.x - drag.start.x), y: round(drag.origin.y + point.y - drag.start.y) };
    const location = drag.surface === 'facade' ? snapToFacade(proposed, contour) : insidePlan(proposed) ? proposed : null;
    if (!location) return;
    drag.last = location;
    setDragPosition({ id: drag.id, ...location });
  };
  const endDrag = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
    const moved = drag.last.x !== drag.origin.x || drag.last.y !== drag.origin.y;
    if (moved && event.type !== 'pointercancel') {
      const location = drag.last;
      change(data => { const target = data.items.find(item => item.id === drag.id); if (target) Object.assign(target, { x: location.x, y: location.y, ...(drag.surface === 'facade' ? { anchorX: location.anchorX, anchorY: location.anchorY } : {}) }); });
    }
    // Pointer capture retargets click to the root SVG, which would clear the selection.
    suppressClickRef.current = event.type !== 'pointercancel';
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    dragRef.current = null;
    setDragPosition(null);
  };
  const changeLayer = nextLayer => {
    setLayer(nextLayer); setCategory('all'); setQuery(''); setPresetId(null);
    setDrawingRoute(false); setRoutePoints([]); setDrawingDimension(false); setDimensionStart(null);
  };

  const printWorkerSheets = () => {
    setPrinting(true);
    document.body.classList.add('print-placement');
    const originalTitle = document.title;
    document.title = `ЭФТ ${project.meta?.projectNum || 'проект'} — планы для рабочих — ${new Date().toLocaleDateString('ru-RU')}`;
    const restore = () => {
      document.body.classList.remove('print-placement');
      document.title = originalTitle;
      setPrinting(false);
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  return <main className="placement-screen">
    <header className="placement-heading"><div><span className="placement-eyebrow">План проекта · размещение</span><h1>Мебель и инженерия</h1><p>Расставляйте мебель, технику и оборудование. Электроточки и освещение можно ставить внутри дома и на фасаде.</p></div><div className="placement-heading-actions"><button onClick={printWorkerSheets} title="Комплект планов и ведомостей для печати или PDF"><Printer size={17}/> Планы для рабочих / PDF</button><button onClick={undo} disabled={!canUndo} title="Отменить"><Undo2 size={17}/> Отменить</button><button onClick={redo} disabled={!canRedo} title="Повторить"><Redo2 size={17}/> Повторить</button></div></header>
    <div className="placement-toolbar">
      <div className="placement-floor-tabs" aria-label="Этаж">{Array.from({ length: floorCount }, (_, index) => <button key={index} className={activeFloor === index + 1 ? 'active' : ''} onClick={() => { setFloor(index + 1); setSelectedId(null); setRoutePoints([]); setDimensionStart(null); }}>Этаж {index + 1}</button>)}</div>
      <div className="placement-summary"><span>Мебель <b>{summary.furniture}</b></span><span>Техника <b>{summary.appliance}</b></span><span>Оборудование <b>{summary.equipment}</b></span><span>Электроточки <b>{summary.electric}</b></span><span>Трассы по плану <b>{summary.routeLength} м</b></span></div>
      <div className="placement-measure-tools"><button className={placement.showAutoDimensions ? 'active' : ''} onClick={() => change(data => { data.showAutoDimensions = !data.showAutoDimensions; })}><Ruler size={16}/> Привязки по контуру</button><button className={drawingDimension ? 'active' : ''} onClick={() => { setDrawingDimension(current => !current); setDimensionStart(null); setDrawingRoute(false); setRoutePoints([]); setPresetId(null); }}><Plus size={16}/> Размер вручную</button></div>
    </div>
    <div className="placement-workspace">
      <aside className="placement-sidebar"><h2>Библиотека элементов</h2>
        <div className="placement-layers">{PLACEMENT_LAYERS.map(entry => <div className={`placement-layer-row ${layer === entry.id ? 'active' : ''}`} key={entry.id}><button className="placement-layer-select" disabled={entry.future} onClick={() => changeLayer(entry.id)}>{entry.label}{entry.future ? <small>позже</small> : null}</button>{!entry.future ? <button className="placement-eye" aria-label={`${visible[entry.id] ? 'Скрыть' : 'Показать'} ${entry.label}`} title={`${visible[entry.id] ? 'Скрыть' : 'Показать'} ${entry.label}`} onClick={() => setVisible(old => ({ ...old, [entry.id]: !old[entry.id] }))}>{visible[entry.id] ? <Eye size={16}/> : <EyeOff size={16}/>}</button> : null}</div>)}</div>
        <div className="placement-catalog-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти элемент" aria-label="Поиск по библиотеке"/></div>
        <div className="placement-categories"><button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>Все</button>{groups.map(group => <button key={group.id} className={category === group.id ? 'active' : ''} onClick={() => setCategory(group.id)}>{group.label}</button>)}</div>
        <div className="placement-palette-heading"><h3>{category === 'all' ? PLACEMENT_LAYERS.find(entry => entry.id === layer)?.label : PLACEMENT_GROUPS.find(entry => entry.id === category)?.label}</h3><small>{catalogItems.length} элементов</small></div>
        <div className="placement-palette">{catalogItems.map(entry => <button key={entry.id} className={presetId === entry.id ? 'active' : ''} title={entry.label} onClick={() => { setPresetId(current => current === entry.id ? null : entry.id); setSelectedId(null); setDrawingRoute(false); setRoutePoints([]); setDrawingDimension(false); setDimensionStart(null); }}><CatalogSymbol preset={entry}/><span className="placement-card-copy"><strong>{entry.label}</strong><small>{Math.round(entry.width * 100)} × {Math.round(entry.depth * 100)} см{entry.surface === 'facade' ? ' · фасад' : ''}</small></span></button>)}</div>
        {!catalogItems.length ? <p className="placement-catalog-empty">По этому запросу элементов нет.</p> : null}
        {layer === 'electric' ? <div className="placement-circuits"><div className="placement-palette-heading"><h3>Группы щита</h3><button onClick={addCircuit} title="Добавить группу"><Plus size={17}/></button></div>{placement.circuits.length ? placement.circuits.map(circuit => <button key={circuit.id} className={selectedCircuitId === circuit.id ? 'active' : ''} onClick={() => { setSelectedCircuitId(circuit.id); setPresetId(null); }}>{circuit.name}</button>) : <p>Добавьте группу для розеток и света.</p>}{selectedCircuit ? <div className="placement-circuit-form"><label>Название<input value={selectedCircuit.name} onChange={event => updateCircuit({ name: event.target.value })}/></label><label>Кабель, по проекту<input value={selectedCircuit.cable || ''} onChange={event => updateCircuit({ cable: event.target.value })} placeholder="Например, 3×2,5"/></label><label>Защита, по проекту<input value={selectedCircuit.breaker || ''} onChange={event => updateCircuit({ breaker: event.target.value })} placeholder="Заполняется после проверки"/></label><button className={drawingRoute ? 'active' : ''} onClick={() => { setDrawingRoute(!drawingRoute); setPresetId(null); setRoutePoints([]); setDrawingDimension(false); }}><Route size={16}/> {drawingRoute ? 'Отменить трассу' : 'Нарисовать трассу'}</button>{drawingRoute ? <button onClick={finishRoute} disabled={routePoints.length < 2}>Сохранить трассу ({routePoints.length} узла)</button> : null}</div> : null}</div> : null}
        {layer === 'electric' && selectedCircuit ? <button className="placement-remove-circuit" onClick={() => { change(data => { data.circuits = data.circuits.filter(circuit => circuit.id !== selectedCircuit.id); data.routes = data.routes.filter(route => route.circuitId !== selectedCircuit.id); data.items.forEach(item => { if (item.circuitId === selectedCircuit.id) item.circuitId = ''; }); }); setSelectedCircuitId(null); setDrawingRoute(false); setRoutePoints([]); }}><Trash2 size={15}/> Удалить группу и её трассы</button> : null}
        {layer === 'electric' && routes.length ? <div className="placement-route-list"><h3>Трассы этажа</h3>{routes.map((route, index) => <div key={route.id}><span>{placement.circuits.find(circuit => circuit.id === route.circuitId)?.name || `Трасса ${index + 1}`}</span><button title="Удалить трассу" aria-label={`Удалить трассу ${index + 1}`} onClick={() => change(data => { data.routes = data.routes.filter(item => item.id !== route.id); })}><Trash2 size={15}/></button></div>)}</div> : null}
      </aside>
      <section className="placement-canvas-panel"><div className="placement-canvas-title"><strong>План этажа {activeFloor}</strong><span>{drawingDimension ? dimensionStart ? 'Укажите вторую точку размера' : 'Укажите первую точку размера' : drawingRoute ? 'Нажимайте точки трассы' : activePreset ? `Разместите: ${activePreset.label}${activePreset.surface === 'facade' ? ' у наружной стены' : ''}` : 'Выберите элемент слева или переместите существующий'}</span></div><div className="placement-canvas-scroll"><svg ref={svgRef} className={`placement-canvas ${activePreset || drawingRoute || drawingDimension ? 'placing' : ''}`} viewBox={viewBox} role="img" aria-label={`План этажа ${activeFloor} для расстановки мебели и инженерии`} onClick={onCanvasClick} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <defs><pattern id="placement-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#dbe5e7" strokeWidth="1"/></pattern><marker id="placement-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 9 5 L 0 8 z" fill="#497c7a"/></marker></defs>
        <rect x={drawingBounds.x * 100 - 65} y={drawingBounds.y * 100 - 65} width={Math.max(5, drawingBounds.w) * 100 + 130} height={Math.max(5, drawingBounds.h) * 100 + 130} fill="url(#placement-grid)"/>
        <path d={pathData(contour)} fill="#f9fbf9" stroke="#40545e" strokeWidth="5" vectorEffect="non-scaling-stroke"/>
        {rooms.map(room => { const points = roomPoints(room); const box = boundsOf(points); return <g key={room.id}><path d={pathData(points)} fill="rgba(219,233,230,.22)" stroke="#a8bcb9" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/><text x={(box.x + box.w / 2) * 100} y={(box.y + box.h / 2) * 100} textAnchor="middle" className="placement-room-label">{room.name}</text></g>; })}
        {(plan.walls || []).filter(wall => wall.include !== false).map(wall => <line key={wall.id} x1={wall.x1 * 100} y1={wall.y1 * 100} x2={wall.x2 * 100} y2={wall.y2 * 100} stroke="#77918f" strokeWidth="4" vectorEffect="non-scaling-stroke"/>)}
        {(plan.openings || []).filter(opening => opening.include !== false).map(opening => <line key={opening.id} x1={(opening.x - (opening.orientation === 'h' ? opening.width / 2 : 0)) * 100} y1={(opening.y - (opening.orientation === 'v' ? opening.width / 2 : 0)) * 100} x2={(opening.x + (opening.orientation === 'h' ? opening.width / 2 : 0)) * 100} y2={(opening.y + (opening.orientation === 'v' ? opening.width / 2 : 0)) * 100} stroke={opening.type === 'window' ? '#468fba' : '#b77d52'} strokeWidth="7" vectorEffect="non-scaling-stroke"/>)}
        {placement.showAutoDimensions ? <PlacementPerimeterDimensions contour={contour} items={items.filter(item => visible[item.layer])}/> : null}
        {routes.filter(route => visible.electric).map(route => <g key={route.id} onClick={event => event.stopPropagation()}><path d={routeData(route.points)} fill="none" stroke="#d79b43" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" strokeDasharray="8 4"/><title>{placement.circuits.find(circuit => circuit.id === route.circuitId)?.name || 'Трасса'}</title></g>)}
        {drawingRoute && routePoints.length ? <path d={routeData(routePoints)} fill="none" stroke="#e39c29" strokeWidth="4" vectorEffect="non-scaling-stroke"/> : null}
        {dimensions.map(dimension => <DimensionLine key={dimension.id} points={dimension.points} label={dimension.label}/>)}
        {dimensionStart ? <circle cx={dimensionStart.x * 100} cy={dimensionStart.y * 100} r="7" fill="#497c7a" pointerEvents="none"/> : null}
        {items.filter(item => visible[item.layer]).map(item => {
          const location = dragPosition?.id === item.id ? dragPosition : item;
          const electrical = item.layer === 'electric';
          const displayWidth = electrical ? Math.max(item.width * 100, 58) : item.width * 100;
          const displayDepth = electrical ? Math.max(item.depth * 100, 58) : item.depth * 100;
          return <g key={item.id} data-placement-id={item.id} transform={`translate(${location.x * 100} ${location.y * 100}) rotate(${item.rotation || 0})`} className={`placement-object ${selectedId === item.id ? 'selected' : ''}`} onPointerDown={event => beginDrag(event, item)} onClick={event => { event.stopPropagation(); if (suppressClickRef.current) suppressClickRef.current = false; setSelectedId(item.id); setPresetId(null); }}>
            {item.surface === 'facade' ? <line x1={(item.anchorX - location.x) * 100} y1={(item.anchorY - location.y) * 100} x2="0" y2="0" stroke="#4a9e94" strokeWidth="3" strokeDasharray="4 3" pointerEvents="none"/> : null}
            <rect x={-Math.max(displayWidth, electrical ? 100 : displayWidth) / 2} y={-Math.max(displayDepth, electrical ? 100 : displayDepth) / 2} width={Math.max(displayWidth, electrical ? 100 : displayWidth)} height={Math.max(displayDepth, electrical ? 100 : displayDepth)} fill="transparent" stroke="none"/>
            <svg x={-displayWidth / 2} y={-displayDepth / 2} width={displayWidth} height={displayDepth} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible"><PlacementSymbol kind={item.kind}/></svg>
            {selectedId === item.id ? <rect x={-displayWidth / 2 - 4} y={-displayDepth / 2 - 4} width={displayWidth + 8} height={displayDepth + 8} rx="8" fill="none" stroke="#2b8f85" strokeWidth="3" pointerEvents="none"/> : null}
            <title>{item.label || item.kind}</title>
          </g>;
        })}
      </svg></div><div className="placement-canvas-note">Выбор элемента размещает один экземпляр. Затем его можно перетащить. Привязки показывают расстояния до центров объектов от крайних наружных габаритов дома; ручные размеры можно провести между двумя точками. Кнопка «Планы для рабочих / PDF» собирает листы по этажам с ведомостями; сохраните PDF с датой выпуска и передайте бригаде актуальный экземпляр.</div></section>
      <aside className="placement-inspector"><div className="placement-inspector-heading"><h2>Свойства и размеры</h2>{selected ? <button onClick={() => setSelectedId(null)} aria-label="Закрыть свойства"><X size={17}/></button> : null}</div>
        {selected ? <div className="placement-inspector-fields"><span className="placement-type">{PLACEMENT_LAYERS.find(entry => entry.id === selected.layer)?.label} · этаж {selected.floor}{selected.surface === 'facade' ? ' · фасад' : ''}</span><label>Название<input value={selected.label || ''} onChange={event => updateItem({ label: event.target.value })}/></label><div className="placement-field-grid"><Field label="X" value={selected.x} onChange={value => { const position = { x: valueOr(value, selected.x), y: selected.y }; updateItem(selected.surface === 'facade' ? facadePosition(position) : position); }} step={.05} suffix="м"/><Field label="Y" value={selected.y} onChange={value => { const position = { x: selected.x, y: valueOr(value, selected.y) }; updateItem(selected.surface === 'facade' ? facadePosition(position) : position); }} step={.05} suffix="м"/><Field label="Ширина" value={selected.width} onChange={value => updateItem({ width: Math.max(.05, valueOr(value, selected.width)) })} min={.05} suffix="м"/><Field label="Глубина" value={selected.depth} onChange={value => updateItem({ depth: Math.max(.05, valueOr(value, selected.depth)) })} min={.05} suffix="м"/></div><Field label="Высота установки" value={selected.height || 0} onChange={value => updateItem({ height: Math.max(0, valueOr(value, selected.height)) })} min={0} suffix="м"/><button className="placement-rotate" onClick={() => updateItem({ rotation: ((selected.rotation || 0) + 90) % 360 })}><RotateCw size={16}/> Повернуть на 90°</button>{selected.layer === 'electric' && selected.kind !== 'panel' ? <label>Электрическая группа<select value={selected.circuitId || ''} onChange={event => updateItem({ circuitId: event.target.value })}><option value="">Не назначена</option>{placement.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}</select></label> : null}<label>Примечание<textarea rows="3" value={selected.note || ''} onChange={event => updateItem({ note: event.target.value })} placeholder="Модель, подключение или уточнение проекта"/></label><button className="placement-delete" onClick={() => { change(data => { data.items = data.items.filter(item => item.id !== selected.id); }); setSelectedId(null); }}><Trash2 size={16}/> Удалить объект</button></div> : <div className="placement-empty-inspector"><p>Выберите предмет на плане, чтобы уточнить его размеры, координаты и высоту установки.</p></div>}
        {dimensions.length ? <div className="placement-dimension-list"><h3>Ручные размеры</h3>{dimensions.map((dimension, index) => <div key={dimension.id}><span>{index + 1}. {measureText(dimensionMetres(dimension.points))}</span><input aria-label={`Подпись размера ${index + 1}`} value={dimension.label || ''} placeholder="Подпись по замеру" onChange={event => change(data => { const target = data.dimensions.find(entry => entry.id === dimension.id); if (target) target.label = event.target.value; })}/><button aria-label={`Удалить размер ${index + 1}`} onClick={() => change(data => { data.dimensions = data.dimensions.filter(entry => entry.id !== dimension.id); })}><Trash2 size={15}/></button></div>)}</div> : null}
      </aside>
    </div>
    {printing ? createPortal(<PlacementWorkerSheets project={project}/>, document.body) : null}
  </main>;
}
