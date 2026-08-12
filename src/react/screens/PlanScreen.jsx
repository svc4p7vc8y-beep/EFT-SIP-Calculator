import { useMemo, useRef, useState } from 'react';
import {
  DoorOpen, Grid2X2Plus, Hammer, MousePointer2, Pentagon, Plus, Redo2, Ruler,
  Save, Trash2, Undo2, Warehouse, Waves, X
} from 'lucide-react';
import { calculatePlanMetrics, chooseDimensionSides, polygonArea } from '../../calculations/plan-metrics.js';
import { calculateTerraceRoof, normalizeTerracePlatform } from '../../calculations/terrace-model.js';
import { useProject } from '../state/ProjectContext.jsx';
import { createCompactPlan, createDefaultPlan, createEmptyPlan } from '../state/project-model.js';
import { calculateFoundation } from '../calculations/foundation-model.js';
import { Field, NumberField, Panel, ScreenHeader, SelectField, Stat, Toggle } from '../components/ui.jsx';
import { formatNumber, uid } from '../utils/format.js';

const TOOLS = [
  ['select', 'Выбор', MousePointer2], ['room', 'Комната', Grid2X2Plus], ['polygon', 'Многоуг.', Pentagon],
  ['wall', 'Стена', Hammer], ['window', 'Окно', Warehouse], ['door', 'Дверь', DoorOpen],
  ['dimension', 'Размер', Ruler], ['pile', 'Свая', Waves], ['pileRow', 'Ряд свай', Waves],
  ['terrace', 'Терраса', Plus], ['porch', 'Крыльцо', Plus], ['delete', 'Удалить', Trash2]
];

const SKETCHES_KEY = 'eft-react-plan-sketches-v46';

function loadCustomSketches() {
  try { return JSON.parse(localStorage.getItem(SKETCHES_KEY) || '[]'); } catch { return []; }
}

const snap = (value, candidates = [], tolerance = 0.16) => {
  const grid = Math.round(value * 10) / 10;
  let best = grid;
  let distance = tolerance;
  candidates.forEach((candidate) => {
    const next = Math.abs(candidate - value);
    if (next <= distance) { best = candidate; distance = next; }
  });
  return Math.round(best * 1000) / 1000;
};

function roomPoints(room) {
  return room.points?.length >= 3 ? room.points : [
    { x: room.x, y: room.y }, { x: room.x + room.w, y: room.y },
    { x: room.x + room.w, y: room.y + room.h }, { x: room.x, y: room.y + room.h }
  ];
}

