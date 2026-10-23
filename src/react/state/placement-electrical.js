import { placementWallFaces } from './placement-walls.js';
import { appendSurfaceWaypoint, surfaceRouteLeg } from './placement-route-surfaces.js';
import { electricalDrawingAnchors } from './placement-schematic.js';

const round = value => Math.round(value * 100) / 100;
export const routeLength = points => (points || []).slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
export const electricalRouteLength3d = points => (points || []).slice(1).reduce((sum, point, index) => {
  const previous = points[index];
  return sum + Math.hypot(point.x - previous.x, point.y - previous.y, (point.z || 0) - (previous.z || 0));
}, 0);

const switches = new Set(['switch', 'double-switch', 'two-way-switch', 'dimmer']);
const lights = new Set(['light', 'spotlight', 'pendant-light', 'wall-light', 'led-strip', 'facade-light', 'facade-spotlight']);
const outlets = new Set(['socket', 'double-socket', 'power', 'facade-socket']);
export const ELECTRICAL_CABLE_CHOICES = ['3×1,5', '3×2,5', '3×4', '3×6', '5×2,5', '5×4', '5×6'];
export const breakerDescription = circuit => [circuit.breakerAmps ? `${circuit.breakerAmps} А` : '', circuit.breaker || ''].filter(Boolean).join(' · ') || 'Не указана';
export const cableCoreCount = cable => {
  const count = Number(String(cable || '').match(/(?:^|\D)(\d+)\s*[×xXх]\s*\d/)?.[1]);
  return count >= 2 && count <= 12 ? count : null;
};

const electricalBillOptions = placement => ({ cableReservePercent: 10, endAllowanceM: 0, protection: 'none', protectionSpec: '', fastenerType: '', fastenerSpec: '', fastenerSpacingM: null, connectorModel: '', junctionConnectors: true, lightConnectors: true, ...(placement.electricalBillSettings || {}) });
const routePurchaseLength = (route, settings) => electricalRouteLength3d(route.points) * (1 + Math.max(0, Number(settings.cableReservePercent) || 0) / 100) + 2 * Math.max(0, Number(settings.endAllowanceM) || 0);
const routeVerticalLength = points => (points || []).slice(1).reduce((sum, point, index) => sum + (Math.hypot(point.x - points[index].x, point.y - points[index].y) < .001 ? Math.abs((point.z || 0) - (points[index].z || 0)) : 0), 0);

const crosses = (a, b, c, d) => {
  const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const first = orient(a, b, c), second = orient(a, b, d), third = orient(c, d, a), fourth = orient(c, d, b);
  return first * second < -.000001 && third * fourth < -.000001;
};

export function orthogonalElectricalPath(from, to, plan) {
  const start = { x: from.x, y: from.y }, end = { x: to.x, y: to.y };
  if (Math.abs(start.x - end.x) < .01 || Math.abs(start.y - end.y) < .01) return [start, end];
  const candidates = [
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
  ];
  if (plan) {
    const faces = placementWallFaces(plan);
    const values = (axis, min, max) => [...new Set(faces.flatMap(face => [face.a[axis], face.b[axis]]).filter(value => value > min + .05 && value < max - .05).map(value => round(value)))];
    for (const x of values('x', Math.min(start.x, end.x), Math.max(start.x, end.x))) candidates.push([start, { x, y: start.y }, { x, y: end.y }, end]);
    for (const y of values('y', Math.min(start.y, end.y), Math.max(start.y, end.y))) candidates.push([start, { x: start.x, y }, { x: end.x, y }, end]);
    const score = path => path.slice(1).reduce((sum, point, index) => {
      const previous = path[index];
      return sum + Math.hypot(point.x - previous.x, point.y - previous.y) + faces.reduce((crossings, face) => crossings + (crosses(previous, point, face.a, face.b) ? 8 : 0), 0);
    }, 0) + path.length * .01;
    return candidates.sort((a, b) => score(a) - score(b))[0].filter((point, index, path) => index === 0 || Math.hypot(point.x - path[index - 1].x, point.y - path[index - 1].y) > .01);
  }
  return candidates[0];
}

