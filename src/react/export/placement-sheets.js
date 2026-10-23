import { electricalBill, resolvedElectricalRoutes } from '../state/placement-electrical.js';
import { NETWORK_SYSTEMS, networkBill, resolvedNetworkRoutes } from '../state/placement-networks.js';
import { placementWallFaces } from '../state/placement-walls.js';
import { roomPoints } from '../planner/geometry.js';
import { pointInPolygon } from '../state/placement-geometry.js';
import { findPlacementPreset, PLACEMENT_LAYERS } from '../state/placement-model.js';
import { roomNameForPlacement } from '../state/placement-visibility.js';

export function buildPlacementSheets(project) {
  const placement = project.placement || { items: [], routes: [], dimensions: [], circuits: [] };
  const floors = Math.max(1, Math.min(2, Number(project.meta?.floors) || 1));
  const sheets = [];
  for (let floor = 1; floor <= floors; floor += 1) {
    const plan = floor === 1 ? project.plan : project.upperFloors?.[floor - 2] || project.plan;
    for (const discipline of ['layout', 'electric', ...Object.keys(NETWORK_SYSTEMS)]) {
      const list = (placement.items || []).filter(item => item.floor === floor && (discipline === 'electric' ? item.layer === 'electric' : discipline === 'layout' ? !['electric', ...Object.keys(NETWORK_SYSTEMS)].includes(item.layer) : item.layer === discipline));
      const routes = discipline === 'electric' ? resolvedElectricalRoutes(placement, floor, plan) : NETWORK_SYSTEMS[discipline] ? resolvedNetworkRoutes(placement, discipline, floor) : [];
      if (NETWORK_SYSTEMS[discipline] && !list.length && !routes.length) continue;
      const circuitIds = new Set([...list.map(item => item.circuitId), ...routes.map(route => route.circuitId)].filter(Boolean));
      const prefix = discipline === 'electric' ? 'Э' : NETWORK_SYSTEMS[discipline]?.prefix || 'Р';
      sheets.push({
        id: `${floor}-${discipline}`,
        floor,
        discipline,
        title: discipline === 'electric' ? 'План электроточек и освещения' : NETWORK_SYSTEMS[discipline] ? `План сети · ${NETWORK_SYSTEMS[discipline].label}` : 'План мебели и оборудования',
        plan,
        items: list.map((item, index) => ({ item, mark: `${prefix}-${String(index + 1).padStart(2, '0')}` })),
        routes,
        electricalBill: discipline === 'electric' ? electricalBill(placement, floor, plan) : null,
        networkBill: NETWORK_SYSTEMS[discipline] ? networkBill(placement, discipline, floor) : null,
        dimensions: ['layout', 'electric'].includes(discipline) ? (placement.dimensions || []).filter(dimension => dimension.floor === floor) : [],
        circuits: discipline === 'electric' ? (placement.circuits || []).filter(circuit => circuitIds.has(circuit.id)) : [],
      });
      if (discipline === 'electric') {
        const refs = new Set([...list.map(item => item.wallRef), ...routes.flatMap(route => route.points?.map(point => point.wallRef) || [])].filter(Boolean));
        for (const wall of placementWallFaces(plan).filter(face => refs.has(face.ref))) {
          const wallItems = list.map((item, index) => ({ item, mark: `${prefix}-${String(index + 1).padStart(2, '0')}` })).filter(entry => entry.item.wallRef === wall.ref);
          const wallRoutes = routes.filter(route => route.points?.some(point => point.wallRef === wall.ref) || [route.fromItemId, route.targetItemId].some(id => wallItems.some(entry => entry.item.id === id)));
          sheets.push({ id: `${floor}-electric-${wall.ref}`, floor, discipline, title: `Электрика · ${wall.label} · развёртка`, plan, wall, items: wallItems, routes: wallRoutes, dimensions: [], circuits: (placement.circuits || []).filter(circuit => circuitIds.has(circuit.id)), electricalBill: null, networkBill: null });
        }
      }
      if (NETWORK_SYSTEMS[discipline]) {
        const refs = new Set([...list.map(item => item.wallRef), ...routes.map(route => route.wallRef)].filter(Boolean));
        for (const wall of placementWallFaces(plan).filter(face => refs.has(face.ref))) {
          sheets.push({
            id: `${floor}-${discipline}-${wall.ref}`, floor, discipline,
            title: `${NETWORK_SYSTEMS[discipline].label} · развёртка стены`, plan, wall,
            items: list.map((item, index) => ({ item, mark: `${prefix}-${String(index + 1).padStart(2, '0')}` })).filter(entry => entry.item.wallRef === wall.ref),
            routes: routes.filter(route => route.wallRef === wall.ref),
            dimensions: [], circuits: [], networkBill: null,
          });
        }
      }
    }
  }
  return sheets;
}