function roomBounds(room) {
  const points = roomPoints(room);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { x: Math.min(...xs), y: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

function nearestOpeningPlacement(point, plan) {
  const candidates = [
    { orientation: 'v', axis: 0, start: 0, end: plan.house.h, outer: true },
    { orientation: 'v', axis: plan.house.w, start: 0, end: plan.house.h, outer: true },
    { orientation: 'h', axis: 0, start: 0, end: plan.house.w, outer: true },
    { orientation: 'h', axis: plan.house.h, start: 0, end: plan.house.w, outer: true }
  ];
  plan.rooms.forEach((room) => {
    const points = roomPoints(room);
    points.forEach((a, index) => {
      const b = points[(index + 1) % points.length];
      if (Math.abs(a.x - b.x) < 0.03 && a.x > 0.25 && a.x < plan.house.w - 0.25) candidates.push({ orientation: 'v', axis: a.x, start: Math.min(a.y, b.y), end: Math.max(a.y, b.y), outer: false });
      if (Math.abs(a.y - b.y) < 0.03 && a.y > 0.25 && a.y < plan.house.h - 0.25) candidates.push({ orientation: 'h', axis: a.y, start: Math.min(a.x, b.x), end: Math.max(a.x, b.x), outer: false });
    });
  });
  return candidates.map((candidate) => {
    const along = candidate.orientation === 'v' ? point.y : point.x;
    const across = candidate.orientation === 'v' ? point.x : point.y;
    const projected = Math.max(candidate.start, Math.min(candidate.end, along));
    return { ...candidate, projected, distance: Math.hypot(across - candidate.axis, along - projected) };
  }).sort((left, right) => left.distance - right.distance)[0];
}

function DoorSwing({ opening, q, size, plan }) {
  const hingeAtStart = opening.hinge === 'left';
  if (opening.orientation === 'h') {
    const hingeX = q.x + (hingeAtStart ? -size / 2 : size / 2);
    const closedX = q.x + (hingeAtStart ? size / 2 : -size / 2);
    const inside = opening.outer !== false ? (opening.y < plan.house.h / 2 ? 1 : -1) : 1;
    const direction = (opening.swing || 'in') === 'in' ? inside : -inside;
    const leafY = q.y + direction * size;
    return <g className="door-swing"><line x1={hingeX} y1={q.y} x2={hingeX} y2={leafY} /><path d={`M ${closedX} ${q.y} A ${size} ${size} 0 0 ${hingeAtStart === (direction > 0) ? 1 : 0} ${hingeX} ${leafY}`} /></g>;
  }
  const hingeY = q.y + (hingeAtStart ? -size / 2 : size / 2);
  const closedY = q.y + (hingeAtStart ? size / 2 : -size / 2);
  const inside = opening.outer !== false ? (opening.x < plan.house.w / 2 ? 1 : -1) : 1;
  const direction = (opening.swing || 'in') === 'in' ? inside : -inside;
  const leafX = q.x + direction * size;
  return <g className="door-swing"><line x1={q.x} y1={hingeY} x2={leafX} y2={hingeY} /><path d={`M ${q.x} ${closedY} A ${size} ${size} 0 0 ${hingeAtStart === (direction < 0) ? 1 : 0} ${leafX} ${hingeY}`} /></g>;
}

function withBounds(room) {
  return { ...room, ...roomBounds(room) };
}

function labelPoint(room) {
  const bounds = roomBounds(room);
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
}

function planLayout(plan) {
  const sides = chooseDimensionSides(plan);
  const bounds = sides.bounds;
  const margin = 1.8;
  const minX = Math.min(bounds.minX, 0) - margin;
  const minY = Math.min(bounds.minY, 0) - margin;
  const maxX = Math.max(bounds.maxX, plan.house.w) + margin;
  const maxY = Math.max(bounds.maxY, plan.house.h) + margin;
  const width = maxX - minX;
  const height = maxY - minY;
  const scale = Math.min(900 / width, 650 / height) * (plan.zoom || 100) / 100;
  return { scale, ox: 500 - (minX + maxX) * scale / 2, oy: 375 - (minY + maxY) * scale / 2, sides };
}

function stairsPath(platform, layout) {
  const steps = Math.max(0, Math.round(platform.steps) || 0);
  if (!steps) return null;
  const depth = (platform.tread || 0.3) * steps;
  const width = Math.min(platform.stairWidth || 1.2, platform.stairSide === 'left' || platform.stairSide === 'right' ? platform.h : platform.w);
  const centerX = platform.x + platform.w / 2;
  const centerY = platform.y + platform.h / 2;
  const p = (x, y) => `${layout.ox + x * layout.scale},${layout.oy + y * layout.scale}`;
  if (platform.stairSide === 'bottom') return `${p(centerX - width / 2, platform.y + platform.h)} ${p(centerX + width / 2, platform.y + platform.h)} ${p(centerX + width / 2, platform.y + platform.h + depth)} ${p(centerX - width / 2, platform.y + platform.h + depth)}`;
  if (platform.stairSide === 'top') return `${p(centerX - width / 2, platform.y)} ${p(centerX + width / 2, platform.y)} ${p(centerX + width / 2, platform.y - depth)} ${p(centerX - width / 2, platform.y - depth)}`;
  if (platform.stairSide === 'right') return `${p(platform.x + platform.w, centerY - width / 2)} ${p(platform.x + platform.w, centerY + width / 2)} ${p(platform.x + platform.w + depth, centerY + width / 2)} ${p(platform.x + platform.w + depth, centerY - width / 2)}`;
  return `${p(platform.x, centerY - width / 2)} ${p(platform.x, centerY + width / 2)} ${p(platform.x - depth, centerY + width / 2)} ${p(platform.x - depth, centerY - width / 2)}`;
}

function PlanSvg({ plan, tool, selected, setSelected, commitPlan, polygonDraft, setPolygonDraft }) {
  const svgRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [drag, setDrag] = useState(null);
  const layout = useMemo(() => planLayout(plan), [plan]);
  const foundation = useMemo(() => calculateFoundation(plan, { spacing: 2.5, boardVolumePerMeter: 0.0225 }), [plan]);
  const candidates = useMemo(() => {
    const xs = [0, plan.wallThickness, plan.house.w - plan.wallThickness, plan.house.w];
    const ys = [0, plan.wallThickness, plan.house.h - plan.wallThickness, plan.house.h];
    plan.rooms.forEach((room) => roomPoints(room).forEach((point) => { xs.push(point.x); ys.push(point.y); }));
    return { xs, ys };
  }, [plan]);
  const toPlan = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: snap(((event.clientX - rect.left) / rect.width * 1000 - layout.ox) / layout.scale, candidates.xs), y: snap(((event.clientY - rect.top) / rect.height * 750 - layout.oy) / layout.scale, candidates.ys) };
  };
  const p = (x, y) => ({ x: layout.ox + x * layout.scale, y: layout.oy + y * layout.scale });

  const startBackground = (event) => {
    if (event.target !== svgRef.current && !event.target.classList.contains('plan-grid-hit')) return;
    const point = toPlan(event);
    if (tool === 'select') { setSelected(null); return; }
    if (tool === 'polygon') { setPolygonDraft((points) => [...points, point]); return; }
    if (tool === 'pile') {
      commitPlan((next) => { next.piles.push({ id: uid('pile'), ...point, source: 'manual' }); });
      return;
    }
    if (['room', 'terrace', 'porch', 'wall', 'dimension', 'pileRow'].includes(tool)) setDraft({ tool, start: point, end: point });
  };

  const pointerMove = (event) => {
    const point = toPlan(event);
    if (draft) setDraft((current) => ({ ...current, end: point }));
    if (drag) setDrag((current) => ({ ...current, end: point }));
  };

  const finishPointer = () => {
    if (draft) {
      const x = Math.min(draft.start.x, draft.end.x);
      const y = Math.min(draft.start.y, draft.end.y);
      const w = Math.abs(draft.end.x - draft.start.x);
      const h = Math.abs(draft.end.y - draft.start.y);
      if ((draft.tool === 'room' || draft.tool === 'terrace' || draft.tool === 'porch') && w >= 0.5 && h >= 0.5) {
        const id = uid(draft.tool);
        commitPlan((next) => {
          if (draft.tool === 'room') next.rooms.push({ id, name: 'Новая комната', x, y, w, h, include: true, bearing: false });
          else next.platforms.push(normalizeTerracePlatform({ id, kind: draft.tool, x, y, w, h, include: true, steps: 0, stairSide: 'bottom' }));
        });
        setSelected({ type: draft.tool === 'room' ? 'room' : 'platform', id });
      }
      if (['wall', 'dimension', 'pileRow'].includes(draft.tool) && Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y) >= 0.3) {
        const id = uid(draft.tool);
        commitPlan((next) => {
          if (draft.tool === 'wall') next.walls.push({ id, x1: draft.start.x, y1: draft.start.y, x2: draft.end.x, y2: draft.end.y, bearing: false });
          if (draft.tool === 'dimension') next.dimensions.push({ id, x1: draft.start.x, y1: draft.start.y, x2: draft.end.x, y2: draft.end.y });
          if (draft.tool === 'pileRow') next.pileRows.push({ id, name: 'Новый ряд', x1: draft.start.x, y1: draft.start.y, x2: draft.end.x, y2: draft.end.y, count: Math.max(2, Math.ceil(Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y) / 2.5) + 1), group: 'house' });
        });
      }
      setDraft(null);
    }
    if (drag) {
      const dx = drag.end.x - drag.start.x;
      const dy = drag.end.y - drag.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.001) commitPlan((next) => {
        if (drag.type === 'room') {
          const room = next.rooms.find((item) => item.id === drag.id);
          if (room.points) room.points = room.points.map((point) => ({ x: snap(point.x + dx, candidates.xs), y: snap(point.y + dy, candidates.ys) }));
          else { room.x = snap(room.x + dx, candidates.xs); room.y = snap(room.y + dy, candidates.ys); }
          Object.assign(room, roomBounds(room));
        }
        if (drag.type === 'platform') {
          const platform = next.platforms.find((item) => item.id === drag.id);
          platform.x = snap(platform.x + dx, candidates.xs); platform.y = snap(platform.y + dy, candidates.ys);
        }
        if (drag.type === 'vertex') {
          const room = next.rooms.find((item) => item.id === drag.id);
          room.points[drag.vertex] = { x: drag.end.x, y: drag.end.y };
          Object.assign(room, roomBounds(room));
        }
      });
      setDrag(null);
    }
  };

  const objectDown = (event, type, id, vertex) => {
    event.stopPropagation();
    if (tool === 'delete') { commitPlan((next) => { const key = type === 'room' ? 'rooms' : type === 'platform' ? 'platforms' : type === 'opening' ? 'openings' : type === 'wall' ? 'walls' : type === 'dimension' ? 'dimensions' : type === 'pileRow' ? 'pileRows' : 'piles'; next[key] = next[key].filter((item) => item.id !== id); }); setSelected(null); return; }
    const start = toPlan(event);
    setSelected({ type, id });
    if (type === 'room' || type === 'platform') setDrag({ type, id, start, end: start });
    if (vertex !== undefined) setDrag({ type: 'vertex', id, vertex, start, end: start });
  };

  const addOpening = (event, type) => {
    event.stopPropagation();
    const point = toPlan(event);
    const placement = nearestOpeningPlacement(point, plan);
    const opening = { id: uid(type), type, width: type === 'window' ? 1.2 : 0.86, height: type === 'window' ? 1.2 : 2.05, outer: placement.outer, doorType: placement.outer ? 'entrance' : 'interior', hinge: 'right', swing: placement.outer ? 'out' : 'in', orientation: placement.orientation };
    if (placement.orientation === 'v') Object.assign(opening, { x: placement.axis, y: placement.projected });
    else Object.assign(opening, { x: placement.projected, y: placement.axis });
    commitPlan((next) => next.openings.push(opening));
    setSelected({ type: 'opening', id: opening.id });
  };

  const dragShift = (type, id) => drag && drag.id === id && drag.type === type ? { x: (drag.end.x - drag.start.x) * layout.scale, y: (drag.end.y - drag.start.y) * layout.scale } : { x: 0, y: 0 };
  const outerTop = p(0, 0);
  const outerBottom = p(plan.house.w, plan.house.h);
  const horizontalY = layout.sides.horizontal === 'top' ? outerTop.y - 28 : outerBottom.y + 28;
  const verticalX = layout.sides.vertical === 'left' ? outerTop.x - 28 : outerBottom.x + 28;

  return (
    <svg ref={svgRef} className="plan-svg" viewBox="0 0 1000 750" role="img" aria-label="Интерактивный план дома" onPointerDown={startBackground} onPointerMove={pointerMove} onPointerUp={finishPointer} onPointerLeave={finishPointer} onDoubleClick={() => tool === 'polygon' && polygonDraft.length >= 3 && setPolygonDraft((points) => points)}>
      <defs><pattern id="minor-grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="currentColor" strokeOpacity=".08" strokeWidth="1" /></pattern><pattern id="major-grid" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="60" fill="url(#minor-grid)" /><path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="1" /></pattern></defs>
      <rect className="plan-grid-hit" width="1000" height="750" fill="url(#major-grid)" onClick={(event) => (tool === 'window' || tool === 'door') && addOpening(event, tool)} />
      {plan.platforms.map((platform) => {
        const q = p(platform.x, platform.y); const shift = dragShift('platform', platform.id); const selectedNow = selected?.type === 'platform' && selected.id === platform.id;
        return <g key={platform.id} transform={`translate(${shift.x} ${shift.y})`} onPointerDown={(event) => objectDown(event, 'platform', platform.id)}>
          <rect className={`platform-shape ${platform.kind} ${selectedNow ? 'selected' : ''}`} x={q.x} y={q.y} width={platform.w * layout.scale} height={platform.h * layout.scale} />
          <text className="platform-label" x={q.x + platform.w * layout.scale / 2} y={q.y + platform.h * layout.scale / 2 - 5}>{platform.kind === 'porch' ? 'Крыльцо' : 'Терраса'}</text>
          <text className="platform-area" x={q.x + platform.w * layout.scale / 2} y={q.y + platform.h * layout.scale / 2 + 14}>{formatNumber(platform.w * platform.h)} м²</text>
          {stairsPath(platform, layout) ? <polygon className="stairs" points={stairsPath(platform, layout)} /> : null}
        </g>;
      })}
      <rect className="house-fill" x={outerTop.x} y={outerTop.y} width={plan.house.w * layout.scale} height={plan.house.h * layout.scale} />
      {plan.rooms.map((room) => {
        const points = roomPoints(room).map((point) => p(point.x, point.y)); const shift = dragShift('room', room.id); const center = p(labelPoint(room).x, labelPoint(room).y); const selectedNow = selected?.type === 'room' && selected.id === room.id;
        return <g key={room.id} transform={`translate(${shift.x} ${shift.y})`}>
          <polygon className={`room-shape ${selectedNow ? 'selected' : ''}`} points={points.map((point) => `${point.x},${point.y}`).join(' ')} onPointerDown={(event) => objectDown(event, 'room', room.id)} />
          <text className="room-name" x={center.x} y={center.y - 5}>{room.name}</text>
          <text className="room-area" x={center.x} y={center.y + 14}>{formatNumber(polygonArea(roomPoints(room)))} м²</text>
          {selectedNow && room.points ? points.map((point, index) => <circle key={index} className="vertex-handle" cx={point.x} cy={point.y} r="6" onPointerDown={(event) => objectDown(event, 'room', room.id, index)} />) : null}
        </g>;
      })}
      <rect className="outer-wall" x={outerTop.x} y={outerTop.y} width={plan.house.w * layout.scale} height={plan.house.h * layout.scale} style={{ strokeWidth: Math.max(6, plan.wallThickness * layout.scale) }} />
      {plan.walls.map((wall) => { const a = p(wall.x1, wall.y1); const b = p(wall.x2, wall.y2); return <line key={wall.id} className="inner-wall" x1={a.x} y1={a.y} x2={b.x} y2={b.y} onPointerDown={(event) => objectDown(event, 'wall', wall.id)} />; })}
      {plan.openings.map((opening) => { const q = p(opening.x, opening.y); const size = Math.max(24, opening.width * layout.scale); const selectedNow = selected?.type === 'opening' && selected.id === opening.id; return <g key={opening.id} className={selectedNow ? 'selected-opening' : ''} onPointerDown={(event) => objectDown(event, 'opening', opening.id)}>{opening.orientation === 'v' ? <><line className="opening-cut" x1={q.x} y1={q.y - size / 2} x2={q.x} y2={q.y + size / 2} /><line className={`opening ${opening.type}`} x1={q.x} y1={q.y - size / 2} x2={q.x} y2={q.y + size / 2} /></> : <><line className="opening-cut" x1={q.x - size / 2} y1={q.y} x2={q.x + size / 2} y2={q.y} /><line className={`opening ${opening.type}`} x1={q.x - size / 2} y1={q.y} x2={q.x + size / 2} y2={q.y} /></>}{opening.type === 'door' ? <><DoorSwing opening={opening} q={q} size={size} plan={plan} /><text className="opening-tag" x={q.x} y={q.y - 10}>{opening.doorType === 'interior' ? 'МД' : 'ВХ'}</text></> : null}</g>; })}
      {plan.showPiles ? foundation.points.map((point, index) => { const q = p(point.x, point.y); return <circle key={`${point.x}-${point.y}-${index}`} className={`pile-point ${point.source}`} cx={q.x} cy={q.y} r="6" />; }) : null}
      {plan.showPiles ? plan.pileRows.map((row) => { const a = p(row.x1, row.y1); const b = p(row.x2, row.y2); return <line key={row.id} className="pile-guide" x1={a.x} y1={a.y} x2={b.x} y2={b.y} onPointerDown={(event) => objectDown(event, 'pileRow', row.id)} />; }) : null}
      {plan.dimensions.map((dimension) => { const a = p(dimension.x1, dimension.y1); const b = p(dimension.x2, dimension.y2); const length = Math.hypot(dimension.x2 - dimension.x1, dimension.y2 - dimension.y1); return <g key={dimension.id} onPointerDown={(event) => objectDown(event, 'dimension', dimension.id)}><line className="custom-dimension" x1={a.x} y1={a.y} x2={b.x} y2={b.y} /><text className="dimension-text" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8}>{Math.round(length * 1000)} мм</text></g>; })}
      <g className="outer-dimensions"><line x1={outerTop.x} y1={horizontalY} x2={outerBottom.x} y2={horizontalY} /><text x={(outerTop.x + outerBottom.x) / 2} y={horizontalY - 8}>{Math.round(plan.house.w * 1000).toLocaleString('ru-RU')}</text><line x1={verticalX} y1={outerTop.y} x2={verticalX} y2={outerBottom.y} /><text transform={`translate(${verticalX - 9} ${(outerTop.y + outerBottom.y) / 2}) rotate(-90)`}>{Math.round(plan.house.h * 1000).toLocaleString('ru-RU')}</text></g>
      {draft ? <rect className="draft-shape" x={p(Math.min(draft.start.x, draft.end.x), Math.min(draft.start.y, draft.end.y)).x} y={p(Math.min(draft.start.x, draft.end.x), Math.min(draft.start.y, draft.end.y)).y} width={Math.abs(draft.end.x - draft.start.x) * layout.scale} height={Math.abs(draft.end.y - draft.start.y) * layout.scale} /> : null}
      {polygonDraft.length ? <polyline className="polygon-draft" points={polygonDraft.map((point) => { const q = p(point.x, point.y); return `${q.x},${q.y}`; }).join(' ')} /> : null}
    </svg>
  );
}

