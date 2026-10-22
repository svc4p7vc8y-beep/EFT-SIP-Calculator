import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { boundsOf, roomPoints } from '../planner/geometry.js';
import { pointInPolygon } from '../state/placement-geometry.js';
import { PLACEMENT_LAYERS } from '../state/placement-model.js';
import { roomItemPlane, roomOpeningOnEdge, roomUnfoldLayout, roomWallDisplayPoint, roomWallPlanPoint } from '../state/placement-room.js';
import { linkedWallSwitch, wallPointDisplayOrder } from '../state/placement-visibility.js';
import { pointOnRouteSegment, routeSegmentDirection, shiftRouteSegment, shiftRouteSegmentTo } from '../state/placement-route-edit.js';
import { alignLightToNeighbors, panelRouteBundles, schematicPosition } from '../state/placement-schematic.js';
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

export default function PlacementRoomUnfolding({ room, plan, items, routes = [], draftPoints = [], draftSystem = '', draftCircuitId = '', visible = {}, onToggleLayer, elementsLocked, linesLocked, onToggleLock, onToggleLinesLock, onUndo, onRedo, onScreenshot, canUndo, canRedo, circuitColor, activePreset, selectedId, selectedRouteId, selectedRoutePointIndex, routeMode, onPlace, onMove, onSelect, onPickNode, onRoutePoint, onSelectRoute, onSelectRoutePoint, onInsertRoutePoint, onShiftRouteSegment }) {
  const drag = useRef(null);
  const skipClick = useRef(false);
  const [routePreview, setRoutePreview] = useState(null);
  const [itemPreview, setItemPreview] = useState(null);
  if (!room) return null;
  const vertices = roomPoints(room);
  const box = boundsOf(vertices);
  const height = Math.max(.5, Number(plan.wallHeight) || 2.5);
  const roomItems = items.filter(item => visible[item.layer] !== false && (pointInPolygon(item, vertices) || (item.linkedApplianceId && items.some(parent => parent.id === item.linkedApplianceId && pointInPolygon(parent, vertices)))));
  const roomRoutes = routes.filter(route => visible[route.system] !== false && (route.points || []).some(point => pointInPolygon(point, vertices)));
  const routeBundles = panelRouteBundles(roomRoutes.filter(route => route.system === 'electric'));
  const layout = roomUnfoldLayout(room, height);
  const edges = layout.edges;
  const assignments = new Map(roomItems.map(item => [item.id, roomItemPlane(room, item)]));
  const floorItems = roomItems.filter(item => assignments.get(item.id)?.plane === 'floor');
  const wallItems = roomItems.filter(item => assignments.get(item.id)?.plane === 'wall');
  const selectedFloorLight = floorItems.find(item => item.id === selectedId);
  const selectedLightGuides = selectedFloorLight && !itemPreview ? alignLightToNeighbors(selectedFloorLight, selectedFloorLight, roomItems, [room], .025).guides : [];
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
  const selectedWall = wallItems.find(item => item.id === selectedId);
  const selectedEdge = edges.find(edge => edge.index === assignments.get(selectedId)?.edgeIndex);
  const selectedWallPoint = selectedWall && selectedEdge ? roomWallDisplayPoint(room, selectedEdge.index, selectedWall, selectedWall.height || 0, height) : null;
  const selectedAnchorPosition = selectedWall ? anchorPositions.get(selectedWall.id) || selectedWall : null;
  const selectedAnchor = selectedAnchorPosition ? { x: layout.floor.x + selectedAnchorPosition.x - box.x, y: layout.floor.y + selectedAnchorPosition.y - box.y } : null;
  const selectedWallCanvasPoint = selectedWallPoint && selectedEdge ? { x: selectedEdge.x + selectedWallPoint.x, y: selectedEdge.y + selectedWallPoint.y } : null;
  const floorW = Math.max(1, box.w) * 100, floorH = Math.max(1, box.h) * 100;
  const floorPath = vertices.map((point, index) => `${index ? 'L' : 'M'} ${(point.x - box.x) * 100} ${(point.y - box.y) * 100}`).join(' ') + ' Z';
  const surfacePosition = (local, edgeIndex) => edgeIndex < 0
    ? { position: { x: round(box.x + local.x / 100), y: round(box.y + local.y / 100) }, elevation: activePreset?.height || 0 }
    : roomWallPlanPoint(room, edgeIndex, local.x / 100, local.y / 100, height);
  const routePointAt = (route, segmentIndex, local, edgeIndex) => {
    if (edgeIndex < 0) return pointOnRouteSegment(route.points, segmentIndex, { x: box.x + local.x / 100, y: box.y + local.y / 100 });
    const a = roomWallDisplayPoint(room, edgeIndex, route.points[segmentIndex], route.points[segmentIndex].z || 0, height);
    const b = roomWallDisplayPoint(room, edgeIndex, route.points[segmentIndex + 1], route.points[segmentIndex + 1].z || 0, height);
    if (!a || !b) return null;
    const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < .0001) return null;
    const ratio = Math.max(0, Math.min(1, ((local.x / 100 - a.x) * dx + (local.y / 100 - a.y) * dy) / lengthSquared));
    if (ratio * Math.sqrt(lengthSquared) < .03 || (1 - ratio) * Math.sqrt(lengthSquared) < .03) return null;
    const target = roomWallPlanPoint(room, edgeIndex, a.x + dx * ratio, a.y + dy * ratio, height);
    return target ? { x: target.position.x, y: target.position.y, z: target.elevation } : null;
  };
  const handleRouteDown = (event, route, segmentIndex, edgeIndex) => {
    if (linesLocked || routeMode || activePreset || route.system !== 'electric') return;
    const svg = event.currentTarget.ownerSVGElement;
    const start = svgPosition(svg, event);
    if (!start) return;
    event.preventDefault(); event.stopPropagation();
    svg.setPointerCapture(event.pointerId);
    drag.current = { route, segmentIndex, edgeIndex, pointerId: event.pointerId, start, clientX: event.clientX, clientY: event.clientY, delta: 0, preview: null };
  };
  const handleRouteMove = (event, edgeIndex) => {
    const current = drag.current;
    if (!current?.route || current.pointerId !== event.pointerId || current.edgeIndex !== edgeIndex) return;
    const local = svgPosition(event.currentTarget, event);
    if (!local) return;
    const { route, segmentIndex } = current;
    let preview = null;
    if (edgeIndex < 0) {
      const direction = routeSegmentDirection(route.points[segmentIndex], route.points[segmentIndex + 1]);
      const axis = direction === 'horizontal' ? 'y' : direction === 'vertical' ? 'x' : null;
      if (axis) {
        current.delta = Math.round((local[axis] - current.start[axis]) / 5) / 20;
        preview = shiftRouteSegment(route.points, segmentIndex, current.delta);
      }
    } else {
      const a = roomWallDisplayPoint(room, edgeIndex, route.points[segmentIndex], route.points[segmentIndex].z || 0, height);
      const b = roomWallDisplayPoint(room, edgeIndex, route.points[segmentIndex + 1], route.points[segmentIndex + 1].z || 0, height);
      if (a && b) {
        const direction = routeSegmentDirection(a, b);
        const axis = direction === 'horizontal' ? 'y' : direction === 'vertical' ? 'x' : null;
        if (axis) {
          const edge = edges.find(entry => entry.index === edgeIndex);
          const limit = edge?.[axis === 'x' ? 'width' : 'height'] || 0;
          const requested = Math.round((local[axis] - current.start[axis]) / 5) / 20;
          current.delta = Math.max(-Math.min(a[axis], b[axis]), Math.min(limit - Math.max(a[axis], b[axis]), requested));
          if (Math.abs(current.delta) >= .01) {
            const shiftedA = { ...a, [axis]: a[axis] + current.delta };
            const shiftedB = { ...b, [axis]: b[axis] + current.delta };
            const first = roomWallPlanPoint(room, edgeIndex, shiftedA.x, shiftedA.y, height);
            const second = roomWallPlanPoint(room, edgeIndex, shiftedB.x, shiftedB.y, height);
            if (first && second) preview = shiftRouteSegmentTo(route.points, segmentIndex,
              { x: first.position.x, y: first.position.y, z: first.elevation },
              { x: second.position.x, y: second.position.y, z: second.elevation });
          }
        }
      }
    }
    current.preview = preview;
    setRoutePreview(preview ? { id: route.id, points: preview } : null);
  };
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
    if (current.route) {
      drag.current = null;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      const travelled = Math.hypot(event.clientX - current.clientX, event.clientY - current.clientY);
      if (event.type !== 'pointercancel' && !linesLocked) {
        if (travelled > 5 && current.preview) onShiftRouteSegment?.(current.route, current.preview);
        else if (travelled <= 5) {
          const local = svgPosition(event.currentTarget, event);
          const point = local && routePointAt(current.route, current.segmentIndex, local, edgeIndex);
          if (point) onInsertRoutePoint?.(current.route, current.segmentIndex, point);
        }
      }
      setRoutePreview(null);
      skipClick.current = true;
      window.setTimeout(() => { skipClick.current = false; }, 0);
      return;
    }
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
      onPointerDown={event => handleDown(event, item)} onClick={event => { event.stopPropagation(); if (skipClick.current) { skipClick.current = false; return; } if (routeMode) onPickNode(item); else onSelect(item.id); }}>
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
      <svg viewBox={`0 0 ${width} ${wallHeight}`} aria-label={`Стена ${index + 1} комнаты ${room.name}`} role="img" onClick={event => handleClick(event, index)} onPointerMove={event => handleRouteMove(event, index)} onPointerUp={event => handleUp(event, index)} onPointerCancel={() => { drag.current = null; setRoutePreview(null); }}>
        <rect width={width} height={wallHeight} className="placement-room-wall-fill"/>
        {Array.from({ length: Math.floor(length) + 1 }, (_, station) => horizontal ? <line key={station} className="placement-room-grid" x1={station * 100} y1="0" x2={station * 100} y2={wallHeight}/> : <line key={station} className="placement-room-grid" x1="0" y1={station * 100} x2={width} y2={station * 100}/>)}
        {openings.map(({ opening, display }) => <g key={opening.id} data-opening-id={opening.id}><rect x={display.x * 100} y={display.y * 100} width={display.width * 100} height={display.height * 100} className={`placement-room-opening ${opening.type}`}/><title>{opening.type === 'door' ? 'Дверь' : 'Окно'} · {display.clippedWidth.toFixed(2)} м{opening.type === 'window' && opening.sillHeight == null ? ' · отметка подоконника не указана' : ''}</title></g>)}
        {roomRoutes.filter(route => route.points.length > 1 && route.points.every(point => roomWallDisplayPoint(room, index, point, point.z || 0, height)?.distance < .22)).map(route => {
          const points = routePreview?.id === route.id ? routePreview.points : route.points;
          return <g key={route.id} data-route-id={route.id}><path d={points.map((point, pointIndex) => { const position = roomWallDisplayPoint(room, index, point, point.z || 0, height); return `${pointIndex ? 'L' : 'M'} ${position.x * 100} ${position.y * 100}`; }).join(' ')} fill="none" stroke={routeColor(route, circuitColor)} strokeWidth={route.system === 'electric' ? 2 : 4} strokeDasharray={route.system === 'electric' ? '5 4' : undefined} vectorEffect="non-scaling-stroke" onClick={event => { event.stopPropagation(); onSelectRoute(route); }}><title>{route.system} · трасса</title></path>
            {route.system === 'electric' && route.id === selectedRouteId && !routeMode && !linesLocked ? route.points.slice(0, -1).map((point, segmentIndex) => { const a = roomWallDisplayPoint(room, index, point, point.z || 0, height); const b = roomWallDisplayPoint(room, index, route.points[segmentIndex + 1], route.points[segmentIndex + 1].z || 0, height); return a && b ? <line key={segmentIndex} className="placement-route-segment-target" x1={a.x * 100} y1={a.y * 100} x2={b.x * 100} y2={b.y * 100} onPointerDown={event => handleRouteDown(event, route, segmentIndex, index)}><title>Нажмите для новой точки или перетащите участок</title></line> : null; }) : null}
            {route.system === 'electric' && route.id === selectedRouteId && !routeMode ? route.points.slice(1, -1).map((point, pointIndex) => { const at = roomWallDisplayPoint(room, index, point, point.z || 0, height); return at ? <circle key={pointIndex} data-route-point={pointIndex + 1} cx={at.x * 100} cy={at.y * 100} r="16" className={`placement-route-waypoint${selectedRoutePointIndex === pointIndex + 1 ? ' selected' : ''}`} onClick={event => { event.stopPropagation(); onSelectRoutePoint?.(route, pointIndex + 1); }}><title>Точка {pointIndex + 1} · выбрать для удаления</title></circle> : null; }) : null}
          </g>;
        })}
        {wallItems.filter(item => assignments.get(item.id)?.edgeIndex === index).map(item => { const position = roomWallDisplayPoint(room, index, item, item.height || 0, height); return position ? mark(item, position.x * 100, position.y * 100, 'wall') : null; })}
      </svg>
    </div>;
  };
  return <section className="placement-room-unfolding"><header><div><strong>Развёртка комнаты: {room.name}</strong><span>Пол в центре, стены по сторонам. Длина каждой стены взята из грани пола.</span></div><div className="placement-room-heading-actions"><span>{roomItems.length} элементов · {roomRoutes.length} трасс</span><button type="button" className={elementsLocked ? "active" : ""} aria-pressed={elementsLocked} onClick={onToggleLock}>{elementsLocked ? "🔒 Элементы" : "🔓 Элементы"}</button><button type="button" className={linesLocked ? "active" : ""} aria-pressed={linesLocked} onClick={onToggleLinesLock}>{linesLocked ? "🔒 Линии" : "🔓 Линии"}</button><button type="button" onClick={onUndo} disabled={!canUndo} title="Отменить">↶</button><button type="button" onClick={onRedo} disabled={!canRedo} title="Повторить">↷</button><button type="button" onClick={onScreenshot} title="Снимок рабочего поля" aria-label="Снимок рабочего поля"><Camera size={16}/></button></div></header>
    <div className="placement-room-layer-switches" role="group" aria-label="Слои развёртки">{PLACEMENT_LAYERS.filter(entry => !entry.future).map(entry => <button key={entry.id} className={visible[entry.id] === false ? 'muted' : 'active'} aria-pressed={visible[entry.id] !== false} onClick={() => onToggleLayer?.(entry.id)}>{entry.label}</button>)}</div>
    <div className="placement-room-unfold-scroll"><div className="placement-room-unfold-grid" style={{ width: `${layout.width * SCALE}px`, height: `${layout.height * SCALE}px` }}>
      {edges.map(wall)}
      <div className="placement-room-surface floor" style={{ left: `${layout.floor.x * SCALE}px`, top: `${layout.floor.y * SCALE}px`, width: `${floorW * SCALE / 100}px`, height: `${floorH * SCALE / 100}px` }}>
        <svg viewBox={`0 0 ${floorW} ${floorH}`} aria-label={`Пол комнаты ${room.name}`} role="img"
          onClick={handleClick} onPointerMove={event => { handleRouteMove(event, -1); handleItemMove(event); }} onPointerUp={handleUp} onPointerCancel={() => { drag.current = null; setRoutePreview(null); setItemPreview(null); }}>
          <defs><clipPath id={`room-floor-${room.id}`}><path d={floorPath}/></clipPath></defs>
          <path d={floorPath} className="placement-room-floor-fill"/>
          <g clipPath={`url(#room-floor-${room.id})`}>
          {roomRoutes.map(route => {
            const points = routePreview?.id === route.id ? routePreview.points : route.points;
            return <g key={route.id} data-route-id={route.id}><path d={points.map((point, index) => `${index ? 'L' : 'M'} ${(point.x - box.x) * 100} ${(point.y - box.y) * 100}`).join(' ')} fill="none" stroke={routeColor(route, circuitColor)} strokeWidth={route.system === 'electric' ? 2 : 4} strokeDasharray={route.system === 'electric' ? '5 4' : route.auto ? '7 5' : undefined} vectorEffect="non-scaling-stroke" onClick={event => { event.stopPropagation(); onSelectRoute(route); }}><title>{route.system} · трасса</title></path>
              {route.system === 'electric' && route.id === selectedRouteId && !routeMode && !linesLocked ? route.points.slice(0, -1).map((point, segmentIndex) => <line key={segmentIndex} className="placement-route-segment-target" x1={(point.x - box.x) * 100} y1={(point.y - box.y) * 100} x2={(route.points[segmentIndex + 1].x - box.x) * 100} y2={(route.points[segmentIndex + 1].y - box.y) * 100} onPointerDown={event => handleRouteDown(event, route, segmentIndex, -1)}><title>Нажмите для новой точки или перетащите участок</title></line>) : null}
              {route.system === 'electric' && route.id === selectedRouteId && !routeMode ? route.points.slice(1, -1).map((point, pointIndex) => <circle key={pointIndex} data-route-point={pointIndex + 1} cx={(point.x - box.x) * 100} cy={(point.y - box.y) * 100} r="16" className={`placement-route-waypoint${selectedRoutePointIndex === pointIndex + 1 ? ' selected' : ''}`} onClick={event => { event.stopPropagation(); onSelectRoutePoint?.(route, pointIndex + 1); }}><title>Точка {pointIndex + 1} · выбрать для удаления</title></circle>) : null}
            </g>;
          })}
          {routeBundles.map((bundle, index) => <g key={`bundle-${index}`} pointerEvents="none">
            <line x1={(bundle.start.x - box.x) * 100} y1={(bundle.start.y - box.y) * 100} x2={(bundle.end.x - box.x) * 100} y2={(bundle.end.y - box.y) * 100} stroke="#fff" strokeWidth={bundle.circuits.length * 3 + 3} strokeLinecap="round"/>
            {bundle.circuits.map((circuitId, lane) => { const offset = (lane - (bundle.circuits.length - 1) / 2) * 3; const dx = bundle.axis === 'y' ? offset : 0, dy = bundle.axis === 'x' ? offset : 0; return <g key={circuitId} stroke={circuitColor?.(circuitId) || colors.electric} strokeWidth="2" strokeLinecap="round" strokeDasharray="5 4"><line x1={(bundle.start.x - box.x) * 100 + dx} y1={(bundle.start.y - box.y) * 100 + dy} x2={(bundle.end.x - box.x) * 100 + dx} y2={(bundle.end.y - box.y) * 100 + dy}/><line x1={(bundle.start.x - box.x) * 100} y1={(bundle.start.y - box.y) * 100} x2={(bundle.start.x - box.x) * 100 + dx} y2={(bundle.start.y - box.y) * 100 + dy}/><line x1={(bundle.end.x - box.x) * 100 + dx} y1={(bundle.end.y - box.y) * 100 + dy} x2={(bundle.end.x - box.x) * 100} y2={(bundle.end.y - box.y) * 100}/></g>; })}
          </g>)}
          {draftPoints.length > 1 ? <path d={draftPoints.map((point, index) => `${index ? 'L' : 'M'} ${(point.x - box.x) * 100} ${(point.y - box.y) * 100}`).join(' ')} fill="none" stroke={draftSystem === 'electric' ? circuitColor?.(draftCircuitId) : colors[draftSystem] || '#d77524'} strokeWidth={draftSystem === 'electric' ? 1.5 : 3} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" pointerEvents="none"/> : null}
          {itemPreview?.guides.map((guide, index) => <g key={`guide-${index}`} pointerEvents="none"><line x1={(guide.from.x - box.x) * 100} y1={(guide.from.y - box.y) * 100} x2={(itemPreview.position.x - box.x) * 100} y2={(itemPreview.position.y - box.y) * 100} stroke="#138dba" strokeWidth="2" strokeDasharray="6 4"/><circle cx={(guide.from.x - box.x) * 100} cy={(guide.from.y - box.y) * 100} r="5" fill="#138dba"/><circle cx={(itemPreview.position.x - box.x) * 100} cy={(itemPreview.position.y - box.y) * 100} r="5" fill="#138dba"/></g>)}
          {selectedLightGuides.map((guide, index) => <line key={`selected-guide-${index}`} x1={(guide.from.x - box.x) * 100} y1={(guide.from.y - box.y) * 100} x2={(selectedFloorLight.x - box.x) * 100} y2={(selectedFloorLight.y - box.y) * 100} stroke="#138dba" strokeOpacity=".65" strokeWidth="2" strokeDasharray="6 4" pointerEvents="none"/>)}
          {wallItems.map(item => { const anchor = anchorPositions.get(item.id) || item; return <g key={`anchor-${item.id}`} className="placement-room-anchor" onClick={event => { event.stopPropagation(); onSelect(item.id); }}><circle cx={(anchor.x - box.x) * 100} cy={(anchor.y - box.y) * 100} r={selectedId === item.id ? 9 : 6} fill={itemColor(item)} stroke="#fff" strokeWidth="2"/><title>{item.label} · стена {(assignments.get(item.id)?.edgeIndex ?? -1) + 1} · h={Number(item.height || 0).toFixed(2)} м</title></g>; })}
          {wallItems.filter(item => item.kind === 'junction-box' && Number.isFinite(item.diagramX) && Number.isFinite(item.diagramY) && Math.hypot(item.diagramX - item.x, item.diagramY - item.y) >= .12).map(item => { const at = schematicPosition(item), x = (at.x - box.x) * 100, y = (at.y - box.y) * 100; return <g key={`diagram-${item.id}`} data-room-diagram={item.id} onPointerDown={event => handleDown(event, item)} onClick={event => { event.stopPropagation(); onSelect(item.id); }}><path d={`M ${x} ${y} L ${(item.x - box.x) * 100} ${y} L ${(item.x - box.x) * 100} ${(item.y - box.y) * 100}`} fill="none" stroke={itemColor(item)} strokeWidth="2" strokeDasharray="5 5" pointerEvents="none"/><circle cx={x} cy={y} r="12" fill="#fff" stroke={itemColor(item)} strokeWidth="2.5"/><circle cx={x} cy={y} r="4" fill={itemColor(item)} pointerEvents="none"/><title>Распайка на схеме; фактическая установка на стене под потолком</title></g>; })}
          {floorItems.map(item => { const at = itemPreview?.id === item.id ? itemPreview.position : item; return mark(item, (at.x - box.x) * 100, (at.y - box.y) * 100); })}
          </g>
        </svg>
      </div>
      <svg className="placement-room-links" viewBox={`0 0 ${layout.width * 100} ${layout.height * 100}`} aria-hidden="true">
        {edges.filter(edge => edge.detached).map(edge => <path key={edge.index} d={`M ${edge.hinge.x * 100} ${edge.hinge.y * 100} L ${(edge.x + edge.width / 2) * 100} ${(edge.y + edge.height / 2) * 100}`} stroke="#94a89c" strokeWidth="2" strokeDasharray="6 5" fill="none"/>)}
        {selectedAnchor && selectedWallCanvasPoint ? <path d={`M ${selectedAnchor.x * 100} ${selectedAnchor.y * 100} L ${selectedWallCanvasPoint.x * 100} ${selectedWallCanvasPoint.y * 100}`} stroke={itemColor(selectedWall)} strokeWidth="4" strokeDasharray="8 5" fill="none"/> : null}
      </svg>
    </div></div>
    <div className="placement-room-surface-labels" aria-label="Размеры плоскостей"><span>Пол · {box.w.toFixed(2)} × {box.h.toFixed(2)} м</span>{edges.map(edge => <span key={edge.index} className={selectedEdge?.index === edge.index ? 'active' : ''}>Стена {edge.index + 1} · {sideNames[edge.side]} · {edge.length.toFixed(2)} м{edge.detached ? ' ↔ грань' : ''}</span>)}</div>
    {wallItems.length ? <div className="placement-room-point-list"><strong>Привязки к стенам · цветные точки на полу показывают место установки</strong><div>{wallItems.map(item => <button key={item.id} type="button" className={selectedId === item.id ? 'active' : ''} onClick={() => onSelect(item.id)}><i style={{ background: itemColor(item) }}/>{item.label} · стена {(assignments.get(item.id)?.edgeIndex ?? -1) + 1} · h={Number(item.height || 0).toFixed(2)} м</button>)}</div></div> : null}
    {floorItems.some(item => item.id === selectedId) ? <div className="placement-room-selected-label">Выбрано на полу: {floorItems.find(item => item.id === selectedId)?.label}</div> : null}
    <p>Нажмите на плоскость, чтобы поставить элемент или точку трассы. Элементы можно перемещать между планом пола и стенами.</p>
  </section>;
}
