import { resolvedElectricalRoutes } from './placement-electrical.js';
import { normalizeNetworkRoutes } from './placement-networks.js';
import { addMissingConnectionPorts } from './placement-connections.js';

export const PLACEMENT_LAYERS = [
  { id: 'furniture', label: 'Мебель' },
  { id: 'appliance', label: 'Бытовая техника' },
  { id: 'equipment', label: 'Инженерия' },
  { id: 'electric', label: 'Электрика' },
  { id: 'plumbing', label: 'Водоснабжение' },
  { id: 'heating', label: 'Отопление' },
  { id: 'sewer', label: 'Канализация' },
  { id: 'ventilation', label: 'Вентиляция' },
];

export const PLACEMENT_GROUPS = [
  { id: 'living', label: 'Гостиная и спальня', layer: 'furniture' },
  { id: 'kitchen', label: 'Кухня', layer: 'furniture' },
  { id: 'bathroom', label: 'Ванная и туалет', layer: 'furniture' },
  { id: 'storage', label: 'Шкафы и хранение', layer: 'furniture' },
  { id: 'kitchen-appliances', label: 'Кухонная техника', layer: 'appliance' },
  { id: 'laundry', label: 'Стирка и уборка', layer: 'appliance' },
  { id: 'climate', label: 'Климат и вода', layer: 'equipment' },
  { id: 'engineering', label: 'Инженерные системы', layer: 'equipment' },
  { id: 'electric-points', label: 'Розетки и выключатели', layer: 'electric' },
  { id: 'lighting', label: 'Освещение', layer: 'electric' },
  { id: 'facade', label: 'Фасад', layer: 'electric' },
  { id: 'electrical-panel', label: 'Щиты', layer: 'electric' },
  { id: 'water-sources', label: 'Источники и коллекторы', layer: 'plumbing' },
  { id: 'water-points', label: 'Водорозетки и арматура', layer: 'plumbing' },
  { id: 'heat-sources', label: 'Источник и коллектор', layer: 'heating' },
  { id: 'heat-points', label: 'Приборы и арматура', layer: 'heating' },
  { id: 'sewer-risers', label: 'Стояки и ревизии', layer: 'sewer' },
  { id: 'sewer-points', label: 'Выпуски и трапы', layer: 'sewer' },
  { id: 'air-units', label: 'Установки и узлы', layer: 'ventilation' },
  { id: 'air-points', label: 'Решётки и диффузоры', layer: 'ventilation' },
];

const preset = (id, label, layer, group, width, depth, icon = id, extra = {}) => ({ id, label, layer, group, width, depth, icon, ...extra });

