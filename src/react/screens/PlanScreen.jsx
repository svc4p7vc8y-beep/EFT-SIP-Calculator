import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, DoorOpen, Grid2X2Plus, Hammer, Link2Off, MousePointer2, Pentagon,
  Plus, Redo2, Ruler, Save, Trash2, Undo2, Warehouse, Waves, X, ZoomIn, ZoomOut
} from 'lucide-react';
import { calculatePlanMetrics, chooseDimensionSides, polygonArea } from '../../calculations/plan-metrics.js';
import { calculateTerraceRoof, normalizeTerracePlatform } from '../../calculations/terrace-model.js';
import { calculateFoundation } from '../calculations/foundation-model.js';
import { Field, NumberField, ScreenHeader, SelectField, Stat, Toggle } from '../components/ui.jsx';
import { createCompactPlan, createDefaultPlan, createEmptyPlan } from '../state/project-model.js';
import { useProject } from '../state/ProjectContext.jsx';
import { formatNumber, uid } from '../utils/format.js';
import {
  allOpeningSegments, boundsOf, collectSnapAxes, lineEndpoints, movePoints, nearestSegment,
  planIssues, rectanglePoints, roomPoints, roundCoord, snapPoint, unifiedWallSegments, withRoomBounds
} from '../planner/geometry.js';

const VIEW = { width: 1100, height: 760 };
const SKETCHES_KEY = 'eft-react-plan-sketches-v47';
const DRAW_TOOLS = new Set(['room', 'wall', 'dimension', 'pileRow', 'terrace', 'porch']);
const TOOLS = [
  ['select', 'Выбор', MousePointer2], ['room', 'Комната', Grid2X2Plus], ['polygon', 'Многоугольная', Pentagon],
  ['wall', 'Стена', Hammer], ['gap', 'Разрыв стены', Link2Off], ['window', 'Окно', Warehouse], ['door', 'Дверь', DoorOpen],
  ['dimension', 'Размер', Ruler], ['pile', 'Свая', Waves], ['pileRow', 'Ряд свай', Waves],
  ['terrace', 'Терраса', Plus], ['porch', 'Крыльцо', Plus], ['delete', 'Удалить', Trash2]
];

const getStoredSketches = () => {
  try { return JSON.parse(localStorage.getItem(SKETCHES_KEY) || '[]'); } catch { return []; }
};

function layoutFor(plan) {
  const sides = chooseDimensionSides(plan);
  const bounds = sides.bounds;
  const margin = 1.5;
  const minX = Math.min(0, bounds.minX) - margin;
  const minY = Math.min(0, bounds.minY) - margin;
  const maxX = Math.max(plan.house.w, bounds.maxX) + margin;
  const maxY = Math.max(plan.house.h, bounds.maxY) + margin;
  const scale = Math.min(980 / (maxX - minX), 660 / (maxY - minY)) * Math.max(0.65, Math.min(1.8, (plan.zoom || 100) / 100));
  return { scale, ox: VIEW.width / 2 - ((minX + maxX) / 2) * scale, oy: VIEW.height / 2 - ((minY + maxY) / 2) * scale, sides };
}

function previewPlan(source, gesture) {
  if (!gesture || gesture.kind === 'draw') return source;
  const plan = structuredClone(source);
  const end = gesture.end;
  const dx = end.x - gesture.start.x; const dy = end.y - gesture.start.y;
  const axes = collectSnapAxes(plan, gesture.type === 'room' ? gesture.id : null);
  const itemFor = (key) => plan[key].find((item) => item.id === gesture.id);
  if (gesture.kind === 'vertex') {
    const room = itemFor('rooms');
    if (room?.points?.[gesture.index]) {
      const wall = Number(plan.wallThickness) || 0.174;
      room.points[gesture.index] = snapPoint({ x: Math.max(wall, Math.min(plan.house.w - wall, end.x)), y: Math.max(wall, Math.min(plan.house.h - wall, end.y)) }, axes);
      Object.assign(room, boundsOf(room.points));
    }
    return plan;
  }
  if (gesture.kind === 'endpoint') {
    const key = gesture.type === 'wall' ? 'walls' : gesture.type === 'dimension' ? 'dimensions' : 'pileRows';
    const item = itemFor(key); const point = snapPoint(end, axes);
    if (item) { item[`x${gesture.index + 1}`] = point.x; item[`y${gesture.index + 1}`] = point.y; }
    return plan;
  }
  if (gesture.type === 'room') {
    const room = itemFor('rooms');
    room.points = movePoints(roomPoints(room), dx, dy, plan, axes);
    Object.assign(room, boundsOf(room.points));
  } else if (gesture.type === 'platform') {
    const item = itemFor('platforms'); const origin = snapPoint({ x: item.x + dx, y: item.y + dy }, axes);
    item.x = origin.x; item.y = origin.y;
  } else if (gesture.type === 'opening') {
    const item = itemFor('openings'); const segment = nearestSegment(end, allOpeningSegments(plan));
    if (segment) {
      item.orientation = segment.axis; item.outer = segment.outer;
      if (item.type === 'door') item.doorType = segment.outer ? 'entrance' : 'interior';
      if (segment.axis === 'v') { item.x = segment.fixed; item.y = segment.projected; }
      else { item.x = segment.projected; item.y = segment.fixed; }
    }
  } else if (gesture.type === 'pile') {
    const item = itemFor('piles'); Object.assign(item, snapPoint(end, axes));
  } else if (gesture.type === 'gap') {
    const item = itemFor('wallGaps'); const segment = nearestSegment(end, allOpeningSegments(plan));
    if (segment) { item.orientation = segment.axis; item.outer = segment.outer; item.x = segment.axis === 'v' ? segment.fixed : segment.projected; item.y = segment.axis === 'v' ? segment.projected : segment.fixed; }
  } else {
    const key = gesture.type === 'wall' ? 'walls' : gesture.type === 'dimension' ? 'dimensions' : 'pileRows';
    const item = itemFor(key);
    if (item) {
      const first = snapPoint({ x: item.x1 + dx, y: item.y1 + dy }, axes);
      const delta = { x: first.x - item.x1, y: first.y - item.y1 };
      item.x1 = first.x; item.y1 = first.y; item.x2 = roundCoord(item.x2 + delta.x); item.y2 = roundCoord(item.y2 + delta.y);
    }
  }
  return plan;
}

