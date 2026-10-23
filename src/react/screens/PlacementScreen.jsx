import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Plus, RotateCw, Route, Trash2, Undo2, Redo2, X, Ruler, Search, Printer, Camera, Download, Share2, ZoomIn, ZoomOut, Maximize2, Minimize2, LayoutGrid, BedDouble, CookingPot, Bath, Boxes, Refrigerator, WashingMachine, Heater, PlugZap, Lightbulb, House, CircuitBoard, Droplets, Wrench, LockKeyhole, LockKeyholeOpen, Unlink2, PencilLine, Check } from 'lucide-react';
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
import PlacementRoomUnfolding from './PlacementRoomUnfolding.jsx';
import { connectionPortsFor } from '../state/placement-connections.js';
import { electricalGroupColor, electricalPlacementClusters, electricalPointsByRoom, roomNameForPlacement, wallPointDisplayOrder } from '../state/placement-visibility.js';
import { CIRCUIT_COLORS, nextCircuitColor, validCircuitColor } from '../state/placement-circuit-colors.js';
import { electricalSettingOutDimension, placementWallFaces, projectToWallFace, snapPlacementToWall, wallFacePoint } from '../state/placement-walls.js';
import { ELECTRICAL_CABLE_CHOICES, breakerDescription, connectSelectedElectricalPoints, electricalBill, electricalRouteLength3d, proposeElectricalCircuitRoutes, reassignElectricalPoint, resolvedElectricalRoutes, routeBetweenElectricalNodes, routeLength } from '../state/placement-electrical.js';
import { NETWORK_SYSTEMS, isNetworkLayer, networkLength3d, resolvedNetworkRoutes } from '../state/placement-networks.js';
import { insertRoutePoint, pointOnRouteSegment, removeRoutePoint, routeSegmentDirection, shiftRouteSegment } from '../state/placement-route-edit.js';
import { ROUTE_SURFACES, appendSurfaceWaypoint, nearestRouteWall, orthogonalizeSurfaceRoute, replaceRouteSurface, routeSurfaceAtPoint, routeSurfaceHeight, surfaceRouteLeg } from '../state/placement-route-surfaces.js';
import { alignLightToNeighbors, electricalDrawingAnchors, junctionWallMount, schematicPosition, sharedElectricalRouteLanes } from '../state/placement-schematic.js';
import { appendManualRouteWaypoint, constrainManualRouteChoice, finishManualRoute, manualRouteSnap, nearestRouteNode } from '../state/placement-manual-routing.js';
import './placement.css';