function Inspector({ plan, selected, commitPlan }) {
  const room = selected?.type === 'room' ? plan.rooms.find((item) => item.id === selected.id) : null;
  const platform = selected?.type === 'platform' ? plan.platforms.find((item) => item.id === selected.id) : null;
  const opening = selected?.type === 'opening' ? plan.openings.find((item) => item.id === selected.id) : null;
  const pileRow = selected?.type === 'pileRow' ? plan.pileRows.find((item) => item.id === selected.id) : null;
  const update = (key, mutate) => commitPlan((next) => { const item = next[key].find((candidate) => candidate.id === selected.id); mutate(item); });
  if (!selected) return <div className="inspector-empty"><MousePointer2 /><h3>Выберите объект</h3><p>Справа появятся размеры, конструктивные параметры и включение в смету.</p></div>;
  if (room) {
    const bounds = roomBounds(room);
    const resize = (dimension, value) => update('rooms', (item) => {
      const old = roomBounds(item); const sx = dimension === 'w' ? value / Math.max(0.1, old.w) : 1; const sy = dimension === 'h' ? value / Math.max(0.1, old.h) : 1;
      if (item.points) item.points = item.points.map((point) => ({ x: old.x + (point.x - old.x) * sx, y: old.y + (point.y - old.y) * sy })); else { item.w = dimension === 'w' ? value : item.w; item.h = dimension === 'h' ? value : item.h; }
      Object.assign(item, roomBounds(item));
    });
    return <div className="inspector-form"><h3>{room.name}</h3><Field label="Название"><input value={room.name} onChange={(event) => update('rooms', (item) => { item.name = event.target.value; })} /></Field><div className="form-grid"><NumberField label="Длина" value={bounds.w} suffix="м" min={0.5} onChange={(value) => resize('w', value)} /><NumberField label="Ширина" value={bounds.h} suffix="м" min={0.5} onChange={(value) => resize('h', value)} /></div><div className="readout"><span>Площадь</span><strong>{formatNumber(polygonArea(roomPoints(room)))} м²</strong></div><Toggle label="Несущая стена" checked={room.bearing} onChange={(value) => update('rooms', (item) => { item.bearing = value; })} /><Toggle label="Учитывать в смете" checked={room.include !== false} onChange={(value) => update('rooms', (item) => { item.include = value; })} />{room.points ? <p className="inspector-note">Комната неправильной формы: {room.points.length} вершин. Зелёные точки можно перетаскивать.</p> : null}</div>;
  }
  if (platform) {
    const roofResult = calculateTerraceRoof(platform, plan.house);
    const updatePlatform = (mutate) => update('platforms', (item) => { mutate(item); Object.assign(item, normalizeTerracePlatform(item)); });
    return <div className="inspector-form"><h3>{platform.kind === 'porch' ? 'Крыльцо' : 'Терраса'} · {formatNumber(platform.w * platform.h)} м²</h3><div className="form-grid"><NumberField label="Длина" value={platform.w} suffix="м" min={0.5} onChange={(value) => updatePlatform((item) => { item.w = value; })} /><NumberField label="Ширина" value={platform.h} suffix="м" min={0.5} onChange={(value) => updatePlatform((item) => { item.h = value; })} /><NumberField label="Ступени" value={platform.steps} suffix="шт" step={1} onChange={(value) => updatePlatform((item) => { item.steps = value; })} /><NumberField label="Ширина марша" value={platform.stairWidth} suffix="м" onChange={(value) => updatePlatform((item) => { item.stairWidth = value; })} /></div><SelectField label="Свайное поле" value={platform.foundation.mode} onChange={(value) => updatePlatform((item) => { item.foundation.mode = value; })} options={[{ value: 'shared', label: 'Общее с домом' }, { value: 'separate', label: 'Отдельное' }, { value: 'none', label: 'Без свай' }]} /><SelectField label="Обвязка" value={platform.binding.mode} onChange={(value) => updatePlatform((item) => { item.binding.mode = value; })} disabled={platform.foundation.mode === 'none'} options={[{ value: 'shared', label: 'Общая с домом' }, { value: 'separate', label: 'Отдельная' }, { value: 'none', label: 'Не учитывать' }]} /><SelectField label="Кровля" value={platform.roof.mode} onChange={(value) => updatePlatform((item) => { item.roof.mode = value; })} options={[{ value: 'none', label: 'Без кровли' }, { value: 'cold', label: 'Холодная' }, { value: 'warm', label: 'Тёплая СИП' }]} />{platform.roof.mode !== 'none' ? <><SelectField label="Форма кровли" value={platform.roof.shape} onChange={(value) => updatePlatform((item) => { item.roof.shape = value; })} options={[{ value: 'shed', label: 'Односкатная' }, { value: 'continuation', label: 'Продолжение основной' }, { value: 'gable', label: 'Двускатная' }]} /><div className="form-grid"><NumberField label="Передний свес" value={platform.roof.frontOverhang} suffix="м" onChange={(value) => updatePlatform((item) => { item.roof.frontOverhang = value; })} /><NumberField label="Боковой свес" value={platform.roof.sideOverhang} suffix="м" onChange={(value) => updatePlatform((item) => { item.roof.sideOverhang = value; })} /><NumberField label="Высота у стены" value={platform.roof.highHeight} suffix="м" onChange={(value) => updatePlatform((item) => { item.roof.highHeight = value; })} /><NumberField label="Высота края" value={platform.roof.lowHeight} suffix="м" onChange={(value) => updatePlatform((item) => { item.roof.lowHeight = value; })} /></div><div className="readout"><span>Кровля / с запасом</span><strong>{formatNumber(roofResult.netArea)} / {formatNumber(roofResult.purchaseArea)} м²</strong></div></> : null}<Toggle label="Учитывать в смете" checked={platform.include !== false} onChange={(value) => updatePlatform((item) => { item.include = value; })} /></div>;
  }
  if (opening) return <div className="inspector-form"><h3>{opening.type === 'window' ? 'Окно' : 'Дверь'}</h3><div className="form-grid"><NumberField label="Ширина" value={opening.width * 1000} suffix="мм" step={10} onChange={(value) => update('openings', (item) => { item.width = value / 1000; })} /><NumberField label="Высота" value={opening.height * 1000} suffix="мм" step={10} onChange={(value) => update('openings', (item) => { item.height = value / 1000; })} /></div>{opening.type === 'door' ? <><SelectField label="Тип двери" value={opening.doorType || 'entrance'} onChange={(value) => update('openings', (item) => { item.doorType = value; item.outer = value === 'entrance'; })} options={[{ value: 'entrance', label: 'Входная' }, { value: 'interior', label: 'Межкомнатная' }]} /><div className="form-grid"><SelectField label="Петли" value={opening.hinge || 'right'} onChange={(value) => update('openings', (item) => { item.hinge = value; })} options={[{ value: 'left', label: 'Слева' }, { value: 'right', label: 'Справа' }]} /><SelectField label="Открывание" value={opening.swing || 'in'} onChange={(value) => update('openings', (item) => { item.swing = value; })} options={[{ value: 'in', label: 'Внутрь' }, { value: 'out', label: 'Наружу' }]} /></div><SelectField label="Ориентация полотна" value={opening.orientation || 'h'} onChange={(value) => update('openings', (item) => { item.orientation = value; })} options={[{ value: 'h', label: 'Горизонтальная стена' }, { value: 'v', label: 'Вертикальная стена' }]} /></> : null}</div>;
  if (pileRow) return <div className="inspector-form"><h3>{pileRow.name}</h3><Field label="Название ряда"><input value={pileRow.name} onChange={(event) => update('pileRows', (item) => { item.name = event.target.value; })} /></Field><NumberField label="Количество свай" value={pileRow.count} suffix="шт" min={2} max={50} step={1} onChange={(value) => update('pileRows', (item) => { item.count = Math.max(2, Math.round(value)); })} /><div className="readout"><span>Длина ряда</span><strong>{formatNumber(Math.hypot(pileRow.x2 - pileRow.x1, pileRow.y2 - pileRow.y1))} м</strong></div></div>;
  return <div className="inspector-empty"><Ruler /><h3>Объект выбран</h3><p>Для удаления используйте инструмент «Удалить».</p></div>;
}