// Printable pages use the current floor plan and room unfoldings. A group
// line sheet is a filtered copy of that floor plan, never a separate drawing.
export function buildPrintablePlacementSheets(project) {
  const placement = project.placement || {};
  const visible = placement.visibleLayers || {};
  const floors = Math.max(1, Math.min(2, Number(project.meta?.floors) || 1));
  const result = [];
  for (let floor = 1; floor <= floors; floor += 1) {
    const plan = floor === 1 ? project.plan : project.upperFloors?.[floor - 2] || project.plan;
    const items = (placement.items || []).filter(item => item.floor === floor && visible[item.layer] !== false);
    const electricRoutes = visible.electric === false ? [] : resolvedElectricalRoutes(placement, floor, plan).map(route => ({ ...route, system: 'electric' }));
    const networkRoutes = Object.keys(NETWORK_SYSTEMS).flatMap(system => visible[system] === false ? [] : resolvedNetworkRoutes(placement, system, floor).map(route => ({ ...route, system })));
    const routes = [...electricRoutes, ...networkRoutes];
    const marks = items.map((item, index) => ({ item, mark: String(index + 1).padStart(2, '0') }));
    const dimensions = (placement.dimensions || []).filter(dimension => dimension.floor === floor);
    result.push({ id: `${floor}-plan`, kind: 'plan', floor, title: `План этажа ${floor}`, plan, items: marks, routes, dimensions: dimensions.filter(dimension => !dimension.roomId), circuits: placement.circuits || [], showAutoDimensions: placement.showAutoDimensions !== false });
    for (const circuit of placement.circuits || []) {
      const layerRoutes = electricRoutes.filter(route => route.circuitId === circuit.id);
      if (!layerRoutes.length) continue;
      const connectedIds = new Set(layerRoutes.flatMap(route => [route.fromItemId, route.panelItemId, route.targetItemId]).filter(Boolean));
      result.push({ id: `${floor}-lines-${circuit.id}`, kind: 'line-layer', floor, title: `Линии · ${circuit.name}`, plan,
        items: marks.filter(({ item }) => item.layer === 'electric' && (item.circuitId === circuit.id || connectedIds.has(item.id))),
        routes: layerRoutes, dimensions: dimensions.filter(dimension => !dimension.roomId), circuits: [circuit], showAutoDimensions: placement.showAutoDimensions !== false });
    }
    for (const room of (plan.rooms || []).filter(entry => entry.include !== false)) {
      const polygon = roomPoints(room);
      const roomItems = marks.filter(({ item }) => pointInPolygon(item, polygon) || item.linkedApplianceId && items.some(parent => parent.id === item.linkedApplianceId && pointInPolygon(parent, polygon)));
      const itemIds = new Set(roomItems.map(({ item }) => item.id));
      const roomRoutes = routes.filter(route => [route.fromItemId, route.targetItemId, route.fromId, route.toId].some(id => itemIds.has(id)) || route.points?.some(point => pointInPolygon(point, polygon)));
      result.push({ id: `${floor}-room-${room.id}`, kind: 'room', floor, title: `Развёртка · ${room.name}`, plan, room, items: roomItems, routes: roomRoutes, dimensions: dimensions.filter(dimension => dimension.roomId === room.id), circuits: placement.circuits || [] });
    }
  }
  return result;
}

export function expandPrintablePlanTiles(sheets, tileCount = 1) {
  if (![2, 4].includes(tileCount)) return sheets;
  return sheets.flatMap(sheet => {
    if (sheet.kind !== 'plan') return [sheet];
    const wide = Number(sheet.plan.house?.w) >= Number(sheet.plan.house?.h);
    const cols = tileCount === 4 || wide ? 2 : 1;
    const rows = tileCount / cols;
    return Array.from({ length: tileCount }, (_, index) => {
      const row = Math.floor(index / cols), col = index % cols;
      return { ...sheet, id: `${sheet.id}-tile-${index + 1}`, title: `${sheet.title} · часть ${index + 1}/${tileCount}`,
        tile: { cols, rows, col, row, index: index + 1, count: tileCount } };
    });
  });
}

