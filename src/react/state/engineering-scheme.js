import { engineeringSettings } from './engineering-settings.js';
import { findPlacementPreset } from './placement-model.js';
import { NETWORK_SYSTEMS, proposedNetworkPoints } from './placement-networks.js';
import { placementWallFaces, wallFacePoint } from './placement-walls.js';

export const ENGINEERING_SYSTEMS = ['plumbing', 'heating', 'sewer'];
export const mediumColor = medium => ({ cold: '#2979aa', hot: '#bd5547', recirculation: '#c58b27', supply: '#bd5547', return: '#2979aa', waste: '#72579a', 'vent-stack': '#69816d' }[medium] || '#50666e');
const round = n => Math.round(n * 100) / 100;
export function itemMedia(item, system) {
  if (item.connectionMedium) return [item.connectionMedium];
  if (['water-isolation', 'water-filter'].includes(item.schemeRole)) return ['cold'];
  if (item.schemeRole?.startsWith('branch-')) return [item.schemeRole.split('-')[1]];
  if (['boiler-supply', 'heat-union-supply', 'heat-safety'].includes(item.schemeRole)) return ['supply'];
  if (item.schemeRole?.endsWith('-tee') && item.schemeRole.startsWith('heat-')) return ['return'];
  if (['boiler-return', 'heat-filter', 'heat-pump', 'heat-expansion', 'heat-drain', 'heat-makeup', 'heat-union-return'].includes(item.schemeRole)) return ['return'];
  if (item.kind === 'water-inlet-filter') return ['cold'];
  if (item.kind === 'water-source' || item.kind === 'cold-outlet' || item.kind === 'cold-manifold') return ['cold'];
  if (item.kind === 'hot-outlet' || item.kind === 'hot-manifold') return ['hot'];
  return NETWORK_SYSTEMS[system]?.media.map(m => m.id) || [];
}

export function connectEngineeringItems(data, system, floor, fromId, toId, medium, createId) {
  const spec = NETWORK_SYSTEMS[system];
  const from = data.items.find(i => i.id === fromId && i.layer === system && i.floor === floor);
  const to = data.items.find(i => i.id === toId && i.layer === system && i.floor === floor);
  if (!spec || !from || !to || from === to || !spec.media.some(m => m.id === medium)
    || !itemMedia(from, system).includes(medium) || !itemMedia(to, system).includes(medium)) return null;
  const previous = (data.networks[system] || []).find(r => r.floor === floor && r.medium === medium && ((r.fromId === fromId && r.toId === toId) || (r.fromId === toId && r.toId === fromId)));
  if (previous) return previous;
  const route = { id: createId(), floor, fromId, toId, medium, auto: true, routing: 'wall', plane: 'wall',
    clearanceMm: 30, wallRef: from.wallRef === to.wallRef ? from.wallRef || '' : '',
    routeLevel: null, diameterMm: null, material: '', slopePermille: null, accessories: [],
    points: proposedNetworkPoints(from, to), note: '' };
  (data.networks[system] ||= []).push(route);
  return route;
}

// Diagram coordinates are presentation only; never use them as pipe lengths.
export function schemePosition(item, index) {
  const p = item.networkDiagram;
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : { x: 90 + (index % 5) * 190, y: 100 + Math.floor(index / 5) * 145 };
}

export function moveEngineeringItem(data, id, patch) {
  const item = data.items.find(i => i.id === id);
  if (!item) return;
  const precise=n=>Math.round(n*1000)/1000;
  const before = { x: item.x, y: item.y, height: item.height || 0 };
  Object.assign(item, patch, Object.hasOwn(patch, 'height') ? { heightKnown: true } : {});
  for (const port of data.items.filter(i => i.linkedApplianceId === id && i.followsAppliance)) {
    port.x = precise(port.x + item.x - before.x); port.y = precise(port.y + item.y - before.y);
    if (Object.hasOwn(patch, 'height')) { port.height = precise((port.height || 0) + item.height - before.height); port.heightKnown = true; }
    if (Object.hasOwn(patch, 'wallRef')) port.wallRef = item.wallRef;
  }
  if ((Object.hasOwn(patch, 'x') || Object.hasOwn(patch, 'y')) && item.linkedApplianceId) item.followsAppliance = false;
}

