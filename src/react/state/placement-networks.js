import {placementWallFaces} from './placement-walls.js';
import { addPipeBill, pipeEquipmentKind } from './placement-pipe-bill.js';
import { orthogonalPipePath,orthogonalWallPath } from './placement-pipe-routing.js';
export const NETWORK_SYSTEMS = {
  plumbing: { label: 'Водоснабжение', prefix: 'В', media: [{ id: 'cold', label: 'ХВС' }, { id: 'hot', label: 'ГВС' }, { id: 'recirculation', label: 'Рециркуляция ГВС' }] },
  heating: { label: 'Отопление', prefix: 'О', media: [{ id: 'supply', label: 'Подача' }, { id: 'return', label: 'Обратка' }] },
  sewer: { label: 'Канализация', prefix: 'К', media: [{ id: 'waste', label: 'Сток' }, { id: 'vent-stack', label: 'Фановая линия' }] },
  ventilation: { label: 'Вентиляция', prefix: 'Вн', media: [{ id: 'supply-air', label: 'Приток' }, { id: 'extract-air', label: 'Вытяжка' }] },
};

export const isPipeSystem = system => system === "heating" || system === "plumbing";
export const isNetworkLayer = layer => Boolean(NETWORK_SYSTEMS[layer]);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const optionalPositive = value => value === '' || value == null ? null : Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const round = value => Math.round(value * 100) / 100;
const point = (item, z = item.height) => ({ x: item.x, y: item.y, z: finite(z) });

export function normalizeNetworkRoutes(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.keys(NETWORK_SYSTEMS).map(system => [system,
    (Array.isArray(source[system]) ? source[system] : []).filter(route => route && typeof route.id === 'string' && Array.isArray(route.points)).map(route => ({
      ...route,
      showName: route.showName === true,
      annotationText: typeof route.annotationText === 'string' ? route.annotationText.slice(0, 120) : '',
      labelOffsetX: finite(route.labelOffsetX),
      labelOffsetY: finite(route.labelOffsetY, -.1),
      floor: Math.max(1, Math.min(2, Math.round(finite(route.floor, 1)))),
      medium: NETWORK_SYSTEMS[system].media.some(entry => entry.id === route.medium) ? route.medium : NETWORK_SYSTEMS[system].media[0].id,
      fromId: typeof route.fromId === 'string' ? route.fromId : '',
      toId: typeof route.toId === 'string' ? route.toId : '',
      auto: route.auto === true,
      routing: ['wall', 'orthogonal'].includes(route.routing) ? route.routing : 'legacy',
      clearanceMm: Math.max(0, Math.min(300, finite(route.clearanceMm, 30))),
      fastener: ['clip', 'clamp'].includes(route.fastener) ? route.fastener : '',
      fastenerSpacingM: optionalPositive(route.fastenerSpacingM) == null ? null : Math.max(.05, Number(route.fastenerSpacingM)),
      chainId: typeof route.chainId === 'string' ? route.chainId.slice(0, 120) : '',
      bendFitting: route.bendFitting === 'sweep' ? 'sweep' : 'elbow',
      bendAxis: route.bendAxis === "y" ? "y" : "x",
      plane: ['wall', 'floor', 'ceiling', 'service'].includes(route.plane) ? route.plane : 'service',
      wallRef: typeof route.wallRef === 'string' ? route.wallRef : '',
      routeLevel: route.routeLevel === '' || route.routeLevel == null ? null : finite(route.routeLevel),
      diameterMm: optionalPositive(route.diameterMm),
      widthMm: optionalPositive(route.widthMm),
      heightMm: optionalPositive(route.heightMm),
      material: String(route.material || '').slice(0, 100),
      slopePermille: optionalPositive(route.slopePermille),
      flowM3h: optionalPositive(route.flowM3h),
      note: String(route.note || '').slice(0, 500),
      accessories: (Array.isArray(route.accessories) ? route.accessories : []).filter(entry => entry && typeof entry.name === 'string').map(entry => ({ name: entry.name.slice(0, 100), quantity: Math.max(0, finite(entry.quantity)), unit: String(entry.unit || 'шт').slice(0, 20) })),
      points: route.points.filter(p => Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))).map(p => ({ x: finite(p.x), y: finite(p.y), z: finite(p.z) })),
    })).filter(route => route.points.length >= 2),
  ]));
}