export function routeBetweenElectricalNodes(from, to, routeLevel = null, plan = null) {
  const hasHeight = routeLevel != null || Number.isFinite(Number(from.height)) && Number.isFinite(Number(to.height)) && (from.heightKnown === true || to.heightKnown === true || Number(from.height) > 0 || Number(to.height) > 0);
  const level = routeLevel == null ? Number(from.height) || 0 : Number(routeLevel) || 0;
  const at = (item, z) => ({ x: item.x, y: item.y, ...(hasHeight ? { z } : {}) });
  const points = [at(from, Number(from.height) || 0)];
  if (hasHeight && Math.abs((Number(from.height) || 0) - level) > .001) points.push(at(from, level));
  points.push(...orthogonalElectricalPath(from, to, plan).slice(1, -1).map(point => ({ ...point, ...(hasHeight ? { z: level } : {}) })));
  points.push(at(to, level));
  if (hasHeight && Math.abs((Number(to.height) || 0) - level) > .001) points.push(at(to, Number(to.height) || 0));
  return points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y, (p.z || 0) - (points[i - 1].z || 0)) > .001);
}

const ceilingRouteLevel = plan => Number(plan?.wallHeight) > 0 ? Number(plan.wallHeight) : null;

export function routeToPanel(panel, item) {
  return routeBetweenElectricalNodes(panel, item);
}

export function reassignElectricalPoint(placement, itemId, circuitId) {
  const item = placement.items.find(entry => entry.id === itemId && entry.layer === 'electric' && entry.kind !== 'panel');
  if (!item) return '';
  const previous = item.circuitId || '';
  if (previous === circuitId) return previous;
  item.circuitId = circuitId;
  placement.routes = placement.routes.filter(route => route.circuitId === circuitId || (route.fromItemId !== itemId && route.targetItemId !== itemId));
  return previous;
}

export function connectSelectedElectricalPoints(placement, floor, circuitId, fromId, targetId, createId, plan) {
  const from = placement.items.find(item => item.id === fromId && item.floor === floor && item.layer === 'electric');
  const target = placement.items.find(item => item.id === targetId && item.floor === floor && item.layer === 'electric');
  if (!from || !target || from.id === target.id || !circuitId) return null;
  placement.routes = placement.routes.filter(route => !(route.floor === floor && route.circuitId === circuitId && route.auto && route.targetItemId === targetId));
  const route = { id: createId(), floor, circuitId,
    panelItemId: placement.items.find(item => item.floor === floor && item.kind === 'panel')?.id || '',
    fromItemId: fromId, targetItemId: targetId, purpose: 'selected-chain', auto: true,
    points: routeBetweenElectricalNodes(from, target, null, plan) };
  placement.routes.push(route);
  return route;
}

