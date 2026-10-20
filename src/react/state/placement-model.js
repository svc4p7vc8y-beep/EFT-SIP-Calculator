export const PLACEMENT_LAYERS = [
  { id: 'furniture', label: 'Мебель' },
  { id: 'appliance', label: 'Бытовая техника' },
  { id: 'equipment', label: 'Оборудование' },
  { id: 'electric', label: 'Электрика' },
  { id: 'plumbing', label: 'Сантехника', future: true },
  { id: 'heating', label: 'Отопление', future: true },
  { id: 'ventilation', label: 'Вентиляция', future: true },
];

export const PLACEMENT_PRESETS = [
  { id: 'bed', label: 'Кровать', layer: 'furniture', width: 2, depth: 1.6 },
  { id: 'sofa', label: 'Диван', layer: 'furniture', width: 2.1, depth: .9 },
  { id: 'wardrobe', label: 'Шкаф', layer: 'furniture', width: 1.8, depth: .6 },
  { id: 'table', label: 'Стол', layer: 'furniture', width: 1.4, depth: .8 },
  { id: 'kitchen', label: 'Кухонный модуль', layer: 'furniture', width: 2.4, depth: .6 },
  { id: 'other-furniture', label: 'Другая мебель', layer: 'furniture', width: 1, depth: .6 },
  { id: 'refrigerator', label: 'Холодильник', layer: 'appliance', width: .65, depth: .65 },
  { id: 'washer', label: 'Стиральная машина', layer: 'appliance', width: .6, depth: .6 },
  { id: 'dishwasher', label: 'Посудомоечная машина', layer: 'appliance', width: .6, depth: .6 },
  { id: 'stove', label: 'Плита', layer: 'appliance', width: .6, depth: .6 },
  { id: 'other-appliance', label: 'Другая техника', layer: 'appliance', width: .6, depth: .6 },
  { id: 'boiler', label: 'Котёл', layer: 'equipment', width: .7, depth: .5 },
  { id: 'water-heater', label: 'Бойлер', layer: 'equipment', width: .55, depth: .55 },
  { id: 'manifold', label: 'Коллектор', layer: 'equipment', width: .7, depth: .3 },
  { id: 'pump', label: 'Насос', layer: 'equipment', width: .5, depth: .4 },
  { id: 'vent-unit', label: 'Вентустановка', layer: 'equipment', width: 1, depth: .7 },
  { id: 'other-equipment', label: 'Другое оборудование', layer: 'equipment', width: .7, depth: .5 },
  { id: 'panel', label: 'Электрощит', layer: 'electric', width: .45, depth: .16 },
  { id: 'socket', label: 'Розетка', layer: 'electric', width: .18, depth: .12, height: .3 },
  { id: 'switch', label: 'Выключатель', layer: 'electric', width: .18, depth: .12, height: .9 },
  { id: 'light', label: 'Светильник', layer: 'electric', width: .3, depth: .3, height: 2.5 },
  { id: 'power', label: 'Силовая точка', layer: 'electric', width: .18, depth: .12, height: .3 },
];

const validLayers = new Set(PLACEMENT_LAYERS.map(layer => layer.id));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function createPlacement() {
  return { version: 1, items: [], circuits: [], routes: [], networks: { plumbing: [], heating: [], ventilation: [] } };
}

export function normalizePlacement(value) {
  const base = createPlacement();
  if (!value || typeof value !== 'object') return base;
  const items = Array.isArray(value.items) ? value.items : [];
  const circuits = Array.isArray(value.circuits) ? value.circuits : [];
  const routes = Array.isArray(value.routes) ? value.routes : [];
  return {
    ...base,
    ...value,
    version: 1,
    items: items.filter(item => item && typeof item.id === 'string' && validLayers.has(item.layer)).map(item => ({
      ...item,
      floor: Math.max(1, Math.min(2, Math.round(finite(item.floor, 1)))),
      x: finite(item.x), y: finite(item.y),
      width: Math.max(.05, finite(item.width, .5)),
      depth: Math.max(.05, finite(item.depth, .5)),
      rotation: finite(item.rotation),
      height: Math.max(0, finite(item.height)),
    })),
    circuits: circuits.filter(circuit => circuit && typeof circuit.id === 'string').map(circuit => ({ ...circuit, name: String(circuit.name || 'Группа') })),
    routes: routes.filter(route => route && typeof route.id === 'string' && Array.isArray(route.points)).map(route => ({
      ...route,
      floor: Math.max(1, Math.min(2, Math.round(finite(route.floor, 1)))),
      points: route.points.filter(point => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y))).map(point => ({ x: Number(point.x), y: Number(point.y) })),
    })).filter(route => route.points.length >= 2),
    networks: { ...base.networks, ...(value.networks && typeof value.networks === 'object' ? value.networks : {}) },
  };
}

export function placementSummary(placement, floor) {
  const items = (placement?.items || []).filter(item => item.floor === floor);
  const routes = (placement?.routes || []).filter(route => route.floor === floor);
  const length = routes.reduce((sum, route) => sum + route.points.slice(1).reduce((distance, point, index) => {
    const previous = route.points[index];
    return distance + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0), 0);
  return { furniture: items.filter(item => item.layer === 'furniture').length, appliance: items.filter(item => item.layer === 'appliance').length, equipment: items.filter(item => item.layer === 'equipment').length, electric: items.filter(item => item.layer === 'electric').length, routeLength: Math.round(length * 10) / 10 };
}