export function buildWorkerPrintPages(sheets, tileCount = 1) {
  const rowsPerPage = 40;
  return sheets.flatMap(sheet => {
    const parts = Math.ceil(sheet.items.length / rowsPerPage);
    return [
      ...expandPrintablePlanTiles([sheet], tileCount),
      ...Array.from({ length: parts }, (_, index) => ({
        ...sheet, id: `${sheet.id}-points-${index + 1}`, kind: 'point-list',
        title: `Перечень точек · ${sheet.title}${parts > 1 ? ` · ${index + 1}/${parts}` : ''}`,
        items: sheet.items.slice(index * rowsPerPage, (index + 1) * rowsPerPage),
        pointListTotal: sheet.items.length,
      })),
    ];
  });
}

// Locate print numbers independently of the symbol: close numbers stay next to
// their points, while crowded numbers move into free space and get a leader.
export function placeFloorPointLabels(entries, view) {
  const [left, top, width, height] = view;
  const occupied = [];
  const anchors = entries.map(({ item }) => ({ x: item.x * 100, y: item.y * 100 }));
  const grid = [];
  for (let y = top + 18; y <= top + height - 18; y += 31) {
    for (let x = left + 30; x <= left + width - 30; x += 56) grid.push({ x, y });
  }
  return entries.map(({ item, mark }, index) => {
    const anchor = anchors[index];
    const choices = [];
    for (const radius of [32, 55, 82, 112, 150, 195, 250, 320]) {
      for (const [dx, dy] of [[1, -1], [-1, -1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]]) {
        choices.push({ x: anchor.x + dx * radius, y: anchor.y + dy * radius });
      }
    }
    const fits = ({ x, y }) => {
      if (x < left + 28 || x > left + width - 28 || y < top + 16 || y > top + height - 16) return false;
      if (occupied.some(label => Math.abs(label.x - x) < 52 && Math.abs(label.y - y) < 27)) return false;
      return !anchors.some((point, pointIndex) => pointIndex !== index && Math.abs(point.x - x) < 33 && Math.abs(point.y - y) < 25);
    };
    const position = choices.find(fits) || [...grid].sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y)).find(fits) || anchor;
    occupied.push(position);
    return { id: item.id, mark, x: position.x, y: position.y, anchorX: anchor.x, anchorY: anchor.y, leader: Math.hypot(position.x - anchor.x, position.y - anchor.y) > 45 };
  });
}

export function pointLegendRows(sheet) {
  const rooms = (sheet.plan.rooms || []).filter(room => room.include !== false);
  return sheet.items.map(({ item, mark }) => {
    const type = findPlacementPreset(item.kind)?.label || item.label || item.kind;
    const name = item.annotationText?.trim() || item.label?.trim() || type;
    const details = [];
    if (name !== type) details.push(type);
    details.push(PLACEMENT_LAYERS.find(layer => layer.id === item.layer)?.label || item.layer);
    details.push(sheet.room?.name || roomNameForPlacement(item, rooms));
    const circuit = sheet.circuits.find(entry => entry.id === item.circuitId);
    if (circuit) details.push(`Группа: ${circuit.name}`);
    if (item.heightKnown) details.push(`h ${Number(item.height).toFixed(2).replace('.', ',')} м`);
    if (item.surface === 'facade') details.push('Фасад');
    return { id: item.id, mark, name, details };
  });
}

export function planTileViewBox(full, tile) {
  if (!tile) return full;
  const [x, y, width, height] = full;
  const partWidth = width / tile.cols, partHeight = height / tile.rows;
  const overlapX = partWidth * .025, overlapY = partHeight * .025;
  const left = Math.max(x, x + tile.col * partWidth - overlapX);
  const top = Math.max(y, y + tile.row * partHeight - overlapY);
  const right = Math.min(x + width, x + (tile.col + 1) * partWidth + overlapX);
  const bottom = Math.min(y + height, y + (tile.row + 1) * partHeight + overlapY);
  return [left, top, right - left, bottom - top];
}
