import { PlacementSymbol } from './PlacementClassicSymbol.jsx';
import { mediumColor } from '../state/engineering-scheme.js';
import { useRef, useState } from 'react';
import { projectToWallFace } from '../state/placement-walls.js';
import { NETWORK_SYSTEMS } from '../state/placement-networks.js';

const colors = { plumbing: '#2979aa', heating: '#bf6134', sewer: '#72579a', ventilation: '#3d9481' };

export default function PlacementWallElevation({ wall, plan, items, routes, activePreset, drawing, points, onPosition, onSelectItem, selectedId, locked, onMoveItem }) {
  const svgRef = useRef(null), drag = useRef(null), skipClick = useRef(false);
  const [preview, setPreview] = useState(null);
  if (!wall) return <div className="placement-elevation-empty">Нажмите на стену на плане, чтобы открыть её развёртку.</div>;
  const height = Math.max(.5, Number(plan.wallHeight) || 2.5);
  const width = wall.length * 100;
  const itemMarks = items.map(item => ({ item, projection: projectToWallFace(wall, item) }))
    .filter(entry => entry.projection && (entry.item.wallRef === wall.ref || entry.projection.distance < .18));
  const wallRoutes = routes.filter(route => route.wallRef === wall.ref || (route.points || []).every(point => projectToWallFace(wall, point)?.distance < .18));
  const locationFromEvent = event => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
    return { station: Math.max(0, Math.min(wall.length, p.x / 100)), height: Math.max(0, Math.min(height, (height * 100 - p.y) / 100)) };
  };
  const click = event => {
    if (skipClick.current) { skipClick.current = false; return; }
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return;
    const location = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    onPosition(Math.max(0, Math.min(wall.length, location.x / 100)), Math.max(0, Math.min(height, (height * 100 - location.y) / 100)));
  };
  const ticks = Array.from({ length: Math.floor(wall.length) + 1 }, (_, index) => index);
  return <section className="placement-elevation"><div className="placement-elevation-heading"><div><strong>Развёртка: {wall.label}</strong><span>{wall.length.toFixed(2)} м × {height.toFixed(2)} м · высота стены из проекта</span></div><span>{drawing ? 'Нажмите точку трассы на стене' : activePreset ? `Поставьте: ${activePreset.label}` : 'Выберите элемент слева или линию сети'}</span></div>
    <div className="placement-elevation-scroll"><svg ref={svgRef} viewBox={`-35 -20 ${width + 70} ${height * 100 + 65}`} role="img" aria-label={`Развёртка стены ${wall.label}`} onClick={click}
      onPointerMove={event => { const d = drag.current; if (!d || d.pointerId !== event.pointerId) return; const at = locationFromEvent(event); if (at) { d.last = at; setPreview({ id: d.id, ...at }); } }}
      onPointerUp={event => { const d = drag.current; if (!d || d.pointerId !== event.pointerId) return; if (d.last && Math.hypot(event.clientX - d.x, event.clientY - d.y) > 4) { onMoveItem?.(d.id, d.last.station, d.last.height); skipClick.current = true; } drag.current = null; setPreview(null); }}
      onPointerCancel={() => { drag.current = null; setPreview(null); }}>
      <rect x="0" y="0" width={width} height={height * 100} className="placement-elevation-wall"/>
      {ticks.map(station => <g key={station}><line x1={station * 100} y1="0" x2={station * 100} y2={height * 100} className="placement-elevation-grid"/><text x={station * 100} y={height * 100 + 24} textAnchor="middle">{station} м</text></g>)}
      {Array.from({ length: Math.floor(height) + 1 }, (_, index) => <g key={index}><line x1="0" y1={(height - index) * 100} x2={width} y2={(height - index) * 100} className="placement-elevation-grid"/><text x="-7" y={(height - index) * 100 + 4} textAnchor="end">{index}</text></g>)}
      {wallRoutes.map(route => { const projected = route.points.map(point => projectToWallFace(wall, point)); return <path key={route.id} d={projected.map((entry, index) => `${index ? 'L' : 'M'} ${entry.station * 100} ${height * 100 - (route.points[index].z || 0) * 100}`).join(' ')} fill="none" stroke={mediumColor(route.medium) || colors[route.system] || '#73858c'} strokeWidth="4" strokeDasharray={route.auto ? '6 4' : undefined}><title>{NETWORK_SYSTEMS[route.system]?.label} · {route.medium}</title></path>; })}
      {points.filter(point => projectToWallFace(wall, point)?.distance < .18).map((point, index) => <circle key={index} cx={projectToWallFace(wall, point).station * 100} cy={height * 100 - (point.z || 0) * 100} r="5" fill="#d48a21"/>)}
      {itemMarks.map(({ item, projection }) => {
        const at = preview?.id === item.id ? preview : { station: projection.station, height: item.height || 0 };
        const x = at.station * 100, y = (height - at.height) * 100;
        return <g key={item.id} className="placement-elevation-item" onPointerDown={event => { if (locked || activePreset || drawing || event.button !== 0) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: item.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY }; }} onClick={event => { event.stopPropagation(); if (skipClick.current) { skipClick.current = false; return; } onSelectItem(item.id); }}>
          {item.id === selectedId && <rect x={x - 24} y={y - 24} width="48" height="48" rx="5" fill="#e6f2da" stroke="#5b8d2d"/>}
          <svg x={x - 20} y={y - 20} width="40" height="40" viewBox="0 0 100 100"><PlacementSymbol kind={item.kind} system={item.layer} medium={item.connectionMedium}/></svg>
          <text x={x + 24} y={y - 13} fontSize="12">{item.label}</text><text x={x + 24} y={y + 3} fontSize="11">{at.station.toFixed(2)} м · h={at.height.toFixed(2)} м{item.heightKnown === false ? ' · уточнить' : ''}</text>
        </g>;
      })}
    </svg></div><p>Выберите элемент слева и поставьте его на стену. Перетаскивайте значки по горизонтали и высоте. Точные размеры доступны справа. Для соединения включите построение во вкладке «Трассы».</p>
  </section>;
}