const ORIGINAL_PRESETS = [
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

const ORIGINAL_GROUPS = {
  bed: 'living', sofa: 'living', table: 'living',
  kitchen: 'kitchen', wardrobe: 'storage', 'other-furniture': 'storage',
  refrigerator: 'kitchen-appliances', dishwasher: 'kitchen-appliances', stove: 'kitchen-appliances',
  washer: 'laundry', 'other-appliance': 'laundry',
  socket: 'electric-points', switch: 'electric-points', power: 'electric-points',
  light: 'lighting', panel: 'electrical-panel',
};
const ORIGINAL_ICONS = { kitchen: 'counter', refrigerator: 'fridge', stove: 'hob', 'water-heater': 'water-heater', 'other-furniture': 'cabinet', 'other-appliance': 'appliance', 'other-equipment': 'equipment-generic' };

export const PLACEMENT_PRESETS = [
  ...ORIGINAL_PRESETS.map(item => ({ ...item, group: ORIGINAL_GROUPS[item.id] || 'climate', icon: ORIGINAL_ICONS[item.id] || item.id })),
  preset('bed-nightstand-left', 'Кровать с тумбой слева', 'furniture', 'living', 2.05, 2, 'bed-nightstand-left'),
  preset('bed-nightstand-right', 'Кровать с тумбой справа', 'furniture', 'living', 2.05, 2, 'bed-nightstand-right'),
  preset('bed-nightstands', 'Кровать с двумя тумбами', 'furniture', 'living', 2.5, 2, 'bed-nightstands'),
  preset('single-bed', 'Односпальная кровать', 'furniture', 'living', 2, .9, 'bed'),
  preset('corner-sofa', 'Угловой диван', 'furniture', 'living', 2.5, 1.6, 'corner-sofa'),
  preset('armchair', 'Кресло', 'furniture', 'living', .85, .85, 'armchair'),
  preset('coffee-table', 'Журнальный стол', 'furniture', 'living', 1, .55, 'table'),
  preset('desk', 'Письменный стол', 'furniture', 'living', 1.4, .7, 'desk'),
  preset('chair', 'Стул', 'furniture', 'living', .5, .5, 'chair'),
  preset('base-cabinet', 'Напольный шкаф 60', 'furniture', 'kitchen', .6, .6, 'cabinet'),
  preset('base-cabinet-80', 'Напольный шкаф 80', 'furniture', 'kitchen', .8, .6, 'cabinet'),
  preset('corner-cabinet', 'Угловой модуль', 'furniture', 'kitchen', .9, .9, 'corner-cabinet'),
  preset('wall-cabinet', 'Навесной шкаф', 'furniture', 'kitchen', .8, .35, 'wall-cabinet', { height: 1.45 }),
  preset('tall-cabinet', 'Шкаф-пенал', 'furniture', 'kitchen', .6, .6, 'wardrobe'),
  preset('kitchen-island', 'Кухонный остров', 'furniture', 'kitchen', 1.8, .9, 'island'),
  preset('countertop', 'Столешница', 'furniture', 'kitchen', 1.2, .6, 'counter'),
  preset('kitchen-sink', 'Кухонная мойка', 'furniture', 'kitchen', .8, .6, 'sink'),
  preset('bathtub', 'Ванна', 'furniture', 'bathroom', 1.7, .7, 'bathtub'),
  preset('corner-bathtub', 'Угловая ванна', 'furniture', 'bathroom', 1.5, 1.5, 'corner-bathtub'),
  preset('shower', 'Душевая кабина', 'furniture', 'bathroom', .9, .9, 'shower'),
  preset('walk-in-shower', 'Душевая зона', 'furniture', 'bathroom', 1.2, .9, 'shower'),
  preset('toilet', 'Унитаз', 'furniture', 'bathroom', .7, .38, 'toilet'),
  preset('wall-toilet', 'Подвесной унитаз', 'furniture', 'bathroom', .55, .38, 'toilet'),
  preset('bidet', 'Биде', 'furniture', 'bathroom', .6, .38, 'bidet'),
  preset('bathroom-sink', 'Раковина', 'furniture', 'bathroom', .6, .5, 'basin'),
  preset('double-sink', 'Двойная раковина', 'furniture', 'bathroom', 1.2, .5, 'double-basin'),
  preset('vanity', 'Тумба с раковиной', 'furniture', 'bathroom', .8, .5, 'vanity'),
  preset('sliding-wardrobe', 'Шкаф-купе', 'furniture', 'storage', 2.4, .65, 'sliding-wardrobe'),
  preset('built-in-wardrobe', 'Встроенный шкаф', 'furniture', 'storage', 1.8, .6, 'wardrobe'),
  preset('dresser', 'Комод', 'furniture', 'storage', 1.2, .5, 'dresser'),
  preset('shelves', 'Стеллаж', 'furniture', 'storage', 1, .4, 'shelves'),
  preset('side-by-side-fridge', 'Широкий холодильник', 'appliance', 'kitchen-appliances', .9, .75, 'fridge'),
  preset('freezer', 'Морозильник', 'appliance', 'kitchen-appliances', .6, .65, 'freezer'),
  preset('hob', 'Варочная панель', 'appliance', 'kitchen-appliances', .6, .52, 'hob'),
  preset('oven', 'Духовой шкаф', 'appliance', 'kitchen-appliances', .6, .6, 'oven'),
  preset('microwave', 'Микроволновая печь', 'appliance', 'kitchen-appliances', .5, .4, 'microwave'),
  preset('food-disposer', 'Измельчитель отходов', 'appliance', 'kitchen-appliances', .3, .3, 'appliance'),
  preset('hood', 'Вытяжка', 'appliance', 'kitchen-appliances', .6, .5, 'hood', { height: 1.6 }),
  preset('dryer', 'Сушильная машина', 'appliance', 'laundry', .6, .6, 'dryer'),
  preset('washer-dryer', 'Стирально-сушильная машина', 'appliance', 'laundry', .6, .6, 'washer'),
  preset('vacuum', 'Робот-пылесос', 'appliance', 'laundry', .36, .36, 'vacuum'),
  preset('air-conditioner', 'Кондиционер', 'equipment', 'climate', .9, .25, 'air-conditioner', { height: 2.2 }),
  preset('hydro-tank', 'Гидроаккумулятор', 'equipment', 'engineering', .55, .55, 'hydro-tank'),
  preset('expansion-tank', 'Расширительный бак', 'equipment', 'engineering', .45, .45, 'expansion-tank'),
  preset('heat-pump', 'Тепловой насос', 'equipment', 'engineering', .8, .65, 'heat-pump'),
  preset('water-filter', 'Фильтр воды', 'equipment', 'engineering', .45, .35, 'water-filter'),
  preset('gas-stove', 'Газовая плита', 'appliance', 'kitchen-appliances', .6, .6, 'gas-stove'),
  preset('electric-stove', 'Электрическая плита', 'appliance', 'kitchen-appliances', .6, .6, 'electric-stove'),
  preset('double-socket', 'Двойная розетка', 'electric', 'electric-points', .28, .12, 'double-socket', { height: .3 }),
  preset('double-switch', 'Двойной выключатель', 'electric', 'electric-points', .22, .12, 'double-switch', { height: .9 }),
  preset('two-way-switch', 'Проходной выключатель', 'electric', 'electric-points', .18, .12, 'two-way-switch', { height: .9 }),
  preset('dimmer', 'Диммер', 'electric', 'electric-points', .18, .12, 'dimmer', { height: .9 }),
  preset('spotlight', 'Точечный светильник', 'electric', 'lighting', .14, .14, 'spotlight', { height: 2.5 }),
  preset('pendant-light', 'Подвесной светильник', 'electric', 'lighting', .35, .35, 'pendant-light', { height: 2.2 }),
  preset('wall-light', 'Настенный светильник', 'electric', 'lighting', .24, .16, 'wall-light', { height: 1.8 }),
  preset('led-strip', 'LED-лента', 'electric', 'lighting', 1.2, .06, 'led-strip', { height: 2.4 }),
  preset('facade-socket', 'Уличная розетка', 'electric', 'facade', .18, .12, 'facade-socket', { height: 1.1, surface: 'facade' }),
  preset('facade-light', 'Фасадный светильник', 'electric', 'facade', .26, .18, 'facade-light', { height: 2.2, surface: 'facade' }),
  preset('facade-spotlight', 'Фасадный прожектор', 'electric', 'facade', .28, .2, 'facade-spotlight', { height: 2.6, surface: 'facade' }),
  preset('junction-box', 'Распределительная коробка', 'electric', 'electrical-panel', .18, .12, 'junction-box'),
  preset('water-source', 'Ввод воды', 'plumbing', 'water-sources', .2, .16, 'water-source'),
  preset('cold-manifold', 'Коллектор ХВС', 'plumbing', 'water-sources', .45, .18, 'manifold'),
  preset('hot-manifold', 'Коллектор ГВС', 'plumbing', 'water-sources', .45, .18, 'manifold'),
  preset('water-heater-point', 'Водонагреватель', 'plumbing', 'water-sources', .55, .4, 'water-heater'),
  preset('cold-outlet', 'Водорозетка ХВС', 'plumbing', 'water-points', .16, .12, 'water-outlet'),
  preset('hot-outlet', 'Водорозетка ГВС', 'plumbing', 'water-points', .16, .12, 'hot-outlet'),
  preset('water-valve', 'Запорный кран', 'plumbing', 'water-points', .16, .12, 'valve'),
  preset('water-tee', 'Тройник', 'plumbing', 'water-points', .14, .12, 'tee'),
  preset('heat-source', 'Источник тепла', 'heating', 'heat-sources', .55, .4, 'boiler'),
  preset('heat-manifold', 'Коллектор отопления', 'heating', 'heat-sources', .5, .2, 'manifold'),
  preset('radiator-point', 'Радиатор', 'heating', 'heat-points', .8, .16, 'radiator'),
  preset('floor-heating-loop', 'Контур тёплого пола', 'heating', 'heat-points', .25, .25, 'floor-loop'),
  preset('heat-valve', 'Клапан отопления', 'heating', 'heat-points', .16, .12, 'valve'),
  preset('heat-tee', 'Тройник отопления', 'heating', 'heat-points', .14, .12, 'tee'),
  preset('sewer-stack', 'Канализационный стояк', 'sewer', 'sewer-risers', .2, .2, 'stack'),
  preset('sewer-cleanout', 'Ревизия', 'sewer', 'sewer-risers', .18, .15, 'cleanout'),
  preset('sewer-outlet', 'Выпуск канализации', 'sewer', 'sewer-points', .16, .12, 'drain'),
  preset('sewer-floor-drain', 'Трап', 'sewer', 'sewer-points', .18, .18, 'floor-drain'),
  preset('sewer-tee', 'Тройник канализации', 'sewer', 'sewer-points', .14, .12, 'tee'),
  preset('air-unit', 'Вентустановка', 'ventilation', 'air-units', .8, .5, 'vent-unit'),
  preset('air-junction', 'Разветвитель воздуховодов', 'ventilation', 'air-units', .2, .2, 'tee'),
  preset('air-damper', 'Заслонка', 'ventilation', 'air-units', .2, .16, 'damper'),
  preset('supply-diffuser', 'Приточный диффузор', 'ventilation', 'air-points', .25, .25, 'supply-diffuser'),
  preset('extract-grille', 'Вытяжная решётка', 'ventilation', 'air-points', .25, .18, 'extract-grille'),
  preset('air-intake', 'Наружный воздухозабор', 'ventilation', 'air-points', .26, .18, 'air-intake', { surface: 'facade' }),
  preset('air-exhaust', 'Наружный выброс', 'ventilation', 'air-points', .26, .18, 'air-exhaust', { surface: 'facade' }),
];

export const findPlacementPreset = kind => PLACEMENT_PRESETS.find(item => item.id === kind);

// These points are a planning default only: the designer may move, change or
// remove each socket independently. No assumed wattage or cable gauge enters the estimate.
export function applianceSupplyKind(preset) {
  if (preset?.layer === 'appliance') return ['stove', 'electric-stove', 'hob', 'oven'].includes(preset.id) ? 'power' : 'socket';
  if (preset?.layer === 'equipment' && ['water-heater', 'pump', 'vent-unit', 'air-conditioner', 'heat-pump', 'boiler'].includes(preset.id)) return 'power';
  return '';
}

const validLayers = new Set(PLACEMENT_LAYERS.map(layer => layer.id));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function createPlacement() {
  return { version: 4, items: [], circuits: [], routes: [], dimensions: [], showAutoDimensions: true, networks: normalizeNetworkRoutes() };
}

export function normalizePlacement(value) {
  const base = createPlacement();
  if (!value || typeof value !== 'object') return base;
  const items = Array.isArray(value.items) ? value.items : [];
  const circuits = Array.isArray(value.circuits) ? value.circuits : [];
  const routes = Array.isArray(value.routes) ? value.routes : [];
  const dimensions = Array.isArray(value.dimensions) ? value.dimensions : [];
  const normalized = {
    ...base,
    ...value,
    version: 4,
    showAutoDimensions: value.showAutoDimensions !== false,
    items: items.filter(item => item && typeof item.id === 'string' && validLayers.has(item.layer)).map(item => ({
      ...item,
      floor: Math.max(1, Math.min(2, Math.round(finite(item.floor, 1)))),
      x: finite(item.x), y: finite(item.y),
      width: Math.max(.05, finite(item.width, .5)),
      depth: Math.max(.05, finite(item.depth, .5)),
      rotation: finite(item.rotation),
      height: Math.max(0, finite(item.height)),
      heightKnown: item.heightKnown === true || (item.heightKnown !== false && Number(item.height) > 0),
      wallRef: typeof item.wallRef === 'string' ? item.wallRef : '',
      displayPlane: ['floor', 'wall'].includes(item.displayPlane) ? item.displayPlane : 'auto',
      dimensionSide: ['auto', 'left', 'right'].includes(item.dimensionSide) ? item.dimensionSide : 'auto',
      showHeight: item.showHeight === true,
      showName: item.showName === true,
      labelOffsetX: finite(item.labelOffsetX, .65),
      labelOffsetY: finite(item.labelOffsetY, -.45),
      surface: item.surface === 'facade' ? 'facade' : 'interior',
      anchorX: item.surface === 'facade' ? finite(item.anchorX, finite(item.x)) : undefined,
      anchorY: item.surface === 'facade' ? finite(item.anchorY, finite(item.y)) : undefined,
    })),
    circuits: circuits.filter(circuit => circuit && typeof circuit.id === 'string').map(circuit => ({ ...circuit, name: String(circuit.name || 'Группа'),
      breakerAmps: circuit.breakerAmps === '' || circuit.breakerAmps == null || !Number.isFinite(Number(circuit.breakerAmps)) || Number(circuit.breakerAmps) <= 0 ? null : Number(circuit.breakerAmps),
      accessories: (Array.isArray(circuit.accessories) ? circuit.accessories : []).filter(entry => entry && typeof entry.name === 'string').map(entry => ({ name: entry.name.slice(0, 100), quantity: Math.max(0, finite(entry.quantity)), unit: String(entry.unit || 'шт').slice(0, 20) })),
    })),
    routes: routes.filter(route => route && typeof route.id === 'string' && Array.isArray(route.points)).map(route => ({
      ...route,
      floor: Math.max(1, Math.min(2, Math.round(finite(route.floor, 1)))),
      points: route.points.filter(point => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y))).map(point => ({ x: Number(point.x), y: Number(point.y), ...(Number.isFinite(Number(point?.z)) && point?.z != null ? { z: Number(point.z) } : {}) })),
    })).filter(route => route.points.length >= 2),
    dimensions: dimensions.filter(dimension => dimension && typeof dimension.id === 'string' && Array.isArray(dimension.points) && dimension.points.length === 2).map(dimension => ({
      ...dimension,
      floor: Math.max(1, Math.min(2, Math.round(finite(dimension.floor, 1)))),
      points: dimension.points.map(point => ({ x: finite(point?.x), y: finite(point?.y) })),
      label: typeof dimension.label === 'string' ? dimension.label.slice(0, 80) : '',
    })),
    networks: normalizeNetworkRoutes(value.networks),
  };
  if (Number(value.version || 0) < 4) normalized.items = addMissingConnectionPorts(normalized.items);
  return normalized;
}

export function placementSummary(placement, floor) {
  const items = (placement?.items || []).filter(item => item.floor === floor);
  const routes = resolvedElectricalRoutes(placement || { items: [], routes: [] }, floor);
  const length = routes.reduce((sum, route) => sum + route.points.slice(1).reduce((distance, point, index) => {
    const previous = route.points[index];
    return distance + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0), 0);
  return { furniture: items.filter(item => item.layer === 'furniture').length, appliance: items.filter(item => item.layer === 'appliance').length, equipment: items.filter(item => item.layer === 'equipment').length, electric: items.filter(item => item.layer === 'electric').length, routeLength: Math.round(length * 10) / 10 };
}
