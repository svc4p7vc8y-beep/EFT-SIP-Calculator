// Planning connection points only. Their heights and sizes remain project inputs.
const port = (system, medium, label) => ({ system, medium, label });

const waterPair = [port('plumbing', 'cold', 'ХВС'), port('plumbing', 'hot', 'ГВС')];
const heatPair = [port('heating', 'supply', 'Подача'), port('heating', 'return', 'Обратка')];
const drain = port('sewer', 'waste', 'Сток');

export const CONNECTION_PORTS = {
  'hydro-tank': [port('plumbing', 'cold', 'Вход ХВС'), port('plumbing', 'cold', 'Выход ХВС')],
  'expansion-tank': [port('heating', 'return', 'Подключение обратки')],
  'heat-pump': heatPair,
  boiler: [...heatPair, ...waterPair],
  'water-heater': waterPair,
  manifold: [port('plumbing', 'cold', 'Вход ХВС'), port('plumbing', 'hot', 'Выход ГВС')],
  pump: [port('plumbing', 'cold', 'Вход'), port('plumbing', 'cold', 'Выход')],
  'water-filter': [port('plumbing', 'cold', 'Вход ХВС'), port('plumbing', 'cold', 'Выход ХВС')],
  bathtub: [...waterPair, drain],
  'corner-bathtub': [...waterPair, drain],
  shower: [...waterPair, drain],
  'walk-in-shower': [...waterPair, drain],
  'bathroom-sink': [...waterPair, drain],
  'double-sink': [...waterPair, drain],
  vanity: [...waterPair, drain],
  'kitchen-sink': [...waterPair, drain],
  bidet: [...waterPair, drain],
  toilet: [port('plumbing', 'cold', 'ХВС'), drain],
  'wall-toilet': [port('plumbing', 'cold', 'ХВС'), drain],
  dishwasher: [port('plumbing', 'cold', 'ХВС'), drain],
  washer: [port('plumbing', 'cold', 'ХВС'), drain],
  'washer-dryer': [port('plumbing', 'cold', 'ХВС'), drain],
  'vent-unit': [port('ventilation', 'supply-air', 'Приток'), port('ventilation', 'extract-air', 'Вытяжка')],
  hood: [port('ventilation', 'extract-air', 'Вытяжка')],
  'air-conditioner': [port('sewer', 'waste', 'Конденсат')],
};

export function connectionPortsFor(item) {
  const definitions = CONNECTION_PORTS[item?.kind] || [];
  return definitions.map((definition, index) => {
    const siblings = definitions.filter(entry => entry.system === definition.system);
    const station = siblings.indexOf(definition);
    const offset = (station - (siblings.length - 1) / 2) * .18;
    const reach = .12;
    const location = definition.system === 'plumbing' ? { x: item.x + offset, y: item.y + item.depth / 2 + reach }
      : definition.system === 'heating' ? { x: item.x + offset, y: item.y - item.depth / 2 - reach }
        : definition.system === 'sewer' ? { x: item.x + item.width / 2 + reach, y: item.y + offset }
          : { x: item.x - item.width / 2 - reach, y: item.y + offset };
    return {
      id: `port-${item.id}-${index}`, floor: item.floor, layer: definition.system,
      kind: 'connection-port', label: `${item.label || item.kind} · ${definition.label}`,
      x: Math.round(location.x * 100) / 100, y: Math.round(location.y * 100) / 100,
      width: .12, depth: .12, rotation: 0, height: 0, heightKnown: false,
      wallRef: item.wallRef || '', surface: 'interior', dimensionSide: 'auto',
      showHeight: false, showName: false, labelOffsetX: .65, labelOffsetY: -.45,
      linkedApplianceId: item.id, followsAppliance: true, connectionMedium: definition.medium,
    };
  });
}

export function addMissingConnectionPorts(items) {
  const ids = new Set(items.map(item => item.id));
  return [...items, ...items.flatMap(item => connectionPortsFor(item)).filter(item => !ids.has(item.id))];
}