export function proposeElectricalCircuitRoutes(items, floor, circuitId, panelId, createId, plan = null, surface = 'ceiling') {
  const floorItems = items.filter(item => item.floor === floor);
  const panel = floorItems.find(item => item.id === panelId && item.kind === 'panel');
  if (!panel) return [];
  const assigned = floorItems.filter(item => item.circuitId === circuitId && item.kind !== 'panel');
  const junctions = assigned.filter(item => item.kind === 'junction-box');
  const nearestJunction = item => junctions.find(entry => entry.id === item.junctionItemId) || [...junctions].sort((a, b) => Math.hypot(item.x - a.x, item.y - a.y) - Math.hypot(item.x - b.x, item.y - b.y))[0] || null;
  const level = surface === 'floor' ? 0 : ceilingRouteLevel(plan);
  const make = (from, to, purpose) => ({ id: createId(), floor, circuitId, panelItemId: panel.id, fromItemId: from.id, targetItemId: to.id, purpose, auto: true, points: routeBetweenElectricalNodes(from, to, level, plan) });
  // Feed the junctions as one rooted tree. A downstream junction is connected
  // to the nearest already fed junction or the panel, never routed via the
  // panel again merely because it is the next junction in the group.
  const result = [];
  const fed = [panel];
  const pendingJunctions = [...junctions];
  const feedLengths = new Map();
  const feedLength = (from, to) => {
    const key = `${from.id}:${to.id}`;
    if (!feedLengths.has(key)) feedLengths.set(key, electricalRouteLength3d(routeBetweenElectricalNodes(from, to, level, plan)));
    return feedLengths.get(key);
  };
  while (pendingJunctions.length) {
    const candidates = pendingJunctions.flatMap(to => fed.map(from => ({ from, to, length: feedLength(from, to) })));
    candidates.sort((a, b) => a.length - b.length || a.to.id.localeCompare(b.to.id) || a.from.id.localeCompare(b.from.id));
    const chosen = candidates[0];
    result.push(make(chosen.from, chosen.to, 'feed'));
    fed.push(chosen.to);
    pendingJunctions.splice(pendingJunctions.findIndex(item => item.id === chosen.to.id), 1);
  }
  const routed = new Set(junctions.map(item => item.id));
  // Build one editable chain for each junction. Without junctions the chain
  // starts at the panel. Every outlet remains an explicit route endpoint.
  const outletGroups = new Map();
  for (const outlet of assigned.filter(item => outlets.has(item.kind))) {
    const anchor = nearestJunction(outlet) || panel;
    if (!outletGroups.has(anchor.id)) outletGroups.set(anchor.id, { anchor, pending: [] });
    outletGroups.get(anchor.id).pending.push(outlet);
  }
  for (const { anchor, pending } of outletGroups.values()) {
    let previous = anchor;
    while (pending.length) {
      pending.sort((a, b) => Math.hypot(a.x - previous.x, a.y - previous.y) - Math.hypot(b.x - previous.x, b.y - previous.y) || a.id.localeCompare(b.id));
      const outlet = pending.shift();
      result.push(make(previous, outlet, previous.id === anchor.id ? 'outlet-feed' : 'outlet-chain'));
      routed.add(outlet.id);
      previous = outlet;
    }
  }
  // A two-way pair has a feed, a traveller cable and a switched return.
  // Both switches remain explicit nodes, so moving either updates its cables.
  for (const first of assigned.filter(item => item.kind === 'two-way-switch' && item.pairedSwitchId && !routed.has(item.id))) {
    const second = assigned.find(item => item.id === first.pairedSwitchId && item.kind === 'two-way-switch' && item.pairedSwitchId === first.id);
    if (!second || routed.has(second.id)) continue;
    const junction = nearestJunction(first) || panel;
    result.push(make(junction, first, 'switch-feed'));
    result.push(make(first, second, 'travellers'));
    const lamp = assigned.find(item => item.id === first.controlsItemId && lights.has(item.kind)) || assigned.find(item => item.id === second.controlsItemId && lights.has(item.kind));
    if (lamp) {
      result.push(make(second, lamp, 'switched-light'));
      if (junction.id !== panel.id) result.push(make(junction, lamp, 'neutral-light'));
      routed.add(lamp.id);
    }
    routed.add(first.id); routed.add(second.id);
  }
  for (const item of assigned) {
    if (item.kind === 'junction-box' || routed.has(item.id)) continue;
    const controllingSwitch = assigned.find(candidate => switches.has(candidate.kind) && candidate.kind !== 'two-way-switch' && candidate.controlsItemId === item.id);
    const from = controllingSwitch ? nearestJunction(controllingSwitch) || controllingSwitch : nearestJunction(item) || panel;
    result.push(make(from, item, controllingSwitch && from.id === controllingSwitch.id ? 'switched-light' : switches.has(item.kind) ? 'switch-feed' : lights.has(item.kind) ? 'light-feed' : 'device-feed'));
    routed.add(item.id);
  }
  return result;
}