function stairOutline(platform, p) {
  const steps = Math.max(0, Math.round(platform.steps) || 0);
  if (!steps) return '';
  const depth = steps * (Number(platform.tread) || 0.3);
  const vertical = platform.stairSide === 'left' || platform.stairSide === 'right';
  const width = Math.min(Number(platform.stairWidth) || 1.2, vertical ? platform.h : platform.w);
  const cx = platform.x + platform.w / 2; const cy = platform.y + platform.h / 2;
  let points;
  if (platform.stairSide === 'top') points = [[cx - width / 2, platform.y], [cx + width / 2, platform.y], [cx + width / 2, platform.y - depth], [cx - width / 2, platform.y - depth]];
  else if (platform.stairSide === 'left') points = [[platform.x, cy - width / 2], [platform.x, cy + width / 2], [platform.x - depth, cy + width / 2], [platform.x - depth, cy - width / 2]];
  else if (platform.stairSide === 'right') points = [[platform.x + platform.w, cy - width / 2], [platform.x + platform.w, cy + width / 2], [platform.x + platform.w + depth, cy + width / 2], [platform.x + platform.w + depth, cy - width / 2]];
  else points = [[cx - width / 2, platform.y + platform.h], [cx + width / 2, platform.y + platform.h], [cx + width / 2, platform.y + platform.h + depth], [cx - width / 2, platform.y + platform.h + depth]];
  return points.map(([x, y]) => { const q = p(x, y); return `${q.x},${q.y}`; }).join(' ');
}

function DoorLeaf({ opening, q, size, plan }) {
  const left = opening.hinge === 'left';
  if (opening.orientation === 'h') {
    const hingeX = q.x + (left ? -size / 2 : size / 2); const closedX = q.x + (left ? size / 2 : -size / 2);
    const inward = opening.outer ? (opening.y < plan.house.h / 2 ? 1 : -1) : 1;
    const direction = opening.swing === 'out' ? -inward : inward; const leafY = q.y + direction * size;
    return <g className="door-swing"><line x1={hingeX} y1={q.y} x2={hingeX} y2={leafY} /><path d={`M ${closedX} ${q.y} A ${size} ${size} 0 0 ${left === (direction > 0) ? 1 : 0} ${hingeX} ${leafY}`} /></g>;
  }
  const hingeY = q.y + (left ? -size / 2 : size / 2); const closedY = q.y + (left ? size / 2 : -size / 2);
  const inward = opening.outer ? (opening.x < plan.house.w / 2 ? 1 : -1) : 1;
  const direction = opening.swing === 'out' ? -inward : inward; const leafX = q.x + direction * size;
  return <g className="door-swing"><line x1={q.x} y1={hingeY} x2={leafX} y2={hingeY} /><path d={`M ${q.x} ${closedY} A ${size} ${size} 0 0 ${left === (direction < 0) ? 1 : 0} ${leafX} ${hingeY}`} /></g>;
}

