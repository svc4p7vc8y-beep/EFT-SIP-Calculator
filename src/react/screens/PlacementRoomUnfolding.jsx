import { useEffect, useRef, useState } from 'react';
import { Camera, Minus, Plus, Ruler, Trash2 } from 'lucide-react';
import { boundsOf, roomPoints } from '../planner/geometry.js';
import { pointInPolygon } from '../state/placement-geometry.js';
import { PLACEMENT_LAYERS } from '../state/placement-model.js';
import { roomDimensionEnd, roomItemPlane, roomOpeningOnEdge, roomUnfoldLayout, roomWallDisplayPoint, roomWallPlanPoint } from '../state/placement-room.js';
import { linkedWallSwitch, wallPointDisplayOrder } from '../state/placement-visibility.js';
import { alignLightToNeighbors, schematicPosition } from '../state/placement-schematic.js';
import { PlacementSymbol } from './PlacementClassicSymbol.jsx';

const round = value => Math.round(value * 100) / 100;
const SCALE = 68;
const colors = { electric: '#d77524', plumbing: '#2979aa', heating: '#bf6134', sewer: '#72579a', ventilation: '#3d9481' };
const sideNames = { top: 'верхняя', right: 'правая', bottom: 'нижняя', left: 'левая' };
const dimensionId = () => globalThis.crypto?.randomUUID?.() || `room-dimension-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clampZoom = value => Math.max(50, Math.min(250, Math.round(value)));

function RoomDimensionMark({ points, label, preview = false }) {
  if (!points || points.length !== 2) return null;
  const [first, last] = points;
  const dx = last.x - first.x, dy = last.y - first.y;
  const distance = Math.hypot(dx, dy);
  if (distance < .02) return null;
  const inward = Math.abs(dy) > Math.abs(dx) && first.x < .2 ? -1 : 1;
  const nx = -dy / distance * .13 * inward, ny = dx / distance * .13 * inward;
  const a = { x: (first.x + nx) * 100, y: (first.y + ny) * 100 };
  const b = { x: (last.x + nx) * 100, y: (last.y + ny) * 100 };
  return <g className={`placement-room-dimension${preview ? ' preview' : ''}`} stroke="#176d63" fill="#176d63" pointerEvents="none">
    <line x1={first.x * 100} y1={first.y * 100} x2={a.x} y2={a.y}/>
    <line x1={last.x * 100} y1={last.y * 100} x2={b.x} y2={b.y}/>
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>
    <circle cx={a.x} cy={a.y} r="3"/><circle cx={b.x} cy={b.y} r="3"/>
    <text x={(a.x + b.x) / 2 + (inward < 0 ? 24 : 0)} y={(a.y + b.y) / 2 - 5} textAnchor="middle" stroke="none" fill="#174d43" fontSize="12" fontWeight="700">{label || `${distance.toFixed(2)} м`}</text>
  </g>;
}

const svgPosition = (svg, event) => {
  const matrix = svg?.getScreenCTM();
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
};

export default function PlacementRoomUnfolding({ room, plan, items, visible = {}, onToggleLayer, elementsLocked, onToggleLock, onUndo, onRedo, onScreenshot, canUndo, canRedo, circuitColor, activePreset, selectedId, routeMode, onPlace, onMove, onSelect, dimensions = [], floor = 1, onDimensionCreate, onDimensionLabel, onDimensionDelete }) {
  const drag = useRef(null);
  const skipClick = useRef(false);
  const [itemPreview, setItemPreview] = useState(null);
  const [dimensionMode, setDimensionMode] = useState('off');
  const [dimensionStart, setDimensionStart] = useState(null);
  const [dimensionPreview, setDimensionPreview] = useState(null);
  const [showAutoDimensions, setShowAutoDimensions] = useState(true);
  const [zoom, setZoom] = useState(100);
  useEffect(() => { setDimensionStart(null); setDimensionPreview(null); setDimensionMode('off'); setZoom(100); }, [room?.id]);
  if (!room) return null;
  const vertices = roomPoints(room);
  const box = boundsOf(vertices);
  const height = Math.max(.5, Number(plan.wallHeight) || 2.5);
  const roomItems = items.filter(item => visible[item.layer] !== false && (pointInPolygon(item, vertices) || (item.linkedApplianceId && items.some(parent => parent.id === item.linkedApplianceId && pointInPolygon(parent, vertices)))));
  const layout = roomUnfoldLayout(room, height);
  const edges = layout.edges;
  const assignments = new Map(roomItems.map(item => [item.id, roomItemPlane(room, item)]));
  const floorItems = roomItems.filter(item => assignments.get(item.id)?.plane === 'floor');
  const wallItems = roomItems.filter(item => assignments.get(item.id)?.plane === 'wall');
  const anchorPositions = new Map();
  const anchorGroups = [];
  for (const item of wallItems) {
    const edgeIndex = assignments.get(item.id).edgeIndex;
    let group = anchorGroups.find(entry => entry.edgeIndex === edgeIndex && Math.hypot(entry.x - item.x, entry.y - item.y) < .14);
    if (!group) { group = { edgeIndex, x: item.x, y: item.y, items: [] }; anchorGroups.push(group); }
    group.items.push(item);
  }
  for (const group of anchorGroups) {
    const edge = edges.find(entry => entry.index === group.edgeIndex);
    wallPointDisplayOrder(group.items).forEach(({ item, offset }) => {
      const candidate = { x: item.x - edge.outward.x * offset, y: item.y - edge.outward.y * offset };
      anchorPositions.set(item.id, pointInPolygon(candidate, vertices) ? candidate : item);
    });
  }
  for (const junction of wallItems.filter(item => item.kind === 'junction-box' && Math.hypot((item.diagramX ?? item.x) - item.x, (item.diagramY ?? item.y) - item.y) < .12)) {
    const host = linkedWallSwitch(wallItems, junction);
    const edgeIndex = assignments.get(junction.id)?.edgeIndex;
    if (!host || assignments.get(host.id)?.edgeIndex !== edgeIndex) continue;
    const edge = edges.find(entry => entry.index === edgeIndex);
    const hostAnchor = anchorPositions.get(host.id) || host;
    const candidate = { x: hostAnchor.x - edge.outward.x * .18, y: hostAnchor.y - edge.outward.y * .18 };
    if (pointInPolygon(candidate, vertices)) anchorPositions.set(junction.id, candidate);
  }
  const itemColor = item => item.layer === 'electric' ? circuitColor?.(item.circuitId) || colors.electric : colors[item.layer] || '#708d7b';
  const selectedEdge = edges.find(edge => edge.index === assignments.get(selectedId)?.edgeIndex);
  const floorW = Math.max(1, box.w) * 100, floorH = Math.max(1, box.h) * 100;
  const floorPath = vertices.map((point, index) => `${index ? 'L' : 'M'} ${(point.x - box.x) * 100} ${(point.y - box.y) * 100}`).join(' ') + ' Z';
  const surfacePosition = (local, edgeIndex) => edgeIndex < 0
    ? { position: { x: round(box.x + local.x / 100), y: round(box.y + local.y / 100) }, elevation: activePreset?.height || 0 }
    : roomWallPlanPoint(room, edgeIndex, local.x / 100, local.y / 100, height);
  const handleDimensionMove = (event, edgeIndex) => {
    if (dimensionMode === 'off' || !dimensionStart || dimensionStart.edgeIndex !== edgeIndex) return;
    const local = svgPosition(event.currentTarget, event);
    if (local) setDimensionPreview(roomDimensionEnd(dimensionStart.point, { x: round(local.x / 100), y: round(local.y / 100) }, dimensionMode));
  };
  const handleClick = (event, edgeIndex = -1) => {
    if (skipClick.current) { skipClick.current = false; return; }
    const local = svgPosition(event.currentTarget.ownerSVGElement || event.currentTarget, event);
    if (!local) return;
    const target = surfacePosition(local, edgeIndex);
    if (!target?.position || (edgeIndex < 0 && !pointInPolygon(target.position, vertices))) return;
    if (dimensionMode !== 'off') {
      const point = { x: round(local.x / 100), y: round(local.y / 100) };
      if (!dimensionStart || dimensionStart.edgeIndex !== edgeIndex) setDimensionStart({ edgeIndex, point });
      else {
        const end = roomDimensionEnd(dimensionStart.point, point, dimensionMode);
        if (Math.hypot(end.x - dimensionStart.point.x, end.y - dimensionStart.point.y) >= .02) onDimensionCreate?.({ id: dimensionId(), floor, roomId: room.id, edgeIndex, mode: dimensionMode, points: [dimensionStart.point, end], label: '' });
        setDimensionStart(null);
        setDimensionPreview(null);
      }
      return;
    }
    if (activePreset) onPlace(target.position, target.elevation, edgeIndex);
    else if (!routeMode && selectedId && !elementsLocked) onMove(selectedId, target.position, edgeIndex < 0 ? null : target.elevation, edgeIndex);
  };
  const handleDown = (event, item) => {
    if (elementsLocked || routeMode || activePreset || dimensionMode !== 'off') return;
    event.stopPropagation();
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    drag.current = { id: item.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const handleItemMove = event => {
    const current = drag.current;
    if (!current?.id || current.pointerId !== event.pointerId) return;
    const item = roomItems.find(entry => entry.id === current.id);
    const local = svgPosition(event.currentTarget, event);
    const target = local && surfacePosition(local, -1);
    if (!item || !target?.position || !pointInPolygon(target.position, vertices)) return;
    const aligned = alignLightToNeighbors(target.position, item, roomItems, [room]);
    setItemPreview({ id: item.id, ...aligned });
  };
  const handleUp = (event, edgeIndex = -1) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y) > 4;
    drag.current = null;
    const preview = itemPreview;
    setItemPreview(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!moved) { onSelect(current.id); skipClick.current = true; window.setTimeout(() => { skipClick.current = false; }, 0); return; }
    const local = svgPosition(event.currentTarget, event);
    if (!local) return;
    const target = surfacePosition(local, edgeIndex);
    if (!elementsLocked && target?.position && (edgeIndex >= 0 || pointInPolygon(target.position, vertices))) {
      onMove(current.id, edgeIndex < 0 && preview?.id === current.id ? preview.position : target.position, edgeIndex < 0 ? null : target.elevation, edgeIndex);
      skipClick.current = true;
      window.setTimeout(() => { skipClick.current = false; }, 0);
    }
  };
  const mark = (item, x, y, surface = 'floor') => {
    const width = Math.max(26, Math.min(surface === 'wall' ? 65 : 999, (Number(item.width) || .1) * 100));
    const depth = Math.max(26, Math.min(surface === 'wall' ? 60 : 999, (Number(item.depth) || .1) * 100));
    return <g key={`${surface}-${item.id}`} data-room-item={item.id} className="placement-room-mark"
      onPointerDown={event => handleDown(event, item)} onClick={event => { event.stopPropagation(); if (skipClick.current) { skipClick.current = false; return; } if (dimensionMode !== 'off') handleClick(event, surface === 'floor' ? -1 : assignments.get(item.id)?.edgeIndex); else onSelect(item.id); }}>
      {item.kind !== 'connection-port' ? <g transform={surface === 'floor' && item.rotation ? `rotate(${item.rotation} ${x} ${y})` : undefined}>
        <rect x={x - width / 2 - 2} y={y - depth / 2 - 2} width={width + 4} height={depth + 4} rx="4" fill="#fff" fillOpacity=".7" stroke={itemColor(item)} strokeWidth="1"/>
        <svg x={x - width / 2} y={y - depth / 2} width={width} height={depth} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible"><PlacementSymbol kind={item.kind} system={item.layer} medium={item.connectionMedium}/></svg>
      </g> : <circle cx={x} cy={y} r={selectedId === item.id ? 10 : 7} fill={item.connectionMedium === 'hot' ? '#bd5547' : itemColor(item)} stroke="#fff" strokeWidth="2"/>}
      {selectedId === item.id ? <circle cx={x} cy={y} r="13" fill="none" stroke="#2b8f85" strokeWidth="2" pointerEvents="none"/> : null}
      <title>{item.label}{item.connectionMedium ? ` · ${item.connectionMedium}` : ''}</title>
    </g>;
  };
  const wall = edge => {
    const { index, side, length } = edge;
    const horizontal = side === 'top' || side === 'bottom';
    const width = (horizontal ? length : height) * 100;
    const wallHeight = (horizontal ? height : length) * 100;
    const openings = (plan.openings || []).map(opening => ({ opening, display: roomOpeningOnEdge(room, index, opening, height) })).filter(entry => entry.display);
    return <div key={index} className={`placement-room-surface wall-${side}${selectedEdge?.index === index ? ' selected-wall' : ''}`} style={{ left: `${edge.x * SCALE}px`, top: `${edge.y * SCALE}px`, width: `${width * SCALE / 100}px`, height: `${wallHeight * SCALE / 100}px` }} data-edge-index={index} data-edge-length={length.toFixed(3)} data-detached={edge.detached || undefined}>
      <svg viewBox={`0 0 ${width} ${wallHeight}`} aria-label={`Стена ${index + 1} комнаты ${room.name}`} role="img" onClick={event => handleClick(event, index)} onPointerMove={event => handleDimensionMove(event, index)} onPointerUp={event => handleUp(event, index)} onPointerCancel={() => { drag.current = null; setDimensionPreview(null); }}>
        <rect width={width} height={wallHeight} className="placement-room-wall-fill" fill="#f0f7f2" stroke="#839d8e" strokeWidth="2"/>
        {openings.map(({ opening, display }) => <g key={opening.id} data-opening-id={opening.id}><rect x={display.x * 100} y={display.y * 100} width={display.width * 100} height={display.height * 100} className={`placement-room-opening ${opening.type}`} fill="#fff" stroke="#8ba99a" strokeWidth="2"/><title>{opening.type === 'door' ? 'Дверь' : 'Окно'} · {display.clippedWidth.toFixed(2)} м{opening.type === 'window' && opening.sillHeight == null ? ' · отметка подоконника не указана' : ''}</title></g>)}
        {wallItems.filter(item => assignments.get(item.id)?.edgeIndex === index).map(item => { const position = roomWallDisplayPoint(room, index, item, item.height || 0, height); return position ? mark(item, position.x * 100, position.y * 100, 'wall') : null; })}
        {showAutoDimensions ? <><RoomDimensionMark points={[{ x: 0, y: horizontal ? 0 : 0 }, { x: horizontal ? length : height, y: 0 }]}/><RoomDimensionMark points={[{ x: 0, y: 0 }, { x: 0, y: horizontal ? height : length }]}/></> : null}
        {dimensions.filter(entry => entry.edgeIndex === index).map(entry => <RoomDimensionMark key={entry.id} points={entry.points} label={entry.label}/>)}
        {dimensionStart?.edgeIndex === index && dimensionPreview ? <RoomDimensionMark points={[dimensionStart.point, dimensionPreview]} preview/> : null}
      </svg>
    </div>;
  };
  return <section className="placement-room-unfolding"><header><div><strong>Развёртка комнаты: {room.name}</strong><span>Пол и стены для размещения точек инженерии и размеров.</span></div><div className="placement-room-heading-actions"><span>{roomItems.length} элементов</span><button type="button" className={elementsLocked ? 'active' : ''} aria-pressed={elementsLocked} onClick={onToggleLock}>{elementsLocked ? '🔒 Элементы' : '🔓 Элементы'}</button><button type="button" onClick={onUndo} disabled={!canUndo} title="Отменить">↶</button><button type="button" onClick={onRedo} disabled={!canRedo} title="Повторить">↷</button><button type="button" onClick={onScreenshot} title="Снимок развёртки"><Camera size={16}/> Снимок развёртки</button></div></header>
    <div className="placement-room-layer-switches" role="group" aria-label="Слои развёртки">{PLACEMENT_LAYERS.filter(entry => !entry.future).map(entry => <button key={entry.id} className={visible[entry.id] === false ? 'muted' : 'active'} aria-pressed={visible[entry.id] !== false} onClick={() => onToggleLayer?.(entry.id)}>{entry.label}</button>)}</div>
    <div className="placement-room-tools" role="toolbar" aria-label="Размеры и масштаб развёртки">
      <button type="button" className={showAutoDimensions ? 'active' : ''} aria-pressed={showAutoDimensions} onClick={() => setShowAutoDimensions(value => !value)}><Ruler size={16}/> Габариты</button>
      {[[ 'free', 'Произвольный размер' ], [ 'horizontal', 'Горизонтальный размер' ], [ 'vertical', 'Вертикальный размер' ]].map(([mode, label]) => <button key={mode} type="button" className={dimensionMode === mode ? 'active' : ''} aria-pressed={dimensionMode === mode} onClick={() => { setDimensionMode(current => current === mode ? 'off' : mode); setDimensionStart(null); setDimensionPreview(null); }}>{label}</button>)}
      {dimensionStart ? <button type="button" onClick={() => { setDimensionStart(null); setDimensionPreview(null); }}>Сбросить первую точку</button> : null}
      <div className="placement-room-zoom"><button type="button" aria-label="Уменьшить масштаб" onClick={() => setZoom(value => clampZoom(value - 25))}><Minus size={16}/></button><button type="button" aria-label="Масштаб 100%" onClick={() => setZoom(100)}>{zoom}%</button><button type="button" aria-label="Увеличить масштаб" onClick={() => setZoom(value => clampZoom(value + 25))}><Plus size={16}/></button></div>
    </div>
    {dimensionMode !== 'off' ? <p className="placement-room-tool-hint">Нажмите две точки на одной плоскости. Размер сохранится в проекте. Режим: {dimensionMode === 'free' ? 'произвольный' : dimensionMode === 'horizontal' ? 'горизонтальный' : 'вертикальный'}.</p> : null}
    <div className="placement-room-unfold-scroll"><div className="placement-room-zoom-frame" style={{ width: `${layout.width * SCALE * zoom / 100}px`, height: `${layout.height * SCALE * zoom / 100}px` }}><div className="placement-room-unfold-grid" style={{ width: `${layout.width * SCALE}px`, height: `${layout.height * SCALE}px`, transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}>
      {edges.map(wall)}
      <div className="placement-room-surface floor" style={{ left: `${layout.floor.x * SCALE}px`, top: `${layout.floor.y * SCALE}px`, width: `${floorW * SCALE / 100}px`, height: `${floorH * SCALE / 100}px` }}>
        <svg viewBox={`0 0 ${floorW} ${floorH}`} aria-label={`Пол комнаты ${room.name}`} role="img"
          onClick={handleClick} onPointerMove={event => { handleDimensionMove(event, -1); handleItemMove(event); }} onPointerUp={handleUp} onPointerCancel={() => { drag.current = null; setDimensionPreview(null); setItemPreview(null); }}>
          <defs><clipPath id={`room-floor-${room.id}`}><path d={floorPath}/></clipPath></defs>
          <path d={floorPath} className="placement-room-floor-fill" fill="#eaf2e8" stroke="#628e73" strokeWidth="2"/>
          <g clipPath={`url(#room-floor-${room.id})`}>
          {wallItems.map(item => { const anchor = anchorPositions.get(item.id) || item; return <g key={`anchor-${item.id}`} className="placement-room-anchor" onClick={event => { event.stopPropagation(); onSelect(item.id); }}><circle cx={(anchor.x - box.x) * 100} cy={(anchor.y - box.y) * 100} r={selectedId === item.id ? 9 : 6} fill={itemColor(item)} stroke="#fff" strokeWidth="2"/><title>{item.label} · стена {(assignments.get(item.id)?.edgeIndex ?? -1) + 1} · h={Number(item.height || 0).toFixed(2)} м</title></g>; })}
          {wallItems.filter(item => item.kind === 'junction-box' && Number.isFinite(item.diagramX) && Number.isFinite(item.diagramY) && Math.hypot(item.diagramX - item.x, item.diagramY - item.y) >= .12).map(item => { const at = schematicPosition(item), x = (at.x - box.x) * 100, y = (at.y - box.y) * 100; return <g key={`diagram-${item.id}`} data-room-diagram={item.id} onPointerDown={event => handleDown(event, item)} onClick={event => { event.stopPropagation(); onSelect(item.id); }}><circle cx={x} cy={y} r="12" fill="#fff" stroke={itemColor(item)} strokeWidth="2.5"/><circle cx={x} cy={y} r="4" fill={itemColor(item)} pointerEvents="none"/><title>Распайка на схеме; фактическая установка на стене под потолком</title></g>; })}
          {floorItems.map(item => { const at = itemPreview?.id === item.id ? itemPreview.position : item; return mark(item, (at.x - box.x) * 100, (at.y - box.y) * 100); })}
          </g>
          {showAutoDimensions ? <><RoomDimensionMark points={[{ x: 0, y: 0 }, { x: box.w, y: 0 }]}/><RoomDimensionMark points={[{ x: 0, y: 0 }, { x: 0, y: box.h }]}/></> : null}
          {dimensions.filter(entry => entry.edgeIndex === -1).map(entry => <RoomDimensionMark key={entry.id} points={entry.points} label={entry.label}/>)}
          {dimensionStart?.edgeIndex === -1 && dimensionPreview ? <RoomDimensionMark points={[dimensionStart.point, dimensionPreview]} preview/> : null}
        </svg>
      </div>
    </div></div></div>
    <div className="placement-room-surface-labels" aria-label="Размеры плоскостей"><span>Пол · {box.w.toFixed(2)} × {box.h.toFixed(2)} м</span>{edges.map(edge => <span key={edge.index} className={selectedEdge?.index === edge.index ? 'active' : ''}>Стена {edge.index + 1} · {sideNames[edge.side]} · {edge.length.toFixed(2)} м{edge.detached ? ' ↔ грань' : ''}</span>)}</div>
    {wallItems.length ? <div className="placement-room-point-list"><strong>Привязки к стенам · цветные точки на полу показывают место установки</strong><div>{wallItems.map(item => <button key={item.id} type="button" className={selectedId === item.id ? 'active' : ''} onClick={() => onSelect(item.id)}><i style={{ background: itemColor(item) }}/>{item.label} · стена {(assignments.get(item.id)?.edgeIndex ?? -1) + 1} · h={Number(item.height || 0).toFixed(2)} м</button>)}</div></div> : null}
    {floorItems.some(item => item.id === selectedId) ? <div className="placement-room-selected-label">Выбрано на полу: {floorItems.find(item => item.id === selectedId)?.label}</div> : null}
    {dimensions.length ? <div className="placement-room-dimension-list"><strong>Размеры комнаты</strong>{dimensions.map(entry => <div key={entry.id}><span>{entry.edgeIndex === -1 ? 'Пол' : `Стена ${entry.edgeIndex + 1}`} · {Math.hypot(entry.points[1].x - entry.points[0].x, entry.points[1].y - entry.points[0].y).toFixed(2)} м</span><input aria-label="Подпись размера" value={entry.label || ''} placeholder="Подпись" onChange={event => onDimensionLabel?.(entry.id, event.target.value)}/><button type="button" aria-label="Удалить размер" onClick={() => onDimensionDelete?.(entry.id)}><Trash2 size={16}/></button></div>)}</div> : null}
    <p>Выберите инструмент размера и нажмите две точки на полу или стене. Точки инженерии и элементы размещаются как прежде. Трассы доступны на основном плане.</p>
  </section>;
}