// An editable planning template, not a hydraulic design or a consumption norm.
// Only explicit nodes are counted; built-in boiler components stay excluded.
export function addBasicEngineeringScheme(data, plan, system, floor, options, createId) {
  const walls = placementWallFaces(plan);
  const wall = walls.find(w => w.ref === options.wallRef) || walls.find(w => w.type === 'outer');
  if (!wall || !ENGINEERING_SYSTEMS.includes(system)) return { added: 0, message: 'Сначала задайте контур дома и стену подключения.' };
  (data.engineeringDefaults ||= {})[system + '-' + floor] = engineeringSettings({ ...options, wallRef: wall.ref });
  const startCount = data.items.length;
  const existingRoutes = new Set((data.networks[system] || []).map(r => r.id));
  let station = .3, ownerId = '';
  const reserved = new Set();
  const ensure = (kind, role, height = .6) => {
    const previous = data.items.find(i => i.floor === floor && i.layer === system && (i.schemeRole === role || (!i.schemeRole && i.kind === kind && ['water-source', 'water-riser', 'sewer-stack', 'sewer-building-outlet', 'heat-source'].includes(kind))));
    if (previous) { reserved.add(previous.id); return previous; }
    const preset = findPlacementPreset(kind);
    if (!preset) throw new Error('Нет элемента схемы: ' + kind);
    const p = wallFacePoint(wall, Math.min(wall.length - .1, station)); station += .45;
    const item = { id: createId(), floor, layer: system, kind, label: preset.label, ...p,
      width: preset.width, depth: preset.depth, rotation: 0, height: Math.min(Number(plan.wallHeight) || 2.5, height),
      heightKnown: false, wallRef: wall.ref, displayPlane: 'wall', surface: 'interior', schemeRole: role, schemeOwnerId: ownerId,
      networkDiagram: { x: 100 + ((data.items.length - startCount) % 5) * 190, y: 90 + Math.floor((data.items.length - startCount) / 5) * 150 } };
    data.items.push(item); reserved.add(item.id); return item;
  };
  const link = (a, b, medium) => {
    const route = connectEngineeringItems(data, system, floor, a.id, b.id, medium, createId);
    if (route && !existingRoutes.has(route.id)) Object.assign(route,{schemeGenerated:true,material:options.material||'',diameterMm:options.diameterMm||null,clearanceMm:options.clearanceMm??30});
  };
  const all = () => data.items.filter(i => i.floor === floor && i.layer === system);
  const consumers = (medium, kinds) => all().filter(i => !reserved.has(i.id) && !(i.kind === 'connection-port' && ((system === 'heating' && ['boiler', 'heat-pump'].includes(data.items.find(p => p.id === i.linkedApplianceId)?.kind)) || (system === 'plumbing' && medium === 'hot' && ['boiler', 'water-heater'].includes(data.items.find(p => p.id === i.linkedApplianceId)?.kind)))) && !i.schemeRole && !(data.networks[system] || []).some(r => r.floor === floor && r.medium === medium && (r.fromId === i.id || r.toId === i.id)) && (kinds.includes(i.kind) || (i.kind === 'connection-port' && i.connectionMedium === medium)));
  const distribute = (source, targets, medium, reverse = false) => {
    const join = (a, b) => reverse ? link(b, a, medium) : link(a, b, medium);
    if (!targets.length) return;
    if (options.distribution === 'collector' && system !== 'sewer') {
      const collector = ensure(system === 'heating' ? 'heat-manifold' : medium === 'hot' ? 'hot-manifold' : 'cold-manifold', 'collector-' + medium);
      join(source, collector); targets.forEach(t => join(collector, t)); return;
    }
    let trunk = source;
    targets.forEach((target, index) => {
      if (index < targets.length - 1 && system !== 'sewer') {
        const tee = ensure(system === 'heating' ? 'heat-tee' : 'water-tee', 'branch-' + medium + '-' + target.id);
        join(trunk, tee); join(tee, target); trunk = tee;
      } else join(trunk, target);
    });
  };
  if (system === 'plumbing') {
    const source = ensure(floor === 1 ? 'water-source' : 'water-riser', 'water-entry', .4);
    const valve = ensure('water-valve', 'water-isolation', .4);
    const filter = ensure('water-inlet-filter', 'water-filter', .4);
    link(source, valve, 'cold'); link(valve, filter, 'cold');
    distribute(filter, consumers('cold', ['cold-outlet']), 'cold');
    const hot = consumers('hot', ['hot-outlet']);
    if (hot.length) {
      const heaterPort = all().find(i => i.kind === 'connection-port' && i.connectionMedium === 'hot' && ['boiler', 'water-heater'].includes(data.items.find(p => p.id === i.linkedApplianceId)?.kind));
      const heater = heaterPort || ensure('water-heater-point', 'water-heater', 1.2);
      if (!heaterPort) link(filter, heater, 'cold');
      distribute(heater, hot, 'hot');
    }
  } else if (system === 'sewer') {
    const exit = ensure(floor === 1 ? 'sewer-building-outlet' : 'sewer-stack', 'sewer-exit', .1);
    const revision = ensure('sewer-cleanout', 'sewer-revision', .2);
    link(revision, exit, 'waste');
    consumers('waste', ['sewer-outlet', 'sewer-floor-drain', 'sewer-stack']).forEach(target => link(target, revision, 'waste'));
  } else {
    const boiler = data.items.find(i => i.floor === floor && ['boiler', 'heat-pump'].includes(i.kind));
    const source = all().find(i => i.linkedApplianceId === boiler?.id && i.kind === 'connection-port' && i.connectionMedium === 'supply') || ensure('heat-source', 'heat-source', .6);
    const returnSource = all().find(i => i.linkedApplianceId === boiler?.id && i.kind === 'connection-port' && i.connectionMedium === 'return') || source;
    ownerId = boiler?.id || source.id;
    const supplyValve = ensure('heat-valve', 'boiler-supply', .6);
    const returnValve = ensure('heat-valve', 'boiler-return', .4);
    const unionSupply = ensure('heat-union', 'heat-union-supply', .6);
    const unionReturn = ensure('heat-union', 'heat-union-return', .4);
    const filter = ensure('heat-filter', 'heat-filter', .4);
    link(source, unionSupply, 'supply'); link(unionSupply, supplyValve, 'supply'); link(filter, returnValve, 'return'); link(returnValve, unionReturn, 'return'); link(unionReturn, returnSource, 'return');
    let returnNode = filter;
    if (!options.builtInPump) { const pump = ensure('heat-pump-point', 'heat-pump', .4); link(pump, filter, 'return'); returnNode = pump; }
    if (!options.builtInSafety) { const safety = ensure('heat-safety-group', 'heat-safety', .9); link(supplyValve, safety, 'supply'); }
    const service = (kind, role, height) => {
      const branch = ensure('heat-tee', role + '-tee', .4);
      const fixture = ensure(kind, role, height);
      link(branch, returnNode, 'return'); link(branch, fixture, 'return'); returnNode = branch;
    };
    if (!options.builtInExpansion) service('heat-expansion-tank', 'heat-expansion', .4);
    service('heat-drain-valve', 'heat-drain', .2);
    service('heat-makeup-valve', 'heat-makeup', .4);
    distribute(supplyValve, consumers('supply', ['radiator-point', 'floor-heating-loop']), 'supply');
    distribute(returnNode, consumers('return', ['radiator-point', 'floor-heating-loop']), 'return', true);
  }
  const added = data.items.slice(startCount);
  added.forEach((item, index) => {
    const p=wallFacePoint(wall,.1+Math.min(wall.length-.2,Math.max(1,added.length*.3))*(index+1)/(added.length+1));
    const offset=(options.clearanceMm??30)/1000;
    Object.assign(item,{x:p.x+wall.normal.x*offset,y:p.y+wall.normal.y*offset,wallClearanceMm:options.clearanceMm??30});
  });
  return { added: data.items.length - startCount, message: 'Базовая схема дополнена. Уточните высоты, размеры труб и оборудование; ручные линии сохранены.' };
}
