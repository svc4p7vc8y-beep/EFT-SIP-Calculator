const round = value => Math.round(value * 100) / 100;
export const routeLength = points => (points || []).slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);

export function routeToPanel(panel, item) {
  const start = { x: panel.x, y: panel.y }, end = { x: item.x, y: item.y };
  if (Math.abs(start.x - end.x) < .01 || Math.abs(start.y - end.y) < .01) return [start, end];
  return [start, { x: end.x, y: start.y }, end];
}

export function resolvedElectricalRoutes(placement, floor) {
  const items = (placement.items || []).filter(item => item.floor === floor);
  return (placement.routes || []).filter(route => route.floor === floor).map(route => {
    const panel = items.find(item => item.id === route.panelItemId);
    if (!route.auto) return panel ? { ...route, points: [{ x: panel.x, y: panel.y }, ...route.points.slice(1)] } : route;
    const target = items.find(item => item.id === route.targetItemId);
    return panel && target ? { ...route, points: routeToPanel(panel, target) } : null;
  }).filter(Boolean);
}

export function electricalBill(placement, floor) {
  const items = (placement.items || []).filter(item => item.floor === floor && item.layer === 'electric');
  const routes = resolvedElectricalRoutes(placement, floor);
  const circuits = (placement.circuits || []).filter(circuit => items.some(item => item.circuitId === circuit.id) || routes.some(route => route.circuitId === circuit.id));
  const routeMetres = round(routes.reduce((sum, route) => sum + routeLength(route.points), 0));
  const byCircuit = circuits.map(circuit => ({ ...circuit, routeMetres: round(routes.filter(route => route.circuitId === circuit.id).reduce((sum, route) => sum + routeLength(route.points), 0)) }));
  const count = kinds => items.filter(item => kinds.includes(item.kind)).length;
  const outletCount = count(['socket', 'double-socket', 'power', 'facade-socket']);
  const switchCount = count(['switch', 'double-switch', 'dimmer']);
  const lightCount = count(['light', 'spotlight', 'pendant-light', 'wall-light', 'led-strip', 'facade-light', 'facade-spotlight']);
  const components = [
    { name: 'Электрощит', quantity: count(['panel']), unit: 'шт' },
    { name: 'Розетки и силовые точки', quantity: outletCount, unit: 'шт' },
    { name: 'Выключатели и диммеры', quantity: switchCount, unit: 'шт' },
    { name: 'Светильники и световые точки', quantity: lightCount, unit: 'шт' },
    { name: 'Подрозетники', quantity: outletCount + switchCount, unit: 'шт', note: 'По одной монтажной коробке на размещённый прибор; блоки уточнить' },
    { name: 'Кабельные трассы по плану', quantity: routeMetres, unit: 'м', note: 'Без вертикальных спусков, запаса и обходов' },
    { name: 'Гофра / кабель-канал', quantity: routeMetres, unit: 'м', note: 'Если предусмотрены проектом; без запаса' },
    { name: 'Группы защиты', quantity: circuits.length, unit: 'групп', note: 'Номиналы и аппараты задаются проектом' },
    { name: 'Распределительные коробки', quantity: null, unit: 'шт', note: 'Количество и расположение задать по схеме соединений' },
    { name: 'Клеммы / соединители', quantity: null, unit: 'шт', note: 'Подобрать по схеме соединений' },
    { name: 'Крепёж трасс', quantity: null, unit: 'шт', note: 'Шаг крепления задать по способу монтажа' },
    { name: 'Маркировка и расходные материалы', quantity: null, unit: 'компл', note: 'Состав уточнить по рабочему проекту' },
  ];
  return { routes, byCircuit, components, routeMetres, unconnected: items.filter(item => item.kind !== 'panel' && !routes.some(route => route.targetItemId === item.id || (!route.auto && route.circuitId === item.circuitId))) };
}
