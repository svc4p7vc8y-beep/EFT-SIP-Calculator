import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Plus, RotateCw, Route, Trash2, Undo2, Redo2, X, Ruler, Search, Printer, ZoomIn, ZoomOut, Maximize2, Minimize2, LayoutGrid, BedDouble, CookingPot, Bath, Boxes, Refrigerator, WashingMachine, Heater, PlugZap, Lightbulb, House, CircuitBoard, Droplets, Wrench } from 'lucide-react';
import { createPortal } from 'react-dom';
import PlacementWorkerSheets from './PlacementWorkerSheets.jsx';
import { useProject } from '../state/ProjectContext.jsx';
import { boundsOf, houseContourPoints, roomPoints } from '../planner/geometry.js';
import { applianceSupplyKind, createPlacement, findPlacementPreset, PLACEMENT_GROUPS, PLACEMENT_LAYERS, PLACEMENT_PRESETS, placementSummary } from '../state/placement-model.js';
import { dimensionMetres, pointInPolygon, snapToFacade } from '../state/placement-geometry.js';
import { CatalogSymbol, PlacementSymbol } from './PlacementClassicSymbol.jsx';
import PlacementWallDimensions from './PlacementWallDimensions.jsx';
import PlacementWalls from './PlacementWalls.jsx';
import PlacementNetworkPanel from './PlacementNetworkPanel.jsx';
import PlacementWallElevation from './PlacementWallElevation.jsx';
import { placementWallFaces, projectToWallFace, snapPlacementToWall, wallFacePoint } from '../state/placement-walls.js';
import { ELECTRICAL_CABLE_CHOICES, breakerDescription, electricalBill, electricalRouteLength3d, proposeElectricalCircuitRoutes, resolvedElectricalRoutes, routeLength } from '../state/placement-electrical.js';
import { NETWORK_SYSTEMS, isNetworkLayer, networkLength3d, resolvedNetworkRoutes } from '../state/placement-networks.js';
import './placement.css';