export function resolvedElectricalRoutes(placement, floor, plan = null) {
  const items = (placement.items || []).filter(item => item.floor === floor);
  const drawingAnchors = plan ? electricalDrawingAnchors(items, plan.rooms || []) : null;
  return (placement.routes || []).filter(route => route.floor === floor && (placement.electricalRouteMode === 'manual' ? route.auto !== true : placement.electricalRouteMode === 'automatic' ? route.auto !== false : true)).map(route => {
    const panel = items.find(item => item.id === route.panelItemId);
    const from = items.find(item => item.id === route.fromItemId) || panel;
    if (!route.auto) {
      const target = items.find(item => item.id === route.targetItemId);
      if (!from || route.points.length < 2) return route;
      if (route.rebuildOnMove && route.purpose !== 'manual' && target && plan) {
        const start = { x: from.x, y: from.y, z: from.heightKnown ? Number(from.height) || 0 : Number(route.points[0].z) || 0, surface: 'device', wallRef: from.wallRef || '' };
        const end = { x: target.x, y: target.y, z: target.heightKnown ? Number(target.height) || 0 : Number(route.points.at(-1).z) || 0, surface: 'device', wallRef: target.wallRef || '' };
        let rebuilt = [start];
        for (const anchor of route.points.filter(point => point.waypoint)) {
          const next = appendSurfaceWaypoint(rebuilt, anchor, anchor.surface || 'ceiling', plan, route.wallHeight ?? null, anchor.wallRef || '');
          if (!next) { rebuilt = null; break; }
          rebuilt = next;
        }
        if (rebuilt) {
          const surface = route.surface || rebuilt.at(-1).surface || 'ceiling';
          const leg = surfaceRouteLeg(rebuilt.at(-1), end, surface, plan, route.wallHeight ?? null);
          if (leg) return { ...route, points: [...rebuilt, ...leg.slice(1)] };
        }
      }
      const points = route.points.map(point => ({ ...point }));
      const start = route.purpose === 'manual' ? drawingAnchors?.get(from.id) || from : from;
      points[0] = { ...points[0], x: start.x, y: start.y, ...(from.heightKnown ? { z: Number(from.height) || 0 } : {}) };
      if (target) {
        const end = route.purpose === 'manual' ? drawingAnchors?.get(target.id) || target : target;
        points[points.length - 1] = { ...points[points.length - 1], x: end.x, y: end.y, ...(target.heightKnown ? { z: Number(target.height) || 0 } : {}) };
      }
      return { ...route, points };
    }
    const target = items.find(item => item.id === route.targetItemId);
    const level = route.routeLevel ?? (route.surface === 'floor' || placement.defaultRouteSurface === 'floor' ? 0 : ceilingRouteLevel(plan));
    return from && target ? { ...route, points: routeBetweenElectricalNodes(from, target, level, plan) } : null;
  }).filter(Boolean);
}

