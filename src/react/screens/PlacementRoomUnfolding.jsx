import { useRef } from 'react';
import { boundsOf, roomPoints } from '../planner/geometry.js';
import { pointInPolygon } from '../state/placement-geometry.js';
import { PLACEMENT_LAYERS } from '../state/placement-model.js';
import { electricalPlacementClusters } from '../state/placement-visibility.js';
import { roomEdgeDisplay, roomWallDisplayPoint, roomWallPlanPoint } from '../state/placement-room.js';
import { PlacementSymbol } from './PlacementClassicSymbol.jsx';

const round = value => Math.round(value * 100) / 100;
const SCALE = 68;
const colors = { electric: '#d77524', plumbing: '#2979aa', heating: '#bf6134', sewer: '#72579a', ventilation: '#3d9481' };
const sideNames = { top: 'верхняя', right: 'правая', bottom: 'нижняя', left: 'левая' };
const routeColor = (route, circuitColor) => route.system === 'electric' ? circuitColor?.(route.circuitId) : colors[route.system] || '#d77524';

const svgPosition = (svg, event) => {
  const matrix = svg?.getScreenCTM();
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
};

export default function PlacementRoomUnfolding({ room, plan, items, routes = [], draftPoints = [], draftSystem = '', draftCircuitId = '', visible = {}, onToggleLayer, elementsLocked, onToggleLock, circuitColor, activePreset, selectedId, routeMode, onPlace, onMove, onSelect, onPickNode, onRoutePoint, onSelectRoute }) {
  const drag = useRef(null);
  const skipClick = useRef(false);
  if (!room) return null;
  const vertices = roomPoints(room);
  const box = boundsOf(vertices);
  const height = Math.max(.5, Number(plan.wallHeight) || 2.5);
  const roomItems = items.filter(item => visible[item.layer] !== false && (pointInPolygon(item, vertices) || (item.linkedApplianceId && items.some(parent => parent.id === item.linkedApplianceId && pointInPolygon(parent, vertices)))));
  const roomClusters = electricalPlacementClusters(roomItems, [room]);
  const rowPositions = new Map(roomClusters.flatMap(cluster => cluster.items.map((item, index) => [item.id, { x: cluster.x + cluster.normal.x * (.24 + index * .3), y: cluster.y + cluster.normal.y * (.24 + index * .3) }])));
  const roomRoutes = routes.filter(route => visible[route.system] !== false && (route.points || []).some(point => pointInPolygon(point, vertices)));
  const edges = vertices.map((_, index) => ({ index, ...roomEdgeDisplay(room, index) })).filter(edge => edge.length > .01);
  const primarySides = new Set(), primaryEdges = [], extraEdges = [];
  for (const edge of edges) {
    if (primarySides.has(edge.side)) extraEdges.push(edge);
    else { primarySides.add(edge.side); primaryEdges.push(edge); }
  }
  const floorW = Math.max(1, box.w) * 100, floorH = Math.max(1, box.h) * 100;
  const surfacePosition = (local, edgeIndex) => edgeIndex < 0
    ? { position: { x: round(box.x + local.x / 100), y: round(box.y + local.y / 100) }, elevation: activePreset?.height || 0 }
    : roomWallPlanPoint(room, edgeIndex, local.x / 100, local.y / 100, height);
  const handleClick = (event, edgeIndex = -1) => {
    if (skipClick.current) { skipClick.current = false; return; }
    const local = svgPosition(event.currentTarget, event);
    if (!local) return;
    const target = surfacePosition(local, edgeIndex);
    if (!target?.position || (edgeIndex < 0 && !pointInPolygon(target.position, vertices))) return;
    if (routeMode) onRoutePoint(target.position, target.elevation);
    else if (activePreset) onPlace(target.position, target.elevation, edgeIndex);
    else if (selectedId && !elementsLocked) onMove(selectedId, target.position, edgeIndex < 0 ? null : target.elevation, edgeIndex);
  };
  const handleDown = (event, item) => {
    if (elementsLocked || routeMode || activePreset) return;
    event.stopPropagation();
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    drag.current = { id: item.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const handleUp = (event, edgeIndex = -1) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y) > 4;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!moved) { onSelect(current.id); skipClick.current = true; window.setTimeout(() => { skipClick.current = false; }, 0); return; }
    const local = svgPosition(event.currentTarget, event);
    if (!local) return;
    const target = surfacePosition(local, edgeIndex);
    if (!elementsLocked && target?.position && (edgeIndex >= 0 || pointInPolygon(target.position, vertices))) {
      onMove(current.id, target.position, edgeIndex < 0 ? null : target.elevation, edgeIndex);
      skipClick.current = true;
      window.setTimeout(() => { skipClick.current = false; }, 0);
    }
  };
  const mark = (item, x, y, surface = 'floor') => <g key={`${surface}-${item.id}`} data-room-item={item.id} className="placement-room-mark"
    onPointerDown={event => handleDown(event, item)} onClick={event => { event.stopPropagation(); if (skipClick.current) { skipClick.current = false; return; } if (routeMode) onPickNode(item); else onSelect(item.id); }}>
    {item.layer === 'electric' && rowPositions.has(item.id) && surface === 'floor' ? <><circle cx={x} cy={y} r="15" fill="#fff" stroke={circuitColor?.(item.circuitId)} strokeWidth="3"/><circle cx={x} cy={y} r="8" fill={circuitColor?.(item.circuitId)}/></> : item.kind !== 'connection-port' ? <><rect x={x - Math.max(26, Math.min(surface === 'wall' ? 65 : 999, (Number(item.width) || .1) * 100)) / 2 - 2} y={y - Math.max(26, Math.min(surface === 'wall' ? 60 : 999, (Number(item.depth) || .1) * 100)) / 2 - 2} width={Math.max(26, Math.min(surface === 'wall' ? 65 : 999, (Number(item.width) || .1) * 100)) + 4} height={Math.max(26, Math.min(surface === 'wall' ? 60 : 999, (Number(item.depth) || .1) * 100)) + 4} rx="4" fill="#fff" fillOpacity=".7" stroke={item.layer === 'electric' ? circuitColor?.(item.circuitId) : colors[item.layer] || '#708d7b'} strokeWidth="1"/><svg x={x - Math.max(26, Math.min(surface === 'wall' ? 65 : 999, (Number(item.width) || .1) * 100)) / 2} y={y - Math.max(26, Math.min(surface === 'wall' ? 60 : 999, (Number(item.depth) || .1) * 100)) / 2} width={Math.max(26, Math.min(surface === 'wall' ? 65 : 999, (Number(item.width) || .1) * 100))} height={Math.max(26, Math.min(surface === 'wall' ? 60 : 999, (Number(item.depth) || .1) * 100))} viewBox="0 0 100 100" overflow="visible"><PlacementSymbol kind={item.kind} system={item.layer} medium={item.connectionMedium}/></svg></> : <circle cx={x} cy={y} r={selectedId === item.id ? 10 : 7} fill={item.connectionMedium === 'hot' ? '#bd5547' : colors[item.layer] || '#375f52'} stroke="#fff" strokeWidth="2"/>}
    {selectedId === item.id ? <circle cx={x} cy={y} r="13" fill="none" stroke="#2b8f85" strokeWidth="2" pointerEvents="none"/> : null}
    {selectedId === item.id ? <text x={x + 12} y={y - 10} className="placement-room-mark-label">{item.label}</text> : null}
    <title>{item.label}{item.connectionMedium ? ` · ${item.connectionMedium}` : ''}</title>
  </g>;
  const wall = edge => {
    const { index, side, length } = edge;
    const horizontal = side === 'top' || side === 'bottom';
    const width = (horizontal ? length : height) * 100;
    const wallHeight = (horizontal ? height : length) * 100;
    const openings = (plan.openings || []).filter(opening => {
      if (!['window', 'door'].includes(opening.type) || !(Number(opening.width) > 0)) return false;
      const start = { x: Number(opening.x), y: Number(opening.y) };
      const end = opening.orientation === 'h' ? { x: start.x + Number(opening.width), y: start.y } : { x: start.x, y: start.y + Number(opening.width) };
      return roomWallDisplayPoint(room, index, start, 0, height)?.distance < .28 && roomWallDisplayPoint(room, index, end, 0, height)?.distance < .28;
    });
    return <div key={index} className={`placement-room-surface wall-${side}`} style={{ width: `${width * SCALE / 100}px`, height: `${wallHeight * SCALE / 100}px` }} data-edge-index={index} data-edge-length={length.toFixed(3)}><strong>Стена {index + 1} · {sideNames[side]} · {length.toFixed(2)} м</strong>
      <svg viewBox={`0 0 ${width} ${wallHeight}`} aria-label={`Стена ${index + 1} комнаты ${room.name}`} role="img" onClick={event => handleClick(event, index)} onPointerUp={event => handleUp(event, index)} onPointerCancel={() => { drag.current = null; }}>
        <rect width={width} height={wallHeight} className="placement-room-wall-fill"/>
        {Array.from({ length: Math.floor(length) + 1 }, (_, station) => horizontal ? <line key={station} className="placement-room-grid" x1={station * 100} y1="0" x2={station * 100} y2={wallHeight}/> : <line key={station} className="placement-room-grid" x1="0" y1={station * 100} x2={width} y2={station * 100}/>)}
        {openings.map(opening => {
          const start = { x: Number(opening.x), y: Number(opening.y) };
          const end = opening.orientation === 'h' ? { x: start.x + Number(opening.width), y: start.y } : { x: start.x, y: start.y + Number(opening.width) };
          const sill = Number.isFinite(Number(opening.sillHeight)) && opening.sillHeight != null ? Number(opening.sillHeight) : opening.type === 'door' ? 0 : Math.max(0, (height - Number(opening.height || 1.2)) / 2);
          const upper = Math.min(height, sill + Number(opening.height || 1.2));
          const a = roomWallDisplayPoint(room, index, start, sill, height), b = roomWallDisplayPoint(room, index, end, upper, height);
          return <g key={opening.id}><rect x={Math.min(a.x, b.x) * 100} y={Math.min(a.y, b.y) * 100} width={Math.max(5, Math.abs(a.x - b.x) * 100)} height={Math.max(5, Math.abs(a.y - b.y) * 100)} className={`placement-room-opening ${opening.type}`}/><title>{opening.type === 'door' ? 'Дверь' : 'Окно'} · {Number(opening.width).toFixed(2)} м{opening.type === 'window' && opening.sillHeight == null ? ' · отметка подоконника не указана' : ''}</title></g>;
        })}
        {roomRoutes.filter(route => route.points.length > 1 && route.points.every(point => roomWallDisplayPoint(room, index, point, point.z || 0, height)?.distance < .22)).map(route => <path key={route.id} d={route.points.map((point, pointIndex) => { const position = roomWallDisplayPoint(room, index, point, point.z || 0, height); return `${pointIndex ? 'L' : 'M'} ${position.x * 100} ${position.y * 100}`; }).join(' ')} fill="none" stroke={routeColor(route, circuitColor)} strokeWidth="4" vectorEffect="non-scaling-stroke" onClick={event => { event.stopPropagation(); onSelectRoute(route); }}><title>{route.system} · трасса</title></path>)}
        {roomItems.map(item => { const position = roomWallDisplayPoint(room, index, item, item.height || 0, height); return position?.distance <= .35 ? mark(item, position.x * 100, position.y * 100, 'wall') : null; })}
      </svg>
    </div>;
  };
  return <section className="placement-room-unfolding"><header><div><strong>Развёртка комнаты: {room.name}</strong><span>Пол в центре, стены по сторонам. Длина каждой стены взята из грани пола.</span></div><div className="placement-room-heading-actions"><span>{roomItems.length} элементов · {roomRoutes.length} трасс</span><button type="button" className={elementsLocked ? "active" : ""} aria-pressed={elementsLocked} onClick={onToggleLock}>{elementsLocked ? "🔒 Элементы заблокированы" : "🔓 Заблокировать элементы"}</button></div></header>
    <div className="placement-room-layer-switches" role="group" aria-label="Слои развёртки">{PLACEMENT_LAYERS.filter(entry => !entry.future).map(entry => <button key={entry.id} className={visible[entry.id] === false ? 'muted' : 'active'} aria-pressed={visible[entry.id] !== false} onClick={() => onToggleLayer?.(entry.id)}>{entry.label}</button>)}</div>
    <div className="placement-room-unfold-scroll"><div className="placement-room-unfold-grid" style={{ '--room-floor-w': `${floorW * SCALE / 100}px`, '--room-floor-h': `${floorH * SCALE / 100}px`, '--room-wall-span': `${height * SCALE}px` }}>
      {primaryEdges.map(wall)}
      <div className="placement-room-surface floor" style={{ width: `${floorW * SCALE / 100}px`, height: `${floorH * SCALE / 100}px` }}><strong>Пол · {box.w.toFixed(2)} × {box.h.toFixed(2)} м</strong>
        <svg viewBox={`0 0 ${floorW} ${floorH}`} aria-label={`Пол комнаты ${room.name}`} role="img"
          onClick={handleClick} onPointerUp={handleUp} onPointerCancel={() => { drag.current = null; }}>
          <path d={vertices.map((point, index) => `${index ? 'L' : 'M'} ${(point.x - box.x) * 100} ${(point.y - box.y) * 100}`).join(' ') + ' Z'} className="placement-room-floor-fill"/>
          {roomRoutes.map(route => <path key={route.id} d={route.points.map((point, index) => `${index ? 'L' : 'M'} ${(point.x - box.x) * 100} ${(point.y - box.y) * 100}`).join(' ')} fill="none" stroke={routeColor(route, circuitColor)} strokeWidth="4" strokeDasharray={route.auto ? '7 5' : undefined} vectorEffect="non-scaling-stroke" onClick={event => { event.stopPropagation(); onSelectRoute(route); }}><title>{route.system} · трасса</title></path>)}
          {draftPoints.length > 1 ? <path d={draftPoints.map((point, index) => `${index ? 'L' : 'M'} ${(point.x - box.x) * 100} ${(point.y - box.y) * 100}`).join(' ')} fill="none" stroke={draftSystem === 'electric' ? circuitColor?.(draftCircuitId) : colors[draftSystem] || '#d77524'} strokeWidth="3" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" pointerEvents="none"/> : null}
          {roomItems.map(item => { const position = rowPositions.get(item.id) || item; return mark(item, (position.x - box.x) * 100, (position.y - box.y) * 100); })}
        </svg>
      </div>
    </div>{extraEdges.length ? <div className="placement-room-extra-walls">{extraEdges.map(wall)}</div> : null}</div><p>Нажмите на плоскость, чтобы поставить элемент или точку трассы. Элементы можно перемещать между планом пола и стенами.</p>
  </section>;
}
