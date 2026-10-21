import { useRef } from 'react';
import { boundsOf, roomPoints } from '../planner/geometry.js';
import { pointInPolygon } from '../state/placement-geometry.js';
import { projectToRoomEdge, roomEdgePosition } from '../state/placement-room.js';
import { PlacementSymbol } from './PlacementClassicSymbol.jsx';

const round = value => Math.round(value * 100) / 100;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const colors = { electric: '#d77524', plumbing: '#2979aa', heating: '#bf6134', sewer: '#72579a', ventilation: '#3d9481' };

const svgPosition = (svg, event) => {
  const matrix = svg?.getScreenCTM();
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
};

export default function PlacementRoomUnfolding({ room, plan, items, routes = [], draftPoints = [], draftSystem = '', activePreset, selectedId, routeMode, onPlace, onMove, onSelect, onPickNode, onRoutePoint, onSelectRoute }) {
  const drag = useRef(null);
  const skipClick = useRef(false);
  if (!room) return null;
  const vertices = roomPoints(room);
  const box = boundsOf(vertices);
  const height = Math.max(.5, Number(plan.wallHeight) || 2.5);
  const roomItems = items.filter(item => pointInPolygon(item, vertices) || (item.linkedApplianceId && items.some(parent => parent.id === item.linkedApplianceId && pointInPolygon(parent, vertices))));
  const roomRoutes = routes.filter(route => (route.points || []).some(point => pointInPolygon(point, vertices)));
  const floorW = Math.max(1, box.w) * 100, floorH = Math.max(1, box.h) * 100;
  const handleClick = (event, surface, edgeIndex = -1) => {
    if (skipClick.current) { skipClick.current = false; return; }
    const local = svgPosition(event.currentTarget, event);
    if (!local) return;
    const position = surface === 'floor'
      ? { x: round(box.x + local.x / 100), y: round(box.y + local.y / 100) }
      : roomEdgePosition(room, edgeIndex, surface === 'vertical' ? local.y / 100 : local.x / 100);
    if (!position || (surface === 'floor' && !pointInPolygon(position, vertices))) return;
    const z = surface === 'floor' ? activePreset?.height || 0 : round(clamp(height - (surface === 'vertical' ? local.x : local.y) / 100, 0, height));
    if (routeMode) onRoutePoint(position, z);
    else if (activePreset) onPlace(position, z, edgeIndex);
    else if (selectedId) onMove(selectedId, position, z, edgeIndex);
  };
  const handleDown = (event, item) => {
    if (routeMode || activePreset) return;
    event.stopPropagation();
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    drag.current = { id: item.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const handleUp = (event, surface, edgeIndex = -1) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y) > 4;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!moved) { onSelect(current.id); skipClick.current = true; window.setTimeout(() => { skipClick.current = false; }, 0); return; }
    const local = svgPosition(event.currentTarget, event);
    if (!local) return;
    const position = surface === 'floor'
      ? { x: round(box.x + local.x / 100), y: round(box.y + local.y / 100) }
      : roomEdgePosition(room, edgeIndex, surface === 'vertical' ? local.y / 100 : local.x / 100);
    if (position && (surface !== 'floor' || pointInPolygon(position, vertices))) {
      onMove(current.id, position, surface === 'floor' ? null : round(clamp(height - (surface === 'vertical' ? local.x : local.y) / 100, 0, height)), edgeIndex);
      skipClick.current = true;
      window.setTimeout(() => { skipClick.current = false; }, 0);
    }
  };
  const mark = (item, x, y, surface = 'floor') => <g key={item.id} data-room-item={item.id} className="placement-room-mark"
    onPointerDown={event => handleDown(event, item)} onClick={event => { event.stopPropagation(); if (skipClick.current) { skipClick.current = false; return; } if (routeMode) onPickNode(item); else onSelect(item.id); }}>
    {surface === 'floor' && item.kind !== 'connection-port' ? <svg x={x - Math.max(26, item.width * 100) / 2} y={y - Math.max(26, item.depth * 100) / 2} width={Math.max(26, item.width * 100)} height={Math.max(26, item.depth * 100)} viewBox="0 0 100 100" overflow="visible"><PlacementSymbol kind={item.kind} system={item.layer}/></svg> : <circle cx={x} cy={y} r={selectedId === item.id ? 10 : 7} fill={item.connectionMedium === 'hot' ? '#bd5547' : colors[item.layer] || '#375f52'} stroke="#fff" strokeWidth="2"/>}
    {selectedId === item.id ? <circle cx={x} cy={y} r="13" fill="none" stroke="#2b8f85" strokeWidth="2" pointerEvents="none"/> : null}
    {selectedId === item.id ? <text x={x + 12} y={y - 10} className="placement-room-mark-label">{item.label}</text> : null}
    <title>{item.label}{item.connectionMedium ? ` · ${item.connectionMedium}` : ''}</title>
  </g>;
  const wall = index => {
    const a = vertices[index], b = vertices[(index + 1) % vertices.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const vertical = index === 1 || index === 3;
    const surface = vertical ? 'vertical' : 'horizontal';
    const width = vertical ? height * 100 : length * 100;
    const wallHeight = vertical ? length * 100 : height * 100;
    return <div key={index} className={`placement-room-surface wall-${index < 4 ? index : 'extra'}`}><strong>Стена {index + 1} · {length.toFixed(2)} м</strong>
      <svg viewBox={`0 0 ${width} ${wallHeight}`} aria-label={`Стена ${index + 1} комнаты ${room.name}`} role="img"
        onClick={event => handleClick(event, surface, index)} onPointerUp={event => handleUp(event, surface, index)} onPointerCancel={() => { drag.current = null; }}>
        <rect width={width} height={wallHeight} className="placement-room-wall-fill"/>
        {Array.from({ length: Math.floor(length) + 1 }, (_, station) => <line key={station} className="placement-room-grid" x1={vertical ? 0 : station * 100} y1={vertical ? station * 100 : 0} x2={vertical ? width : station * 100} y2={vertical ? station * 100 : wallHeight}/>)}
        {roomRoutes.filter(route => route.points.every(point => projectToRoomEdge(room, index, point)?.distance < .22)).map(route => <path key={route.id} d={route.points.map((point, pointIndex) => { const station = projectToRoomEdge(room, index, point).station * 100; const elevation = (height - (point.z || 0)) * 100; return `${pointIndex ? 'L' : 'M'} ${vertical ? elevation : station} ${vertical ? station : elevation}`; }).join(' ')} fill="none" stroke={colors[route.system] || '#d77524'} strokeWidth="4" vectorEffect="non-scaling-stroke" onClick={event => { event.stopPropagation(); onSelectRoute(route); }}><title>{route.system} · трасса</title></path>)}
        {roomItems.map(item => {
          const projection = projectToRoomEdge(room, index, item);
          if (!projection || projection.distance > .35) return null;
          return mark(item, vertical ? (height - (item.height || 0)) * 100 : projection.station * 100, vertical ? projection.station * 100 : (height - (item.height || 0)) * 100, 'wall');
        })}
      </svg>
    </div>;
  };
  return <section className="placement-room-unfolding"><header><strong>Комната: {room.name}</strong><span>Пол и {vertices.length} стены · перетаскивайте точки и элементы или выберите их на схеме</span></header>
    <div className="placement-room-unfold-scroll"><div className="placement-room-unfold-grid">
      {vertices.map((_, index) => wall(index))}
      <div className="placement-room-surface floor"><strong>Пол · {box.w.toFixed(2)} × {box.h.toFixed(2)} м</strong>
        <svg viewBox={`0 0 ${floorW} ${floorH}`} aria-label={`Пол комнаты ${room.name}`} role="img"
          onClick={event => handleClick(event, 'floor')} onPointerUp={event => handleUp(event, 'floor')} onPointerCancel={() => { drag.current = null; }}>
          <path d={vertices.map((point, index) => `${index ? 'L' : 'M'} ${(point.x - box.x) * 100} ${(point.y - box.y) * 100}`).join(' ') + ' Z'} className="placement-room-floor-fill"/>
          {roomRoutes.map(route => <path key={route.id} d={route.points.map((point, index) => `${index ? 'L' : 'M'} ${(point.x - box.x) * 100} ${(point.y - box.y) * 100}`).join(' ')} fill="none" stroke={colors[route.system] || '#d77524'} strokeWidth="4" strokeDasharray={route.auto ? '7 5' : undefined} vectorEffect="non-scaling-stroke" onClick={event => { event.stopPropagation(); onSelectRoute(route); }}><title>{route.system} · трасса</title></path>)}
          {draftPoints.length > 1 ? <path d={draftPoints.map((point, index) => `${index ? 'L' : 'M'} ${(point.x - box.x) * 100} ${(point.y - box.y) * 100}`).join(' ')} fill="none" stroke={colors[draftSystem] || '#d77524'} strokeWidth="3" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" pointerEvents="none"/> : null}
          {roomItems.map(item => mark(item, (item.x - box.x) * 100, (item.y - box.y) * 100))}
        </svg>
      </div>
    </div></div><p>Высоты и точки подключения предварительные: уточните их в свойствах элемента. Плановые размеры помещения не меняются.</p>
  </section>;
}