const createId = () => globalThis.crypto?.randomUUID?.() || `place-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const round = value => Math.round(value * 100) / 100;
const pathData = points => points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ') + ' Z';
const routeData = points => points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ');
const valueOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const measureText = value => `${Number(value).toFixed(2)} м`;
const groupIcons = { living: BedDouble, kitchen: CookingPot, bathroom: Bath, storage: Boxes, 'kitchen-appliances': Refrigerator, laundry: WashingMachine, climate: Heater, engineering: Wrench, 'electric-points': PlugZap, lighting: Lightbulb, facade: House, 'electrical-panel': CircuitBoard, 'water-sources': Droplets, 'water-points': Droplets, 'heat-sources': Heater, 'heat-points': Heater, 'sewer-risers': Wrench, 'sewer-points': Wrench, 'air-units': Wrench, 'air-points': Wrench };
const networkColors = { plumbing: '#2979aa', heating: '#bf6134', sewer: '#72579a', ventilation: '#3d9481' };
const clampZoom = value => Math.max(35, Math.min(2000, Math.round(value)));
const gridPoint = point => ({ x: Math.round(point.x * 4) / 4, y: Math.round(point.y * 4) / 4 });

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
  const [visible, setVisible] = useState({ furniture: true, appliance: true, equipment: true, electric: true, plumbing: true, heating: true, sewer: true, ventilation: true });
  const [presetId, setPresetId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedCircuitId, setSelectedCircuitId] = useState(null);
  const [drawingRoute, setDrawingRoute] = useState(false);
  const [routePoints, setRoutePoints] = useState([]);
  const [routeStartId, setRouteStartId] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [routeCursor, setRouteCursor] = useState(null);
  const [routeNotice, setRouteNotice] = useState('');
  const [customCableCircuitId, setCustomCableCircuitId] = useState(null);
  const [networkFromId, setNetworkFromId] = useState('');
  const [networkToId, setNetworkToId] = useState('');
  const [networkMedium, setNetworkMedium] = useState('cold');
  const [networkDrawing, setNetworkDrawing] = useState(false);
  const [networkPoints, setNetworkPoints] = useState([]);
  const [selectedNetworkRouteId, setSelectedNetworkRouteId] = useState(null);
  const [selectedWallRef, setSelectedWallRef] = useState('');
  const [drawingDimension, setDrawingDimension] = useState(false);
  const [dimensionStart, setDimensionStart] = useState(null);
  const [dragPosition, setDragPosition] = useState(null);
  const [dragLabel, setDragLabel] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenPanel, setFullscreenPanel] = useState('library');
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const touchPointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const suppressClickRef = useRef(false);
  const plan = activeFloor === 1 ? project.plan : project.upperFloors?.[activeFloor - 2] || project.plan;
  const contour = useMemo(() => houseContourPoints(plan), [plan]);
  const rooms = useMemo(() => (plan.rooms || []).filter(room => room.include !== false), [plan]);
  const platformPoints = (plan.platforms || []).filter(platform => platform.include !== false).flatMap(platform => [{ x: platform.x, y: platform.y }, { x: platform.x + platform.w, y: platform.y + platform.h }]);
  const drawingBounds = useMemo(() => boundsOf([...contour, ...rooms.flatMap(roomPoints), ...platformPoints]), [contour, rooms, plan.platforms]);
  const margin = Math.max(145, 70 + (placement.items || []).filter(item => item.floor === activeFloor && item.layer === 'electric').length * 23);
  const baseWidth = Math.max(5, drawingBounds.w) * 100 + margin * 2;
  const baseHeight = Math.max(5, drawingBounds.h) * 100 + margin * 2;
  const viewWidth = baseWidth * 100 / zoom, viewHeight = baseHeight * 100 / zoom;
  const viewBox = `${drawingBounds.x * 100 - margin + (baseWidth - viewWidth) / 2 + pan.x} ${drawingBounds.y * 100 - margin + (baseHeight - viewHeight) / 2 + pan.y} ${viewWidth} ${viewHeight}`;
  const items = useMemo(() => placement.items.filter(item => item.floor === activeFloor), [placement.items, activeFloor]);
  const routes = useMemo(() => resolvedElectricalRoutes(placement, activeFloor, plan), [placement, activeFloor, plan]);
  const wallFaces = useMemo(() => placementWallFaces(plan), [plan]);
  const selectedWall = wallFaces.find(face => face.ref === selectedWallRef);
  const networkRoutes = useMemo(() => Object.keys(NETWORK_SYSTEMS).flatMap(system => resolvedNetworkRoutes(placement, system, activeFloor).map(route => ({ ...route, system }))), [placement, activeFloor]);
  const electricBill = useMemo(() => electricalBill(placement, activeFloor, plan), [placement, activeFloor, plan]);
  const dimensions = useMemo(() => (placement.dimensions || []).filter(item => item.floor === activeFloor), [placement.dimensions, activeFloor]);
  const selected = items.find(item => item.id === selectedId);
  const itemWall = selected?.wallRef ? wallFaces.find(face => face.ref === selected.wallRef) : null;
  const selectedCircuit = placement.circuits.find(item => item.id === selectedCircuitId);
  const customCable = selectedCircuit && (customCableCircuitId === selectedCircuit.id || Boolean(selectedCircuit.cable && !ELECTRICAL_CABLE_CHOICES.includes(selectedCircuit.cable)));
  const selectedRoute = routes.find(route => route.id === selectedRouteId);
  const activePreset = findPlacementPreset(presetId);
  const summary = placementSummary(placement, activeFloor);
  const groups = PLACEMENT_GROUPS.filter(group => group.layer === layer);
  const searchTerm = query.trim().toLocaleLowerCase('ru');
  const catalogItems = PLACEMENT_PRESETS.filter(item => searchTerm
    ? item.label.toLocaleLowerCase('ru').includes(searchTerm)
    : item.layer === layer && (category === 'all' || item.group === category));

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = event => { event.preventDefault(); setZoom(current => clampZoom(current * (event.deltaY < 0 ? 1.12 : 1 / 1.12))); };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  const change = update => commit(next => {
    if (!next.placement) next.placement = createPlacement();
    update(next.placement);
    return next;
  });
  const rebuildAutoRoutes = (data, circuitId, targetFloor = activeFloor) => {
    if (!circuitId) return;
    const panel = data.items.find(item => item.floor === targetFloor && item.kind === 'panel');
    if (!panel) return;
    data.routes = data.routes.filter(route => !(route.floor === targetFloor && route.circuitId === circuitId && route.auto));
    const manualTargets = new Set(data.routes.filter(route => route.floor === targetFloor && route.circuitId === circuitId && !route.auto).map(route => route.targetItemId).filter(Boolean));
    const routePlan = targetFloor === 1 ? project.plan : project.upperFloors?.[targetFloor - 2] || project.plan;
    data.routes.push(...proposeElectricalCircuitRoutes(data.items, targetFloor, circuitId, panel.id, createId, routePlan).filter(route => !manualTargets.has(route.targetItemId)));
  };
  const updateItem = patch => {
    if (!selected) return;
    change(data => { const item = data.items.find(candidate => candidate.id === selected.id); if (item) {
      const priorCircuit = item.circuitId;
      Object.assign(item, patch, Object.hasOwn(patch, 'height') ? { heightKnown: true } : {});
      if (item.kind === 'two-way-switch' && Object.hasOwn(patch, 'controlsItemId')) {
        const pair = data.items.find(entry => entry.id === item.pairedSwitchId && entry.pairedSwitchId === item.id);
        if (pair) pair.controlsItemId = item.controlsItemId;
      }
      if (Object.hasOwn(patch, 'x') || Object.hasOwn(patch, 'y')) {
        const linked = data.items.find(entry => entry.id === item.supplyItemId && entry.followsAppliance);
        if (linked) Object.assign(linked, { x: round(linked.x + item.x - selected.x), y: round(linked.y + item.y - selected.y) });
        if (item.linkedApplianceId) item.followsAppliance = false;
      }
      if ((Object.hasOwn(patch, 'x') || Object.hasOwn(patch, 'y')) && item.surface !== 'facade' && !Object.hasOwn(patch, 'wallRef')) {
        const near = wallFaces.map(face => ({ face, distance: projectToWallFace(face, item)?.distance ?? Infinity })).sort((a, b) => a.distance - b.distance)[0];
        item.wallRef = near?.distance < .35 ? near.face.ref : '';
      }
      if (['circuitId', 'controlsItemId', 'junctionItemId', 'pairedSwitchId'].some(key => Object.hasOwn(patch, key))) {
        rebuildAutoRoutes(data, priorCircuit); if (item.circuitId !== priorCircuit) rebuildAutoRoutes(data, item.circuitId);
      }
    } });
  };
  const facadePosition = position => {
    const snapped = snapToFacade(position, contour);
    return snapped ? { x: snapped.x, y: snapped.y, anchorX: snapped.anchorX, anchorY: snapped.anchorY } : position;
  };
  const itemPosition = (position, item) => item.surface === 'facade' ? facadePosition(position) : snapPlacementToWall(plan, position, item);
  const pointFromEvent = event => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: round(point.x / 100), y: round(point.y / 100) };
  };
  const insidePlan = point => point && (pointInPolygon(point, contour) || rooms.some(room => pointInPolygon(point, roomPoints(room))) || (plan.platforms || []).some(platform => platform.include !== false && point.x >= platform.x && point.x <= platform.x + platform.w && point.y >= platform.y && point.y <= platform.y + platform.h));
  const addPlacementItem = (preset, location, height = preset.height || 0, wallRef = '') => {
    const id = createId();
    const supplyKind = applianceSupplyKind(preset);
    change(data => {
      data.items.push({
      id, floor: activeFloor, layer: preset.layer, kind: preset.id, label: preset.label,
      x: location.x, y: location.y, width: preset.width, depth: preset.depth,
      rotation: 0, height, heightKnown: wallRef !== '' || Boolean(preset.height), wallRef,
      surface: preset.surface || 'interior', dimensionSide: 'auto', showHeight: false, showName: false,
      labelOffsetX: .65, labelOffsetY: -.45,
      ...(preset.surface === 'facade' ? { anchorX: location.anchorX, anchorY: location.anchorY } : {}),
      circuitId: preset.layer === 'electric' && preset.id !== 'panel' ? selectedCircuitId || '' : '',
      ...(supplyKind ? { supplyItemId: `supply-${id}` } : {}),
      });
      if (supplyKind) {
        const pointPreset = findPlacementPreset(supplyKind);
        const pointLocation = snapPlacementToWall(plan, { x: location.x + .5, y: location.y + .5 }, pointPreset);
        const closestWall = wallFaces.map(face => ({ face, distance: projectToWallFace(face, pointLocation)?.distance ?? Infinity })).sort((a, b) => a.distance - b.distance)[0];
        data.items.push({ id: `supply-${id}`, floor: activeFloor, layer: 'electric', kind: supplyKind,
          label: `${supplyKind === 'power' ? 'Силовая точка' : 'Розетка'} · ${preset.label}`, x: pointLocation.x, y: pointLocation.y,
          width: pointPreset.width, depth: pointPreset.depth, rotation: 0, height: pointPreset.height || .3,
          heightKnown: true, wallRef: closestWall?.distance < .35 ? closestWall.face.ref : '', surface: 'interior', dimensionSide: 'auto', showHeight: false, showName: false,
          labelOffsetX: .65, labelOffsetY: -.45, circuitId: selectedCircuitId || '', linkedApplianceId: id, followsAppliance: true });
      }
      if (preset.id === 'panel') data.circuits.forEach(circuit => rebuildAutoRoutes(data, circuit.id));
      else if (preset.layer === 'electric' || supplyKind) rebuildAutoRoutes(data, selectedCircuitId);
    });
    if (supplyKind) setVisible(current => ({ ...current, electric: true }));
    setSelectedId(id);
    setPresetId(null);
    if (isNetworkLayer(preset.layer)) setCategory('all');
  };
  const onWallPosition = (station, height) => {
    if (!selectedWall) return;
    const facePoint = wallFacePoint(selectedWall, station);
    if (networkDrawing) { setNetworkPoints(current => [...current, { ...facePoint, z: round(height) }]); return; }
    if (!activePreset || activePreset.surface === 'facade') return;
    const normal = selectedWall.normal;
    const half = (Math.abs(normal.x) * activePreset.width + Math.abs(normal.y) * activePreset.depth) / 2;
    addPlacementItem(activePreset, { x: round(facePoint.x + normal.x * half), y: round(facePoint.y + normal.y * half) }, round(height), selectedWall.ref);
  };
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
    if (drawingRoute) { if (routeStartId) setRoutePoints(current => [...current, { ...gridPoint(point), z: Number(items.find(item => item.id === routeStartId)?.height) || 0 }]); return; }
    if (networkDrawing) { if (insidePlan(point)) setNetworkPoints(current => [...current, { ...point, z: Number(items.find(item => item.id === networkFromId)?.height) || 0 }]); return; }
    if (!activePreset) { setSelectedId(null); setSelectedRouteId(null); setSelectedNetworkRouteId(null); setSelectedWallRef(''); return; }
    const location = activePreset.surface === 'facade' ? snapToFacade(point, contour) : insidePlan(point) ? itemPosition(point, activePreset) : null;
    if (!location || (activePreset.surface === 'facade' && location.distance > 1.5)) { setPresetId(null); setSelectedWallRef(''); return; }
    const nearestFace = wallFaces.map(face => ({ face, projection: projectToWallFace(face, location) })).sort((a, b) => a.projection.distance - b.projection.distance)[0];
    addPlacementItem(activePreset, location, activePreset.height || 0, nearestFace?.projection.distance < .35 ? nearestFace.face.ref : '');
  };
  const addNetworkRoute = (auto, pair = false) => {
    if (!isNetworkLayer(layer) || !networkFromId || !networkToId || networkFromId === networkToId) return;
    const from = items.find(item => item.id === networkFromId), to = items.find(item => item.id === networkToId);
    if (!from || !to) return;
    const id = createId();
    const sharedWall = from.wallRef && from.wallRef === to.wallRef ? from.wallRef : '';
    const directions = pair && layer === 'heating' ? [{ source: from, target: to, medium: 'supply', id }, { source: to, target: from, medium: 'return', id: createId() }] : [{ source: from, target: to, medium: NETWORK_SYSTEMS[layer].media.some(entry => entry.id === networkMedium) ? networkMedium : NETWORK_SYSTEMS[layer].media[0].id, id }];
    const pending = directions.filter(entry => !(placement.networks[layer] || []).some(route => route.floor === activeFloor && route.fromId === entry.source.id && route.toId === entry.target.id && route.medium === entry.medium));
    if (!pending.length) { setSelectedNetworkRouteId(placement.networks[layer].find(route => route.floor === activeFloor && route.fromId === from.id && route.toId === to.id)?.id || null); setNetworkDrawing(false); setNetworkPoints([]); return; }
    change(data => pending.forEach(entry => data.networks[layer].push({
      id: entry.id, floor: activeFloor, medium: entry.medium,
      fromId: entry.source.id, toId: entry.target.id, auto, plane: sharedWall ? 'wall' : 'service', wallRef: sharedWall,
      routeLevel: null, diameterMm: null, material: '', slopePermille: null, flowM3h: null, note: '', accessories: [],
      points: [{ x: entry.source.x, y: entry.source.y, z: entry.source.height || 0 }, ...networkPoints, { x: entry.target.x, y: entry.target.y, z: entry.target.height || 0 }],
    })));
    setSelectedNetworkRouteId(pending[0].id);
    setNetworkDrawing(false);
    setNetworkPoints([]);
  };
  const updateNetworkRoute = (id, patch) => change(data => { const route = data.networks[layer]?.find(entry => entry.id === id); if (route) Object.assign(route, patch); });
  const addCircuit = () => {
    const id = createId();
    change(data => data.circuits.push({ id, name: `Группа ${data.circuits.length + 1}`, cable: '', breaker: '', breakerAmps: null, note: '', accessories: [] }));
    setSelectedCircuitId(id);
    setLayer('electric');
  };
  const updateCircuit = patch => change(data => { const circuit = data.circuits.find(item => item.id === selectedCircuitId); if (circuit) Object.assign(circuit, patch); });
  const assignCircuit = (itemId, circuitId) => change(data => {
    const item = data.items.find(entry => entry.id === itemId);
    if (!item || item.kind === 'panel') return;
    const previous = item.circuitId;
    item.circuitId = circuitId;
    rebuildAutoRoutes(data, previous);
    rebuildAutoRoutes(data, circuitId);
  });
  const finishRoute = target => {
    const panel = items.find(item => item.kind === 'panel');
    const source = items.find(item => item.id === routeStartId);
    const circuitId = selectedCircuitId || source?.circuitId || target?.circuitId;
    if (!source || !target || source.id === target.id || !circuitId) { setRouteNotice('Выберите две разные электроточки и группу.'); return; }
    if ([source, target].some(item => item.kind !== 'panel' && item.circuitId && item.circuitId !== circuitId)) { setRouteNotice('Точки относятся к разным группам. Сначала измените назначение группы.'); return; }
    if (source && target && source.id !== target.id && circuitId) {
      const points = [...routePoints, { x: target.x, y: target.y, z: Number(target.height) || 0 }];
      change(data => {
        for (const node of [source, target]) { const current = data.items.find(item => item.id === node.id); if (current && current.kind !== 'panel' && !current.circuitId) current.circuitId = circuitId; }
        data.routes.push({ id: createId(), floor: activeFloor, circuitId,
          panelItemId: panel?.id || '', fromItemId: source.id, targetItemId: target.id, auto: false,
          purpose: 'manual', points }); rebuildAutoRoutes(data, circuitId);
      });
      setRouteNotice('Трасса соединена с точками и сохранена.');
    }
    setRoutePoints([]);
    setRouteStartId('');
    setRouteCursor(null);
    setDrawingRoute(false);
  };
  const chooseRouteNode = item => {
    if (item.layer !== 'electric') { setRouteNotice('Для электрической трассы выберите электроточку.'); return; }
    if (!routeStartId) {
      if (item.circuitId && selectedCircuitId && item.circuitId !== selectedCircuitId) { setRouteNotice('Эта точка назначена другой группе.'); return; }
      if (!selectedCircuitId && !item.circuitId) { setRouteNotice('Сначала выберите группу щита.'); return; }
      if (!selectedCircuitId) setSelectedCircuitId(item.circuitId);
      setRouteNotice('');
      setRouteStartId(item.id);
      setRoutePoints([{ x: item.x, y: item.y, z: Number(item.height) || 0 }]);
      return;
    }
    if (item.id !== routeStartId) finishRoute(item);
  };
  const updateRoute = (id, patch) => change(data => { const route = data.routes.find(entry => entry.id === id); if (route) Object.assign(route, patch); });
  const updateRoutePoint = (id, index, point) => change(data => { const route = data.routes.find(entry => entry.id === id); const resolved = routes.find(entry => entry.id === id); if (route && resolved && index > 0 && index < resolved.points.length - 1) {
    if (route.auto) route.points = resolved.points.map(entry => ({ ...entry }));
    route.auto = false; route.points[index] = { ...route.points[index], ...gridPoint(point) };
  } });
  const addRouteWaypoint = route => {
    if (!route || route.points.length < 2) return;
    const before = route.points[route.points.length - 2], after = route.points.at(-1);
    change(data => { const target = data.routes.find(entry => entry.id === route.id); if (target) {
      target.auto = false; target.points = route.points.map(point => ({ ...point }));
      target.points.splice(target.points.length - 1, 0, gridPoint({ x: (before.x + after.x) / 2, y: (before.y + after.y) / 2 }));
    } });
  };
  const autoRouteCircuit = () => {
    const panel = items.find(item => item.kind === 'panel');
    if (!panel || !selectedCircuitId) return;
    change(data => rebuildAutoRoutes(data, selectedCircuitId));
  };
  const beginDrag = (event, item) => {
    if (drawingRoute || drawingDimension || networkDrawing) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = { id: item.id, pointerId: event.pointerId, start: point, origin: { x: item.x, y: item.y }, last: { x: item.x, y: item.y }, surface: item.surface };
    setSelectedId(item.id);
    setPresetId(null);
  };
  const beginLabelDrag = (event, item) => {
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault(); event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    const origin = { x: item.x + (item.labelOffsetX ?? .65), y: item.y + (item.labelOffsetY ?? -.45) };
    dragRef.current = { id: item.id, pointerId: event.pointerId, start: point, origin, last: origin, label: true };
    setSelectedId(item.id);
  };
  const moveDrag = event => {
    if (drawingRoute) {
      const position = pointFromEvent(event);
      if (position) setRouteCursor(gridPoint(position));
    }
    if (event.pointerType === 'touch' && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchRef.current && touchPointersRef.current.size === 2) {
        const [first, second] = [...touchPointersRef.current.values()];
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        setZoom(clampZoom(pinchRef.current.zoom * distance / pinchRef.current.distance));
        return;
      }
    }
    if (panRef.current?.pointerId === event.pointerId) {
      const origin = panRef.current;
      const bounds = svgRef.current.getBoundingClientRect();
      setPan({ x: origin.pan.x - (event.clientX - origin.clientX) * origin.width / bounds.width, y: origin.pan.y - (event.clientY - origin.clientY) * origin.height / bounds.height });
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    if (!point) return;
    if (drag.routeId) { drag.last = gridPoint(point); setDragPosition({ routeId: drag.routeId, index: drag.index, ...drag.last }); return; }
    const proposed = { x: round(drag.origin.x + point.x - drag.start.x), y: round(drag.origin.y + point.y - drag.start.y) };
    if (drag.label) { drag.last = proposed; setDragLabel({ id: drag.id, x: proposed.x, y: proposed.y }); return; }
    const item = items.find(entry => entry.id === drag.id);
    const location = drag.surface === 'facade' ? snapToFacade(proposed, contour) : insidePlan(proposed) && item ? itemPosition(proposed, item) : null;
    if (!location) return;
    drag.last = location;
    setDragPosition({ id: drag.id, ...location });
  };
  const endDrag = event => {
    if (touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.delete(event.pointerId);
      pinchRef.current = null;
      panRef.current = null;
      if (touchPointersRef.current.size === 1) {
        const [pointerId, position] = [...touchPointersRef.current.entries()][0];
        panRef.current = { pointerId, clientX: position.x, clientY: position.y, pan, width: viewWidth, height: viewHeight };
      }
      if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      return;
    }
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
    const moved = drag.last.x !== drag.origin.x || drag.last.y !== drag.origin.y;
    if (moved && event.type !== 'pointercancel') {
      const location = drag.last;
      if (drag.routeId) updateRoutePoint(drag.routeId, drag.index, location);
      else
      change(data => { const target = data.items.find(item => item.id === drag.id); if (target) {
        const dx = location.x - target.x, dy = location.y - target.y;
        Object.assign(target, drag.label ? { labelOffsetX: round(location.x - target.x), labelOffsetY: round(location.y - target.y) } : { x: location.x, y: location.y, ...(drag.surface === 'facade' ? { anchorX: location.anchorX, anchorY: location.anchorY } : {}) });
        if (!drag.label && target.supplyItemId) {
          const supply = data.items.find(item => item.id === target.supplyItemId && item.followsAppliance);
          if (supply) Object.assign(supply, { x: round(supply.x + dx), y: round(supply.y + dy) });
        }
        if (!drag.label && target.linkedApplianceId) target.followsAppliance = false;
        if (!drag.label && drag.surface !== 'facade') {
          const near = wallFaces.map(face => ({ face, distance: projectToWallFace(face, target)?.distance ?? Infinity })).sort((a, b) => a.distance - b.distance)[0];
          target.wallRef = near?.distance < .35 ? near.face.ref : '';
        }
      } });
    }
    // Pointer capture retargets click to the root SVG, which would clear the selection.
    suppressClickRef.current = event.type !== 'pointercancel';
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    dragRef.current = null;
    setDragPosition(null);
    setDragLabel(null);
  };
  const changeLayer = nextLayer => {
    setLayer(nextLayer); setCategory('all'); setQuery(''); setPresetId(null);
    setDrawingRoute(false); setRoutePoints([]); setRouteStartId(''); setRouteCursor(null); setRouteNotice(''); setSelectedRouteId(null); setDrawingDimension(false); setDimensionStart(null);
    setNetworkDrawing(false); setNetworkPoints([]); setNetworkFromId(''); setNetworkToId(''); setSelectedNetworkRouteId(null);
    if (isNetworkLayer(nextLayer)) setNetworkMedium(NETWORK_SYSTEMS[nextLayer].media[0].id);
  };
  const beginPan = event => {
    const touch = event.pointerType === 'touch' && !activePreset && !drawingDimension && !drawingRoute && !networkDrawing;
    if (!touch && event.button !== 1 && !event.shiftKey) return;
    event.preventDefault();
    svgRef.current?.setPointerCapture(event.pointerId);
    if (touch) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointersRef.current.size === 2) {
        const [first, second] = [...touchPointersRef.current.values()];
        pinchRef.current = { zoom, distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)) };
        panRef.current = null;
        return;
      }
    }
    panRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, pan, width: viewWidth, height: viewHeight };
  };
  const resetView = () => { setZoom(100); setPan({ x: 0, y: 0 }); };

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

  const deleteSelection = () => {
    if (selectedRouteId) {
      change(data => { data.routes = data.routes.filter(route => route.id !== selectedRouteId); });
      setSelectedRouteId(null);
      return;
    }
    if (!selected) return;
    change(data => {
      data.items = data.items.filter(item => item.id !== selected.id && item.id !== selected.supplyItemId);
      data.routes = data.routes.filter(route => ![selected.id, selected.supplyItemId].includes(route.targetItemId) && ![selected.id, selected.supplyItemId].includes(route.panelItemId) && ![selected.id, selected.supplyItemId].includes(route.fromItemId));
      Object.keys(NETWORK_SYSTEMS).forEach(system => { data.networks[system] = data.networks[system].filter(route => route.fromId !== selected.id && route.toId !== selected.id); });
      data.items.forEach(item => { if (item.controlsItemId === selected.id) item.controlsItemId = ''; if (item.junctionItemId === selected.id) item.junctionItemId = ''; if (item.pairedSwitchId === selected.id) item.pairedSwitchId = ''; if (item.supplyItemId === selected.id) item.supplyItemId = ''; });
    });
    setSelectedId(null);
  };

  useEffect(() => {
    const onKeyDown = event => {
      const editing = event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (editing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); if (event.shiftKey) redo(); else undo(); return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && (selected || selectedRouteId)) { event.preventDefault(); deleteSelection(); return; }
      const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (selected && steps[event.key] && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        const step = event.shiftKey ? .25 : .05, [dx, dy] = steps[event.key];
        const proposed = { x: round(selected.x + dx * step), y: round(selected.y + dy * step) };
        const position = selected.surface === 'facade' ? facadePosition(proposed) : itemPosition(proposed, selected);
        updateItem(position);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return <main className={`placement-screen${fullscreen ? ` placement-fullscreen placement-fullscreen-${fullscreenPanel || 'canvas'}` : ''}`}>
    <header className="placement-heading"><div><span className="placement-eyebrow">План проекта · размещение</span><h1>Мебель и инженерия</h1><p>Расставляйте оборудование и точки сетей на плане или развёртке стены. Вода, отопление, канализация и вентиляция имеют отдельные маршруты и ведомости.</p></div><div className="placement-heading-actions"><button className="placement-fullscreen-exit" title="Свернуть полноэкранный план" onClick={() => setFullscreen(false)}><Minimize2 size={16}/> Свернуть</button><div className="placement-fullscreen-panel-tools" role="group" aria-label="Панели полноэкранного плана"><button className={fullscreenPanel === 'library' ? 'active' : ''} aria-pressed={fullscreenPanel === 'library'} onClick={() => setFullscreenPanel(current => current === 'library' ? null : 'library')}><Boxes size={16}/> Библиотека</button><button className={fullscreenPanel === 'properties' ? 'active' : ''} aria-pressed={fullscreenPanel === 'properties'} onClick={() => setFullscreenPanel(current => current === 'properties' ? null : 'properties')}><Wrench size={16}/> Свойства</button></div><button onClick={printWorkerSheets} title="Комплект планов и ведомостей для печати или PDF"><Printer size={17}/> Планы для рабочих / PDF</button><button onClick={undo} disabled={!canUndo} title="Отменить"><Undo2 size={17}/> Отменить</button><button onClick={redo} disabled={!canRedo} title="Повторить"><Redo2 size={17}/> Повторить</button></div></header>
    <div className="placement-toolbar">
      <div className="placement-floor-tabs" aria-label="Этаж">{Array.from({ length: floorCount }, (_, index) => <button key={index} className={activeFloor === index + 1 ? 'active' : ''} onClick={() => { setFloor(index + 1); setSelectedId(null); setRoutePoints([]); setDimensionStart(null); }}>Этаж {index + 1}</button>)}</div>
      <div className="placement-summary"><span>Мебель <b>{summary.furniture}</b></span><span>Техника <b>{summary.appliance}</b></span><span>Инженерия <b>{summary.equipment}</b></span><span>Электроточки <b>{summary.electric}</b></span><span>Сети <b>{items.filter(item => isNetworkLayer(item.layer)).length}</b></span><span>Линии сетей <b>{networkRoutes.length}</b></span><span>Трассы по плану <b>{electricBill.routeMetres} м</b></span></div>
      <div className="placement-measure-tools"><button className={placement.showAutoDimensions ? 'active' : ''} onClick={() => change(data => { data.showAutoDimensions = !data.showAutoDimensions; })}><Ruler size={16}/> Авторазмеры электрики</button><button className={drawingDimension ? 'active' : ''} onClick={() => { setDrawingDimension(current => !current); setDimensionStart(null); setDrawingRoute(false); setRoutePoints([]); setPresetId(null); }}><Plus size={16}/> Размер вручную</button></div>
    </div>
    <div className="placement-layers" role="toolbar" aria-label="Слои плана">{PLACEMENT_LAYERS.map(entry => <div className={`placement-layer-row ${layer === entry.id ? 'active' : ''}`} key={entry.id}><button className="placement-layer-select" disabled={entry.future} onClick={() => changeLayer(entry.id)}>{entry.label}{entry.future ? <small>позже</small> : null}</button>{!entry.future ? <button className="placement-eye" aria-label={`${visible[entry.id] ? 'Скрыть' : 'Показать'} ${entry.label}`} title={`${visible[entry.id] ? 'Скрыть' : 'Показать'} ${entry.label}`} onClick={() => setVisible(old => ({ ...old, [entry.id]: !old[entry.id] }))}>{visible[entry.id] ? <Eye size={16}/> : <EyeOff size={16}/>}</button> : null}</div>)}</div>
    <div className="placement-workspace">
      <aside className="placement-sidebar"><h2>Библиотека элементов</h2>
        <div className="placement-catalog-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск по всей библиотеке" aria-label="Поиск по библиотеке"/></div>
        <div className="placement-catalog-layout"><nav className="placement-category-rail" aria-label="Группы элементов"><button className={category === 'all' ? 'active' : ''} title="Все элементы" aria-label="Все элементы" aria-pressed={category === 'all'} onClick={() => setCategory('all')}><LayoutGrid size={20}/></button>{groups.map(group => { const Icon = groupIcons[group.id] || Droplets; return <button key={group.id} className={category === group.id ? 'active' : ''} title={group.label} aria-label={group.label} aria-pressed={category === group.id} onClick={() => setCategory(group.id)}><Icon size={20}/></button>; })}</nav><div className="placement-catalog-results">
        <div className="placement-palette-heading"><h3>{searchTerm ? 'Результаты поиска' : category === 'all' ? PLACEMENT_LAYERS.find(entry => entry.id === layer)?.label : PLACEMENT_GROUPS.find(entry => entry.id === category)?.label}</h3><small>{catalogItems.length} элементов</small></div>
        <div className="placement-palette">{catalogItems.map(entry => <button key={entry.id} className={presetId === entry.id ? 'active' : ''} title={entry.label} onClick={() => { setPresetId(current => current === entry.id ? null : entry.id); setLayer(entry.layer); setCategory(entry.group); setQuery(''); setVisible(old => ({ ...old, [entry.layer]: true })); setSelectedId(null); setDrawingRoute(false); setRoutePoints([]); setDrawingDimension(false); setDimensionStart(null); setNetworkDrawing(false); setNetworkPoints([]); }}><CatalogSymbol preset={entry}/><span className="placement-card-copy"><strong>{entry.label}</strong><small>{Math.round(entry.width * 100)} × {Math.round(entry.depth * 100)} см{searchTerm ? ` · ${PLACEMENT_LAYERS.find(layerEntry => layerEntry.id === entry.layer)?.label}` : entry.surface === 'facade' ? ' · фасад' : ''}</small></span></button>)}</div>
        {!catalogItems.length ? <p className="placement-catalog-empty">По этому запросу элементов нет.</p> : null}</div></div>
        {isNetworkLayer(layer) ? <PlacementNetworkPanel system={layer} floor={activeFloor} placement={placement} fromId={networkFromId} toId={networkToId} medium={networkMedium} onFrom={setNetworkFromId} onTo={setNetworkToId} onMedium={setNetworkMedium} onAuto={() => addNetworkRoute(true)} onPair={() => addNetworkRoute(true, true)} onBeginManual={() => { setNetworkDrawing(true); setNetworkPoints([]); setPresetId(null); setDrawingDimension(false); setDrawingRoute(false); }} onFinishManual={() => addNetworkRoute(false)} onCancelManual={() => { setNetworkDrawing(false); setNetworkPoints([]); }} drawing={networkDrawing} points={networkPoints} selectedRouteId={selectedNetworkRouteId} onSelectRoute={setSelectedNetworkRouteId} onUpdateRoute={updateNetworkRoute} onDeleteRoute={id => { change(data => { data.networks[layer] = data.networks[layer].filter(route => route.id !== id); }); setSelectedNetworkRouteId(null); }}/> : null}
        {layer === 'electric' ? <div className="placement-circuits">
          <div className="placement-palette-heading"><h3>Группы щита</h3><button onClick={addCircuit} title="Добавить группу"><Plus size={17}/></button></div>
          {placement.circuits.length ? placement.circuits.map(circuit => <button key={circuit.id} className={selectedCircuitId === circuit.id ? 'active' : ''} onClick={() => { setSelectedCircuitId(circuit.id); setPresetId(null); }}>{circuit.name}</button>) : <p>Добавьте группу для розеток и света.</p>}
          {selectedCircuit ? <div className="placement-circuit-form">
            <label>Название<input value={selectedCircuit.name} onChange={event => updateCircuit({ name: event.target.value })}/></label>
            <label>Кабель по проекту<select value={customCable ? 'custom' : selectedCircuit.cable || ''} onChange={event => { if (event.target.value === 'custom') setCustomCableCircuitId(selectedCircuit.id); else { setCustomCableCircuitId(null); updateCircuit({ cable: event.target.value }); } }}><option value="">Не указан</option>{ELECTRICAL_CABLE_CHOICES.map(cable => <option key={cable} value={cable}>{cable}</option>)}<option value="custom">Другой · вручную</option></select></label>
            {customCable ? <label>Свой кабель<input value={selectedCircuit.cable || ''} onChange={event => updateCircuit({ cable: event.target.value })} placeholder="Обозначение по проекту"/></label> : null}
            <label>Номинал автомата, А<input type="number" min="1" step="1" value={selectedCircuit.breakerAmps ?? ''} onChange={event => updateCircuit({ breakerAmps: event.target.value ? Number(event.target.value) : null })} placeholder="По проекту"/></label>
            <label>Тип защиты / характеристика<input value={selectedCircuit.breaker || ''} onChange={event => updateCircuit({ breaker: event.target.value })} placeholder="По проекту"/></label>
            <button className={drawingRoute ? 'active' : ''} onClick={() => { setDrawingRoute(!drawingRoute); setPresetId(null); setRoutePoints([]); setRouteStartId(''); setRouteCursor(null); setRouteNotice(''); setDrawingDimension(false); }}><Route size={16}/> {drawingRoute ? 'Отменить трассу' : 'Нарисовать трассу'}</button>
            {drawingRoute ? <p className="placement-route-hint">{routeStartId ? 'Щёлкните промежуточные точки по сетке 0,25 м, затем конечную электроточку. Линия привяжется к обоим элементам.' : 'Щёлкните начальную электроточку или щит. Неназначенная точка получит эту группу.'}</p> : null}
            {routeNotice ? <p className="placement-route-hint" role="status">{routeNotice}</p> : null}
          </div> : null}
          <div className="placement-panel-diagram"><h3>Схема щита · этаж {activeFloor}</h3><div className="placement-panel-feed">{items.some(item => item.kind === 'panel') ? 'Электрощит' : 'Щит не размещён'}</div>{placement.circuits.map((circuit, index) => <div className="placement-panel-row" key={circuit.id}><b>{index + 1}</b><span><strong>{breakerDescription(circuit)}</strong><small>{circuit.name}</small></span><small>{circuit.cable || 'Кабель не указан'}</small></div>)}<small>Номиналы и кабели задаются по проекту; схема не подбирает защиту автоматически.</small></div>
          <div className="placement-point-groups"><h3>Назначение электроточек</h3>{items.filter(item => item.layer === 'electric' && item.kind !== 'panel').map(item => <label key={item.id}><span>{item.label || item.kind}</span><select aria-label={`Группа для ${item.label || item.kind}`} value={item.circuitId || ''} onChange={event => assignCircuit(item.id, event.target.value)}><option value="">Без группы</option>{placement.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}</select></label>)}</div>
        </div> : null}
        {layer === 'electric' && selectedCircuit ? <div className="placement-circuit-accessories"><h3>Комплектующие группы</h3>{(selectedCircuit.accessories || []).map((entry, index) => <div key={index}><input aria-label={`Комплектующее группы ${index + 1}`} placeholder="Наименование" value={entry.name} onChange={event => { const accessories = [...(selectedCircuit.accessories || [])]; accessories[index] = { ...entry, name: event.target.value }; updateCircuit({ accessories }); }}/><input aria-label={`Количество комплектующего группы ${index + 1}`} type="number" min="0" value={entry.quantity} onChange={event => { const accessories = [...(selectedCircuit.accessories || [])]; accessories[index] = { ...entry, quantity: Number(event.target.value) || 0 }; updateCircuit({ accessories }); }}/><input aria-label={`Единица комплектующего группы ${index + 1}`} value={entry.unit} onChange={event => { const accessories = [...(selectedCircuit.accessories || [])]; accessories[index] = { ...entry, unit: event.target.value }; updateCircuit({ accessories }); }}/><button title="Удалить комплектующее группы" onClick={() => updateCircuit({ accessories: selectedCircuit.accessories.filter((_, i) => i !== index) })}>×</button></div>)}<button onClick={() => updateCircuit({ accessories: [...(selectedCircuit.accessories || []), { name: '', quantity: 1, unit: 'шт' }] })}>+ Добавить комплектующее</button><small>Клеммы, крепёж, гофра и другие позиции по утверждённой схеме.</small></div> : null}
        {layer === 'electric' && selectedCircuit ? <button className="placement-remove-circuit" onClick={() => { change(data => { data.circuits = data.circuits.filter(circuit => circuit.id !== selectedCircuit.id); data.routes = data.routes.filter(route => route.circuitId !== selectedCircuit.id); data.items.forEach(item => { if (item.circuitId === selectedCircuit.id) item.circuitId = ''; }); }); setSelectedCircuitId(null); setDrawingRoute(false); setRoutePoints([]); }}><Trash2 size={15}/> Удалить группу и её трассы</button> : null}
        {layer === 'electric' && selectedCircuit ? <button className="placement-auto-route" disabled={!items.some(item => item.kind === 'panel')} onClick={autoRouteCircuit}><Route size={16}/> Протянуть группу к щиту</button> : null}
        {layer === 'electric' && !items.some(item => item.kind === 'panel') ? <p className="placement-route-hint">Сначала поставьте электрощит на этом этаже.</p> : null}
        {layer === 'electric' && routes.length ? <div className="placement-route-list"><h3>Трассы этажа</h3>{routes.map((route, index) => <div key={route.id}><button className={selectedRouteId === route.id ? 'active' : ''} onClick={() => { setSelectedRouteId(route.id); setSelectedId(null); setLayer('electric'); }}>{placement.circuits.find(circuit => circuit.id === route.circuitId)?.name || `Трасса ${index + 1}`} · {electricalRouteLength3d(route.points).toFixed(2)} м</button><button title="Удалить трассу" aria-label={`Удалить трассу ${index + 1}`} onClick={() => { change(data => { data.routes = data.routes.filter(item => item.id !== route.id); }); setSelectedRouteId(null); }}><Trash2 size={15}/></button></div>)}</div> : null}
        {layer === 'electric' ? <div className="placement-electrical-bill"><h3>Ведомость электрики · этаж {activeFloor}</h3><p>Трассы по геометрии: {electricBill.routeMetres.toFixed(2)} м. С заданными высотами; без запаса и обходов.</p>{electricBill.byCircuit.map(circuit => <p key={circuit.id}>{circuit.name}: {circuit.routeMetres.toFixed(2)} м · {circuit.cable || 'кабель не указан'}</p>)}<ul>{electricBill.components.map(component => <li key={component.name}><span>{component.name}</span><strong>{component.quantity == null ? 'уточнить' : `${component.quantity} ${component.unit}`}</strong>{component.note ? <small>{component.note}</small> : null}</li>)}{electricBill.manualComponents.map(component => <li key={`manual-${component.name}-${component.unit}`}><span>{component.name} · по проекту</span><strong>{component.quantity} {component.unit}</strong></li>)}</ul>{electricBill.unconnected.length ? <p>Без линии к щиту: {electricBill.unconnected.length} точек.</p> : null}{electricBill.topologyIssues?.length ? <details><summary>Связи света: {electricBill.topologyIssues.length} уточнения</summary><ul>{electricBill.topologyIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></details> : null}<p>Ведомость не меняет смету. Сечение, защита и способ монтажа задаются по проекту.</p></div> : null}
      </aside>
      <section className="placement-canvas-panel"><div className="placement-canvas-title"><div className="placement-canvas-caption"><strong>План этажа {activeFloor}</strong><span>{drawingDimension ? dimensionStart ? 'Укажите вторую точку размера' : 'Укажите первую точку размера' : drawingRoute ? routeStartId ? 'Промежуточные точки — по сетке; завершение — щелчком по электроэлементу' : 'Выберите начальный электроэлемент' : activePreset ? `Разместите: ${activePreset.label}${activePreset.surface === 'facade' ? ' у наружной стены' : ''}` : 'Выберите элемент слева или переместите существующий'}</span></div><div className="placement-viewport-tools" role="toolbar" aria-label="Масштаб и поле плана"><button title="Уменьшить масштаб" aria-label="Уменьшить масштаб" onClick={() => setZoom(current => clampZoom(current - 10))}><ZoomOut size={17}/></button><button className="placement-zoom-value" title="Сбросить масштаб и положение" aria-label={`Масштаб ${zoom}%. Сбросить масштаб и положение`} onClick={resetView}>{zoom}%</button><button title="Увеличить масштаб" aria-label="Увеличить масштаб" onClick={() => setZoom(current => clampZoom(current + 10))}><ZoomIn size={17}/></button><button title={fullscreen ? 'Свернуть поле плана' : 'Развернуть поле плана на весь экран'} aria-label={fullscreen ? 'Свернуть поле плана' : 'Развернуть поле плана на весь экран'} onClick={() => setFullscreen(value => !value)}>{fullscreen ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}</button></div></div><div className="placement-canvas-scroll"><svg ref={svgRef} className={`placement-canvas ${activePreset || drawingRoute || drawingDimension ? 'placing' : ''}`} viewBox={viewBox} role="img" aria-label={`План этажа ${activeFloor} для расстановки мебели и инженерии`} onClick={onCanvasClick} onPointerDown={beginPan} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <defs><pattern id="placement-grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M 25 0 V 100 M 50 0 V 100 M 75 0 V 100 M 0 25 H 100 M 0 50 H 100 M 0 75 H 100" fill="none" stroke="#e6eeeb" strokeWidth=".7"/><path d="M 100 0 H 0 V 100" fill="none" stroke="#b9d0ca" strokeWidth="1.4"/></pattern><marker id="placement-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 9 5 L 0 8 z" fill="#497c7a"/></marker></defs>
        <rect x={drawingBounds.x * 100 - margin} y={drawingBounds.y * 100 - margin} width={Math.max(5, drawingBounds.w) * 100 + margin * 2} height={Math.max(5, drawingBounds.h) * 100 + margin * 2} fill="url(#placement-grid)"/>
        {(plan.platforms || []).filter(platform => platform.include !== false).map(platform => <g key={platform.id} className="placement-platform"><rect x={platform.x * 100} y={platform.y * 100} width={platform.w * 100} height={platform.h * 100}/><text x={(platform.x + platform.w / 2) * 100} y={(platform.y + platform.h / 2) * 100} textAnchor="middle">{platform.kind === 'porch' ? 'Крыльцо' : 'Терраса'}</text></g>)}
        <path d={pathData(contour)} fill="#f9fbf9" stroke="none"/>
        {rooms.map(room => { const points = roomPoints(room); const box = boundsOf(points); return <g key={room.id}><path d={pathData(points)} fill="rgba(219,233,230,.22)" stroke="none"/><text x={(box.x + box.w / 2) * 100} y={(box.y + box.h / 2) * 100} textAnchor="middle" className="placement-room-label">{room.name}</text></g>; })}
        <PlacementWalls plan={plan} idPrefix={`placement-floor-${activeFloor}`}/>
        {wallFaces.map(face => <g key={face.ref} onClick={event => { if (activePreset || drawingRoute || drawingDimension || networkDrawing) return; event.stopPropagation(); setSelectedWallRef(face.ref); }}><line x1={face.a.x * 100} y1={face.a.y * 100} x2={face.b.x * 100} y2={face.b.y * 100} stroke={selectedWallRef === face.ref ? '#278b78' : 'transparent'} strokeWidth={selectedWallRef === face.ref ? 5 : 18} vectorEffect="non-scaling-stroke" className="placement-wall-face-target"><title>{face.label} · открыть развёртку</title></line></g>)}
        {placement.showAutoDimensions && visible.electric ? <PlacementWallDimensions plan={plan} items={items.filter(item => item.layer === 'electric')}/> : null}
        {routes.filter(route => visible.electric).map(route => <g key={route.id} onClick={event => { event.stopPropagation(); setSelectedRouteId(route.id); setSelectedId(null); setLayer('electric'); }}><path d={routeData(route.points)} fill="none" stroke={selectedRouteId === route.id ? '#ae4b16' : '#d79b43'} strokeWidth={selectedRouteId === route.id ? 7 : 5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" strokeDasharray={route.auto ? '8 4' : undefined}/><title>{placement.circuits.find(circuit => circuit.id === route.circuitId)?.name || 'Трасса'} · {electricalRouteLength3d(route.points).toFixed(2)} м</title></g>)}
        {selectedRoute && !drawingRoute ? selectedRoute.points.slice(1, -1).map((point, index) => { const location = dragPosition?.routeId === selectedRoute.id && dragPosition.index === index + 1 ? dragPosition : point; return <circle key={`${selectedRoute.id}-${index}`} cx={location.x * 100} cy={location.y * 100} r="9" className="placement-route-handle" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); svgRef.current?.setPointerCapture(event.pointerId); dragRef.current = { routeId: selectedRoute.id, index: index + 1, pointerId: event.pointerId, start: pointFromEvent(event), origin: point, last: point }; }}/>; }) : null}
        {drawingRoute && routePoints.length ? <path d={routeData(routeCursor ? [...routePoints, routeCursor] : routePoints)} fill="none" stroke="#df7328" strokeWidth="4" strokeDasharray="8 4" vectorEffect="non-scaling-stroke" pointerEvents="none"/> : null}
        {drawingRoute && routeCursor ? <g className="placement-route-cursor" pointerEvents="none"><line x1={drawingBounds.x * 100 - margin} y1={routeCursor.y * 100} x2={(drawingBounds.x + drawingBounds.w) * 100 + margin} y2={routeCursor.y * 100}/><line x1={routeCursor.x * 100} y1={drawingBounds.y * 100 - margin} x2={routeCursor.x * 100} y2={(drawingBounds.y + drawingBounds.h) * 100 + margin}/><circle cx={routeCursor.x * 100} cy={routeCursor.y * 100} r="6"/><text x={routeCursor.x * 100 + 22} y={routeCursor.y * 100 - 14}>{routeCursor.x.toFixed(2)} · {routeCursor.y.toFixed(2)} м{routePoints.length ? ` · ${routeLength([routePoints.at(-1), routeCursor]).toFixed(2)} м` : ''}</text></g> : null}
        {networkRoutes.filter(route => visible[route.system]).map(route => <g key={route.id} onClick={event => { event.stopPropagation(); setLayer(route.system); setSelectedNetworkRouteId(route.id); setPresetId(null); }}><path d={routeData(route.points)} fill="none" stroke={networkColors[route.system]} strokeWidth={selectedNetworkRouteId === route.id ? 6 : 4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={route.auto ? '8 5' : undefined} vectorEffect="non-scaling-stroke"/><title>{NETWORK_SYSTEMS[route.system].label} · {route.medium} · {networkLength3d(route.points).toFixed(2)} м</title></g>)}
        {networkDrawing && networkPoints.length ? <path d={routeData(networkPoints)} fill="none" stroke={networkColors[layer] || '#d48a21'} strokeWidth="4" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none"/> : null}
        {dimensions.map(dimension => <DimensionLine key={dimension.id} points={dimension.points} label={dimension.label}/>)}
        {dimensionStart ? <circle cx={dimensionStart.x * 100} cy={dimensionStart.y * 100} r="7" fill="#497c7a" pointerEvents="none"/> : null}
        {items.filter(item => visible[item.layer]).map(item => {
          const location = dragPosition?.id === item.id ? dragPosition : item;
          const electrical = item.layer === 'electric';
          const displayWidth = electrical ? Math.max(item.width * 100, 58) : item.width * 100;
          const displayDepth = electrical ? Math.max(item.depth * 100, 58) : item.depth * 100;
          return <g key={item.id} data-placement-id={item.id} transform={`translate(${location.x * 100} ${location.y * 100}) rotate(${item.rotation || 0})`} className={`placement-object ${selectedId === item.id ? 'selected' : ''}`} onPointerDown={event => beginDrag(event, item)} onClick={event => { event.stopPropagation(); if (suppressClickRef.current) suppressClickRef.current = false; if (drawingRoute) { chooseRouteNode(item); return; } setSelectedRouteId(null); setSelectedId(item.id); setPresetId(null); }}>
            {drawingRoute && electrical && (item.kind === 'panel' || item.circuitId === selectedCircuitId) ? <circle r="42" fill="none" stroke={item.id === routeStartId ? '#e15f22' : '#30a56e'} strokeWidth="3" strokeDasharray="5 3" pointerEvents="none"/> : null}
            {item.surface === 'facade' ? <line x1={(item.anchorX - location.x) * 100} y1={(item.anchorY - location.y) * 100} x2="0" y2="0" stroke="#4a9e94" strokeWidth="3" strokeDasharray="4 3" pointerEvents="none"/> : null}
            <rect x={-displayWidth / 2} y={-displayDepth / 2} width={displayWidth} height={displayDepth} fill="transparent" stroke="none"/>
            <svg x={-displayWidth / 2} y={-displayDepth / 2} width={displayWidth} height={displayDepth} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible"><PlacementSymbol kind={item.kind}/></svg>
            {selectedId === item.id ? <rect x={-displayWidth / 2 - 4} y={-displayDepth / 2 - 4} width={displayWidth + 8} height={displayDepth + 8} rx="8" fill="none" stroke="#2b8f85" strokeWidth="3" pointerEvents="none"/> : null}
            <title>{item.label || item.kind}</title>
          </g>;
        })}
        {items.filter(item => visible[item.layer]).map(item => {
          const position = dragPosition?.id === item.id ? dragPosition : item;
          const labelPosition = dragLabel?.id === item.id ? dragLabel : { x: position.x + (item.labelOffsetX ?? .65), y: position.y + (item.labelOffsetY ?? -.45) };
          return <g key={`note-${item.id}`}>
            {item.showHeight ? <text className="placement-height-label" x={position.x * 100 + 36} y={position.y * 100 + 45}>h={Number(item.height || 0).toFixed(2)} м</text> : null}
            {item.showName ? <g className="placement-name-callout" onPointerDown={event => beginLabelDrag(event, item)} onClick={event => event.stopPropagation()}><line x1={position.x * 100} y1={position.y * 100} x2={labelPosition.x * 100} y2={labelPosition.y * 100}/><text x={labelPosition.x * 100} y={labelPosition.y * 100}>{item.label || item.kind}</text></g> : null}
          </g>;
        })}
      </svg></div><PlacementWallElevation wall={selectedWall} plan={plan} items={items} routes={networkRoutes} activePreset={activePreset} drawing={networkDrawing} points={networkPoints} onPosition={onWallPosition} onSelectItem={id => { setSelectedId(id); setPresetId(null); }}/><div className="placement-canvas-note">Предметы прилипают к ближайшей грани стены. Нажмите стену, чтобы открыть развёртку. Автоматические размеры электроточек вынесены за контур дома. Маршруты инженерных сетей измеряются с заданными высотами и попадают в отдельные листы. Масштаб меняется колёсиком, кнопками или двумя пальцами.</div></section>
      <aside className="placement-inspector"><div className="placement-inspector-heading"><h2>Свойства и размеры</h2>{selected ? <button onClick={() => setSelectedId(null)} aria-label="Закрыть свойства"><X size={17}/></button> : null}</div>
        {selectedRoute ? <div className="placement-route-editor"><h3>Трасса · {electricalRouteLength3d(selectedRoute.points).toFixed(2)} м</h3><p>Концы закреплены за элементами. Промежуточные точки можно двигать на плане.</p><label>Начало<select value={selectedRoute.fromItemId || selectedRoute.panelItemId || ''} onChange={event => updateRoute(selectedRoute.id, { fromItemId: event.target.value, auto: false })}>{items.filter(item => item.layer === 'electric' && (item.kind === 'panel' || item.circuitId === selectedRoute.circuitId)).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Конец<select value={selectedRoute.targetItemId || ''} onChange={event => updateRoute(selectedRoute.id, { targetItemId: event.target.value, auto: false })}><option value="">Выберите элемент</option>{items.filter(item => item.layer === 'electric' && item.id !== selectedRoute.fromItemId && item.circuitId === selectedRoute.circuitId).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Группа<select value={selectedRoute.circuitId || ''} onChange={event => updateRoute(selectedRoute.id, { circuitId: event.target.value, auto: false })}>{placement.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}</select></label><button onClick={() => addRouteWaypoint(selectedRoute)}>+ Промежуточная точка</button>{selectedRoute.points.slice(1, -1).map((point, index) => <div className="placement-route-point" key={index}><span>Точка {index + 1}</span><Field label="X" value={point.x} onChange={value => updateRoutePoint(selectedRoute.id, index + 1, { x: valueOr(value, point.x), y: point.y })} step={.25}/><Field label="Y" value={point.y} onChange={value => updateRoutePoint(selectedRoute.id, index + 1, { x: point.x, y: valueOr(value, point.y) })} step={.25}/><button onClick={() => updateRoute(selectedRoute.id, { auto: false, points: selectedRoute.points.filter((_, pointIndex) => pointIndex !== index + 1) })}>Удалить точку</button></div>)}<button className="placement-delete" onClick={deleteSelection}><Trash2 size={16}/> Удалить трассу</button></div> : null}
        {selectedRoute ? <div className="placement-route-editor"><Field label="Уровень трассы" value={selectedRoute.routeLevel ?? 0} onChange={value => updateRoute(selectedRoute.id, { routeLevel: Math.max(0, valueOr(value, 0)) })} min={0} suffix="м" disabled={!selectedRoute.auto}/><button onClick={() => updateRoute(selectedRoute.id, { auto: true })}>Перестроить этот участок автоматически</button><small>Автоматика выбирает ортогональную линию с учётом пересечений стен. Фактические проходки и способ прокладки согласуйте по проекту.</small></div> : null}
        {selected ? <div className="placement-inspector-fields"><span className="placement-type">{PLACEMENT_LAYERS.find(entry => entry.id === selected.layer)?.label} · этаж {selected.floor}{selected.surface === 'facade' ? ' · фасад' : ''}</span><label>Название<input value={selected.label || ''} onChange={event => updateItem({ label: event.target.value })}/></label><div className="placement-field-grid"><Field label="X" value={selected.x} onChange={value => { const position = { x: valueOr(value, selected.x), y: selected.y }; updateItem(selected.surface === 'facade' ? facadePosition(position) : position); }} step={.05} suffix="м"/><Field label="Y" value={selected.y} onChange={value => { const position = { x: selected.x, y: valueOr(value, selected.y) }; updateItem(selected.surface === 'facade' ? facadePosition(position) : position); }} step={.05} suffix="м"/><Field label="Ширина" value={selected.width} onChange={value => updateItem({ width: Math.max(.05, valueOr(value, selected.width)) })} min={.05} suffix="м"/><Field label="Глубина" value={selected.depth} onChange={value => updateItem({ depth: Math.max(.05, valueOr(value, selected.depth)) })} min={.05} suffix="м"/></div><Field label="Высота установки" value={selected.height || 0} onChange={value => updateItem({ height: Math.max(0, valueOr(value, selected.height)) })} min={0} suffix="м"/><button className="placement-rotate" onClick={() => updateItem({ rotation: ((selected.rotation || 0) + 90) % 360 })}><RotateCw size={16}/> Повернуть на 90°</button>{selected.layer === 'electric' && selected.kind !== 'panel' ? <label>Электрическая группа<select value={selected.circuitId || ''} onChange={event => updateItem({ circuitId: event.target.value })}><option value="">Не назначена</option>{placement.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}</select></label> : null}<label>Примечание<textarea rows="3" value={selected.note || ''} onChange={event => updateItem({ note: event.target.value })} placeholder="Модель, подключение или уточнение проекта"/></label><button className="placement-delete" onClick={deleteSelection}><Trash2 size={16}/> Удалить объект</button></div> : <div className="placement-empty-inspector"><p>Выберите предмет на плане, чтобы уточнить его размеры, координаты и высоту установки.</p></div>}
        {itemWall ? <div className="placement-wall-station"><strong>{itemWall.label}</strong><Field label="От начала стены" value={round(projectToWallFace(itemWall, selected).station)} onChange={value => { const station = Math.max(0, Math.min(itemWall.length, valueOr(value, 0))); const foot = wallFacePoint(itemWall, station); const half = (Math.abs(itemWall.normal.x) * selected.width + Math.abs(itemWall.normal.y) * selected.depth) / 2; updateItem({ x: round(foot.x + itemWall.normal.x * half), y: round(foot.y + itemWall.normal.y * half), wallRef: itemWall.ref }); }} min={0} max={itemWall.length} suffix="м"/><small>От выбранного конца грани. Точка и размеры трассы обновятся.</small></div> : null}
        {selected?.layer === 'electric' && ['switch', 'double-switch', 'two-way-switch', 'dimmer'].includes(selected.kind) ? <div className="placement-control-links"><h3>Связь выключателя</h3><label>Управляемый светильник<select value={selected.controlsItemId || ''} onChange={event => updateItem({ controlsItemId: event.target.value })}><option value="">Не выбран</option>{items.filter(item => item.layer === 'electric' && ['light', 'spotlight', 'pendant-light', 'wall-light', 'led-strip', 'facade-light', 'facade-spotlight'].includes(item.kind) && item.circuitId === selected.circuitId).map(item => <option key={item.id} value={item.id}>{item.label} · {item.id.slice(0, 6)}</option>)}</select></label>{selected.kind === 'two-way-switch' ? <label>Парный проходной выключатель<select value={selected.pairedSwitchId || ''} onChange={event => { const pairId = event.target.value; change(data => { const current = data.items.find(item => item.id === selected.id); if (!current) return; const oldPair = data.items.find(item => item.id === current.pairedSwitchId); if (oldPair?.pairedSwitchId === current.id) oldPair.pairedSwitchId = ''; current.pairedSwitchId = pairId; const pair = data.items.find(item => item.id === pairId); if (pair) { pair.pairedSwitchId = current.id; if (current.controlsItemId) pair.controlsItemId = current.controlsItemId; } rebuildAutoRoutes(data, current.circuitId); }); }}><option value="">Не выбран</option>{items.filter(item => item.id !== selected.id && item.kind === 'two-way-switch' && item.circuitId === selected.circuitId).map(item => <option key={item.id} value={item.id}>{item.label} · {item.id.slice(0, 6)}</option>)}</select></label> : null}<label>Распределительная коробка<select value={selected.junctionItemId || ''} onChange={event => updateItem({ junctionItemId: event.target.value })}><option value="">Ближайшая из группы</option>{items.filter(item => item.kind === 'junction-box' && item.circuitId === selected.circuitId).map(item => <option key={item.id} value={item.id}>{item.label} · {item.id.slice(0, 6)}</option>)}</select></label><p>Автотрасса связывает щит, коробку, выключатель и светильник. Пара проходных выключателей получает отдельную линию между ними. Схему подключения проверьте перед монтажом.</p></div> : null}
        {selected?.supplyItemId ? <div className="placement-control-links"><h3>Электроподключение прибора</h3><p>На плане создана отдельная электроточка. Её можно переместить, изменить тип и назначить группе.</p><button onClick={() => { setLayer('electric'); setSelectedId(selected.supplyItemId); setSelectedRouteId(null); }}>Открыть электроточку</button></div> : null}
        {selected?.linkedApplianceId ? <div className="placement-control-links"><p>Связано с прибором. {selected.followsAppliance ? 'Точка следует за прибором.' : 'Положение задано вручную.'}</p><label><input type="checkbox" checked={selected.followsAppliance === true} onChange={event => updateItem({ followsAppliance: event.target.checked })}/> Следовать за прибором</label></div> : null}
        {selected ? <div className="placement-annotation-settings">{selected.layer === 'electric' ? <label>Размер от стены<select value={selected.dimensionSide || 'auto'} onChange={event => updateItem({ dimensionSide: event.target.value })}><option value="auto">Ближайшая слева или справа</option><option value="left">Слева</option><option value="right">Справа</option></select></label> : null}<label><input type="checkbox" checked={selected.showHeight === true} onChange={event => updateItem({ showHeight: event.target.checked })}/> Показывать высоту рядом</label><label><input type="checkbox" checked={selected.showName === true} onChange={event => updateItem({ showName: event.target.checked })}/> Выноска названия (перетащите на плане)</label></div> : null}
        {dimensions.length ? <div className="placement-dimension-list"><h3>Ручные размеры</h3>{dimensions.map((dimension, index) => <div key={dimension.id}><span>{index + 1}. {measureText(dimensionMetres(dimension.points))}</span><input aria-label={`Подпись размера ${index + 1}`} value={dimension.label || ''} placeholder="Подпись по замеру" onChange={event => change(data => { const target = data.dimensions.find(entry => entry.id === dimension.id); if (target) target.label = event.target.value; })}/><button aria-label={`Удалить размер ${index + 1}`} onClick={() => change(data => { data.dimensions = data.dimensions.filter(entry => entry.id !== dimension.id); })}><Trash2 size={15}/></button></div>)}</div> : null}
      </aside>
    </div>
    {printing ? createPortal(<PlacementWorkerSheets project={project}/>, document.body) : null}
  </main>;
}