export default function PlanScreen() {
  const { project, commit, undo, redo, canUndo, canRedo } = useProject();
  const [tool, setTool] = useState('select');
  const [selected, setSelected] = useState(null);
  const [polygonDraft, setPolygonDraft] = useState([]);
  const [customSketches, setCustomSketches] = useState(loadCustomSketches);
  const [sketchId, setSketchId] = useState('july-irregular');
  const plan = project.plan;
  const metrics = useMemo(() => calculatePlanMetrics(plan), [plan]);
  const foundation = useMemo(() => calculateFoundation(plan, project.settings.piles), [plan, project.settings.piles]);
  const commitPlan = (mutate) => commit((next) => { mutate(next.plan); return next; });
  const finishPolygon = () => {
    if (polygonDraft.length < 3 || polygonArea(polygonDraft) < 0.25) return;
    const id = uid('room');
    commitPlan((next) => { const room = withBounds({ id, name: 'Новая комната', points: polygonDraft, include: true, bearing: false }); next.rooms.push(room); });
    setSelected({ type: 'room', id }); setPolygonDraft([]); setTool('select');
  };
  const sketches = useMemo(() => [
    { id: 'july-irregular', name: 'План с фото · 103,8 м²', plan: createDefaultPlan() },
    { id: 'compact', name: 'Компактный · 10 × 7 м', plan: createCompactPlan() },
    { id: 'empty', name: 'Чистый контур · 10 × 8 м', plan: createEmptyPlan() },
    ...customSketches
  ], [customSketches]);
  const applySketch = () => {
    const sketch = sketches.find((item) => item.id === sketchId);
    if (!sketch || !window.confirm(`Загрузить эскиз «${sketch.name}»? Текущий план останется в истории отмены.`)) return;
    commit((next) => { next.plan = structuredClone(sketch.plan); return next; });
    setSelected(null); setPolygonDraft([]); setTool('select');
  };
  const saveSketch = () => {
    const name = window.prompt('Название нового эскиза:', `Эскиз ${customSketches.length + 1}`)?.trim();
    if (!name) return;
    const nextSketches = [{ id: uid('sketch'), name, plan: structuredClone(plan) }, ...customSketches].slice(0, 20);
    localStorage.setItem(SKETCHES_KEY, JSON.stringify(nextSketches));
    setCustomSketches(nextSketches);
  };
  return <div className="screen plan-screen"><ScreenHeader title="План дома" description="Комнаты, пристройки, проёмы, свайные ряды и размеры в одной модели проекта" actions={<><select className="sketch-select" value={sketchId} onChange={(event) => setSketchId(event.target.value)}>{sketches.map((sketch) => <option key={sketch.id} value={sketch.id}>{sketch.name}</option>)}</select><button className="button secondary" onClick={applySketch}>Загрузить эскиз</button><button className="button secondary" onClick={saveSketch}><Save />Сохранить как эскиз</button><button className="button ghost" onClick={undo} disabled={!canUndo}><Undo2 />Отменить</button><button className="button ghost" onClick={redo} disabled={!canRedo}><Redo2 />Повторить</button></>} />
    <div className="plan-top-controls"><NumberField label="Длина дома" value={plan.house.w} suffix="м" min={3} onChange={(value) => commitPlan((next) => { next.house.w = value; })} /><NumberField label="Ширина дома" value={plan.house.h} suffix="м" min={3} onChange={(value) => commitPlan((next) => { next.house.h = value; })} /><NumberField label="Высота стен" value={plan.wallHeight} suffix="м" min={2} onChange={(value) => commitPlan((next) => { next.wallHeight = value; })} /><Toggle label="Показывать сваи" checked={plan.showPiles !== false} onChange={(value) => commitPlan((next) => { next.showPiles = value; })} /></div>
    <div className="plan-workbench"><aside className="tool-rail">{TOOLS.map(([id, label, Icon]) => <button key={id} className={tool === id ? 'active' : ''} title={label} onClick={() => { setTool(id); if (id !== 'polygon') setPolygonDraft([]); }}><Icon /><span>{label}</span></button>)}{tool === 'polygon' && polygonDraft.length ? <><button className="finish-tool" onClick={finishPolygon}><Save /><span>Готово</span></button><button onClick={() => setPolygonDraft([])}><X /><span>Сброс</span></button></> : null}</aside><div className="canvas-panel"><PlanSvg plan={plan} tool={tool} selected={selected} setSelected={setSelected} commitPlan={commitPlan} polygonDraft={polygonDraft} setPolygonDraft={setPolygonDraft} /><div className="canvas-hint">{tool === 'select' ? 'Перетаскивайте комнаты и террасы. Края прилипают к стенам и узлам.' : tool === 'polygon' ? 'Ставьте вершины по очереди, затем нажмите «Готово».' : 'Протяните объект мышью на плане.'}</div></div><aside className="plan-inspector"><Inspector plan={plan} selected={selected} commitPlan={commitPlan} /></aside></div>
    <div className="stats-row"><Stat label="Площадь помещений" value={`${formatNumber(metrics.roomArea)} м²`} /><Stat label="Перегородки" value={`${formatNumber(metrics.partitionLength)} м`} /><Stat label="Чистая площадь стен" value={`${formatNumber(metrics.exteriorWallNetArea)} м²`} /><Stat label="Уникальные сваи" value={`${foundation.totalPiles} шт`} /><Stat label="Общая обвязка" value={`${formatNumber(foundation.bindingLength)} м`} /><Stat label="Пристройки" value={`${formatNumber(metrics.platformArea)} м²`} /></div>
  </div>;
}