function PlanCanvas({ plan, tool, selected, setSelected, commitPlan, polygonDraft, setPolygonDraft, issues }) {
  const svgRef = useRef(null);
  const gestureRef = useRef(null);
  const [gesture, setGestureState] = useState(null);
  const setGesture = (value) => { gestureRef.current = typeof value === 'function' ? value(gestureRef.current) : value; setGestureState(gestureRef.current); };
  const shownPlan = useMemo(() => previewPlan(plan, gesture), [plan, gesture]);
  // The viewport must stay fixed during a drag; otherwise an outside terrace
  // changes the fitted bounds and the object jumps away from the pointer.
  const layout = useMemo(() => layoutFor(plan), [plan]);
  const foundation = useMemo(() => calculateFoundation(shownPlan, { spacing: 2.5, boardVolumePerMeter: 0.0225 }), [shownPlan]);
  const unifiedWalls = useMemo(() => unifiedWallSegments(shownPlan), [shownPlan]);
  const issueRooms = useMemo(() => new Set(issues.flatMap((issue) => issue.roomIds || [])), [issues]);
  const p = useCallback((x, y) => ({ x: layout.ox + x * layout.scale, y: layout.oy + y * layout.scale }), [layout]);
  const toPlan = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    const raw = { x: ((event.clientX - rect.left) / rect.width * VIEW.width - layout.ox) / layout.scale, y: ((event.clientY - rect.top) / rect.height * VIEW.height - layout.oy) / layout.scale };
    return snapPoint(raw, collectSnapAxes(plan, gestureRef.current?.type === 'room' ? gestureRef.current.id : null));
  };
  const begin = (event, value) => { event.stopPropagation(); svgRef.current.setPointerCapture?.(event.pointerId); setGesture({ ...value, pointerId: event.pointerId, start: toPlan(event), end: toPlan(event) }); };
  const deleteObject = (type, id) => commitPlan((next) => {
    const key = type === 'room' ? 'rooms' : type === 'platform' ? 'platforms' : type === 'opening' ? 'openings' : type === 'wall' ? 'walls' : type === 'dimension' ? 'dimensions' : type === 'pileRow' ? 'pileRows' : type === 'gap' ? 'wallGaps' : 'piles';
    next[key] = (next[key] || []).filter((item) => item.id !== id);
  });
  const objectDown = (event, type, id, extra = {}) => {
    if (tool === 'delete') { event.stopPropagation(); deleteObject(type, id); setSelected(null); return; }
    if (tool !== 'select') return;
    setSelected({ type, id }); begin(event, { kind: extra.kind || 'move', type, id, index: extra.index });
  };
  const addAt = (point, type) => {
    if (type === 'pile') {
      const id = uid('pile'); commitPlan((next) => next.piles.push({ id, ...point, source: 'manual' })); setSelected({ type: 'pile', id }); return;
    }
    const segment = nearestSegment(point, allOpeningSegments(plan));
    if (!segment) return;
    const id = uid(type); const common = { id, orientation: segment.axis, outer: segment.outer, x: segment.axis === 'v' ? segment.fixed : segment.projected, y: segment.axis === 'v' ? segment.projected : segment.fixed };
    if (type === 'gap') {
      commitPlan((next) => next.wallGaps.push({ ...common, width: 1 })); setSelected({ type: 'gap', id });
    } else {
      const opening = { ...common, type, width: type === 'window' ? 1.2 : 0.86, height: type === 'window' ? 1.2 : 2.05, doorType: segment.outer ? 'entrance' : 'interior', hinge: 'right', swing: segment.outer ? 'out' : 'in' };
      commitPlan((next) => next.openings.push(opening)); setSelected({ type: 'opening', id });
    }
  };
  const canvasDown = (event) => {
    if (event.button !== 0) return;
    const point = toPlan(event);
    if (tool === 'select') { setSelected(null); return; }
    if (tool === 'polygon') { setPolygonDraft((current) => [...current, point]); return; }
    if (tool === 'pile' || tool === 'window' || tool === 'door' || tool === 'gap') { addAt(point, tool); return; }
    if (DRAW_TOOLS.has(tool)) begin(event, { kind: 'draw', type: tool });
  };
  const pointerMove = (event) => {
    if (!gestureRef.current || event.pointerId !== gestureRef.current.pointerId) return;
    const end = toPlan(event); setGesture((current) => ({ ...current, end }));
  };
  const pointerUp = (event) => {
    const current = gestureRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const finalGesture = { ...current, end: toPlan(event) };
    if (current.kind === 'draw') {
      const distance = Math.hypot(finalGesture.end.x - finalGesture.start.x, finalGesture.end.y - finalGesture.start.y);
      if (['room', 'terrace', 'porch'].includes(current.type)) {
        const points = rectanglePoints(finalGesture.start, finalGesture.end); const bounds = boundsOf(points);
        if (bounds.w >= 0.5 && bounds.h >= 0.5) {
          const id = uid(current.type);
          commitPlan((next) => {
            if (current.type === 'room') next.rooms.push(withRoomBounds({ id, name: `Комната ${next.rooms.length + 1}`, points, include: true, bearing: false }));
            else next.platforms.push(normalizeTerracePlatform({ id, kind: current.type, ...bounds, include: true, steps: current.type === 'porch' ? 3 : 0, stairSide: 'bottom', stairDirection: 'outward', stairWidth: 1.2, tread: 0.3, riser: 0.18 }));
          });
          setSelected({ type: current.type === 'room' ? 'room' : 'platform', id });
        }
      } else if (distance >= 0.3) {
        const id = uid(current.type);
        commitPlan((next) => {
          const line = { id, x1: finalGesture.start.x, y1: finalGesture.start.y, x2: finalGesture.end.x, y2: finalGesture.end.y };
          if (current.type === 'wall') next.walls.push({ ...line, bearing: false });
          if (current.type === 'dimension') next.dimensions.push(line);
          if (current.type === 'pileRow') next.pileRows.push({ ...line, name: `Ряд ${next.pileRows.length + 1}`, count: Math.max(2, Math.ceil(distance / 2.5) + 1), group: 'house' });
        });
        setSelected({ type: current.type, id });
      }
    } else {
      const next = previewPlan(plan, finalGesture);
      if (JSON.stringify(next) !== JSON.stringify(plan)) commitPlan((target) => Object.assign(target, next));
    }
    svgRef.current.releasePointerCapture?.(event.pointerId); setGesture(null);
  };

  const topLeft = p(0, 0); const bottomRight = p(shownPlan.house.w, shownPlan.house.h);
  const horizontalY = layout.sides.horizontal === 'top' ? topLeft.y - 30 : bottomRight.y + 30;
  const verticalX = layout.sides.vertical === 'left' ? topLeft.x - 30 : bottomRight.x + 30;
  const line = (item) => ({ a: p(item.x1, item.y1), b: p(item.x2, item.y2) });
  const drawSegment = (segment, key) => { const [a, b] = lineEndpoints(segment); const q1 = p(a.x, a.y); const q2 = p(b.x, b.y); return <line key={key} className="unified-wall" x1={q1.x} y1={q1.y} x2={q2.x} y2={q2.y} />; };
  const renderCut = (item, className) => { const q = p(item.x, item.y); const size = Math.max(18, item.width * layout.scale); return item.orientation === 'v' ? <line className={className} x1={q.x} y1={q.y - size / 2} x2={q.x} y2={q.y + size / 2} /> : <line className={className} x1={q.x - size / 2} y1={q.y} x2={q.x + size / 2} y2={q.y} />; };
  return <svg ref={svgRef} className={`plan-svg tool-${tool}`} viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="img" aria-label="Редактор плана дома" onPointerDown={canvasDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => setGesture(null)}>
    <defs><pattern id="planner-small-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#617064" strokeOpacity=".07" /></pattern><pattern id="planner-grid" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="url(#planner-small-grid)" /><path d="M50 0H0V50" fill="none" stroke="#4d6250" strokeOpacity=".12" /></pattern></defs>
    <rect className="plan-grid-hit" width={VIEW.width} height={VIEW.height} fill="url(#planner-grid)" />
    {(shownPlan.platforms || []).map((platform) => { const q = p(platform.x, platform.y); return <g key={platform.id} className="planner-object" onPointerDown={(event) => objectDown(event, 'platform', platform.id)}><rect className={`platform-shape ${selected?.id === platform.id ? 'selected' : ''}`} x={q.x} y={q.y} width={platform.w * layout.scale} height={platform.h * layout.scale} /><text className="platform-label" x={q.x + platform.w * layout.scale / 2} y={q.y + platform.h * layout.scale / 2 - 5}>{platform.kind === 'porch' ? 'Крыльцо' : 'Терраса'}</text><text className="platform-area" x={q.x + platform.w * layout.scale / 2} y={q.y + platform.h * layout.scale / 2 + 13}>{formatNumber(platform.w * platform.h)} м²</text>{stairOutline(platform, p) ? <polygon className="stairs" points={stairOutline(platform, p)} /> : null}{shownPlan.showBinding !== false && platform.binding?.mode !== 'none' ? <rect className="binding-guide" x={q.x} y={q.y} width={platform.w * layout.scale} height={platform.h * layout.scale} /> : null}</g>; })}
    <rect className="house-fill" x={topLeft.x} y={topLeft.y} width={shownPlan.house.w * layout.scale} height={shownPlan.house.h * layout.scale} />
    {(shownPlan.rooms || []).map((room) => { const points = roomPoints(room); const screen = points.map((point) => p(point.x, point.y)); const bounds = boundsOf(points); const center = p(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2); const selectedNow = selected?.type === 'room' && selected.id === room.id; return <g key={room.id} className="planner-object" onPointerDown={(event) => objectDown(event, 'room', room.id)}><polygon className={`room-fill ${selectedNow ? 'selected' : ''} ${issueRooms.has(room.id) ? 'invalid' : ''}`} points={screen.map((point) => `${point.x},${point.y}`).join(' ')} /><text className="room-name" x={center.x} y={center.y - 12}>{room.name}</text><text className="room-dimensions" x={center.x} y={center.y + 3}>{formatNumber(bounds.w)} × {formatNumber(bounds.h)} м</text><text className="room-area" x={center.x} y={center.y + 17}>{formatNumber(polygonArea(points))} м²</text>{selectedNow ? screen.map((point, index) => <circle key={index} className="vertex-handle" cx={point.x} cy={point.y} r="7" onPointerDown={(event) => objectDown(event, 'room', room.id, { kind: 'vertex', index })} />) : null}</g>; })}
    <rect className="outer-wall" x={topLeft.x} y={topLeft.y} width={shownPlan.house.w * layout.scale} height={shownPlan.house.h * layout.scale} style={{ strokeWidth: Math.max(7, shownPlan.wallThickness * layout.scale) }} />
    {unifiedWalls.map((segment, index) => drawSegment(segment, `unified-${index}`))}
    {(shownPlan.walls || []).map((wall) => { const q = line(wall); const selectedNow = selected?.type === 'wall' && selected.id === wall.id; return <g key={wall.id} className="planner-object" onPointerDown={(event) => objectDown(event, 'wall', wall.id)}><line className={`standalone-wall ${selectedNow ? 'selected' : ''}`} x1={q.a.x} y1={q.a.y} x2={q.b.x} y2={q.b.y} /><line className="wide-hit" x1={q.a.x} y1={q.a.y} x2={q.b.x} y2={q.b.y} />{selectedNow ? [q.a, q.b].map((point, index) => <circle key={index} className="endpoint-handle" cx={point.x} cy={point.y} r="7" onPointerDown={(event) => objectDown(event, 'wall', wall.id, { kind: 'endpoint', index })} />) : null}</g>; })}
    {(shownPlan.wallGaps || []).map((gap) => <g key={gap.id} className="planner-object" onPointerDown={(event) => objectDown(event, 'gap', gap.id)}>{renderCut(gap, `wall-gap ${selected?.id === gap.id ? 'selected' : ''}`)}</g>)}
    {(shownPlan.openings || []).map((opening) => { const q = p(opening.x, opening.y); const size = Math.max(18, opening.width * layout.scale); const selectedNow = selected?.type === 'opening' && selected.id === opening.id; return <g key={opening.id} className={`planner-object ${selectedNow ? 'selected-opening' : ''}`} onPointerDown={(event) => objectDown(event, 'opening', opening.id)}>{renderCut(opening, 'opening-cut')}{renderCut(opening, `opening ${opening.type}`)}{opening.type === 'door' ? <><DoorLeaf opening={opening} q={q} size={size} plan={shownPlan} /><text className="opening-tag" x={q.x} y={q.y - 10}>{opening.doorType === 'interior' ? 'МД' : 'ВХ'}</text></> : null}</g>; })}
    {shownPlan.showBinding !== false ? (shownPlan.pileRows || []).map((row) => { const q = line(row); return <line key={`binding-${row.id}`} className="binding-guide-line" x1={q.a.x} y1={q.a.y} x2={q.b.x} y2={q.b.y} />; }) : null}
    {shownPlan.showPiles !== false ? foundation.points.map((point, index) => { const q = p(point.x, point.y); return <circle key={`derived-${index}`} className={`pile-point ${point.source}`} cx={q.x} cy={q.y} r="6" />; }) : null}
    {shownPlan.showPiles !== false ? (shownPlan.piles || []).map((pile) => { const q = p(pile.x, pile.y); return <circle key={pile.id} className={`manual-pile ${selected?.id === pile.id ? 'selected' : ''}`} cx={q.x} cy={q.y} r="8" onPointerDown={(event) => objectDown(event, 'pile', pile.id)} />; }) : null}
    {shownPlan.showPiles !== false ? (shownPlan.pileRows || []).map((row) => { const q = line(row); const selectedNow = selected?.type === 'pileRow' && selected.id === row.id; return <g key={row.id} className="planner-object" onPointerDown={(event) => objectDown(event, 'pileRow', row.id)}><line className={`pile-guide ${selectedNow ? 'selected' : ''}`} x1={q.a.x} y1={q.a.y} x2={q.b.x} y2={q.b.y} /><line className="wide-hit" x1={q.a.x} y1={q.a.y} x2={q.b.x} y2={q.b.y} />{selectedNow ? [q.a, q.b].map((point, index) => <circle key={index} className="endpoint-handle" cx={point.x} cy={point.y} r="7" onPointerDown={(event) => objectDown(event, 'pileRow', row.id, { kind: 'endpoint', index })} />) : null}</g>; }) : null}
    {shownPlan.showDimensions !== false ? (shownPlan.dimensions || []).map((dimension) => { const q = line(dimension); const length = Math.hypot(dimension.x2 - dimension.x1, dimension.y2 - dimension.y1); const selectedNow = selected?.type === 'dimension' && selected.id === dimension.id; return <g key={dimension.id} className="planner-object" onPointerDown={(event) => objectDown(event, 'dimension', dimension.id)}><line className={`custom-dimension ${selectedNow ? 'selected' : ''}`} x1={q.a.x} y1={q.a.y} x2={q.b.x} y2={q.b.y} /><text className="dimension-text" x={(q.a.x + q.b.x) / 2} y={(q.a.y + q.b.y) / 2 - 8}>{Math.round(length * 1000)} мм</text>{selectedNow ? [q.a, q.b].map((point, index) => <circle key={index} className="endpoint-handle" cx={point.x} cy={point.y} r="7" onPointerDown={(event) => objectDown(event, 'dimension', dimension.id, { kind: 'endpoint', index })} />) : null}</g>; }) : null}
    {shownPlan.showDimensions !== false ? <g className="outer-dimensions"><line x1={topLeft.x} y1={horizontalY} x2={bottomRight.x} y2={horizontalY} /><line x1={topLeft.x} y1={horizontalY - 7} x2={topLeft.x} y2={horizontalY + 7} /><line x1={bottomRight.x} y1={horizontalY - 7} x2={bottomRight.x} y2={horizontalY + 7} /><text x={(topLeft.x + bottomRight.x) / 2} y={horizontalY - 9}>{Math.round(shownPlan.house.w * 1000).toLocaleString('ru-RU')} мм</text><line x1={verticalX} y1={topLeft.y} x2={verticalX} y2={bottomRight.y} /><line x1={verticalX - 7} y1={topLeft.y} x2={verticalX + 7} y2={topLeft.y} /><line x1={verticalX - 7} y1={bottomRight.y} x2={verticalX + 7} y2={bottomRight.y} /><text transform={`translate(${verticalX - 10} ${(topLeft.y + bottomRight.y) / 2}) rotate(-90)`}>{Math.round(shownPlan.house.h * 1000).toLocaleString('ru-RU')} мм</text></g> : null}
    {gesture?.kind === 'draw' ? (() => { const a = p(gesture.start.x, gesture.start.y); const b = p(gesture.end.x, gesture.end.y); return ['room', 'terrace', 'porch'].includes(gesture.type) ? <rect className="draft-shape" x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} /> : <line className="draft-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })() : null}
    {polygonDraft.length ? <g><polyline className="polygon-draft" points={polygonDraft.map((point) => { const q = p(point.x, point.y); return `${q.x},${q.y}`; }).join(' ')} />{polygonDraft.map((point, index) => { const q = p(point.x, point.y); return <circle key={index} className="polygon-point" cx={q.x} cy={q.y} r="5" />; })}</g> : null}
  </svg>;
}

function RoomList({ plan, issues, onSelect }) {
  const issueIds = new Set(issues.flatMap((issue) => issue.roomIds || []));
  return <div className="room-summary"><header><div><h3>Помещения</h3><p>Нажмите строку, чтобы выбрать комнату на плане.</p></div><strong>{formatNumber((plan.rooms || []).reduce((sum, room) => sum + polygonArea(roomPoints(room)), 0))} м²</strong></header>{issues.length ? <div className="plan-warning"><AlertTriangle />{issues.length} несостыковок — отмечены красным</div> : <div className="plan-ok">Стыковка помещений корректна</div>}<div className="room-summary-list">{(plan.rooms || []).map((room, index) => <button key={room.id} className={issueIds.has(room.id) ? 'invalid' : ''} onClick={() => onSelect({ type: 'room', id: room.id })}><span><i>{index + 1}</i><strong>{room.name}</strong></span><em>{formatNumber(polygonArea(roomPoints(room)))} м²</em></button>)}</div></div>;
}

function Inspector({ plan, selected, commitPlan, issues, setSelected }) {
  const get = (key) => (plan[key] || []).find((item) => item.id === selected?.id);
  const update = (key, mutate) => commitPlan((next) => { const item = (next[key] || []).find((candidate) => candidate.id === selected.id); if (item) mutate(item); });
  const remove = () => {
    const key = selected.type === 'room' ? 'rooms' : selected.type === 'platform' ? 'platforms' : selected.type === 'opening' ? 'openings' : selected.type === 'wall' ? 'walls' : selected.type === 'dimension' ? 'dimensions' : selected.type === 'pileRow' ? 'pileRows' : selected.type === 'gap' ? 'wallGaps' : 'piles';
    commitPlan((next) => { next[key] = (next[key] || []).filter((item) => item.id !== selected.id); }); setSelected(null);
  };
  if (!selected) return <RoomList plan={plan} issues={issues} onSelect={setSelected} />;
  const room = selected.type === 'room' ? get('rooms') : null;
  const platform = selected.type === 'platform' ? get('platforms') : null;
  const opening = selected.type === 'opening' ? get('openings') : null;
  const pileRow = selected.type === 'pileRow' ? get('pileRows') : null;
  const wall = selected.type === 'wall' ? get('walls') : null;
  const dimension = selected.type === 'dimension' ? get('dimensions') : null;
  const gap = selected.type === 'gap' ? get('wallGaps') : null;
  const pile = selected.type === 'pile' ? get('piles') : null;
  if (room) {
    const bounds = boundsOf(roomPoints(room));
    const resize = (axis, value) => update('rooms', (item) => { const old = boundsOf(roomPoints(item)); const sx = axis === 'w' ? value / Math.max(.1, old.w) : 1; const sy = axis === 'h' ? value / Math.max(.1, old.h) : 1; item.points = roomPoints(item).map((point) => ({ x: roundCoord(old.x + (point.x - old.x) * sx), y: roundCoord(old.y + (point.y - old.y) * sy) })); Object.assign(item, boundsOf(item.points)); });
    return <div className="inspector-form"><h3>{room.name}</h3><Field label="Название"><input value={room.name} onChange={(event) => update('rooms', (item) => { item.name = event.target.value; })} /></Field><div className="form-grid"><NumberField label="Размер X" value={roundCoord(bounds.w)} suffix="м" min={.5} onChange={(value) => resize('w', value)} /><NumberField label="Размер Y" value={roundCoord(bounds.h)} suffix="м" min={.5} onChange={(value) => resize('h', value)} /></div><div className="readout"><span>Площадь помещения</span><strong>{formatNumber(polygonArea(roomPoints(room)))} м²</strong></div><Toggle label="Несущие перегородки" checked={room.bearing} onChange={(value) => update('rooms', (item) => { item.bearing = value; })} /><Toggle label="Учитывать в расчёте" checked={room.include !== false} onChange={(value) => update('rooms', (item) => { item.include = value; })} /><p className="inspector-note">Зелёные узлы меняют форму комнаты. Перетаскивание внутри комнаты двигает её целиком.</p><button className="button danger-button" onClick={remove}><Trash2 />Удалить комнату</button></div>;
  }
  if (platform) {
    const roof = calculateTerraceRoof(platform, plan.house);
    const change = (mutate) => update('platforms', (item) => { mutate(item); Object.assign(item, normalizeTerracePlatform(item)); });
    return <div className="inspector-form"><h3>{platform.kind === 'porch' ? 'Крыльцо' : 'Терраса'} · {formatNumber(platform.w * platform.h)} м²</h3><div className="form-grid"><NumberField label="Размер X" value={platform.w} suffix="м" min={.5} onChange={(value) => change((item) => { item.w = value; })} /><NumberField label="Размер Y" value={platform.h} suffix="м" min={.5} onChange={(value) => change((item) => { item.h = value; })} /><NumberField label="Ступени" value={platform.steps} suffix="шт" step={1} onChange={(value) => change((item) => { item.steps = Math.round(value); })} /><NumberField label="Ширина лестницы" value={platform.stairWidth || 1.2} suffix="м" onChange={(value) => change((item) => { item.stairWidth = value; })} /><NumberField label="Проступь" value={platform.tread || .3} suffix="м" onChange={(value) => change((item) => { item.tread = value; })} /><NumberField label="Высота ступени" value={platform.riser || .18} suffix="м" onChange={(value) => change((item) => { item.riser = value; })} /></div><SelectField label="Сторона лестницы" value={platform.stairSide || 'bottom'} onChange={(value) => change((item) => { item.stairSide = value; })} options={[{ value: 'top', label: 'Сверху' }, { value: 'right', label: 'Справа' }, { value: 'bottom', label: 'Снизу' }, { value: 'left', label: 'Слева' }]} /><SelectField label="Свайное поле" value={platform.foundation.mode} onChange={(value) => change((item) => { item.foundation.mode = value; })} options={[{ value: 'shared', label: 'Общее с домом' }, { value: 'separate', label: 'Отдельное' }, { value: 'none', label: 'Без свай' }]} /><SelectField label="Обвязка" value={platform.binding.mode} onChange={(value) => change((item) => { item.binding.mode = value; })} options={[{ value: 'shared', label: 'Общая с домом' }, { value: 'separate', label: 'Отдельная' }, { value: 'none', label: 'Не учитывать' }]} /><SelectField label="Кровля" value={platform.roof.mode} onChange={(value) => change((item) => { item.roof.mode = value; })} options={[{ value: 'none', label: 'Без кровли' }, { value: 'cold', label: 'Холодная' }, { value: 'warm', label: 'Тёплая СИП' }]} />{platform.roof.mode !== 'none' ? <><SelectField label="Форма кровли" value={platform.roof.shape} onChange={(value) => change((item) => { item.roof.shape = value; })} options={[{ value: 'shed', label: 'Односкатная' }, { value: 'continuation', label: 'Продолжение основной' }, { value: 'gable', label: 'Двускатная' }]} /><div className="form-grid"><NumberField label="Высота у стены" value={platform.roof.highHeight} suffix="м" onChange={(value) => change((item) => { item.roof.highHeight = value; })} /><NumberField label="Высота края" value={platform.roof.lowHeight} suffix="м" onChange={(value) => change((item) => { item.roof.lowHeight = value; })} /></div><div className="readout"><span>Площадь кровли</span><strong>{formatNumber(roof.netArea)} м²</strong></div></> : null}<button className="button danger-button" onClick={remove}><Trash2 />Удалить пристройку</button></div>;
  }
  if (opening) return <div className="inspector-form"><h3>{opening.type === 'window' ? 'Окно' : 'Дверь'}</h3><div className="form-grid"><NumberField label="Ширина" value={opening.width * 1000} suffix="мм" step={10} onChange={(value) => update('openings', (item) => { item.width = value / 1000; })} /><NumberField label="Высота" value={opening.height * 1000} suffix="мм" step={10} onChange={(value) => update('openings', (item) => { item.height = value / 1000; })} /></div>{opening.type === 'door' ? <><SelectField label="Тип" value={opening.doorType || (opening.outer ? 'entrance' : 'interior')} onChange={(value) => update('openings', (item) => { item.doorType = value; item.outer = value === 'entrance'; })} options={[{ value: 'entrance', label: 'Входная' }, { value: 'interior', label: 'Межкомнатная' }]} /><div className="form-grid"><SelectField label="Петли" value={opening.hinge || 'right'} onChange={(value) => update('openings', (item) => { item.hinge = value; })} options={[{ value: 'left', label: 'Слева' }, { value: 'right', label: 'Справа' }]} /><SelectField label="Открывание" value={opening.swing || 'in'} onChange={(value) => update('openings', (item) => { item.swing = value; })} options={[{ value: 'in', label: 'Внутрь' }, { value: 'out', label: 'Наружу' }]} /></div></> : null}<p className="inspector-note">Перетащите проём — он автоматически встанет на ближайшую стену.</p><button className="button danger-button" onClick={remove}><Trash2 />Удалить</button></div>;
  if (pileRow) return <div className="inspector-form"><h3>{pileRow.name}</h3><Field label="Название"><input value={pileRow.name} onChange={(event) => update('pileRows', (item) => { item.name = event.target.value; })} /></Field><NumberField label="Количество свай" value={pileRow.count} suffix="шт" min={2} max={60} step={1} onChange={(value) => update('pileRows', (item) => { item.count = Math.max(2, Math.round(value)); })} /><div className="readout"><span>Длина ряда</span><strong>{formatNumber(Math.hypot(pileRow.x2 - pileRow.x1, pileRow.y2 - pileRow.y1))} м</strong></div><p className="inspector-note">Перетаскивайте линию целиком или её зелёные концы.</p><button className="button danger-button" onClick={remove}><Trash2 />Удалить ряд</button></div>;
  if (wall || dimension) { const item = wall || dimension; return <div className="inspector-form"><h3>{wall ? 'Отдельная стена' : 'Размерная линия'}</h3><div className="readout"><span>Длина</span><strong>{formatNumber(Math.hypot(item.x2 - item.x1, item.y2 - item.y1))} м</strong></div><p className="inspector-note">Линию можно двигать целиком; зелёные концы изменяют длину и направление.</p><button className="button danger-button" onClick={remove}><Trash2 />Удалить</button></div>; }
  if (gap) return <div className="inspector-form"><h3>Разрыв стены</h3><NumberField label="Ширина разрыва" value={gap.width * 1000} suffix="мм" step={50} onChange={(value) => update('wallGaps', (item) => { item.width = value / 1000; })} /><p className="inspector-note">Разрыв можно перетащить на другую стену.</p><button className="button danger-button" onClick={remove}><Trash2 />Удалить разрыв</button></div>;
  if (pile) return <div className="inspector-form"><h3>Отдельная свая</h3><div className="form-grid"><NumberField label="X" value={pile.x} suffix="м" onChange={(value) => update('piles', (item) => { item.x = value; })} /><NumberField label="Y" value={pile.y} suffix="м" onChange={(value) => update('piles', (item) => { item.y = value; })} /></div><button className="button danger-button" onClick={remove}><Trash2 />Удалить сваю</button></div>;
  return <RoomList plan={plan} issues={issues} onSelect={setSelected} />;
}

export default function PlanScreen() {
  const { project, commit, undo, redo, canUndo, canRedo } = useProject();
  const [tool, setTool] = useState('select');
  const [selected, setSelected] = useState(null);
  const [polygonDraft, setPolygonDraft] = useState([]);
  const [customSketches, setCustomSketches] = useState(getStoredSketches);
  const [sketchId, setSketchId] = useState('photo-plan');
  const plan = project.plan;
  const commitPlan = useCallback((mutate) => commit((next) => { mutate(next.plan); return next; }), [commit]);
  const metrics = useMemo(() => calculatePlanMetrics(plan), [plan]);
  const foundation = useMemo(() => calculateFoundation(plan, project.settings.piles), [plan, project.settings.piles]);
  const issues = useMemo(() => planIssues(plan), [plan]);
  const sketches = useMemo(() => [
    { id: 'photo-plan', name: 'План с фото', plan: createDefaultPlan() },
    { id: 'compact', name: 'Компактный · 10 × 7 м', plan: createCompactPlan() },
    { id: 'empty', name: 'Новый чистый план', plan: createEmptyPlan() }, ...customSketches
  ], [customSketches]);
  const selectTool = (id) => { setTool(id); if (id !== 'polygon') setPolygonDraft([]); };
  const finishPolygon = () => {
    if (polygonDraft.length < 3 || polygonArea(polygonDraft) < .25) return;
    const id = uid('room'); commitPlan((next) => next.rooms.push(withRoomBounds({ id, name: `Комната ${next.rooms.length + 1}`, points: polygonDraft, include: true, bearing: false })));
    setPolygonDraft([]); setSelected({ type: 'room', id }); setTool('select');
  };
  const loadSketch = () => {
    const sketch = sketches.find((item) => item.id === sketchId); if (!sketch) return;
    if (!window.confirm(`Загрузить «${sketch.name}»? Текущий план можно вернуть кнопкой «Отменить».`)) return;
    commit((next) => { next.plan = structuredClone(sketch.plan); return next; }); setSelected(null); setTool('select'); setPolygonDraft([]);
  };
  const saveSketch = () => {
    const name = window.prompt('Название эскиза:', `Эскиз ${customSketches.length + 1}`)?.trim(); if (!name) return;
    const updated = [{ id: uid('sketch'), name, plan: structuredClone(plan) }, ...customSketches].slice(0, 20);
    localStorage.setItem(SKETCHES_KEY, JSON.stringify(updated)); setCustomSketches(updated);
  };
  useEffect(() => {
    const keydown = (event) => {
      if (event.key === 'Escape') { setPolygonDraft([]); setTool('select'); setSelected(null); }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        const key = selected.type === 'room' ? 'rooms' : selected.type === 'platform' ? 'platforms' : selected.type === 'opening' ? 'openings' : selected.type === 'wall' ? 'walls' : selected.type === 'dimension' ? 'dimensions' : selected.type === 'pileRow' ? 'pileRows' : selected.type === 'gap' ? 'wallGaps' : 'piles';
        commitPlan((next) => { next[key] = (next[key] || []).filter((item) => item.id !== selected.id); }); setSelected(null);
      }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [selected, commitPlan]);
  const toolHint = tool === 'select' ? 'Выберите и перетащите объект. Зелёные точки меняют его форму.' : tool === 'polygon' ? 'Щёлкайте по узлам комнаты и нажмите «Готово».' : ['window', 'door', 'gap', 'pile'].includes(tool) ? 'Щёлкните место установки. Проёмы прилипнут к ближайшей стене.' : 'Зажмите кнопку мыши и протяните объект.';
  return <div className="screen plan-screen-v2"><ScreenHeader title="План дома" description="Новый редактор: каждое действие можно выбрать, изменить, удалить и отменить" actions={<><select className="sketch-select" value={sketchId} onChange={(event) => setSketchId(event.target.value)}>{sketches.map((sketch) => <option key={sketch.id} value={sketch.id}>{sketch.name}</option>)}</select><button className="button secondary" onClick={loadSketch}>Загрузить</button><button className="button secondary" onClick={saveSketch}><Save />В эскизы</button><button className="button ghost" onClick={undo} disabled={!canUndo}><Undo2 />Отменить</button><button className="button ghost" onClick={redo} disabled={!canRedo}><Redo2 />Повторить</button></>} />
    <div className="plan-status-bar"><div className="plan-house-fields"><NumberField label="Габарит X" value={plan.house.w} suffix="м" min={3} onChange={(value) => commitPlan((next) => { next.house.w = value; })} /><NumberField label="Габарит Y" value={plan.house.h} suffix="м" min={3} onChange={(value) => commitPlan((next) => { next.house.h = value; })} /><NumberField label="Высота стен" value={plan.wallHeight} suffix="м" min={2} onChange={(value) => commitPlan((next) => { next.wallHeight = value; })} /></div><div className="plan-view-switches"><Toggle label="Сваи" checked={plan.showPiles !== false} onChange={(value) => commitPlan((next) => { next.showPiles = value; })} /><Toggle label="Обвязка" checked={plan.showBinding !== false} onChange={(value) => commitPlan((next) => { next.showBinding = value; })} /><Toggle label="Размеры" checked={plan.showDimensions !== false} onChange={(value) => commitPlan((next) => { next.showDimensions = value; })} /></div><div className="zoom-controls"><button className="icon-button" onClick={() => commitPlan((next) => { next.zoom = Math.max(65, (next.zoom || 100) - 10); })}><ZoomOut /></button><strong>{plan.zoom || 100}%</strong><button className="icon-button" onClick={() => commitPlan((next) => { next.zoom = Math.min(180, (next.zoom || 100) + 10); })}><ZoomIn /></button></div></div>
    <div className="planner-shell"><aside className="planner-tools">{TOOLS.map(([id, label, Icon]) => <button key={id} className={tool === id ? 'active' : ''} title={label} onClick={() => selectTool(id)}><Icon /><span>{label}</span></button>)}{tool === 'polygon' && polygonDraft.length ? <div className="polygon-actions"><button className="active" onClick={finishPolygon} disabled={polygonDraft.length < 3}><Save /><span>Готово</span></button><button onClick={() => setPolygonDraft([])}><X /><span>Сброс</span></button></div> : null}</aside><div className="planner-canvas"><PlanCanvas plan={plan} tool={tool} selected={selected} setSelected={setSelected} commitPlan={commitPlan} polygonDraft={polygonDraft} setPolygonDraft={setPolygonDraft} issues={issues} /><div className="planner-hint">{toolHint}</div></div><aside className="planner-inspector"><Inspector plan={plan} selected={selected} setSelected={setSelected} commitPlan={commitPlan} issues={issues} /></aside></div>
    <div className="stats-row planner-stats"><Stat label="Площадь помещений" value={`${formatNumber(metrics.roomArea)} м²`} /><Stat label="Перегородки без задвоений" value={`${formatNumber(metrics.partitionLength)} м`} /><Stat label="Наружные стены" value={`${formatNumber(metrics.exteriorWallNetArea)} м²`} /><Stat label="Сваи" value={`${foundation.totalPiles} шт`} /><Stat label="Обвязка" value={`${formatNumber(foundation.bindingLength)} м`} /><Stat label="Проверка" value={issues.length ? `${issues.length} ошибок` : 'Стыковка верна'} tone={issues.length ? 'danger' : ''} /></div>
  </div>;
}