const createId = () => globalThis.crypto?.randomUUID?.() || `place-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const round = value => Math.round(value * 100) / 100;
const pathData = points => points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ') + ' Z';
const routeData = points => points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ');
const valueOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const measureText = value => `${Number(value).toFixed(2)} м`;
const groupIcons = { living: BedDouble, kitchen: CookingPot, bathroom: Bath, storage: Boxes, 'kitchen-appliances': Refrigerator, laundry: WashingMachine, climate: Heater, engineering: Wrench, 'electric-points': PlugZap, lighting: Lightbulb, facade: House, 'electrical-panel': CircuitBoard, 'water-sources': Droplets, 'water-points': Droplets, 'heat-sources': Heater, 'heat-points': Heater, 'sewer-risers': Wrench, 'sewer-points': Wrench, 'air-units': Wrench, 'air-points': Wrench };
const networkColors = { plumbing: '#2979aa', heating: '#bf6134', sewer: '#72579a', ventilation: '#3d9481' };
const breakerNominals = [[6, 'небольшие цепи'], [10, 'часто освещение'], [16, 'часто розетки'], [20, 'отдельная нагрузка'], [25, 'по расчёту'], [32, 'по расчёту'], [40, 'по расчёту'], [50, 'по расчёту'], [63, 'по расчёту']];
const clampZoom = value => Math.max(35, Math.min(2000, Math.round(value)));
const gridPoint = point => ({ x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 });
const junctionDefaultHeight = plan => Math.max(0, round((Number(plan.wallHeight) || 2.5) - .15));

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
  const layer = placement.activeLayer || 'furniture';
  const [sidebarTab, setSidebarTab] = useState('elements');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const visible = placement.visibleLayers || createPlacement().visibleLayers;
  const [presetId, setPresetId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedCircuitId, setSelectedCircuitId] = useState(null);
  const [armedCircuitNameId, setArmedCircuitNameId] = useState(null);
  const [editingCircuitNameId, setEditingCircuitNameId] = useState(null);
  const [drawingRoute, setDrawingRoute] = useState(false);
  const routeMode = placement.electricalRouteMode === 'manual' ? 'manual' : 'automatic';
  const [routePoints, setRoutePoints] = useState([]);
  const [routeSurface, setRouteSurface] = useState(placement.defaultRouteSurface || 'ceiling');
  useEffect(() => setRouteSurface(placement.defaultRouteSurface || 'ceiling'), [placement.defaultRouteSurface]);
  const [wallRouteHeight, setWallRouteHeight] = useState(null);
  const [routeStartId, setRouteStartId] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedRoutePoint, setSelectedRoutePoint] = useState(null);
  const [selectedRouteSegment, setSelectedRouteSegment] = useState(null);
  const [settingsCircuitId, setSettingsCircuitId] = useState(null);
  const [circuitColorError, setCircuitColorError] = useState('');
  const [customBreakerAmpsCircuitId, setCustomBreakerAmpsCircuitId] = useState(null);
  const [customBreakerCircuitId, setCustomBreakerCircuitId] = useState(null);
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
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [elementsLocked, setElementsLocked] = useState(false);
  const [linesLocked, setLinesLocked] = useState(false);
  const [showElectricDetails, setShowElectricDetails] = useState(true);
  useEffect(() => setShowElectricDetails(true), [selectedId]);
  const [assigningCircuit, setAssigningCircuit] = useState(false);
  const [networkNotice, setNetworkNotice] = useState('');
  const [drawingDimension, setDrawingDimension] = useState(false);
  const [dimensionStart, setDimensionStart] = useState(null);
  const [dragPosition, setDragPosition] = useState(null);
  const [dragLabel, setDragLabel] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotError, setSnapshotError] = useState('');
  useEffect(() => () => { if (snapshot?.url) URL.revokeObjectURL(snapshot.url); }, [snapshot?.url]);
  const [zoom, setZoom] = useState(100);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
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
  const selectedRoom = rooms.find(room => room.id === selectedRoomId) || null;
  const platformPoints = (plan.platforms || []).filter(platform => platform.include !== false).flatMap(platform => [{ x: platform.x, y: platform.y }, { x: platform.x + platform.w, y: platform.y + platform.h }]);
  const drawingBounds = useMemo(() => boundsOf([...contour, ...rooms.flatMap(roomPoints), ...platformPoints]), [contour, rooms, plan.platforms]);
  const focusBounds = drawingBounds;
  const margin = selectedRoom ? 55 : 85;
  const naturalWidth = Math.max(selectedRoom ? 1 : 5, focusBounds.w) * 100 + margin * 2;
  const naturalHeight = Math.max(selectedRoom ? 1 : 5, focusBounds.h) * 100 + margin * 2;
  const aspect = viewport.width / viewport.height;
  const baseWidth = Math.max(naturalWidth, naturalHeight * aspect);
  const baseHeight = Math.max(naturalHeight, naturalWidth / aspect);
  const viewWidth = baseWidth * 100 / zoom, viewHeight = baseHeight * 100 / zoom;
  const viewBox = `${(focusBounds.x + focusBounds.w / 2) * 100 - viewWidth / 2 + pan.x} ${(focusBounds.y + focusBounds.h / 2) * 100 - viewHeight / 2 + pan.y} ${viewWidth} ${viewHeight}`;
  const items = useMemo(() => placement.items.filter(item => item.floor === activeFloor), [placement.items, activeFloor]);
  const electricalRoomGroups = useMemo(() => electricalPointsByRoom(items, rooms), [items, rooms]);
  const hiddenCircuitLines = useMemo(() => new Set(placement.hiddenCircuitLineIds || []), [placement.hiddenCircuitLineIds]);
  const hiddenCircuitPoints = useMemo(() => new Set(placement.hiddenCircuitPointIds || []), [placement.hiddenCircuitPointIds]);
  const displayedItems = useMemo(() => items.filter(item => item.layer !== 'electric' || item.kind === 'panel' || !hiddenCircuitPoints.has(item.circuitId)), [items, hiddenCircuitPoints]);
  const electricalClusters = useMemo(() => electricalPlacementClusters(displayedItems.filter(item => item.kind !== 'junction-box'), rooms), [displayedItems, rooms]);
  const electricalAnchors = useMemo(() => electricalDrawingAnchors(displayedItems, rooms), [displayedItems, rooms]);
  const routeAnchor = item => electricalAnchors.get(item.id) || schematicPosition(item);
  const manualGuideAnchors = useMemo(() => [...electricalAnchors.values(), ...routePoints], [electricalAnchors, routePoints]);
  const clusteredItemIds = useMemo(() => new Set(electricalClusters.flatMap(cluster => cluster.items.map(item => item.id))), [electricalClusters]);
  const routes = useMemo(() => resolvedElectricalRoutes(placement, activeFloor, plan), [placement, activeFloor, plan]);
  const displayedRoutes = useMemo(() => routes.filter(route => !hiddenCircuitLines.has(route.circuitId)), [routes, hiddenCircuitLines]);
  const routeBundles = useMemo(() => sharedElectricalRouteLanes(displayedRoutes), [displayedRoutes]);
  const wallFaces = useMemo(() => placementWallFaces(plan), [plan]);
  const selectedWall = wallFaces.find(face => face.ref === selectedWallRef);
  const openWallRoom = face => {
    setSelectedWallRef(face.ref);
    const middle = { x: (face.a.x + face.b.x) / 2 + face.normal.x * .12, y: (face.a.y + face.b.y) / 2 + face.normal.y * .12 };
    const room = rooms.find(entry => pointInPolygon(middle, roomPoints(entry)));
    if (room) { setSelectedRoomId(room.id); setZoom(100); setPan({ x: 0, y: 0 }); }
  };
  const networkRoutes = useMemo(() => Object.keys(NETWORK_SYSTEMS).flatMap(system => resolvedNetworkRoutes(placement, system, activeFloor).map(route => ({ ...route, system }))), [placement, activeFloor]);
  const electricBill = useMemo(() => electricalBill(placement, activeFloor, plan), [placement, activeFloor, plan]);
  const dimensions = useMemo(() => (placement.dimensions || []).filter(item => item.floor === activeFloor), [placement.dimensions, activeFloor]);
  const selected = items.find(item => item.id === selectedId);
  const selectedLightGuides = selected && !dragPosition ? alignLightToNeighbors(schematicPosition(selected), selected, displayedItems, rooms, .025).guides : [];
  const itemWall = selected?.wallRef ? wallFaces.find(face => face.ref === selected.wallRef) : null;
  const selectedCircuit = placement.circuits.find(item => item.id === selectedCircuitId);
  const settingsCircuit = placement.circuits.find(item => item.id === settingsCircuitId);
  const customCable = settingsCircuit && (customCableCircuitId === settingsCircuit.id || Boolean(settingsCircuit.cable && !ELECTRICAL_CABLE_CHOICES.includes(settingsCircuit.cable)));
  const selectedRoute = displayedRoutes.find(route => route.id === selectedRouteId);
  const selectedWaypoint = selectedRoutePoint && selectedRoute && selectedRoutePoint.routeId === selectedRoute.id && selectedRoutePoint.index > 0 && selectedRoutePoint.index < selectedRoute.points.length - 1 ? selectedRoutePoint : null;
  const activeRouteSegment = selectedRouteSegment && selectedRoute && selectedRouteSegment.routeId === selectedRoute.id && selectedRouteSegment.index < selectedRoute.points.length - 1 ? selectedRouteSegment : null;
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
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect?.width > 0 && rect?.height > 0) setViewport({ width: rect.width, height: rect.height });
    });
    observer.observe(svg);
    const onWheel = event => { event.preventDefault(); setZoom(current => clampZoom(current * (event.deltaY < 0 ? 1.12 : 1 / 1.12))); };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => { observer.disconnect(); svg.removeEventListener('wheel', onWheel); };
  }, []);
  useEffect(() => {
    const onKeyDown = event => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.target?.closest?.('dialog,[role="dialog"]')) return;
      const hasAction = drawingRoute || routePoints.length > 0 || routeStartId || networkDrawing || networkPoints.length > 0
        || networkFromId || networkToId || drawingDimension || dimensionStart || assigningCircuit || presetId || dragRef.current;
      if (hasAction) {
        event.preventDefault();
        const pointerId = dragRef.current?.pointerId;
        dragRef.current = null;
        if (pointerId != null && svgRef.current?.hasPointerCapture(pointerId)) svgRef.current.releasePointerCapture(pointerId);
        setDragPosition(null); setDragLabel(null);
        setDrawingRoute(false); setRoutePoints([]); setRouteStartId(''); setRouteCursor(null); setRouteNotice('');
        setNetworkDrawing(false); setNetworkPoints([]); setNetworkFromId(''); setNetworkToId(''); setNetworkNotice('');
        setDrawingDimension(false); setDimensionStart(null); setAssigningCircuit(false); setPresetId(null);
        return;
      }
      if (fullscreen) { event.preventDefault(); setFullscreen(false); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, drawingRoute, routePoints.length, routeStartId, networkDrawing, networkPoints.length, networkFromId, networkToId, drawingDimension, dimensionStart, assigningCircuit, presetId]);

  const change = useCallback(update => commit(next => {
    if (!next.placement) next.placement = createPlacement();
    update(next.placement);
    return next;
  }), [commit]);
  const setLayer = nextLayer => change(data => { data.activeLayer = nextLayer; });
  const setVisible = update => change(data => {
    data.visibleLayers = typeof update === 'function' ? update(data.visibleLayers || createPlacement().visibleLayers) : update;
  });
  const rebuildAutoRoutes = (data, circuitId, targetFloor = activeFloor) => {
    if (!circuitId) return;
    const panel = data.items.find(item => item.floor === targetFloor && item.kind === 'panel');
    if (!panel) return;
    const chosenTargets = new Set(data.routes.filter(route => route.floor === targetFloor && route.circuitId === circuitId && route.auto && route.purpose === 'selected-chain').map(route => route.targetItemId));
    data.routes = data.routes.filter(route => !(route.floor === targetFloor && route.circuitId === circuitId && route.auto && route.purpose !== 'selected-chain'));
    const routePlan = targetFloor === 1 ? project.plan : project.upperFloors?.[targetFloor - 2] || project.plan;
    data.routes.push(...proposeElectricalCircuitRoutes(data.items, targetFloor, circuitId, panel.id, createId, routePlan).filter(route => !chosenTargets.has(route.targetItemId)));
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
        data.items.filter(entry => entry.linkedApplianceId === item.id && entry.followsAppliance).forEach(linked => Object.assign(linked, { x: round(linked.x + item.x - selected.x), y: round(linked.y + item.y - selected.y) }));
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
  const itemPosition = (position, item) => item.kind === 'junction-box' ? position
    : item.surface === 'facade' ? facadePosition(position) : snapPlacementToWall(plan, position, item);
  const pointFromEvent = event => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: round(point.x / 100), y: round(point.y / 100) };
  };
  const insidePlan = point => point && (pointInPolygon(point, contour) || rooms.some(room => pointInPolygon(point, roomPoints(room))) || (plan.platforms || []).some(platform => platform.include !== false && point.x >= platform.x && point.x <= platform.x + platform.w && point.y >= platform.y && point.y <= platform.y + platform.h));
  const insideWorkingArea = point => insidePlan(point) && (!selectedRoom || pointInPolygon(point, roomPoints(selectedRoom)));
  const routeNodeAt = (point, tolerance) => nearestRouteNode(
    point,
    displayedItems.filter(item => item.layer === 'electric').map(item => ({ item, anchor: routeAnchor(item) })),
    tolerance,
  )?.item || null;
  const routeClickTolerance = () => {
    const matrix = svgRef.current?.getScreenCTM();
    const pixelsPerMetre = matrix ? Math.hypot(matrix.a, matrix.b) * 100 : 0;
    return pixelsPerMetre ? Math.min(.4, Math.max(.12, 26 / pixelsPerMetre)) : .2;
  };
  const addPlacementItem = (preset, location, height = preset.height || 0, wallRef = '', displayPlane = 'auto') => {
    const id = createId();
    const supplyKind = applianceSupplyKind(preset);
    const aligned = alignLightToNeighbors(location, { id, kind: preset.id, floor: activeFloor }, items, rooms).position;
    const mount = preset.id === 'junction-box' ? junctionWallMount(plan, aligned, selectedRoom) : null;
    change(data => {
      const placed = {
      id, floor: activeFloor, layer: preset.layer, kind: preset.id, label: preset.label,
      x: mount?.x ?? aligned.x, y: mount?.y ?? aligned.y, width: preset.width, depth: preset.depth,
      rotation: 0, height: mount ? junctionDefaultHeight(plan) : height,
      heightKnown: Boolean(mount) || wallRef !== '' || Boolean(preset.height), wallRef: mount?.wallRef || wallRef,
      displayPlane: mount ? 'wall' : displayPlane,
      ...(mount ? { diagramX: aligned.x, diagramY: aligned.y } : {}),
      surface: preset.surface || 'interior', dimensionSide: 'auto', showHeight: false, showName: false,
      labelOffsetX: .65, labelOffsetY: -.45,
      ...(preset.surface === 'facade' ? { anchorX: location.anchorX, anchorY: location.anchorY } : {}),
      circuitId: preset.layer === 'electric' && preset.id !== 'panel' ? selectedCircuitId || '' : '',
      ...(supplyKind ? { supplyItemId: `supply-${id}` } : {}),
      };
      data.items.push(placed, ...connectionPortsFor(placed));
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
    if (drawingRoute) {
      const target = routeNodeAt(point, routeClickTolerance());
      if (target) chooseRouteNode(target);
      else if (routeMode === 'manual' && routeStartId) addSurfaceRoutePoint(point);
      return;
    }
    if (networkDrawing) { if (insideWorkingArea(point)) setNetworkPoints(current => [...current, { ...point, z: Number(items.find(item => item.id === networkFromId)?.height) || 0 }]); return; }
    if (!activePreset) { setSelectedId(null); setSelectedRouteId(null); setSelectedNetworkRouteId(null); setSelectedWallRef(''); return; }
    const location = activePreset.surface === 'facade' ? snapToFacade(point, contour) : insideWorkingArea(point) ? itemPosition(point, activePreset) : null;
    if (!location || (activePreset.surface === 'facade' && location.distance > 1.5)) { setPresetId(null); setSelectedWallRef(''); return; }
    const nearestFace = wallFaces.map(face => ({ face, projection: projectToWallFace(face, location) })).sort((a, b) => a.projection.distance - b.projection.distance)[0];
    addPlacementItem(activePreset, location, activePreset.height || 0, nearestFace?.projection.distance < .35 ? nearestFace.face.ref : '');
  };
  const addNetworkRoute = (auto, pair = false) => {
    if (!isNetworkLayer(layer) || !networkFromId || !networkToId || networkFromId === networkToId) return;
    const from = items.find(item => item.id === networkFromId), to = items.find(item => item.id === networkToId);
    if (!from || !to) return;
    if (!pair && [from, to].some(item => item.connectionMedium && item.connectionMedium !== networkMedium)) { setNetworkNotice('Тип линии не совпадает с выбранным подключением прибора.'); return; }
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
    setNetworkNotice('Трасса соединена с выбранными точками.');
  };
  const updateNetworkRoute = (id, patch) => change(data => { const route = data.networks[layer]?.find(entry => entry.id === id); if (route) Object.assign(route, patch); });
  const addCircuit = () => {
    const id = createId();
    change(data => data.circuits.push({ id, name: `Группа ${data.circuits.length + 1}`, color: nextCircuitColor(data.circuits), cable: '', breaker: '', breakerAmps: null, note: '', accessories: [] }));
    setSelectedCircuitId(id);
    setLayer('electric');
  };
  const updateCircuitById = (id, patch) => change(data => { const circuit = data.circuits.find(item => item.id === id); if (circuit) Object.assign(circuit, patch); });
  const updateCircuit = patch => updateCircuitById(selectedCircuitId, patch);
  const toggleCircuitVisibility = (id, field) => change(data => {
    const hidden = new Set(data[field] || []);
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    data[field] = [...hidden];
  });
  const toggleAllCircuitVisibility = field => change(data => {
    const ids = data.circuits.map(circuit => circuit.id);
    const hidden = new Set(data[field] || []);
    const showAll = ids.every(id => hidden.has(id));
    ids.forEach(id => showAll ? hidden.delete(id) : hidden.add(id));
    data[field] = [...hidden];
  });
  const updateCircuitColor = (id, value) => {
    const color = validCircuitColor(value);
    if (!color) return;
    if (placement.circuits.some(circuit => circuit.id !== id && electricalGroupColor(circuit.id, placement.circuits).toLowerCase() === color)) {
      setCircuitColorError('Этот цвет уже занят другой группой.');
      return;
    }
    setCircuitColorError('');
    updateCircuitById(id, { color });
  };
  const clearCircuit = circuitId => change(data => {
    data.routes = data.routes.filter(route => route.circuitId !== circuitId);
    data.items.forEach(item => {
      if (item.circuitId !== circuitId) return;
      item.circuitId = '';
      item.controlsItemId = '';
      item.junctionItemId = '';
      item.pairedSwitchId = '';
    });
  });
  const changeDefaultRouteSurface = surface => {
    const next = surface === 'floor' ? 'floor' : 'ceiling';
    change(data => { data.defaultRouteSurface = next; });
    setRouteSurface(next);
  };
  const assignCircuit = (itemId, circuitId) => change(data => {
    const item = data.items.find(entry => entry.id === itemId);
    if (!item || item.kind === 'panel') return;
    const previous = reassignElectricalPoint(data, itemId, circuitId);
    rebuildAutoRoutes(data, previous);
    rebuildAutoRoutes(data, circuitId);
  });
  const finishRoute = target => {
    const panel = items.find(item => item.kind === 'panel');
    const source = items.find(item => item.id === routeStartId);
    const circuitId = selectedCircuitId;
    if (!source || !target || source.id === target.id || !circuitId) { setRouteNotice('Выберите две разные электроточки и группу.'); return; }
    if (source && target && source.id !== target.id && circuitId) {
      const next = { ...routeAnchor(target), z: Number(target.height) || 0, surface: 'device', wallRef: target.wallRef || '' };
      const finalSurface = routeSurface;
      const leg = finishManualRoute(routePoints, next, finalSurface, plan);
      if (!leg) { setRouteNotice('Точка не лежит на текущем направлении. Укажите угол поворота, затем выберите эту точку.'); return; }
      const drawnPoints = leg;
      // Store a junction-to-panel cable in panel-to-junction direction.
      const reverseFeed = target.kind === 'panel' && source.kind === 'junction-box';
      const fromId = reverseFeed ? target.id : source.id;
      const toId = reverseFeed ? source.id : target.id;
      const points = reverseFeed ? [...drawnPoints].reverse() : drawnPoints;
      change(data => {
        const priorGroups = new Set([reassignElectricalPoint(data, source.id, circuitId), reassignElectricalPoint(data, target.id, circuitId)]);
        if (source.kind === 'junction-box' && target.kind !== 'panel') {
          const current = data.items.find(item => item.id === target.id);
          if (current) current.junctionItemId = source.id;
        }
        data.routes.push({ id: createId(), floor: activeFloor, circuitId,
          panelItemId: panel?.id || '', fromItemId: fromId, targetItemId: toId, auto: false,
          purpose: 'manual', surface: finalSurface, wallHeight: wallRouteHeight, rebuildOnMove: false, points });
        for (const prior of priorGroups) if (prior && prior !== circuitId) rebuildAutoRoutes(data, prior);
        rebuildAutoRoutes(data, circuitId);
      });
      setRouteNotice('Участок сохранён. Ведите кабель от этой точки дальше или нажмите пробел для завершения.');
    }
    const nextSource = target;
    setRoutePoints([{ ...routeAnchor(nextSource), z: Number(nextSource.height) || 0, surface: 'device', wallRef: nextSource.wallRef || '' }]);
    setRouteStartId(nextSource.id);
    setRouteCursor(null);
  };
  const finishAutomaticRoute = target => {
    const source = items.find(item => item.id === routeStartId);
    if (!source || !target || source.id === target.id || !selectedCircuitId) return;
    change(data => {
      const priorGroups = new Set([reassignElectricalPoint(data, source.id, selectedCircuitId), reassignElectricalPoint(data, target.id, selectedCircuitId)]);
      connectSelectedElectricalPoints(data, activeFloor, selectedCircuitId, source.id, target.id, createId, plan);
      if (source.kind === 'junction-box' && target.kind !== 'panel') {
        const current = data.items.find(item => item.id === target.id);
        if (current) current.junctionItemId = source.id;
      }
      for (const prior of priorGroups) if (prior && prior !== selectedCircuitId) rebuildAutoRoutes(data, prior);
      rebuildAutoRoutes(data, selectedCircuitId);
    });
    setRouteStartId(target.id);
    setRoutePoints([{ ...routeAnchor(target), z: Number(target.height) || 0, surface: 'device', wallRef: target.wallRef || '' }]);
    setRouteCursor(null);
    setRouteNotice('Участок группы сохранён. Выберите следующую точку или нажмите пробел.');
  };
  const chooseRouteNode = item => {
    if (item.layer !== 'electric') { setRouteNotice('Для электрической трассы выберите электроточку.'); return; }
    if (!routeStartId) {
      if (!selectedCircuitId) { setRouteNotice('Сначала выберите группу во вкладке «Группы».'); return; }
      change(data => {
        const previous = reassignElectricalPoint(data, item.id, selectedCircuitId);
        if (previous && previous !== selectedCircuitId) rebuildAutoRoutes(data, previous);
        rebuildAutoRoutes(data, selectedCircuitId);
      });
      setRouteNotice('');
      setRouteStartId(item.id);
      setRoutePoints([{ ...routeAnchor(item), z: Number(item.height) || 0, surface: 'device', wallRef: item.wallRef || '' }]);
      return;
    }
    if (item.id !== routeStartId) (routeMode === 'automatic' ? finishAutomaticRoute : finishRoute)(item);
    else { setRoutePoints([{ ...routeAnchor(item), z: Number(item.height) || 0, surface: 'device', wallRef: item.wallRef || '' }]); setRouteNotice('Начните новый участок от этой точки.'); }
  };
  const pendingManualRoute = useCallback(() => {
    const source = items.find(item => item.id === routeStartId);
    const circuitId = selectedCircuitId;
    if (!source || !circuitId || routePoints.length < 2 || electricalRouteLength3d(routePoints) <= .005) return null;
    return { id: createId(), floor: activeFloor, circuitId,
      panelItemId: items.find(item => item.kind === 'panel')?.id || '', fromItemId: source.id,
      targetItemId: '', auto: false, purpose: 'manual', surface: routeSurface,
      wallHeight: wallRouteHeight, rebuildOnMove: false, points: routePoints.map(point => ({ ...point })) };
  }, [items, routeStartId, selectedCircuitId, routePoints, activeFloor, routeSurface, wallRouteHeight]);
  const selectRouteCircuit = circuitId => {
    if (circuitId === selectedCircuitId) return;
    const pending = drawingRoute && routeMode === 'manual' ? pendingManualRoute() : null;
    if (pending) change(data => data.routes.push(pending));
    setSelectedCircuitId(circuitId || null);
    setArmedCircuitNameId(null);
    setRouteStartId('');
    setRoutePoints([]);
    setRouteCursor(null);
    if (drawingRoute) setRouteNotice('Группа переключена. Выберите начальную электроточку для следующей линии.');
  };
  const endManualRoute = useCallback(() => {
    const pending = routeMode === 'manual' ? pendingManualRoute() : null;
    if (pending) change(data => data.routes.push(pending));
    setDrawingRoute(false); setRoutePoints([]); setRouteStartId(''); setRouteCursor(null);
    setRouteNotice('Ввод трассы завершён. Для продолжения снова выберите способ построения.');
  }, [routeMode, pendingManualRoute, change]);
  useEffect(() => {
    const onSpace = event => {
      if (!drawingRoute || (event.code !== 'Space' && event.key !== ' ') || event.defaultPrevented || event.target?.closest?.('input,textarea,select,dialog,[role="dialog"],[contenteditable="true"]')) return;
      event.preventDefault();
      endManualRoute();
    };
    window.addEventListener('keydown', onSpace);
    return () => window.removeEventListener('keydown', onSpace);
  }, [drawingRoute, routeMode, endManualRoute]);
  const chooseNetworkNode = item => {
    if (item.layer !== layer) { setNetworkNotice('Выберите точку этой инженерной системы.'); return; }
    if (!networkFromId || (networkToId && !networkDrawing)) {
      setNetworkFromId(item.id); setNetworkToId('');
      if (item.connectionMedium) setNetworkMedium(item.connectionMedium);
      setNetworkNotice('Начало выбрано. Укажите вторую точку на плане или развёртке комнаты.');
      return;
    }
    if (item.id === networkFromId) { setNetworkNotice('Начало и конец трассы должны различаться.'); return; }
    if (item.connectionMedium && item.connectionMedium !== networkMedium) { setNetworkNotice('У этой точки другой тип подключения. Выберите соответствующую линию.'); return; }
    setNetworkToId(item.id);
    setNetworkNotice('Конец выбран. Постройте маршрут автоматически или нанесите промежуточные точки вручную.');
  };
  const pickCanvasItem = item => {
    if (drawingRoute) { chooseRouteNode(item); return; }
    if (assigningCircuit && layer === 'electric' && item.layer === 'electric' && item.kind !== 'panel') {
      if (selectedCircuitId) assignCircuit(item.id, item.circuitId === selectedCircuitId ? '' : selectedCircuitId);
      setSelectedId(item.id);
      return;
    }
    if (isNetworkLayer(layer) && item.layer === layer && !activePreset) {
      chooseNetworkNode(item); setSelectedId(item.id); return;
    }
    if (isNetworkLayer(layer) && !activePreset) {
      const ports = items.filter(entry => entry.linkedApplianceId === item.id && entry.layer === layer && entry.connectionMedium === networkMedium);
      if (ports.length === 1) { chooseNetworkNode(ports[0]); setSelectedId(ports[0].id); return; }
      if (ports.length > 1) setNetworkNotice('У прибора несколько подходящих выводов. Выберите цветную точку или вывод в свойствах.');
    }
    setSelectedRouteId(null); setSelectedId(item.id); setPresetId(null);
  };
  const closestWallTo = position => wallFaces.map(face => ({ face, projection: projectToWallFace(face, position) })).sort((a, b) => a.projection.distance - b.projection.distance)[0];
  const roomPlace = (position, height, edgeIndex) => {
    if (!activePreset || !selectedRoom) return;
    const location = activePreset.surface === 'facade' ? snapToFacade(position, contour) : itemPosition(position, activePreset);
    if (!location || !insidePlan(location)) return;
    const nearest = closestWallTo(location);
    addPlacementItem(activePreset, location, height, edgeIndex >= 0 && nearest?.projection.distance < .5 ? nearest.face.ref : '', edgeIndex >= 0 ? 'wall' : 'floor');
  };
  const roomMove = (itemId, position, height, edgeIndex) => {
    if (elementsLocked) return;
    const current = items.find(item => item.id === itemId);
    if (!current || !insidePlan(position)) return;
    const aligned = alignLightToNeighbors(position, current, items, rooms).position;
    const location = current.surface === 'facade' ? snapToFacade(position, contour) : aligned;
    const mount = current.kind === 'junction-box' ? junctionWallMount(plan, location, selectedRoom) : null;
    const nearest = closestWallTo(location);
    change(data => {
      const item = data.items.find(entry => entry.id === itemId);
      if (!item) return;
      const dx = (mount?.x ?? location.x) - item.x, dy = (mount?.y ?? location.y) - item.y;
      Object.assign(item, { x: mount?.x ?? location.x, y: mount?.y ?? location.y,
        ...(mount ? { diagramX: location.x, diagramY: location.y } : {}),
        ...(height == null ? mount && !item.heightKnown ? { height: junctionDefaultHeight(plan), heightKnown: true } : {} : { height, heightKnown: true }),
        wallRef: mount?.wallRef || (edgeIndex >= 0 && nearest?.projection.distance < .5 ? nearest.face.ref : ''),
        displayPlane: mount ? 'wall' : edgeIndex >= 0 ? 'wall' : 'floor' });
      if (item.linkedApplianceId) item.followsAppliance = false;
      data.items.filter(entry => entry.linkedApplianceId === item.id && entry.followsAppliance).forEach(linked => Object.assign(linked, { x: round(linked.x + dx), y: round(linked.y + dy) }));
    });
    setSelectedId(itemId);
  };
  const roomRoutePoint = (position, height) => {
    if (networkDrawing) setNetworkPoints(current => [...current, { ...position, z: height }]);
    else if (drawingRoute) {
      const target = routeNodeAt(position, .25);
      if (target) chooseRouteNode(target);
      else if (routeMode === 'manual' && routeStartId) addSurfaceRoutePoint(position);
    }
  };
  const addSurfaceRoutePoint = position => {
    const choice = routeMode === 'manual' ? manualRouteSnap(plan, position, displayedRoutes, routeSurface, .12, manualGuideAnchors)
      : routeSurface === 'wall' ? { position, surface: 'wall', wallRef: nearestRouteWall(plan, position)?.face.ref }
        : routeSurfaceAtPoint(plan, gridPoint(position), routeSurface);
    if (!choice || (choice.surface === 'wall' && !choice.wallRef)) { setRouteNotice('Для стены укажите точку рядом с ней.'); return; }
    const next = routeMode === 'manual' ? appendManualRouteWaypoint(routePoints, choice, plan, wallRouteHeight)
      : appendSurfaceWaypoint(routePoints, choice.position, choice.surface, plan, wallRouteHeight, choice.wallRef);
    if (!next) { setRouteNotice('Участок по стене ведите через соседний угол или выберите пол/потолок.'); return; }
    setRoutePoints(next);
    setRouteNotice('');
  };
  const updateRoute = (id, patch) => change(data => { const route = data.routes.find(entry => entry.id === id); if (route) { Object.assign(route, patch); if (patch.auto === false) data.electricalRouteMode = 'manual'; if (patch.auto === true) data.electricalRouteMode = 'automatic'; } });
  const replaceRouteGeometry = (route, points) => {
    if (!route || !points || linesLocked) return;
    const geometry = route.purpose === 'manual' ? points : points.some(point => point.surface) ? orthogonalizeSurfaceRoute(points, plan) : points;
    change(data => { const target = data.routes.find(entry => entry.id === route.id); if (target) { Object.assign(target, { auto: false, rebuildOnMove: false, points: geometry }); data.electricalRouteMode = 'manual'; } });
  };
  const setRouteSegmentSurface = (route, index, surface, height = wallRouteHeight) => {
    if (route.purpose === 'manual') {
      const points = route.points.map(point => ({ ...point }));
      points[index + 1] = { ...points[index + 1], surface,
        ...(points[index + 1].waypoint ? { z: routeSurfaceHeight(plan, surface, height) } : {}) };
      replaceRouteGeometry(route, points);
      setSelectedRouteSegment({ routeId: route.id, index });
      return;
    }
    const points = replaceRouteSurface(route.points, index, surface, plan, height);
    if (!points) return;
    replaceRouteGeometry(route, points);
    setSelectedRouteSegment({ routeId: route.id, index });
  };
  const setWholeRouteSurface = (route, surface) => {
    if (route.purpose === 'manual') {
      if (surface === 'wall' && route.points.some(point => point.waypoint && (nearestRouteWall(plan, point)?.projection.distance ?? Infinity) > .12)) {
        setRouteNotice('Точки внутри комнаты останутся на месте. Для стены перенесите их на стену вручную.');
        return;
      }
      change(data => {
        const target = data.routes.find(entry => entry.id === route.id);
        if (!target) return;
        target.surface = surface; target.wallHeight = wallRouteHeight; target.rebuildOnMove = false;
        target.points = route.points.map(point => point.waypoint ? { ...point, surface, z: routeSurfaceHeight(plan, surface, wallRouteHeight) } : { ...point });
      });
      setRouteNotice('');
      return;
    }
    if (surface === 'wall') {
      let cursor = route.points[0];
      for (const target of [...route.points.filter(point => point.waypoint), route.points.at(-1)]) {
        const leg = surfaceRouteLeg(cursor, target, 'wall', plan, wallRouteHeight, target.wallRef || '');
        if (!leg) { setSelectedCircuitId(route.circuitId); setRouteNotice('Вся линия не проходит по соседним стенам. Выберите участки по стене отдельно.'); return; }
        cursor = leg.at(-1);
      }
    }
    change(data => {
    const target = data.routes.find(entry => entry.id === route.id);
    if (!target) return;
    target.auto = false;
    data.electricalRouteMode = 'manual';
    target.surface = surface;
    target.wallHeight = wallRouteHeight;
     target.rebuildOnMove = true;
    target.points = route.points.map(point => point.waypoint ? { ...point, surface } : { ...point });
    });
    setRouteNotice('');
  };
  const insertRouteWaypointAt = (route, segmentIndex, location) => {
    const point = pointOnRouteSegment(route.points, segmentIndex, location);
    if (point) { replaceRouteGeometry(route, insertRoutePoint(route.points, segmentIndex, point)); setSelectedRoutePoint({ routeId: route.id, index: segmentIndex + 1 }); }
  };
  const removeRouteWaypoint = (route, index) => {
    const points = removeRoutePoint(route?.points, index);
    if (!points) return;
    replaceRouteGeometry(route, points);
    setSelectedRoutePoint(null);
  };
  const updateRoutePoint = (id, index, point) => change(data => { const route = data.routes.find(entry => entry.id === id); const resolved = routes.find(entry => entry.id === id); if (route && resolved && index > 0 && index < resolved.points.length - 1) {
    if (route.auto) route.points = resolved.points.map(entry => ({ ...entry }));
    route.auto = false;
    data.electricalRouteMode = 'manual';
    const previous = route.points[index];
    const location = previous.surface === 'wall' ? nearestRouteWall(plan, point, previous.wallRef)?.projection.foot || point : route.purpose === 'manual' ? point : gridPoint(point);
    route.points[index] = { ...previous, x: round(location.x), y: round(location.y) };
    if (route.purpose !== 'manual' && route.points.some(entry => entry.surface)) route.points = orthogonalizeSurfaceRoute(route.points, plan);
  } });
  const addRouteWaypoint = route => {
    if (!route || route.points.length < 2) return;
    const before = route.points[route.points.length - 2], after = route.points.at(-1);
    change(data => { const target = data.routes.find(entry => entry.id === route.id); if (target) {
      target.auto = false; data.electricalRouteMode = 'manual'; target.points = route.points.map(point => ({ ...point }));
      const midpoint = { x: round((before.x + after.x) / 2), y: round((before.y + after.y) / 2) };
      target.points.splice(target.points.length - 1, 0, { ...(route.purpose === 'manual' ? midpoint : gridPoint(midpoint)), z: round(((before.z || 0) + (after.z || 0)) / 2), ...(before.surface ? { surface: before.surface } : {}) });
      if (route.purpose !== 'manual' && target.points.some(entry => entry.surface)) target.points = orthogonalizeSurfaceRoute(target.points, plan);
    } });
  };
  const autoRouteCircuit = () => {
    const panel = items.find(item => item.kind === 'panel');
    if (!panel || !selectedCircuitId) return;
    change(data => rebuildAutoRoutes(data, selectedCircuitId));
  };
  const selectRouteMode = mode => {
    if (mode !== 'manual' && mode !== 'automatic') return;
    const pending = drawingRoute && routeMode === 'manual' ? pendingManualRoute() : null;
    change(data => {
      if (pending) data.routes.push(pending);
      data.electricalRouteMode = mode;
      if (mode === 'automatic') for (let targetFloor = 1; targetFloor <= floorCount; targetFloor += 1) data.circuits.forEach(circuit => rebuildAutoRoutes(data, circuit.id, targetFloor));
    });
    setDrawingRoute(false); setRoutePoints([]); setRouteStartId(''); setRouteCursor(null);
    setSelectedRouteId(null); setRouteNotice('');
    setRouteSurface(placement.defaultRouteSurface || 'ceiling');
  };
  const beginManualRoute = () => {
    if (routeMode !== 'manual') selectRouteMode('manual');
    setSidebarTab('groups'); setLayer('electric'); setFullscreenPanel('library');
    setDrawingRoute(true); setAssigningCircuit(false); setPresetId(null);
    setRoutePoints([]); setRouteStartId(''); setRouteCursor(null);
    setRouteNotice('Выберите любую электроточку для начала кабеля.'); setDrawingDimension(false);
    setVisible(current => ({ ...current, electric: true }));
  };
  const beginAutomaticRoute = () => {
    if (routeMode !== 'automatic') selectRouteMode('automatic');
    setSidebarTab('groups'); setLayer('electric'); setFullscreenPanel('library');
    setDrawingRoute(true); setAssigningCircuit(false); setPresetId(null);
    setRoutePoints([]); setRouteStartId(''); setRouteCursor(null);
    setRouteNotice('Выберите начальную электроточку, затем следующую. Каждая выбранная точка перейдёт в указанную группу.');
    setDrawingDimension(false);
    setVisible(current => ({ ...current, electric: true }));
  };
  const chooseDrawingElement = entry => {
    setPresetId(current => current === entry.id ? null : entry.id);
    setLayer(entry.layer); setCategory('all'); setQuery('');
    setVisible(current => ({ ...current, [entry.layer]: true }));
    setSelectedId(null); setDrawingRoute(false); setRoutePoints([]);
    setDrawingDimension(false); setDimensionStart(null);
    setNetworkDrawing(false); setNetworkPoints([]);
  };
  const beginDrag = (event, item) => {
    if (elementsLocked || drawingRoute || drawingDimension || networkDrawing || assigningCircuit || (isNetworkLayer(layer) && !event.altKey)) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    const origin = schematicPosition(item);
    dragRef.current = { id: item.id, pointerId: event.pointerId, start: point, origin, last: origin, surface: item.surface };
    setSelectedId(item.id);
    setPresetId(null);
  };
  const beginRouteSegmentDrag = (event, route, segmentIndex) => {
    if (linesLocked || drawingRoute || networkDrawing || activePreset) return;
    setSelectedRouteSegment({ routeId: route.id, index: segmentIndex });
    const start = pointFromEvent(event);
    if (!start) return;
    event.preventDefault(); event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = { routeId: route.id, segmentIndex, points: route.points, pointerId: event.pointerId, start, origin: start, last: start, clientX: event.clientX, clientY: event.clientY, delta: 0 };
  };
  const beginLabelDrag = (event, item) => {
    if (elementsLocked) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault(); event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    const schematic = schematicPosition(item);
    const origin = { x: schematic.x + (item.labelOffsetX ?? .65), y: schematic.y + (item.labelOffsetY ?? -.45) };
    dragRef.current = { id: item.id, pointerId: event.pointerId, start: point, origin, last: origin, label: true };
    setSelectedId(item.id);
  };
  const moveDrag = event => {
    if (drawingRoute) {
      const position = pointFromEvent(event);
      if (position) {
        const snapped = routeMode === 'manual' ? manualRouteSnap(plan, position, displayedRoutes, routeSurface, .12, manualGuideAnchors) : null;
        const choice = snapped ? constrainManualRouteChoice(routePoints, snapped, plan) : null;
        setRouteCursor(choice ? { ...choice.position, surface: choice.surface, wallRef: choice.wallRef, snappedTo: choice.snappedTo, guides: choice.guides } : routeMode === 'manual' ? null : gridPoint(position));
      }
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
    if (drag.segmentIndex != null) {
      const direction = routeSegmentDirection(drag.points[drag.segmentIndex], drag.points[drag.segmentIndex + 1]);
      const axis = direction === 'horizontal' ? 'y' : direction === 'vertical' ? 'x' : null;
      if (!axis) return;
      drag.delta = Math.round((point[axis] - drag.start[axis]) * 20) / 20;
      drag.last = point;
      setDragPosition({ routeId: drag.routeId, segmentIndex: drag.segmentIndex, points: shiftRouteSegment(drag.points, drag.segmentIndex, drag.delta) });
      return;
    }
    if (drag.routeId) { drag.last = gridPoint(point); setDragPosition({ routeId: drag.routeId, index: drag.index, ...drag.last }); return; }
    const proposed = { x: round(drag.origin.x + point.x - drag.start.x), y: round(drag.origin.y + point.y - drag.start.y) };
    if (drag.label) { drag.last = proposed; setDragLabel({ id: drag.id, x: proposed.x, y: proposed.y }); return; }
    const item = items.find(entry => entry.id === drag.id);
    const candidate = item ? alignLightToNeighbors(proposed, item, items, rooms) : { position: proposed, guides: [] };
    const location = drag.surface === 'facade' ? snapToFacade(candidate.position, contour) : insideWorkingArea(candidate.position) && item ? itemPosition(candidate.position, item) : null;
    if (!location) return;
    drag.last = location;
    setDragPosition({ id: drag.id, ...location, guides: candidate.guides });
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
    if (drag.segmentIndex != null) {
      const route = routes.find(entry => entry.id === drag.routeId);
      const travelled = Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY);
      if (event.type !== 'pointercancel' && route && !linesLocked) {
        if (travelled > 5 && Math.abs(drag.delta) >= .01) replaceRouteGeometry(route, shiftRouteSegment(drag.points, drag.segmentIndex, drag.delta));
        else if (travelled <= 5 && event.shiftKey) insertRouteWaypointAt(route, drag.segmentIndex, drag.start);
      }
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      dragRef.current = null; setDragPosition(null);
      return;
    }
    const moved = drag.last.x !== drag.origin.x || drag.last.y !== drag.origin.y;
    if (moved && event.type !== 'pointercancel') {
      const location = drag.last;
      if (drag.routeId) updateRoutePoint(drag.routeId, drag.index, location);
      else
      change(data => { const target = data.items.find(item => item.id === drag.id); if (target) {
        const mount = !drag.label && target.kind === 'junction-box' ? junctionWallMount(plan, location, selectedRoom) : null;
        const dx = (mount?.x ?? location.x) - target.x, dy = (mount?.y ?? location.y) - target.y;
        const schematic = schematicPosition(target);
        Object.assign(target, drag.label ? { labelOffsetX: round(location.x - schematic.x), labelOffsetY: round(location.y - schematic.y) }
          : { x: mount?.x ?? location.x, y: mount?.y ?? location.y,
            ...(mount ? { diagramX: location.x, diagramY: location.y, wallRef: mount.wallRef, displayPlane: 'wall',
              ...(!target.heightKnown ? { height: junctionDefaultHeight(plan), heightKnown: true } : {}) } : {}),
            ...(drag.surface === 'facade' ? { anchorX: location.anchorX, anchorY: location.anchorY } : {}) });
        if (!drag.label) data.items.filter(item => item.linkedApplianceId === target.id && item.followsAppliance).forEach(linked => Object.assign(linked, { x: round(linked.x + dx), y: round(linked.y + dy) }));
        if (!drag.label && target.linkedApplianceId) target.followsAppliance = false;
        if (!drag.label && drag.surface !== 'facade' && !mount) {
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
    setLayer(nextLayer); setSidebarTab('elements'); setCategory('all'); setQuery(''); setPresetId(null);
    setAssigningCircuit(false); setNetworkNotice('');
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

  const captureWorkspace = async () => {
    const target = selectedRoom ? document.querySelector('.placement-room-unfold-grid') : svgRef.current;
    if (!target || snapshotBusy) return;
    setSnapshotBusy(true); setSnapshotError('');
    try {
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(target, { backgroundColor: '#fff', pixelRatio: 2, cacheBust: true });
      if (!blob) throw new Error('empty image');
      const filename = `eft-${selectedRoom ? 'room' : 'plan'}-floor-${activeFloor}-${new Date().toISOString().slice(0, 10)}.png`;
      setSnapshot({ blob, url: URL.createObjectURL(blob), filename });
    } catch {
      setSnapshotError('Не удалось создать снимок. Повторите попытку после полной загрузки плана.');
    } finally { setSnapshotBusy(false); }
  };
  const saveSnapshot = () => {
    if (!snapshot) return;
    const link = document.createElement('a');
    link.href = snapshot.url; link.download = snapshot.filename;
    document.body.append(link); link.click(); link.remove();
  };
  const shareSnapshot = async () => {
    if (!snapshot) return;
    setSnapshotError('');
    const file = new File([snapshot.blob], snapshot.filename, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] }) && navigator.share) await navigator.share({ files: [file], title: 'План EFT' });
      else if (navigator.clipboard?.write && globalThis.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': snapshot.blob })]);
        setSnapshotError('Снимок скопирован. Вставьте его в сообщение или документ.');
      } else setSnapshotError('Обмен файлами недоступен в этом браузере. Сохраните PNG на устройство.');
    } catch (error) { if (error?.name !== 'AbortError') setSnapshotError('Не удалось поделиться снимком. Сохраните PNG на устройство.'); }
  };

  const deleteSelection = () => {
    if (selectedWaypoint) { removeRouteWaypoint(selectedRoute, selectedWaypoint.index); return; }
    if (selectedRouteId) {
      change(data => { data.routes = data.routes.filter(route => route.id !== selectedRouteId); });
      setSelectedRouteId(null);
      return;
    }
    if (!selected) return;
    change(data => {
      const removed = new Set([selected.id, ...data.items.filter(item => item.linkedApplianceId === selected.id).map(item => item.id)]);
      data.items = data.items.filter(item => !removed.has(item.id));
      data.routes = data.routes.filter(route => !removed.has(route.targetItemId) && !removed.has(route.panelItemId) && !removed.has(route.fromItemId));
      Object.keys(NETWORK_SYSTEMS).forEach(system => { data.networks[system] = data.networks[system].filter(route => !removed.has(route.fromId) && !removed.has(route.toId)); });
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
      if (selected && !elementsLocked && steps[event.key] && !event.altKey && !event.ctrlKey && !event.metaKey) {
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

  const routePreview = drawingRoute && routePoints.length && routeCursor
    ? routeMode === 'manual' ? appendManualRouteWaypoint(routePoints, { position: routeCursor, surface: routeCursor.surface, wallRef: routeCursor.wallRef }, plan, wallRouteHeight) || routePoints
      : routeBetweenElectricalNodes({ ...routePoints.at(-1), height: routePoints.at(-1).z }, { ...routeCursor, height: routeCursor.z ?? routePoints.at(-1).z }, null, plan) : routePoints;
  const layerToolbar = <div className="placement-layers" role="toolbar" aria-label="Слои плана">{PLACEMENT_LAYERS.map(entry => <div className={`placement-layer-row ${layer === entry.id ? 'active' : ''}`} key={entry.id}><button className="placement-layer-select" disabled={entry.future} onClick={() => changeLayer(entry.id)}>{entry.label}{entry.future ? <small>позже</small> : null}</button>{!entry.future ? <button className="placement-eye" aria-label={`${visible[entry.id] ? 'Скрыть' : 'Показать'} ${entry.label}`} onClick={() => setVisible(old => ({ ...old, [entry.id]: !old[entry.id] }))}>{visible[entry.id] ? <Eye size={16}/> : <EyeOff size={16}/>}</button> : null}</div>)}</div>;
  const drawingRail = <div className="placement-drawing-rail" role="toolbar" aria-label="Инструменты рисования на плане">
    <button type="button" className={sidebarTab === 'elements' ? 'active' : ''} aria-label="Открыть элементы для рисования" aria-pressed={sidebarTab === 'elements'} title="Элементы для рисования" onClick={() => { setSidebarTab('elements'); setFullscreenPanel('library'); }}><Boxes size={20}/></button>
    <button type="button" className={sidebarTab === 'groups' ? 'active' : ''} aria-label="Открыть группы и трассы" aria-pressed={sidebarTab === 'groups'} title="Группы и трассы" onClick={() => { setSidebarTab('groups'); setLayer('electric'); setFullscreenPanel('library'); }}><Route size={20}/></button>
    <span className="placement-drawing-rail-separator" aria-hidden="true"/>
    <button type="button" className={routeMode === 'automatic' && drawingRoute ? 'active' : ''} aria-label="Рисовать кабель автоматически" aria-pressed={routeMode === 'automatic' && drawingRoute} title="Рисовать кабель автоматически" onClick={beginAutomaticRoute}><RotateCw size={20}/></button>
    <button type="button" className={routeMode === 'manual' && drawingRoute ? 'active' : ''} aria-label="Рисовать кабель вручную" aria-pressed={routeMode === 'manual' && drawingRoute} title="Рисовать кабель вручную" onClick={beginManualRoute}><PencilLine size={20}/></button>
    {drawingRoute ? <button type="button" aria-label="Завершить трассу" title="Завершить трассу · пробел" onClick={endManualRoute}><Check size={20}/></button> : null}
    <span className="placement-drawing-rail-separator" aria-hidden="true"/>
    <button type="button" aria-label="Снимок рабочего поля" title="Снимок рабочего поля" disabled={snapshotBusy} onClick={captureWorkspace}><Camera size={20}/></button>
  </div>;
  return <main className={`placement-screen${fullscreen ? ` placement-fullscreen placement-fullscreen-${fullscreenPanel || 'canvas'}` : ''}${selectedRoom ? ' placement-room-focused' : ''}`}>
    <header className="placement-heading"><div><h1>Инженерия</h1></div><div className="placement-heading-actions"><button className="placement-fullscreen-exit" title="Свернуть полноэкранный план" onClick={() => setFullscreen(false)}><Minimize2 size={16}/> Свернуть</button><div className="placement-fullscreen-panel-tools" role="group" aria-label="Панели полноэкранного плана"><button className={fullscreenPanel === 'library' ? 'active' : ''} aria-pressed={fullscreenPanel === 'library'} onClick={() => setFullscreenPanel(current => current === 'library' ? null : 'library')}><Boxes size={16}/> Библиотека</button><button className={fullscreenPanel === 'properties' ? 'active' : ''} aria-pressed={fullscreenPanel === 'properties'} onClick={() => setFullscreenPanel(current => current === 'properties' ? null : 'properties')}><Wrench size={16}/> Свойства</button></div><button onClick={printWorkerSheets} title="Комплект планов и ведомостей для печати или PDF"><Printer size={17}/> Планы для рабочих / PDF</button></div></header>
    <div className="placement-workspace">
      <aside className="placement-sidebar"><nav className="placement-sidebar-tabs" aria-label="Разделы инженерии">{[['elements', 'Элементы'], ['groups', 'Группы'], ['rooms', 'Комнаты'], ['bill', 'Ведомость']].map(([id, label]) => <button key={id} className={sidebarTab === id ? 'active' : ''} aria-pressed={sidebarTab === id} onClick={() => { setSidebarTab(id); if (id !== 'elements') setLayer('electric'); }}>{label}</button>)}</nav>
        {sidebarTab === 'elements' ? <div className="placement-sidebar-section"><h2>Библиотека элементов</h2>
        <div className="placement-catalog-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск по всей библиотеке" aria-label="Поиск по библиотеке"/></div>
        <div className="placement-catalog-layout"><nav className="placement-category-rail" aria-label="Группы элементов"><button className={category === 'all' ? 'active' : ''} title="Все элементы" aria-label="Все элементы" aria-pressed={category === 'all'} onClick={() => setCategory('all')}><LayoutGrid size={20}/></button>{groups.map(group => { const Icon = groupIcons[group.id] || Droplets; return <button key={group.id} className={category === group.id ? 'active' : ''} title={group.label} aria-label={group.label} aria-pressed={category === group.id} onClick={() => setCategory(group.id)}><Icon size={20}/></button>; })}</nav><div className="placement-catalog-results">
        <div className="placement-palette-heading"><h3>{searchTerm ? 'Результаты поиска' : category === 'all' ? PLACEMENT_LAYERS.find(entry => entry.id === layer)?.label : PLACEMENT_GROUPS.find(entry => entry.id === category)?.label}</h3><small>{catalogItems.length} элементов</small></div>
        <div className="placement-palette">{catalogItems.map(entry => <button key={entry.id} className={presetId === entry.id ? 'active' : ''} title={entry.label} onClick={() => chooseDrawingElement(entry)}><CatalogSymbol preset={entry}/><span className="placement-card-copy"><strong>{entry.label}</strong><small>{Math.round(entry.width * 100)} × {Math.round(entry.depth * 100)} см{searchTerm ? ` · ${PLACEMENT_LAYERS.find(layerEntry => layerEntry.id === entry.layer)?.label}` : entry.surface === 'facade' ? ' · фасад' : ''}</small></span></button>)}</div>
        {!catalogItems.length ? <p className="placement-catalog-empty">По этому запросу элементов нет.</p> : null}</div></div>
        {isNetworkLayer(layer) ? <PlacementNetworkPanel system={layer} floor={activeFloor} placement={placement} room={selectedRoom} notice={networkNotice} fromId={networkFromId} toId={networkToId} medium={networkMedium} onFrom={setNetworkFromId} onTo={setNetworkToId} onMedium={setNetworkMedium} onAuto={() => addNetworkRoute(true)} onPair={() => addNetworkRoute(true, true)} onBeginManual={() => { setNetworkDrawing(true); setNetworkPoints([]); setPresetId(null); setDrawingDimension(false); setDrawingRoute(false); }} onFinishManual={() => addNetworkRoute(false)} onCancelManual={() => { setNetworkDrawing(false); setNetworkPoints([]); }} drawing={networkDrawing} points={networkPoints} selectedRouteId={selectedNetworkRouteId} onSelectRoute={setSelectedNetworkRouteId} onUpdateRoute={updateNetworkRoute} onDeleteRoute={id => { change(data => { data.networks[layer] = data.networks[layer].filter(route => route.id !== id); }); setSelectedNetworkRouteId(null); }}/> : null}
        </div> : null}
        {['groups', 'rooms'].includes(sidebarTab) ? <div className="placement-sidebar-section">
        {layer === 'electric' ? <div className="placement-circuits">
          {sidebarTab === 'groups' ? <div className="placement-circuit-pinned">
            <div className="placement-palette-heading"><h3>Группы щита</h3><div className="placement-circuit-heading-actions"><button className={placement.circuits.length && placement.circuits.every(circuit => hiddenCircuitLines.has(circuit.id)) ? 'is-hidden' : ''} disabled={!placement.circuits.length} onClick={() => toggleAllCircuitVisibility('hiddenCircuitLineIds')} title="Показать или скрыть линии всех групп" aria-label="Показать или скрыть линии всех групп"><Route size={16}/></button><button className={placement.circuits.length && placement.circuits.every(circuit => hiddenCircuitPoints.has(circuit.id)) ? 'is-hidden' : ''} disabled={!placement.circuits.length} onClick={() => toggleAllCircuitVisibility('hiddenCircuitPointIds')} title="Показать или скрыть точки всех групп" aria-label="Показать или скрыть точки всех групп"><PlugZap size={16}/></button><button onClick={addCircuit} title="Добавить группу" aria-label="Добавить группу"><Plus size={17}/></button></div></div>
            <div className="placement-circuit-list">{placement.circuits.length ? placement.circuits.map(circuit => <div className={`placement-circuit-row ${selectedCircuitId === circuit.id ? 'active' : ''}`} key={circuit.id} style={{ '--circuit-color': electricalGroupColor(circuit.id, placement.circuits) }}>
              {editingCircuitNameId === circuit.id ? <input autoFocus aria-label={`Название группы ${circuit.name}`} value={circuit.name} onChange={event => updateCircuitById(circuit.id, { name: event.target.value })} onBlur={() => { setEditingCircuitNameId(null); setArmedCircuitNameId(null); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur(); }}/> : <button type="button" className="placement-circuit-name" aria-label={`Выбрать группу ${circuit.name}`} title={armedCircuitNameId === circuit.id ? 'Нажмите ещё раз, чтобы изменить название' : 'Выбрать группу'} onClick={() => { if (armedCircuitNameId === circuit.id) setEditingCircuitNameId(circuit.id); else { selectRouteCircuit(circuit.id); setArmedCircuitNameId(circuit.id); setPresetId(null); } }}>{circuit.name}</button>}
              <button type="button" className={hiddenCircuitLines.has(circuit.id) ? 'is-hidden' : ''} aria-pressed={!hiddenCircuitLines.has(circuit.id)} aria-label={`${hiddenCircuitLines.has(circuit.id) ? 'Показать' : 'Скрыть'} линии группы ${circuit.name}`} title={`${hiddenCircuitLines.has(circuit.id) ? 'Показать' : 'Скрыть'} линии группы`} onClick={() => toggleCircuitVisibility(circuit.id, 'hiddenCircuitLineIds')}><Route size={16}/></button>
              <button type="button" className={hiddenCircuitPoints.has(circuit.id) ? 'is-hidden' : ''} aria-pressed={!hiddenCircuitPoints.has(circuit.id)} aria-label={`${hiddenCircuitPoints.has(circuit.id) ? 'Показать' : 'Скрыть'} точки группы ${circuit.name}`} title={`${hiddenCircuitPoints.has(circuit.id) ? 'Показать' : 'Скрыть'} точки группы`} onClick={() => toggleCircuitVisibility(circuit.id, 'hiddenCircuitPointIds')}><PlugZap size={16}/></button>
              <button type="button" aria-label={`Настройки группы ${circuit.name}`} title="Кабель, автомат и цвет" onClick={() => { setSettingsCircuitId(circuit.id); setSelectedCircuitId(circuit.id); setArmedCircuitNameId(null); setCircuitColorError(''); }}><Wrench size={16}/></button>
              <button type="button" className="placement-circuit-clear" title={`Очистить связи группы ${circuit.name}`} aria-label={`Очистить группу ${circuit.name}`} onClick={() => clearCircuit(circuit.id)}><Unlink2 size={16}/></button>
            </div>) : <p>Добавьте группу для розеток и света.</p>}</div>
          </div> : null}
          {sidebarTab === 'groups' ? <label className="placement-route-default">Группа для трассы<select aria-label="Группа для трассы" value={selectedCircuitId || ''} onChange={event => selectRouteCircuit(event.target.value)}><option value="">Выберите группу</option>{placement.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}</select></label> : null}
          {sidebarTab === 'groups' ? <label className="placement-route-default">Линии внутри комнаты<select value={placement.defaultRouteSurface || 'ceiling'} onChange={event => changeDefaultRouteSurface(event.target.value)}><option value="ceiling">По потолку</option><option value="floor">По полу</option></select></label> : null}
          {sidebarTab === 'groups' && selectedCircuit ? <div className="placement-circuit-form">
            <div className="placement-route-modes" role="group" aria-label="Способ построения трассы"><button className={routeMode === 'automatic' && drawingRoute ? 'active' : ''} aria-pressed={routeMode === 'automatic' && drawingRoute} onClick={beginAutomaticRoute}>Рисовать автоматически</button><button className={routeMode === 'manual' && drawingRoute ? 'active' : ''} aria-pressed={routeMode === 'manual' && drawingRoute} onClick={beginManualRoute}>Рисовать кабель вручную</button></div>
            {routeMode === 'automatic' ? <div className="placement-circuit-actions"><button className="placement-auto-route" disabled={!items.some(item => item.kind === 'panel')} onClick={autoRouteCircuit}><Route size={16}/> Перестроить группу к щиту</button></div> : null}
            {drawingRoute ? <button className="placement-manual-finish" onClick={endManualRoute}><Route size={16}/> Завершить трассу · пробел</button> : null}
            {drawingRoute && routeMode === 'manual' ? <div className="placement-route-surface-picker"><label>Следующий участок<select value={routeSurface} onChange={event => setRouteSurface(event.target.value)}>{ROUTE_SURFACES.map(surface => <option key={surface.id} value={surface.id}>{surface.label}</option>)}</select></label>{routeSurface === 'wall' ? <Field label="Высота на стене" value={wallRouteHeight ?? routeSurfaceHeight(plan, 'wall')} onChange={value => setWallRouteHeight(Math.max(0, valueOr(value, 0)))} min={0} max={routeSurfaceHeight(plan, 'ceiling')} suffix="м"/> : null}</div> : null}
            {drawingRoute ? <div className="placement-manual-route-actions"><button type="button" disabled={!routeStartId} onClick={() => { setRoutePoints([]); setRouteStartId(''); setRouteCursor(null); setRouteNotice('Выберите любую электроточку для нового начала.'); }}>Другое начало</button>{routeMode === 'manual' ? <button type="button" disabled={!routePoints.some(point => point.waypoint && !point.manualElbow)} onClick={() => setRoutePoints(current => { const previous = current.slice(0, -1).findLastIndex(point => point.waypoint && !point.manualElbow); return current.slice(0, previous >= 0 ? previous + 1 : 1); })}>Убрать поворот</button> : null}</div> : null}
            <button className={assigningCircuit ? 'active' : ''} onClick={() => { setAssigningCircuit(current => !current); setDrawingRoute(false); setPresetId(null); }}>Выбрать точки группы на плане</button>
            {drawingRoute ? <p className="placement-route-hint">{routeMode === 'manual' ? routeStartId ? 'Укажите углы и электроточки по порядку. Участки идут горизонтально, вертикально или перпендикулярно стене; перед точкой вне направления укажите поворот. Пробел завершает ввод, Escape отменяет незавершённый участок.' : 'Выберите любую электроточку: щит, распайку, розетку, выключатель или светильник. Затем указывайте углы и следующие точки по порядку.' : 'Выбирайте электроточки последовательно. Каждая следующая точка соединится с предыдущей автоматическим участком и перейдёт в выбранную группу. Пробел завершает ввод.'}</p> : null}
            {routeNotice ? <p className="placement-route-hint" role="status">{routeNotice}</p> : null}
          </div> : null}
          {sidebarTab === 'groups' && selectedCircuit ? <div className="placement-circuit-actions"><button className="placement-remove-circuit" onClick={() => { change(data => { data.circuits = data.circuits.filter(circuit => circuit.id !== selectedCircuit.id); data.routes = data.routes.filter(route => route.circuitId !== selectedCircuit.id); data.items.forEach(item => { if (item.circuitId === selectedCircuit.id) item.circuitId = ''; }); }); setSelectedCircuitId(null); setDrawingRoute(false); setRoutePoints([]); }}><Trash2 size={15}/> Удалить группу и её трассы</button></div> : null}
          {sidebarTab === 'groups' ? <div className="placement-panel-diagram"><h3>Схема щита · этаж {activeFloor}</h3><div className="placement-panel-feed">{items.some(item => item.kind === 'panel') ? 'Электрощит' : 'Щит не размещён'}</div>{placement.circuits.map((circuit, index) => <div className="placement-panel-row" key={circuit.id}><b>{index + 1}</b><span><strong>{breakerDescription(circuit)}</strong><small>{circuit.name}</small></span><small>{circuit.cable || 'Кабель не указан'}</small></div>)}<small>Номиналы и кабели задаются по проекту; схема не подбирает защиту автоматически.</small></div> : null}
          {sidebarTab === 'rooms' ? <div className="placement-point-groups"><h3>Назначение электроточек по комнатам</h3>{electricalRoomGroups.map(group => <details className="placement-point-room" key={group.key}><summary><strong>{group.name}</strong><span className="placement-point-room-count">{group.items.length}</span></summary><div className="placement-point-room-items">{group.items.map(item => <label key={item.id}><span title={item.label || item.kind}>{item.label || item.kind}</span><select aria-label={`Группа для ${item.label || item.kind}, ${group.name}`} value={item.circuitId || ''} onChange={event => assignCircuit(item.id, event.target.value)}><option value="">Без группы</option>{placement.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}</select></label>)}</div></details>)}</div> : null}
        </div> : null}
        {sidebarTab === 'groups' && layer === 'electric' && selectedCircuit ? <div className="placement-circuit-accessories"><h3>Комплектующие группы</h3>{(selectedCircuit.accessories || []).map((entry, index) => <div key={index}><input aria-label={`Комплектующее группы ${index + 1}`} placeholder="Наименование" value={entry.name} onChange={event => { const accessories = [...(selectedCircuit.accessories || [])]; accessories[index] = { ...entry, name: event.target.value }; updateCircuit({ accessories }); }}/><input aria-label={`Количество комплектующего группы ${index + 1}`} type="number" min="0" value={entry.quantity} onChange={event => { const accessories = [...(selectedCircuit.accessories || [])]; accessories[index] = { ...entry, quantity: Number(event.target.value) || 0 }; updateCircuit({ accessories }); }}/><input aria-label={`Единица комплектующего группы ${index + 1}`} value={entry.unit} onChange={event => { const accessories = [...(selectedCircuit.accessories || [])]; accessories[index] = { ...entry, unit: event.target.value }; updateCircuit({ accessories }); }}/><button title="Удалить комплектующее группы" onClick={() => updateCircuit({ accessories: selectedCircuit.accessories.filter((_, i) => i !== index) })}>×</button></div>)}<button onClick={() => updateCircuit({ accessories: [...(selectedCircuit.accessories || []), { name: '', quantity: 1, unit: 'шт' }] })}>+ Добавить комплектующее</button><small>Клеммы, крепёж, гофра и другие позиции по утверждённой схеме.</small></div> : null}
        {sidebarTab === 'groups' && layer === 'electric' && !items.some(item => item.kind === 'panel') ? <p className="placement-route-hint">Для подключения группы к щиту поставьте электрощит на этом этаже.</p> : null}
        {sidebarTab === 'groups' && layer === 'electric' && routes.length ? <div className="placement-route-list"><h3>Трассы этажа · {routeMode === 'manual' ? 'вручную' : 'автоматически'}</h3>{routes.map((route, index) => <div key={route.id}><button className={selectedRouteId === route.id ? 'active' : ''} onClick={() => { setSelectedRouteId(route.id); setSelectedId(null); setLayer('electric'); }}>{placement.circuits.find(circuit => circuit.id === route.circuitId)?.name || `Трасса ${index + 1}`} · {electricalRouteLength3d(route.points).toFixed(2)} м</button><select aria-label={`Плоскость трассы ${index + 1}`} value={route.surface || placement.defaultRouteSurface || 'ceiling'} onChange={event => setWholeRouteSurface(route, event.target.value)}><option value="ceiling">Потолок</option><option value="floor">Пол</option><option value="wall">Стена</option></select><button title="Удалить трассу" aria-label={`Удалить трассу ${index + 1}`} onClick={() => { change(data => { data.routes = data.routes.filter(item => item.id !== route.id); }); setSelectedRouteId(null); }}><Trash2 size={15}/></button></div>)}</div> : null}
        </div> : null}
        {sidebarTab === 'bill' ? <div className="placement-sidebar-section"><div className="placement-electrical-bill"><h3>Ведомость электрики · этаж {activeFloor}</h3><p>{routeMode === 'manual' ? 'Ручная схема' : 'Автоматическая схема'}. Трассы по геометрии: {electricBill.routeMetres.toFixed(2)} м. С заданными высотами; без запаса и обходов.</p>{electricBill.byCircuit.map(circuit => <p key={circuit.id}>{circuit.name}: {circuit.routeMetres.toFixed(2)} м · {circuit.cable || 'кабель не указан'}</p>)}<ul>{electricBill.components.map(component => <li key={component.name}><span>{component.name}</span><strong>{component.quantity == null ? 'уточнить' : `${component.quantity} ${component.unit}`}</strong>{component.note ? <small>{component.note}</small> : null}</li>)}{electricBill.manualComponents.map(component => <li key={`manual-${component.name}-${component.unit}`}><span>{component.name} · по проекту</span><strong>{component.quantity} {component.unit}</strong></li>)}</ul>{electricBill.unconnected.length ? <p>Без линии к щиту: {electricBill.unconnected.length} точек.</p> : null}{electricBill.topologyIssues?.length ? <details><summary>Связи света: {electricBill.topologyIssues.length} уточнения</summary><ul>{electricBill.topologyIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></details> : null}<p>Ведомость не меняет смету. Сечение, защита и способ монтажа задаются по проекту.</p></div></div> : null}
      </aside>
      <section className="placement-canvas-panel"><div className="placement-canvas-title"><div className="placement-canvas-caption"><strong>{selectedRoom ? `План этажа ${activeFloor} · навигатор` : `План этажа ${activeFloor}`}</strong><span>{selectedRoom ? `Выбрана: ${selectedRoom.name}` : drawingDimension ? dimensionStart ? 'Укажите вторую точку размера' : 'Укажите первую точку размера' : drawingRoute ? routeStartId ? 'Укажите угол или следующую электроточку; пробел завершает кабель' : 'Выберите начальный электроэлемент' : activePreset ? `Разместите: ${activePreset.label}${activePreset.surface === 'facade' ? ' у наружной стены' : ''}` : 'Выберите элемент слева или переместите существующий'}</span></div><div className="placement-viewport-tools" role="toolbar" aria-label="Масштаб и поле плана"><button className={elementsLocked ? 'placement-lock active' : 'placement-lock'} aria-pressed={elementsLocked} aria-label={elementsLocked ? 'Разблокировать элементы' : 'Заблокировать элементы'} title={elementsLocked ? 'Разблокировать элементы' : 'Заблокировать элементы от перемещения'} onClick={() => { setElementsLocked(value => !value); setDragPosition(null); dragRef.current = null; }}>{elementsLocked ? <LockKeyhole size={17}/> : <LockKeyholeOpen size={17}/>}</button><button className={linesLocked ? 'placement-lock active' : 'placement-lock'} aria-pressed={linesLocked} title={linesLocked ? 'Разблокировать линии' : 'Заблокировать линии от ручного перемещения'} onClick={() => setLinesLocked(value => !value)}><Route size={17}/> Линии</button><button onClick={undo} disabled={!canUndo} title="Отменить" aria-label="Отменить"><Undo2 size={17}/></button><button onClick={redo} disabled={!canRedo} title="Повторить" aria-label="Повторить"><Redo2 size={17}/></button><button onClick={captureWorkspace} disabled={snapshotBusy} title="Снимок рабочего поля" aria-label="Снимок рабочего поля"><Camera size={17}/></button><button title="Уменьшить масштаб" aria-label="Уменьшить масштаб" onClick={() => setZoom(current => clampZoom(current - 10))}><ZoomOut size={17}/></button><button className="placement-zoom-value" title="Сбросить масштаб и положение" aria-label={`Масштаб ${zoom}%. Сбросить масштаб и положение`} onClick={resetView}>{zoom}%</button><button title="Увеличить масштаб" aria-label="Увеличить масштаб" onClick={() => setZoom(current => clampZoom(current + 10))}><ZoomIn size={17}/></button><button title={fullscreen ? 'Свернуть поле плана' : 'Развернуть поле плана на весь экран'} aria-label={fullscreen ? 'Свернуть поле плана' : 'Развернуть поле плана на весь экран'} onClick={() => setFullscreen(value => !value)}>{fullscreen ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}</button></div></div>{layerToolbar}<div className="placement-canvas-scroll">{drawingRail}<svg ref={svgRef} className={`placement-canvas ${activePreset || drawingRoute || drawingDimension ? 'placing' : ''}`} viewBox={viewBox} role="img" aria-label={`План этажа ${activeFloor} для расстановки мебели и инженерии`} onClick={onCanvasClick} onPointerDown={beginPan} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <defs><pattern id="placement-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 10 0 V 50 M 20 0 V 50 M 30 0 V 50 M 40 0 V 50 M 0 10 H 50 M 0 20 H 50 M 0 30 H 50 M 0 40 H 50" fill="none" stroke="#e9f0ed" strokeWidth=".5"/><path d="M 50 0 H 0 V 50" fill="none" stroke="#c5d8d2" strokeWidth="1"/></pattern><marker id="placement-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 9 5 L 0 8 z" fill="#497c7a"/></marker></defs>
        <rect x={drawingBounds.x * 100 - margin} y={drawingBounds.y * 100 - margin} width={Math.max(5, drawingBounds.w) * 100 + margin * 2} height={Math.max(5, drawingBounds.h) * 100 + margin * 2} fill="url(#placement-grid)"/>
        {(plan.platforms || []).filter(platform => platform.include !== false).map(platform => <g key={platform.id} className="placement-platform"><rect x={platform.x * 100} y={platform.y * 100} width={platform.w * 100} height={platform.h * 100}/><text x={(platform.x + platform.w / 2) * 100} y={(platform.y + platform.h / 2) * 100} textAnchor="middle">{platform.kind === 'porch' ? 'Крыльцо' : 'Терраса'}</text></g>)}
        <path d={pathData(contour)} fill="#f9fbf9" stroke="none"/>
        {rooms.map(room => { const points = roomPoints(room); const box = boundsOf(points); return <g key={room.id}><path d={pathData(points)} fill="rgba(219,233,230,.22)" stroke="none"/><text x={(box.x + box.w / 2) * 100} y={(box.y + box.h / 2) * 100} textAnchor="middle" className="placement-room-label">{room.name}</text></g>; })}
        {selectedRoom ? <path d={pathData(roomPoints(selectedRoom))} className="placement-room-mini-highlight" pointerEvents="none"/> : null}
        <PlacementWalls plan={plan} idPrefix={`placement-floor-${activeFloor}`}/>
        {wallFaces.map(face => <g key={face.ref} onClick={event => { if (activePreset || drawingRoute || drawingDimension || networkDrawing) return; event.stopPropagation(); openWallRoom(face); }}><line x1={face.a.x * 100} y1={face.a.y * 100} x2={face.b.x * 100} y2={face.b.y * 100} stroke={selectedWallRef === face.ref ? '#278b78' : 'transparent'} strokeWidth={selectedWallRef === face.ref ? 5 : 18} vectorEffect="non-scaling-stroke" className="placement-wall-face-target"><title>{face.label} · открыть комнату и её развёртку</title></line></g>)}
        {placement.showAutoDimensions && visible.electric ? <PlacementWallDimensions plan={plan} items={displayedItems.filter(item => item.layer === 'electric')}/> : null}
        {visible.electric ? displayedRoutes.map(route => { const shown = dragPosition?.routeId === route.id && dragPosition.segmentIndex != null && dragPosition.points ? dragPosition.points : route.points; const color = electricalGroupColor(route.circuitId, placement.circuits); return <g key={route.id} data-route-id={route.id} className={selectedCircuitId === route.circuitId ? 'placement-route-group-active' : ''} onClick={event => { if (drawingRoute) return; event.stopPropagation(); setSelectedRouteId(route.id); setSelectedId(null); setLayer('electric'); }}>{shown.slice(0, -1).map((start, index) => { const end = shown[index + 1]; const vertical = Math.hypot(end.x - start.x, end.y - start.y) < .001 && Math.abs((end.z || 0) - (start.z || 0)) > .001; return vertical ? <circle key={index} cx={end.x * 100} cy={end.y * 100} r="8" fill="#fff" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke"><title>Подъём или спуск у стены · {Math.abs((end.z || 0) - (start.z || 0)).toFixed(2)} м</title></circle> : <line key={index} x1={start.x * 100} y1={start.y * 100} x2={end.x * 100} y2={end.y * 100} stroke={color} strokeWidth={selectedRouteId === route.id ? 3.5 : selectedCircuitId === route.circuitId ? 3 : 2.5} strokeLinecap="round" strokeDasharray={end.surface === 'wall' ? '2 5' : '5 4'} vectorEffect="non-scaling-stroke"/>; })}<title>{placement.circuits.find(circuit => circuit.id === route.circuitId)?.name || 'Трасса'} · {electricalRouteLength3d(route.points).toFixed(2)} м</title></g>; }) : null}
        {visible.electric ? routeBundles.map((bundle, index) => <g key={`bundle-${index}`} className="placement-route-bundle" pointerEvents="none">
          <line x1={bundle.start.x * 100} y1={bundle.start.y * 100} x2={bundle.end.x * 100} y2={bundle.end.y * 100} stroke="#fff" strokeWidth={bundle.routes.length * 3 + 3.5} strokeLinecap="round"/>
          {bundle.routes.map((route, lane) => { const offset = (lane - (bundle.routes.length - 1) / 2) * 3; const dx = bundle.axis === 'y' ? offset : 0, dy = bundle.axis === 'x' ? offset : 0; return <g key={route.routeId} stroke={electricalGroupColor(route.circuitId, placement.circuits)} strokeWidth="2" strokeLinecap="round" strokeDasharray={route.surface === 'wall' ? '2 5' : '5 4'}><line x1={bundle.start.x * 100 + dx} y1={bundle.start.y * 100 + dy} x2={bundle.end.x * 100 + dx} y2={bundle.end.y * 100 + dy}/><line x1={bundle.start.x * 100} y1={bundle.start.y * 100} x2={bundle.start.x * 100 + dx} y2={bundle.start.y * 100 + dy}/><line x1={bundle.end.x * 100 + dx} y1={bundle.end.y * 100 + dy} x2={bundle.end.x * 100} y2={bundle.end.y * 100}/></g>; })}
        </g>) : null}
        {visible.electric ? displayedItems.filter(item => item.kind === 'junction-box' && Number.isFinite(item.diagramX) && Number.isFinite(item.diagramY) && Math.hypot(item.diagramX - item.x, item.diagramY - item.y) >= .12).map(item => { const at = dragPosition?.id === item.id ? dragPosition : schematicPosition(item); return <g key={`junction-anchor-${item.id}`} className="placement-junction-anchor" pointerEvents="none"><path d={`M ${at.x * 100} ${at.y * 100} L ${item.x * 100} ${at.y * 100} L ${item.x * 100} ${item.y * 100}`} fill="none" stroke={electricalGroupColor(item.circuitId, placement.circuits)} strokeWidth="2.5" strokeDasharray="5 5"/><circle cx={item.x * 100} cy={item.y * 100} r="7" fill="#fff" stroke={electricalGroupColor(item.circuitId, placement.circuits)} strokeWidth="2.5"/><title>Монтаж распайки у стены · h={Number(item.height || 0).toFixed(2)} м</title></g>; }) : null}
        {dragPosition?.guides?.map((guide, index) => <g key={`guide-${index}`} className="placement-alignment-guide" pointerEvents="none"><line x1={guide.from.x * 100} y1={guide.from.y * 100} x2={dragPosition.x * 100} y2={dragPosition.y * 100} stroke="#138dba" strokeWidth="2" strokeDasharray="6 4"/><circle cx={guide.from.x * 100} cy={guide.from.y * 100} r="5" fill="#138dba"/><circle cx={dragPosition.x * 100} cy={dragPosition.y * 100} r="5" fill="#138dba"/></g>)}
        {selectedLightGuides.map((guide, index) => <line key={`selected-guide-${index}`} className="placement-alignment-guide" x1={guide.from.x * 100} y1={guide.from.y * 100} x2={selected.x * 100} y2={selected.y * 100} stroke="#138dba" strokeOpacity=".65" strokeWidth="2" strokeDasharray="6 4" pointerEvents="none"/>)}
        {visible.electric && selectedRoute && !drawingRoute ? selectedRoute.points.slice(0, -1).map((point, index) => <line key={`segment-${index}`} data-route-segment={index} className="placement-route-segment-target" x1={point.x * 100} y1={point.y * 100} x2={selectedRoute.points[index + 1].x * 100} y2={selectedRoute.points[index + 1].y * 100} onPointerDown={event => beginRouteSegmentDrag(event, selectedRoute, index)}><title>{routeSegmentDirection(point, selectedRoute.points[index + 1]) ? 'Нажмите для выбора участка; Shift + нажмите для добавления точки; потяните поперёк для сдвига' : 'Нажмите для выбора участка; Shift + нажмите для добавления точки'}</title></line>) : null}
        {visible.electric && selectedRoute && !drawingRoute ? selectedRoute.points.slice(1, -1).map((point, index) => { const location = dragPosition?.routeId === selectedRoute.id && dragPosition.index === index + 1 ? dragPosition : point; return <circle key={`${selectedRoute.id}-${index}`} data-route-point={index + 1} cx={location.x * 100} cy={location.y * 100} r="16" className={`placement-route-handle${selectedWaypoint?.index === index + 1 ? ' selected' : ''}`} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); setSelectedRoutePoint({ routeId: selectedRoute.id, index: index + 1 }); if (linesLocked) return; svgRef.current?.setPointerCapture(event.pointerId); dragRef.current = { routeId: selectedRoute.id, index: index + 1, pointerId: event.pointerId, start: pointFromEvent(event), origin: point, last: point }; }}><title>Точка {index + 1} · выбрать или перетащить</title></circle>; }) : null}
        {drawingRoute && routePoints.length ? <path d={routeData(routePreview)} fill="none" stroke={electricalGroupColor(selectedCircuitId || items.find(item => item.id === routeStartId)?.circuitId, placement.circuits)} strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none"/> : null}
        {drawingRoute && routeCursor ? <g className="placement-route-cursor" pointerEvents="none">{routeCursor.guides?.map((guide, index) => <line key={index} className="placement-manual-alignment-guide" x1={(guide.axis === 'x' ? guide.from.x : drawingBounds.x) * 100 - (guide.axis === 'y' ? margin : 0)} y1={(guide.axis === 'y' ? guide.from.y : drawingBounds.y) * 100 - (guide.axis === 'x' ? margin : 0)} x2={(guide.axis === 'x' ? guide.from.x : drawingBounds.x + drawingBounds.w) * 100 + (guide.axis === 'y' ? margin : 0)} y2={(guide.axis === 'y' ? guide.from.y : drawingBounds.y + drawingBounds.h) * 100 + (guide.axis === 'x' ? margin : 0)}/>)}<line x1={drawingBounds.x * 100 - margin} y1={routeCursor.y * 100} x2={(drawingBounds.x + drawingBounds.w) * 100 + margin} y2={routeCursor.y * 100}/><line x1={routeCursor.x * 100} y1={drawingBounds.y * 100 - margin} x2={routeCursor.x * 100} y2={(drawingBounds.y + drawingBounds.h) * 100 + margin}/><circle cx={routeCursor.x * 100} cy={routeCursor.y * 100} r="6"/><text x={routeCursor.x * 100 + 22} y={routeCursor.y * 100 - 14}>{routeCursor.x.toFixed(2)} · {routeCursor.y.toFixed(2)} м{routeCursor.snappedTo ? ` · ${routeCursor.snappedTo === 'wall' ? 'стена' : routeCursor.snappedTo === 'point' ? 'электроточка' : 'направляющая'}` : ''}</text></g> : null}
        {networkRoutes.filter(route => visible[route.system]).map(route => <g key={route.id} onClick={event => { event.stopPropagation(); setLayer(route.system); setSelectedNetworkRouteId(route.id); setPresetId(null); }}><path d={routeData(route.points)} fill="none" stroke={networkColors[route.system]} strokeWidth={selectedNetworkRouteId === route.id ? 6 : 4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={route.auto ? '8 5' : undefined} vectorEffect="non-scaling-stroke"/><title>{NETWORK_SYSTEMS[route.system].label} · {route.medium} · {networkLength3d(route.points).toFixed(2)} м</title></g>)}
        {networkDrawing && networkPoints.length ? <path d={routeData(networkPoints)} fill="none" stroke={networkColors[layer] || '#d48a21'} strokeWidth="4" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none"/> : null}
        {dimensions.map(dimension => <DimensionLine key={dimension.id} points={dimension.points} label={dimension.label}/>)}
        {dimensionStart ? <circle cx={dimensionStart.x * 100} cy={dimensionStart.y * 100} r="7" fill="#497c7a" pointerEvents="none"/> : null}
        {displayedItems.filter(item => visible[item.layer] && !clusteredItemIds.has(item.id)).map(item => {
          const location = dragPosition?.id === item.id ? dragPosition : schematicPosition(item);
          const electrical = item.layer === 'electric';
          const displayWidth = electrical ? Math.max(item.width * 100, 36) : item.kind === 'connection-port' ? 32 : item.width * 100;
          const displayDepth = electrical ? Math.max(item.depth * 100, 36) : item.kind === 'connection-port' ? 32 : item.depth * 100;
          return <g key={item.id} data-placement-id={item.id} transform={`translate(${location.x * 100} ${location.y * 100}) rotate(${item.rotation || 0})`} className={`placement-object ${selectedId === item.id ? 'selected' : ''}`} onPointerDown={event => beginDrag(event, item)} onClick={event => { event.stopPropagation(); if (suppressClickRef.current) suppressClickRef.current = false; pickCanvasItem(item); }}>
            {(drawingRoute && electrical || assigningCircuit && electrical || isNetworkLayer(layer) && item.layer === layer && !activePreset) ? <circle r="23" fill="none" stroke={item.id === routeStartId || item.id === networkFromId ? '#e15f22' : item.id === networkToId ? '#a65bb6' : '#30a56e'} strokeWidth="2" strokeDasharray="4 3" pointerEvents="none"/> : null}
            {item.surface === 'facade' ? <line x1={(item.anchorX - location.x) * 100} y1={(item.anchorY - location.y) * 100} x2="0" y2="0" stroke="#4a9e94" strokeWidth="3" strokeDasharray="4 3" pointerEvents="none"/> : null}
            <rect x={-displayWidth / 2} y={-displayDepth / 2} width={displayWidth} height={displayDepth} fill="transparent" stroke="none"/>
            <svg x={-displayWidth / 2} y={-displayDepth / 2} width={displayWidth} height={displayDepth} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible"><PlacementSymbol kind={item.kind} system={item.layer} medium={item.connectionMedium}/></svg>
            {selectedId === item.id ? <rect x={-displayWidth / 2 - 4} y={-displayDepth / 2 - 4} width={displayWidth + 8} height={displayDepth + 8} rx="8" fill="none" stroke="#2b8f85" strokeWidth="3" pointerEvents="none"/> : null}
            <title>{item.label || item.kind}</title>
          </g>;
        })}
        {visible.electric ? electricalClusters.map(cluster => {
          const displayItems = wallPointDisplayOrder(cluster.items);
          const rowEnd = displayItems.at(-1).offset;
          return <g key={cluster.id} className="placement-electrical-row" data-cluster-id={cluster.id}>
          <line x1={cluster.x * 100} y1={cluster.y * 100} x2={(cluster.x + cluster.normal.x * rowEnd) * 100} y2={(cluster.y + cluster.normal.y * rowEnd) * 100} stroke="#9aaea4" strokeWidth="2" strokeDasharray="4 4" pointerEvents="none"/>
          {displayItems.map(({ item, offset }) => {
            const color = electricalGroupColor(item.circuitId, placement.circuits);
            const x = cluster.x + cluster.normal.x * offset;
            const y = cluster.y + cluster.normal.y * offset;
            const position = dragPosition?.id === item.id ? dragPosition : { x, y };
            return <g key={item.id} data-placement-id={item.id} className="placement-object placement-electrical-row-item" transform={`translate(${position.x * 100} ${position.y * 100})`} onPointerDown={event => beginDrag(event, item)} onClick={event => { event.stopPropagation(); pickCanvasItem(item); }}>
              <circle r={item.kind === 'junction-box' ? 11 : 16} fill="#fff" stroke={color} strokeWidth="3"/>
              <circle r={item.kind === 'junction-box' ? 5 : 9} fill={color}/>
              {selectedId === item.id ? <circle r="22" fill="none" stroke="#245d50" strokeWidth="2" pointerEvents="none"/> : null}
              <title>{item.label || item.kind} · h={Number(item.height || 0).toFixed(2)} м · {placement.circuits.find(circuit => circuit.id === item.circuitId)?.name || 'Без группы'}</title>
            </g>;
          })}
        </g>;
        }) : null}
        {displayedItems.filter(item => visible[item.layer]).map(item => {
          const position = dragPosition?.id === item.id ? dragPosition : schematicPosition(item);
          const labelPosition = dragLabel?.id === item.id ? dragLabel : { x: position.x + (item.labelOffsetX ?? .65), y: position.y + (item.labelOffsetY ?? -.45) };
          return <g key={`note-${item.id}`}>
            {item.showHeight ? <text className="placement-height-label" x={position.x * 100 + 36} y={position.y * 100 + 45}>h={Number(item.height || 0).toFixed(2)} м</text> : null}
            {item.showName ? <g className="placement-name-callout" onPointerDown={event => beginLabelDrag(event, item)} onClick={event => event.stopPropagation()}><line x1={position.x * 100} y1={position.y * 100} x2={labelPosition.x * 100} y2={labelPosition.y * 100}/><text x={labelPosition.x * 100} y={labelPosition.y * 100}>{item.label || item.kind}</text></g> : null}
          </g>;
        })}
      </svg></div>
      {!selectedRoom ? <PlacementWallElevation wall={selectedWall} plan={plan} items={items} routes={networkRoutes} activePreset={activePreset} drawing={networkDrawing} points={networkPoints} onPosition={onWallPosition} onSelectItem={id => { setSelectedId(id); setPresetId(null); }}/> : null}
      <div className="placement-canvas-note">Выберите комнату, чтобы работать с её планом, полом и стенами. Точки приборов доступны для подключения линий; их высоты уточняются в свойствах. Автоматические размеры электроточек вынесены за контур дома. Масштаб меняется колёсиком, кнопками или двумя пальцами.</div></section>
      <aside className={`placement-inspector${selected?.layer === 'electric' && !showElectricDetails ? ' compact-electric' : ''}`}><div className="placement-inspector-heading"><h2>Свойства и размеры</h2>{selected ? <button onClick={() => setSelectedId(null)} aria-label="Закрыть свойства"><X size={17}/></button> : null}</div>
        {selectedRoute ? <div className="placement-route-editor"><h3>Трасса · {electricalRouteLength3d(selectedRoute.points).toFixed(2)} м</h3><p>Нажмите на участок, чтобы выбрать его плоскость. Shift + щелчок добавляет точку в указанном месте. Выбранную точку можно удалить. Участок линии можно перетащить поперёк него.</p><label>Начало<select value={selectedRoute.fromItemId || selectedRoute.panelItemId || ''} onChange={event => updateRoute(selectedRoute.id, { fromItemId: event.target.value, auto: false })}>{items.filter(item => item.layer === 'electric' && (item.kind === 'panel' || item.circuitId === selectedRoute.circuitId)).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Конец<select value={selectedRoute.targetItemId || ''} onChange={event => updateRoute(selectedRoute.id, { targetItemId: event.target.value, auto: false })}><option value="">Выберите элемент</option>{items.filter(item => item.layer === 'electric' && item.id !== selectedRoute.fromItemId && item.circuitId === selectedRoute.circuitId).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Группа<select value={selectedRoute.circuitId || ''} onChange={event => updateRoute(selectedRoute.id, { circuitId: event.target.value, auto: false })}>{placement.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}</select></label><button onClick={() => addRouteWaypoint(selectedRoute)}>+ Промежуточная точка</button>{selectedRoute.points.slice(1, -1).map((point, index) => <div className={`placement-route-point${selectedWaypoint?.index === index + 1 ? ' selected' : ''}`} key={index}><button type="button" onClick={() => setSelectedRoutePoint({ routeId: selectedRoute.id, index: index + 1 })}>Точка {index + 1} · {point.surface === 'wall' ? 'стена' : point.surface === 'floor' ? 'пол' : 'потолок'}</button><button type="button" title={`Удалить точку ${index + 1}`} aria-label={`Удалить точку ${index + 1}`} onClick={() => removeRouteWaypoint(selectedRoute, index + 1)}><Trash2 size={15}/></button></div>)}<button className="placement-delete" onClick={() => { setSelectedRoutePoint(null); change(data => { data.routes = data.routes.filter(route => route.id !== selectedRoute.id); }); setSelectedRouteId(null); }}><Trash2 size={16}/> Удалить трассу</button></div> : null}
        {selectedRoute && activeRouteSegment ? <div className="placement-route-editor placement-route-surface-editor">
          <h3>Участок {activeRouteSegment.index + 1}</h3>
          <label>Плоскость прокладки<select value={ROUTE_SURFACES.some(surface => surface.id === selectedRoute.points[activeRouteSegment.index + 1]?.surface) ? selectedRoute.points[activeRouteSegment.index + 1].surface : 'ceiling'} onChange={event => setRouteSegmentSurface(selectedRoute, activeRouteSegment.index, event.target.value)}>{ROUTE_SURFACES.map(surface => <option key={surface.id} value={surface.id}>{surface.label}</option>)}</select></label>
          {selectedRoute.points[activeRouteSegment.index + 1]?.surface === 'wall' ? <Field label="Высота участка на стене" value={wallRouteHeight ?? selectedRoute.points[activeRouteSegment.index + 1].z ?? routeSurfaceHeight(plan, 'wall')} onChange={value => { const height = Math.max(0, valueOr(value, 0)); setWallRouteHeight(height); setRouteSegmentSurface(selectedRoute, activeRouteSegment.index, 'wall', height); }} min={0} max={routeSurfaceHeight(plan, 'ceiling')} suffix="м"/> : null}
          <button type="button" onClick={() => { const start = selectedRoute.points[activeRouteSegment.index], end = selectedRoute.points[activeRouteSegment.index + 1]; insertRouteWaypointAt(selectedRoute, activeRouteSegment.index, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }); }}>+ Точка на участке</button>
          <small>Потолок — штриховая линия, стена — пунктир, пол — сплошная. Кружок показывает подъём или спуск у стены. Длина учитывает все вертикальные участки.</small>
        </div> : null}
        {selectedRoute ? <div className="placement-route-editor"><Field label="Уровень трассы" value={selectedRoute.routeLevel ?? 0} onChange={value => updateRoute(selectedRoute.id, { routeLevel: Math.max(0, valueOr(value, 0)) })} min={0} suffix="м" disabled={!selectedRoute.auto}/><button onClick={() => updateRoute(selectedRoute.id, { auto: true })}>Перестроить этот участок автоматически</button><small>Автоматика выбирает ортогональную линию с учётом пересечений стен. Фактические проходки и способ прокладки согласуйте по проекту.</small></div> : null}
        {selected?.layer === 'electric' ? <div className="placement-electric-inspector"><div className="placement-electric-point-row"><strong title={selected.label || selected.kind}>{selected.label || selected.kind}</strong><small title={placement.circuits.find(circuit => circuit.id === selected.circuitId)?.name || 'Без группы'}>{placement.circuits.find(circuit => circuit.id === selected.circuitId)?.name || 'Без группы'}</small><button type="button" aria-label="Настроить точку" title="Настроить точку" onClick={() => setShowElectricDetails(value => !value)}>⚙</button><button type="button" aria-label="Удалить точку" title="Удалить точку" onClick={deleteSelection}><Trash2 size={15}/></button></div>{showElectricDetails ? <div className="placement-inspector-fields"><label>Название<input value={selected.label || ''} onChange={event => updateItem({ label: event.target.value })}/></label><Field label="Высота установки" value={selected.height || 0} onChange={value => updateItem({ height: Math.max(0, valueOr(value, selected.height)) })} min={0} suffix="м" disabled={elementsLocked}/><label>Группа<select value={selected.circuitId || ''} onChange={event => assignCircuit(selected.id, event.target.value)}><option value="">Без группы</option>{placement.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}</select></label><button className="placement-rotate" onClick={() => updateItem({ rotation: ((selected.rotation || 0) + 90) % 360 })}><RotateCw size={16}/> Повернуть</button><label>Примечание<textarea rows="2" value={selected.note || ''} onChange={event => updateItem({ note: event.target.value })}/></label></div> : null}</div> : null}
        {selected && selected.layer !== 'electric' ? <div className="placement-inspector-fields"><span className="placement-type">{PLACEMENT_LAYERS.find(entry => entry.id === selected.layer)?.label} · этаж {selected.floor}{selected.surface === 'facade' ? ' · фасад' : ''}</span><label>Название<input value={selected.label || ''} onChange={event => updateItem({ label: event.target.value })}/></label><div className="placement-field-grid"><Field label="X" value={selected.x} onChange={value => { const position = { x: valueOr(value, selected.x), y: selected.y }; updateItem(selected.surface === 'facade' ? facadePosition(position) : position); }} step={.05} suffix="м" disabled={elementsLocked}/><Field label="Y" value={selected.y} onChange={value => { const position = { x: selected.x, y: valueOr(value, selected.y) }; updateItem(selected.surface === 'facade' ? facadePosition(position) : position); }} step={.05} suffix="м" disabled={elementsLocked}/><Field label="Ширина" value={selected.width} onChange={value => updateItem({ width: Math.max(.05, valueOr(value, selected.width)) })} min={.05} suffix="м"/><Field label="Глубина" value={selected.depth} onChange={value => updateItem({ depth: Math.max(.05, valueOr(value, selected.depth)) })} min={.05} suffix="м"/></div><Field label="Высота установки" value={selected.height || 0} onChange={value => updateItem({ height: Math.max(0, valueOr(value, selected.height)) })} min={0} suffix="м" disabled={elementsLocked}/><button className="placement-rotate" onClick={() => updateItem({ rotation: ((selected.rotation || 0) + 90) % 360 })}><RotateCw size={16}/> Повернуть на 90°</button>{selected.layer === 'electric' && selected.kind !== 'panel' ? <label>Электрическая группа<select value={selected.circuitId || ''} onChange={event => assignCircuit(selected.id, event.target.value)}><option value="">Без группы</option>{placement.circuits.map(circuit => <option key={circuit.id} value={circuit.id}>{circuit.name}</option>)}</select></label> : null}<label>Примечание<textarea rows="3" value={selected.note || ''} onChange={event => updateItem({ note: event.target.value })} placeholder="Модель, подключение или уточнение проекта"/></label><button className="placement-delete" onClick={deleteSelection}><Trash2 size={16}/> Удалить объект</button></div> : !selected ? <div className="placement-empty-inspector"><p>Выберите предмет на плане, чтобы уточнить его размеры, координаты и высоту установки.</p></div> : null}
        {selected?.kind === 'junction-box' ? <div className="placement-control-links"><h3>Распайка: схема и монтаж</h3><p>Значок на схеме можно двигать по комнате. Пунктир ведёт к месту установки у ближайшей стены. Новая коробка ставится на 0,15 м ниже потолка; высоту и монтажные X/Y выше можно уточнить вручную.</p><div className="placement-field-grid"><Field label="Схема X" value={schematicPosition(selected).x} onChange={value => { const at = { ...schematicPosition(selected), x: valueOr(value, selected.x) }; const mount = junctionWallMount(plan, at, selectedRoom); if (mount) updateItem({ ...mount, diagramX: at.x, diagramY: at.y, displayPlane: 'wall' }); }} step={.05} suffix="м" disabled={elementsLocked}/><Field label="Схема Y" value={schematicPosition(selected).y} onChange={value => { const at = { ...schematicPosition(selected), y: valueOr(value, selected.y) }; const mount = junctionWallMount(plan, at, selectedRoom); if (mount) updateItem({ ...mount, diagramX: at.x, diagramY: at.y, displayPlane: 'wall' }); }} step={.05} suffix="м" disabled={elementsLocked}/></div></div> : null}
        {itemWall ? <div className="placement-wall-station"><strong>{itemWall.label}</strong><Field label="От начала стены" value={round(projectToWallFace(itemWall, selected).station)} onChange={value => { const station = Math.max(0, Math.min(itemWall.length, valueOr(value, 0))); const foot = wallFacePoint(itemWall, station); const half = (Math.abs(itemWall.normal.x) * selected.width + Math.abs(itemWall.normal.y) * selected.depth) / 2; updateItem({ x: round(foot.x + itemWall.normal.x * half), y: round(foot.y + itemWall.normal.y * half), wallRef: itemWall.ref }); }} min={0} max={itemWall.length} suffix="м" disabled={elementsLocked}/><small>От выбранного конца грани. Точка и размеры трассы обновятся.</small></div> : null}
        {selected?.layer === 'electric' && ['switch', 'double-switch', 'two-way-switch', 'dimmer'].includes(selected.kind) ? <div className="placement-control-links"><h3>Связь выключателя</h3><label>Управляемый светильник<select value={selected.controlsItemId || ''} onChange={event => updateItem({ controlsItemId: event.target.value })}><option value="">Не выбран</option>{items.filter(item => item.layer === 'electric' && ['light', 'spotlight', 'pendant-light', 'wall-light', 'led-strip', 'facade-light', 'facade-spotlight'].includes(item.kind) && item.circuitId === selected.circuitId).map(item => <option key={item.id} value={item.id}>{item.label} · {item.id.slice(0, 6)}</option>)}</select></label>{selected.kind === 'two-way-switch' ? <label>Парный проходной выключатель<select value={selected.pairedSwitchId || ''} onChange={event => { const pairId = event.target.value; change(data => { const current = data.items.find(item => item.id === selected.id); if (!current) return; const oldPair = data.items.find(item => item.id === current.pairedSwitchId); if (oldPair?.pairedSwitchId === current.id) oldPair.pairedSwitchId = ''; current.pairedSwitchId = pairId; const pair = data.items.find(item => item.id === pairId); if (pair) { pair.pairedSwitchId = current.id; if (current.controlsItemId) pair.controlsItemId = current.controlsItemId; } rebuildAutoRoutes(data, current.circuitId); }); }}><option value="">Не выбран</option>{items.filter(item => item.id !== selected.id && item.kind === 'two-way-switch' && item.circuitId === selected.circuitId).map(item => <option key={item.id} value={item.id}>{item.label} · {item.id.slice(0, 6)}</option>)}</select></label> : null}<label>Распределительная коробка<select value={selected.junctionItemId || ''} onChange={event => updateItem({ junctionItemId: event.target.value })}><option value="">Ближайшая из группы</option>{items.filter(item => item.kind === 'junction-box' && item.circuitId === selected.circuitId).map(item => <option key={item.id} value={item.id}>{item.label} · {item.id.slice(0, 6)}</option>)}</select></label><p>Автотрасса связывает щит, коробку, выключатель и светильник. Пара проходных выключателей получает отдельную линию между ними. Схему подключения проверьте перед монтажом.</p></div> : null}
        {selected?.supplyItemId ? <div className="placement-control-links"><h3>Электроподключение прибора</h3><p>На плане создана отдельная электроточка. Её можно переместить, изменить тип и назначить группе.</p><button onClick={() => { setLayer('electric'); setSelectedId(selected.supplyItemId); setSelectedRouteId(null); }}>Открыть электроточку</button></div> : null}
        {selected && items.some(item => item.linkedApplianceId === selected.id && item.kind === 'connection-port') ? <div className="placement-control-links"><h3>Выводы для подключения</h3><p>Выберите вывод для трассы. Положение и высоту каждой точки можно изменить отдельно.</p>{items.filter(item => item.linkedApplianceId === selected.id && item.kind === 'connection-port').map(port => <button key={port.id} onClick={() => { setLayer(port.layer); setSelectedId(port.id); setNetworkFromId(port.id); setNetworkToId(''); setNetworkMedium(port.connectionMedium); setNetworkNotice('Вывод выбран. Укажите вторую точку на плане.'); }}>{NETWORK_SYSTEMS[port.layer]?.label} · {port.label.split(' · ').at(-1)}</button>)}</div> : null}
        {selected?.linkedApplianceId ? <div className="placement-control-links"><p>Связано с прибором. {selected.followsAppliance ? 'Точка следует за прибором.' : 'Положение задано вручную.'}</p><label><input type="checkbox" checked={selected.followsAppliance === true} onChange={event => updateItem({ followsAppliance: event.target.checked })}/> Следовать за прибором</label></div> : null}
        {selected?.kind === 'connection-port' && !selected.heightKnown ? <p className="placement-route-hint">Высота этого вывода ещё не задана по проекту. Укажите её перед выпуском рабочих схем.</p> : null}
        {selected ? <div className="placement-annotation-settings"><label>Плоскость на развёртке<select value={selected.displayPlane || 'auto'} onChange={event => updateItem({ displayPlane: event.target.value })} disabled={elementsLocked}><option value="auto">Автоматически</option><option value="floor">Пол</option><option value="wall">Ближайшая стена</option></select></label>{selected.layer === 'electric' ? <label>Размер от стены<select value={selected.dimensionSide || 'auto'} onChange={event => updateItem({ dimensionSide: event.target.value })}><option value="auto">Ближайшая слева или справа</option><option value="left">Слева</option><option value="right">Справа</option></select></label> : null}<label><input type="checkbox" checked={selected.showHeight === true} onChange={event => updateItem({ showHeight: event.target.checked })}/> Показывать высоту рядом</label><label><input type="checkbox" checked={selected.showName === true} onChange={event => updateItem({ showName: event.target.checked })}/> Выноска названия (перетащите на плане)</label></div> : null}
        {dimensions.length ? <div className="placement-dimension-list"><h3>Ручные размеры</h3>{dimensions.map((dimension, index) => <div key={dimension.id}><span>{index + 1}. {measureText(dimensionMetres(dimension.points))}</span><input aria-label={`Подпись размера ${index + 1}`} value={dimension.label || ''} placeholder="Подпись по замеру" onChange={event => change(data => { const target = data.dimensions.find(entry => entry.id === dimension.id); if (target) target.label = event.target.value; })}/><button aria-label={`Удалить размер ${index + 1}`} onClick={() => change(data => { data.dimensions = data.dimensions.filter(entry => entry.id !== dimension.id); })}><Trash2 size={15}/></button></div>)}</div> : null}
      </aside>
      {selectedRoom ? <PlacementRoomUnfolding room={selectedRoom} plan={plan} items={displayedItems} visible={visible} onToggleLayer={id => setVisible(current => ({ ...current, [id]: !current[id] }))} routes={[...networkRoutes, ...displayedRoutes.map(route => ({ ...route, system: 'electric' }))]} draftPoints={networkDrawing ? networkPoints : drawingRoute ? routePoints : []} draftSystem={layer} draftCircuitId={selectedCircuitId || items.find(item => item.id === routeStartId)?.circuitId} activePreset={activePreset} selectedId={selectedId} selectedRouteId={selectedRouteId} selectedRoutePointIndex={selectedWaypoint?.index} elementsLocked={elementsLocked} linesLocked={linesLocked} onToggleLock={() => setElementsLocked(value => !value)} onToggleLinesLock={() => setLinesLocked(value => !value)} onUndo={undo} onRedo={redo} onScreenshot={captureWorkspace} canUndo={canUndo} canRedo={canRedo} circuitColor={id => electricalGroupColor(id, placement.circuits)} routeMode={!activePreset && (networkDrawing || drawingRoute || assigningCircuit || isNetworkLayer(layer))} onPlace={roomPlace} onMove={roomMove} onSelect={id => { setSelectedId(id); setPresetId(null); }} onPickNode={pickCanvasItem} onRoutePoint={roomRoutePoint} onSelectRoute={route => { setLayer(route.system); setSelectedId(null); if (route.system === 'electric') setSelectedRouteId(route.id); else setSelectedNetworkRouteId(route.id); }} onSelectRoutePoint={(route, index) => { setSelectedRouteId(route.id); setSelectedRoutePoint({ routeId: route.id, index }); setSelectedId(null); setLayer("electric"); }} onInsertRoutePoint={(route, segmentIndex, point) => { const next = insertRoutePoint(route.points, segmentIndex, point); replaceRouteGeometry(route, next); setSelectedRoutePoint({ routeId: route.id, index: segmentIndex + 1 }); }} onShiftRouteSegment={replaceRouteGeometry}/> : null}
    </div>
    <div className="placement-toolbar">
      <div className="placement-floor-tabs" aria-label="Этаж">{Array.from({ length: floorCount }, (_, index) => <button key={index} className={activeFloor === index + 1 ? 'active' : ''} onClick={() => { setFloor(index + 1); setSelectedRoomId(''); setSelectedWallRef(''); setSelectedId(null); setRoutePoints([]); setDimensionStart(null); }}>Этаж {index + 1}</button>)}</div>
      <label className="placement-room-picker">Комната<select aria-label="Выбрать комнату" value={selectedRoom?.id || ''} onChange={event => { setSelectedRoomId(event.target.value); setSelectedWallRef(''); resetView(); }}><option value="">Весь этаж</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
      <div className="placement-summary"><span>Мебель <b>{summary.furniture}</b></span><span>Техника <b>{summary.appliance}</b></span><span>Инженерия <b>{summary.equipment}</b></span><span>Электроточки <b>{summary.electric}</b></span><span>Сети <b>{items.filter(item => isNetworkLayer(item.layer)).length}</b></span><span>Линии сетей <b>{networkRoutes.length}</b></span><span>Трассы по плану <b>{electricBill.routeMetres} м</b></span></div>
      <div className="placement-measure-tools"><button className={placement.showAutoDimensions ? 'active' : ''} onClick={() => change(data => { data.showAutoDimensions = !data.showAutoDimensions; })}><Ruler size={16}/> Авторазмеры электрики</button><button className={drawingDimension ? 'active' : ''} onClick={() => { setDrawingDimension(current => !current); setDimensionStart(null); setDrawingRoute(false); setRoutePoints([]); setPresetId(null); }}><Plus size={16}/> Размер вручную</button></div>
    </div>
    {snapshotError && !snapshot ? createPortal(<p className="placement-snapshot-toast" role="status">{snapshotError}<button type="button" aria-label="Закрыть сообщение" onClick={() => setSnapshotError('')}><X size={16}/></button></p>, document.body) : null}
    {snapshot ? createPortal(<div className="placement-snapshot-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSnapshot(null); }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setSnapshot(null); } }}>
      <section className="placement-snapshot-dialog" role="dialog" aria-modal="true" aria-label="Снимок рабочего поля">
        <header><strong>Снимок рабочего поля</strong><button type="button" aria-label="Закрыть снимок" onClick={() => setSnapshot(null)}><X size={18}/></button></header>
        <img src={snapshot.url} alt={selectedRoom ? `Развёртка комнаты ${selectedRoom.name}` : `План этажа ${activeFloor}`}/>
        <div className="placement-snapshot-actions"><button type="button" onClick={saveSnapshot}><Download size={17}/> Сохранить на устройство</button><button type="button" onClick={shareSnapshot}><Share2 size={17}/> Поделиться</button></div>
        {snapshotError ? <p role="status">{snapshotError}</p> : null}
      </section>
    </div>, document.body) : null}
    {settingsCircuit ? createPortal(<div className="placement-circuit-settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSettingsCircuitId(null); }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setSettingsCircuitId(null); } }}>
      <section className="placement-circuit-settings-dialog" role="dialog" aria-modal="true" aria-label={`Настройки группы ${settingsCircuit.name}`}>
        <header><div><small>Настройки группы</small><h2>{settingsCircuit.name}</h2></div><button type="button" aria-label="Закрыть настройки группы" onClick={() => setSettingsCircuitId(null)}><X size={18}/></button></header>
        <label>Кабель по проекту<select value={customCable ? 'custom' : settingsCircuit.cable || ''} onChange={event => { if (event.target.value === 'custom') setCustomCableCircuitId(settingsCircuit.id); else { setCustomCableCircuitId(null); updateCircuitById(settingsCircuit.id, { cable: event.target.value }); } }}><option value="">Не указан</option>{ELECTRICAL_CABLE_CHOICES.map(cable => <option key={cable} value={cable}>{cable}</option>)}<option value="custom">Другой · вручную</option></select></label>
        {customCable ? <label>Свой кабель<input value={settingsCircuit.cable || ''} onChange={event => updateCircuitById(settingsCircuit.id, { cable: event.target.value })} placeholder="Обозначение по проекту"/></label> : null}
        <label>Номинал автомата<select value={customBreakerAmpsCircuitId === settingsCircuit.id || (settingsCircuit.breakerAmps && !breakerNominals.some(([amps]) => amps === settingsCircuit.breakerAmps)) ? 'custom' : settingsCircuit.breakerAmps ?? ''} onChange={event => { if (event.target.value === 'custom') setCustomBreakerAmpsCircuitId(settingsCircuit.id); else { setCustomBreakerAmpsCircuitId(null); updateCircuitById(settingsCircuit.id, { breakerAmps: event.target.value ? Number(event.target.value) : null }); } }}><option value="">Не указан</option>{breakerNominals.map(([amps, purpose]) => <option value={amps} key={amps}>{amps} А · {purpose}</option>)}<option value="custom">Другой · вручную по проекту</option></select></label>
        {customBreakerAmpsCircuitId === settingsCircuit.id || (settingsCircuit.breakerAmps && !breakerNominals.some(([amps]) => amps === settingsCircuit.breakerAmps)) ? <label>Свой номинал, А<input type="number" min="1" step="any" value={settingsCircuit.breakerAmps ?? ''} onChange={event => updateCircuitById(settingsCircuit.id, { breakerAmps: event.target.value ? Number(event.target.value) : null })} placeholder="По проекту"/></label> : null}
        <label>Характеристика автомата<select value={customBreakerCircuitId === settingsCircuit.id || (settingsCircuit.breaker && !['A', 'B', 'C'].includes(settingsCircuit.breaker)) ? 'custom' : settingsCircuit.breaker || ''} onChange={event => { if (event.target.value === 'custom') setCustomBreakerCircuitId(settingsCircuit.id); else { setCustomBreakerCircuitId(null); updateCircuitById(settingsCircuit.id, { breaker: event.target.value }); } }}><option value="">Не указана</option><option value="A">A · только по паспорту аппарата</option><option value="B">B · малый пусковой ток</option><option value="C">C · умеренный пусковой ток</option><option value="custom">Другая / тип защиты · вручную</option></select></label>
        {customBreakerCircuitId === settingsCircuit.id || (settingsCircuit.breaker && !['A', 'B', 'C'].includes(settingsCircuit.breaker)) ? <label>Обозначение по проекту<input value={settingsCircuit.breaker || ''} onChange={event => updateCircuitById(settingsCircuit.id, { breaker: event.target.value })} placeholder="Характеристика или аппарат"/></label> : null}
        <p className="placement-breaker-note">Подсказки не назначают защиту: номинал и кривая зависят от кабеля, нагрузки и условий сети. B/C — типовые кривые модульных автоматов; A применяйте только с паспортом конкретного аппарата. <a href="https://www.se.com/au/en/faqs/FA290880/" target="_blank" rel="noreferrer">Справка Schneider Electric</a>.</p>
        <div className="placement-circuit-color-picker"><strong>Цвет группы</strong><div className="placement-circuit-swatches">{CIRCUIT_COLORS.map(color => { const occupied = placement.circuits.some(circuit => circuit.id !== settingsCircuit.id && electricalGroupColor(circuit.id, placement.circuits).toLowerCase() === color); return <button key={color} type="button" style={{ backgroundColor: color }} className={settingsCircuit.color === color ? 'active' : ''} disabled={occupied} aria-label={`${color}${occupied ? ' · занят' : ''}`} title={occupied ? 'Цвет занят другой группой' : color} onClick={() => updateCircuitColor(settingsCircuit.id, color)}/>; })}</div><label>Свой цвет<input type="color" value={validCircuitColor(settingsCircuit.color) || CIRCUIT_COLORS[0]} onChange={event => updateCircuitColor(settingsCircuit.id, event.target.value)}/></label>{circuitColorError ? <small role="alert">{circuitColorError}</small> : null}</div>
      </section>
    </div>, document.body) : null}
    {printing ? createPortal(<PlacementWorkerSheets project={project}/>, document.body) : null}
  </main>;
}