export function electricalBill(placement, floor, plan = null) {
  const items = (placement.items || []).filter(item => item.floor === floor && item.layer === 'electric');
  const routes = resolvedElectricalRoutes(placement, floor, plan);
  const settings = electricalBillOptions(placement);
  const circuits = (placement.circuits || []).filter(circuit => items.some(item => item.circuitId === circuit.id) || routes.some(route => route.circuitId === circuit.id));
  const routeMetres = round(routes.reduce((sum, route) => sum + electricalRouteLength3d(route.points), 0));
  const verticalMetres = round(routes.reduce((sum, route) => sum + routeVerticalLength(route.points), 0));
  const purchaseMetres = round(routes.reduce((sum, route) => sum + routePurchaseLength(route, settings), 0));
  const byCircuit = circuits.map(circuit => ({ ...circuit,
    routeMetres: round(routes.filter(route => route.circuitId === circuit.id).reduce((sum, route) => sum + electricalRouteLength3d(route.points), 0)),
    purchaseMetres: round(routes.filter(route => route.circuitId === circuit.id).reduce((sum, route) => sum + routePurchaseLength(route, settings), 0)),
  }));
  const count = kinds => items.filter(item => kinds.includes(item.kind)).length;
  const outletCount = count(['socket', 'double-socket', 'power', 'facade-socket']);
  const switchCount = count(['switch', 'double-switch', 'two-way-switch', 'dimmer']);
  const lightCount = count(['light', 'spotlight', 'pendant-light', 'wall-light', 'led-strip', 'facade-light', 'facade-spotlight']);
  const cableRows = new Map();
  for (const route of routes) {
    const circuit = circuits.find(entry => entry.id === route.circuitId);
    const cable = circuit?.cable?.trim() || 'тип не указан';
    cableRows.set(cable, (cableRows.get(cable) || 0) + routePurchaseLength(route, settings));
  }
  const breakerRows = new Map();
  for (const circuit of circuits) {
    const name = `${circuit.protectionDevice === 'RCBO' ? 'Дифавтомат' : 'Автомат'} ${circuit.breakerAmps ? `${circuit.breakerAmps} А` : 'номинал не указан'} · ${circuit.breaker || 'кривая не указана'} · ${circuit.breakerPoles ? `${circuit.breakerPoles}P` : 'полюса не указаны'}${circuit.breakerKa ? ` · ${circuit.breakerKa} кА` : ''}${circuit.protectionDevice === 'RCBO' ? ` · ${circuit.residualMa || '?'} мА` : ''}${circuit.breakerModel ? ` · ${circuit.breakerModel}` : ''}`;
    const row = breakerRows.get(name) || { name, quantity: 0, unit: 'шт', note: '', ready: Boolean(circuit.breakerAmps && circuit.breaker && circuit.breakerPoles && circuit.breakerKa && circuit.breakerModel && (circuit.protectionDevice !== 'RCBO' || circuit.residualMa)) };
    row.quantity += Math.max(1, Number(circuit.breakerQuantity) || 1);
    row.note = [row.note, circuit.name].filter(Boolean).join('; ');
    breakerRows.set(name, row);
  }
  const connectorRows = new Map();
  const connectionNodes = [];
  const terminalIssues = [];
  const routeEnds = new Map();
  for (const route of routes) for (const id of [route.fromItemId || route.panelItemId, route.targetItemId]) {
    if (!id) continue;
    const key = `${id}:${route.circuitId || ''}`;
    routeEnds.set(key, [...(routeEnds.get(key) || []), route]);
  }
  for (const item of items.filter(entry => entry.kind === 'junction-box' && settings.junctionConnectors || lights.has(entry.kind) && settings.lightConnectors)) {
    for (const circuit of circuits) {
      const incident = routeEnds.get(`${item.id}:${circuit.id}`) || [];
      if (!incident.length || item.kind === 'junction-box' && incident.length < 2) continue;
      const cores = cableCoreCount(circuit.cable);
      const ports = item.kind === 'junction-box' ? incident.length : 2;
      const quantity = cores && ports <= 5 ? cores : null;
      const detail = { itemId: item.id, label: item.label || item.kind, circuit: circuit.name, cables: incident.length, conductorEnds: cores ? cores * incident.length : null, ports, quantity };
      connectionNodes.push(detail);
      if (quantity == null) { terminalIssues.push(`${detail.label}: укажите кабель или схему соединения для ${ports} вводов`); continue; }
      const row = connectorRows.get(ports) || { name: `Клеммы соединительные · ${ports} ввода`, quantity: 0, unit: 'шт', note: `${settings.connectorModel || 'Модель не выбрана'}; минимум по числу жил; схему соединений проверить`, ready: Boolean(settings.connectorModel) };
      row.quantity += quantity;
      connectorRows.set(ports, row);
    }
  }
  const fastenerLabels = { clip: 'Клипсы для трассы', clamp: 'Кабельные хомуты', tie: 'Стяжки для трассы' };
  const spacing = Number(settings.fastenerSpacingM);
  const fastenerQuantity = settings.fastenerType && spacing > 0 ? routes.reduce((sum, route) => { const length = electricalRouteLength3d(route.points); return sum + (length > .001 ? Math.ceil(length / spacing) + 1 : 0); }, 0) : null;
  const protectionLabel = settings.protection === 'corrugated' ? 'Гофра' : settings.protection === 'channel' ? 'Кабель-канал' : 'Гофра / кабель-канал';
  const components = [
    { name: 'Электрощит', quantity: count(['panel']), unit: 'шт' },
    { name: 'Розетки и силовые точки', quantity: outletCount, unit: 'шт' },
    { name: 'Выключатели и диммеры', quantity: switchCount, unit: 'шт' },
    { name: 'Светильники и световые точки', quantity: lightCount, unit: 'шт' },
    { name: 'Подрозетники', quantity: outletCount + switchCount, unit: 'шт', note: 'По одной монтажной коробке на размещённый прибор; блоки уточнить' },
    ...[...cableRows].map(([cable, quantity]) => ({ name: `Кабель · ${cable}`, quantity: round(quantity), unit: 'м', note: `3D + запас ${settings.cableReservePercent}% + ${settings.endAllowanceM} м на конец`, ready: cable !== 'тип не указан' })),
    { name: protectionLabel, quantity: settings.protection === 'none' ? null : purchaseMetres, unit: 'м', note: settings.protectionSpec || 'Тип и размер по проекту', ready: settings.protection !== 'none' && Boolean(settings.protectionSpec) },
    ...breakerRows.values(),
    { name: 'УЗО и дополнительные аппараты щита', quantity: null, unit: 'шт', note: 'Тип, ток утечки, номинал и количество задать по схеме щита', ready: false },
    { name: 'Шины N/PE и комплектующие щита', quantity: null, unit: 'компл', note: 'Состав по выбранному щиту и схеме', ready: false },
    { name: 'Распределительные коробки', quantity: count(['junction-box']), unit: 'шт', note: 'Поставленные на план коробки' },
    ...connectorRows.values(),
    { name: 'Наконечники и гильзы', quantity: null, unit: 'шт', note: 'Тип и количество по сечениям жил и схеме подключения', ready: false },
    { name: fastenerLabels[settings.fastenerType] || 'Крепёж трасс', quantity: fastenerQuantity, unit: 'шт', note: spacing > 0 ? `${settings.fastenerSpec || 'Размер не выбран'}; шаг ${spacing} м; по каждой линии с креплением на концах` : 'Выберите тип и шаг в настройках ведомости', ready: fastenerQuantity != null && Boolean(settings.fastenerSpec) },
    { name: 'Маркировка и расходные материалы', quantity: null, unit: 'компл', note: 'Указать состав и количество вручную', ready: false },
  ];
  const manualComponents = [];
  circuits.flatMap(circuit => circuit.accessories || []).filter(entry => entry.name?.trim()).forEach(entry => {
    const name = entry.name.trim(), unit = entry.unit || 'шт';
    const row = manualComponents.find(component => component.name === name && component.unit === unit);
    if (row) row.quantity += Number(entry.quantity) || 0;
    else manualComponents.push({ name, unit, quantity: Number(entry.quantity) || 0 });
  });
  const topologyIssues = items.filter(item => switches.has(item.kind) && !item.controlsItemId).map(item => `${item.label || 'Выключатель'}: светильник не выбран`);
  for (const item of items.filter(entry => switches.has(entry.kind) && entry.controlsItemId)) {
    if (!items.some(candidate => candidate.id === item.controlsItemId && lights.has(candidate.kind) && candidate.circuitId === item.circuitId)) topologyIssues.push(`${item.label || 'Выключатель'}: связь со светильником недействительна`);
    if (!items.some(candidate => candidate.id === item.junctionItemId && candidate.kind === 'junction-box') && !items.some(candidate => candidate.circuitId === item.circuitId && candidate.kind === 'junction-box')) topologyIssues.push(`${item.label || 'Выключатель'}: коробка не выбрана; проверьте соединение у выключателя`);
  }
  for (const item of items.filter(entry => entry.kind === 'two-way-switch')) {
    const pair = items.find(candidate => candidate.id === item.pairedSwitchId);
    if (!pair || pair.kind !== 'two-way-switch' || pair.pairedSwitchId !== item.id || pair.circuitId !== item.circuitId) topologyIssues.push(`${item.label || 'Проходной выключатель'}: выберите парный выключатель той же группы`);
    else if (item.controlsItemId && pair.controlsItemId && item.controlsItemId !== pair.controlsItemId) topologyIssues.push(`${item.label || 'Проходной выключатель'}: пара управляет разными светильниками`);
  }
  const connectedToPanel = new Set(items.filter(item => item.kind === 'panel').map(item => item.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const route of routes) {
      const fromId = route.fromItemId || route.panelItemId;
      const toId = route.targetItemId;
      if (!fromId || !toId) continue;
      if (connectedToPanel.has(fromId) && !connectedToPanel.has(toId)) { connectedToPanel.add(toId); changed = true; }
      if (connectedToPanel.has(toId) && !connectedToPanel.has(fromId)) { connectedToPanel.add(fromId); changed = true; }
    }
  }
  const missingHeights = plan && placement.defaultRouteSurface !== 'floor' ? items.filter(item => item.kind !== 'panel' && !item.heightKnown && routes.some(route => route.targetItemId === item.id || route.fromItemId === item.id)).map(item => item.label || item.kind) : [];
  return { routes, byCircuit, components, manualComponents, routeMetres, verticalMetres, purchaseMetres, settings, connectionNodes, terminalIssues, missingHeights, topologyIssues, unconnected: items.filter(item => item.kind !== 'panel' && !connectedToPanel.has(item.id)) };
}