export function proposedNetworkPoints(from, to, routeLevel = null, bendAxis = "x") {
  const level = routeLevel == null ? finite(from.height) : finite(routeLevel);
  const points = [point(from)];
  if (Math.abs(points[0].z - level) > .001) points.push(point(from, level));
  if (Math.abs(from.x - to.x) > .001 && Math.abs(from.y - to.y) > .001) points.push(bendAxis === "y" ? { x: from.x, y: to.y, z: level } : { x: to.x, y: from.y, z: level });
  points.push(point(to, level));
  if (Math.abs(finite(to.height) - level) > .001) points.push(point(to));
  return points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y, p.z - points[i - 1].z) > .001);
}

export function resolvedNetworkRoutes(placement, system, floor, plan = null) {
  if (!isNetworkLayer(system)) return [];
  const items = (placement?.items || []).filter(item => item.floor === floor);
  return (placement?.networks?.[system] || []).filter(route => route.floor === floor).map(route => {
    const from = items.find(item => item.id === route.fromId);
    const to = items.find(item => item.id === route.toId);
    if (!from || !to) return null;
    const wallRef = from.wallRef && from.wallRef === to.wallRef ? from.wallRef : '';
    if ((isPipeSystem(system) || system === 'sewer') && ['wall', 'orthogonal'].includes(route.routing)) {
      const anchors = system === 'sewer' && route.auto && route.medium === 'waste' ? [point(from, 0), point(to, 0)] : route.auto
        ? proposedNetworkPoints(from, to, route.routeLevel, route.bendAxis).filter((p, i, all) =>
            i === 0 || i === all.length - 1 || (p.x === from.x && p.y === from.y) || (p.x === to.x && p.y === to.y))
        : [point(from), ...route.points.slice(1, -1), point(to)];
      const options = { first: route.bendAxis, alongWall: route.auto && route.routing === 'wall', clearanceMm: route.clearanceMm, keepWaypoints: !route.auto };
      const wall=plan&&route.plane==='wall'&&wallRef&&placementWallFaces(plan).find(w=>w.ref===wallRef);
      const points = wall?orthogonalWallPath(anchors,wall,options):orthogonalPipePath(anchors, { ...options, plan });
      let resolved = points || orthogonalPipePath(anchors, { ...options, alongWall: false });
      if (system === 'sewer' && route.auto && route.medium === 'waste' && resolved) {
        resolved = resolved.filter((p, index, all) => !index || Math.hypot(p.x - all[index - 1].x, p.y - all[index - 1].y) > .0001);
        const total = networkPlanLength(resolved); let distance = 0;
        resolved = resolved.map((p, index, all) => {
          if (index) distance += Math.hypot(p.x - all[index - 1].x, p.y - all[index - 1].y);
          return { ...p, z: finite(from.height) + (finite(to.height) - finite(from.height)) * (total ? distance / total : 0) };
        });
      }
      return { ...route, wallRef, points: resolved, outsideContour: !points };
    }
    if (route.auto) {
      const points = proposedNetworkPoints(from, to, system === 'sewer' ? null : route.routeLevel, route.bendAxis);
      if (system === 'sewer' && route.medium === 'waste') {
        const total = networkPlanLength(points);
        let distance = 0;
        points.forEach((entry, index) => {
          if (index) distance += Math.hypot(entry.x - points[index - 1].x, entry.y - points[index - 1].y);
          entry.z = round(finite(from.height) + (finite(to.height) - finite(from.height)) * (total ? distance / total : 0));
        });
      }
      return { ...route, wallRef, points };
    }
    return { ...route, wallRef, points: [point(from), ...route.points.slice(1, -1), point(to)] };
  }).filter(Boolean);
}

export function networkLength3d(points) {
  return (points || []).slice(1).reduce((sum, p, index) => {
    const previous = points[index];
    return sum + Math.hypot(p.x - previous.x, p.y - previous.y, finite(p.z) - finite(previous.z));
  }, 0);
}

export function networkPlanLength(points) {
  return (points || []).slice(1).reduce((sum, p, index) => sum + Math.hypot(p.x - points[index].x, p.y - points[index].y), 0);
}

export function routeBends(points) {
  let bends = 0;
  for (let index = 1; index < (points || []).length - 1; index += 1) {
    const a = points[index - 1], b = points[index], c = points[index + 1];
    const first = [b.x - a.x, b.y - a.y, finite(b.z) - finite(a.z)];
    const second = [c.x - b.x, c.y - b.y, finite(c.z) - finite(b.z)];
    const cross = [first[1] * second[2] - first[2] * second[1], first[2] * second[0] - first[0] * second[2], first[0] * second[1] - first[1] * second[0]];
    if (Math.hypot(...cross) > .0001) bends += 1;
  }
  return bends;
}

export function networkBill(placement, system, floor, plan = null) {
  const routes = resolvedNetworkRoutes(placement, system, floor, plan);
  const items = (placement?.items || []).filter(item => item.floor === floor && item.layer === system);
  const totals = Object.fromEntries(NETWORK_SYSTEMS[system].media.map(entry => [entry.id, round(routes.filter(route => route.medium === entry.id).reduce((sum, route) => sum + networkLength3d(route.points), 0))]));
  const pipeRows = [];
  for (const route of routes) {
    const size = route.widthMm && route.heightMm ? `${route.widthMm}×${route.heightMm} мм` : route.diameterMm ? `Ø${route.diameterMm} мм` : 'Размер не указан';
    const key = `${route.medium}|${route.material || 'Материал не указан'}|${size}`;
    let row = pipeRows.find(entry => entry.key === key);
    if (!row) { row = { key, medium: route.medium, material: route.material || 'Материал не указан', size, metres: 0 }; pipeRows.push(row); }
    row.metres += networkLength3d(route.points);
  }
  pipeRows.forEach(row => { row.metres = round(row.metres); });
  const issues = [];
  for (const route of routes) {
    const fromItem = items.find(item => item.id === route.fromId);
    const toItem = items.find(item => item.id === route.toId);
    const name = `${fromItem?.label || 'Источник'} → ${toItem?.label || 'Точка'}`;
    if ([fromItem, toItem].some(item => item && (item.heightKnown === false || (item.heightKnown !== true && !finite(item.height))))) issues.push(`${name}: высота точки не задана; вертикальная длина предварительна`);
    if (route.outsideContour) issues.push(`${name}: трасса выходит за контур. Укажите дополнительные повороты.`);
    if ((!route.diameterMm && !(route.widthMm && route.heightMm)) || !route.material) issues.push(`${name}: материал или размер не задан`);
    if (system === 'sewer' && route.medium === 'waste') {
      if (!route.slopePermille) issues.push(`${name}: уклон не задан`);
      else {
        const required = networkPlanLength(route.points) * route.slopePermille / 1000;
        const actual = finite(route.points[0]?.z) - finite(route.points.at(-1)?.z);
        if (actual + .001 < required) issues.push(`${name}: перепад ${round(actual)} м меньше заданного ${round(required)} м`);
      }
    }
    if (system === 'ventilation' && !route.flowM3h) issues.push(`${name}: расход воздуха не задан`);
  }
  const ids=new Set(items.map(i=>i.id)),connections=(placement.portConnections||[]).filter(c=>ids.has(c.fromId)&&ids.has(c.toId));
  const connected = new Set([...routes.flatMap(route => [route.fromId, route.toId]),...connections.flatMap(c=>[c.fromId,c.toId])]);
  items.filter(i=>i.linkedApplianceId&&connected.has(i.id)).forEach(i=>connected.add(i.linkedApplianceId));
  const components = [];
  const addComponent = (name, quantity, unit = 'шт') => {
    const existing = components.find(entry => entry.name === name && entry.unit === unit);
    if (existing) existing.quantity += quantity;
    else components.push({ name, quantity, unit });
  };
  const equipment = system === 'heating' ? (placement?.items || []).filter(item => item.floor === floor && pipeEquipmentKind(item)) : [];
  const countedTee = (isPipeSystem(system) || system === 'sewer') ? addPipeBill(routes, equipment, addComponent, issues, items, system) : () => false;
  items.filter(item => !['connection-port', 'pipe-junction'].includes(item.kind) && (!['heat-tee', 'water-tee', 'sewer-tee', 'pp-tee','heat-pp-tee'].includes(item.kind) || !countedTee(item)))
    .forEach(item => addComponent(item.label || item.kind, 1));
  routes.forEach(route => (route.accessories || []).filter(entry => entry.name.trim()).forEach(entry => addComponent(entry.name.trim(), entry.quantity, entry.unit)));
  if (system === 'heating') equipment.filter(item => item.layer !== system).forEach(item => addComponent(item.label || item.kind, 1));
  for (const row of placement?.networkCustomRows?.[system + '-' + floor] || []) {
    if (String(row.name || '').trim() && Number(row.quantity) > 0) addComponent(row.name.trim(), Number(row.quantity), row.unit || 'шт');
  }
  return {
    routes, items, totals, pipeRows, components, equipment, connections,
    totalLength: round(routes.reduce((sum, route) => sum + networkLength3d(route.points), 0)),
    bends: routes.reduce((sum, route) => sum + routeBends(route.points), 0),
    unconnected: items.filter(item => !connected.has(item.id)),
    issues,
  };
}
