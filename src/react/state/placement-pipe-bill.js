export const PIPE_TYPES = ['PEX', 'PE-RT', 'Металлопластик', 'Полипропилен PP-R', 'Медь', 'Нержавеющая сталь'];
export const PIPE_DIAMETERS = [12, 14, 15, 16, 18, 20, 22, 25, 26, 28, 32, 40, 50, 63];

export const PIPE_EQUIPMENT = {
  radiator: [
    ['Кронштейн радиатора', 2], ['Крепёж кронштейна', 2], ['Клапан подачи радиатора', 1],
    ['Термоголовка радиатора', 1], ['Запорно-балансировочный клапан радиатора', 1],
    ['Кран Маевского', 1], ['Заглушка радиатора', 1], ['Переходник радиатора', 2],
  ],
  boiler: [
    ['Группа безопасности котла', 1, 'Подача'],
    ['Грязевик / магнитный сепаратор', 1, 'Обратка'],
    ['Расширительный бак отопления', 1, 'Обратка'],
    ['Циркуляционный насос отопления', 1, 'По паспорту'],
    ['Запорный кран котла', 2, 'Сервисные подключения'],
    ['Узел подпитки', 1, 'По паспорту'],
    ['Сливной кран', 1, 'По паспорту'],
    ['Разъёмное соединение котла', 2, 'Сервисные подключения'],
  ],
};

export const pipeEquipmentKind = item => item.kind === 'radiator-point' ? 'radiator'
  : ['boiler', 'heat-source'].includes(item.kind) ? 'boiler' : null;

export function pipeEquipmentRows(item) {
  return (PIPE_EQUIPMENT[pipeEquipmentKind(item)] || []).map(([name, example, circuit], i) => ({
    name, example, circuit, quantity: Math.max(0, Number(item.pipeKit?.[i]) || 0),
  }));
}

const pointKey = point => [point.x, point.y, point.z || 0].map(value => Math.round(value * 1000)).join(',');
const sizeLabel = route => [route.material, route.diameterMm && 'Ø' + route.diameterMm + ' мм'].filter(Boolean).join(' · ');
const steps = points => points.slice(1).map((b, i) => [points[i], b]);
const vector = (a, b) => [b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)];

export function addPipeBill(routes, equipment, addComponent, issues) {
  const nodes = new Map(), countedTees = new Set();
  for (const route of routes) {
    if (route.outsideContour) continue;
    const size = sizeLabel(route);
    const topology = route.medium + '|' + size;
    const realPoints = route.points.filter((p, i) => i === 0 || pointKey(p) !== pointKey(route.points[i - 1]));
    if (route.fastener) {
      if (!route.fastenerSpacingM) issues.push('Для крепления трубы укажите шаг по паспорту выбранной системы.');
      else {
        let length = 0, runs = [];
        let lastAxis;
        for (const [a, b] of steps(realPoints)) {
          const v = vector(a, b), axis = v.map(value => Math.sign(Math.round(value * 1000))).join(',');
          if (lastAxis && axis !== lastAxis) { runs.push(length); length = 0; }
          length += Math.hypot(...v);
          lastAxis = axis;
        }
        if (length > 0) runs.push(length);
        const count = runs.reduce((total, run) => total + Math.ceil(run / route.fastenerSpacingM - 1e-9) + 1, 0);
        if (count) {
          addComponent((route.fastener === 'clip' ? 'Клипса для трубы' : 'Хомут для трубы') + (size ? ' · ' + size : ''), count);
          addComponent('Комплект крепежа клипсы / хомута к стене', count, 'компл');
        }
      }
    }
    for (const [a, b] of steps(realPoints)) {
      for (const [point, other] of [[a, b], [b, a]]) {
        const id = topology + '|' + pointKey(point);
        const node = nodes.get(id) || { size, point: pointKey(point), directions: new Map(), useElbow: false };
        const v = vector(point, other), length = Math.hypot(...v);
        if (length < .001) continue;
        const direction = v.map(value => Math.round(value / length * 1000));
        node.directions.set(direction.join(','), direction);
        node.useElbow ||= route.bendFitting !== 'sweep';
        nodes.set(id, node);
      }
    }
  }
  for (const node of nodes.values()) {
    const directions = [...node.directions.values()], suffix = node.size ? ' · ' + node.size : '';
    if (directions.length === 3) { addComponent('Тройник трубы' + suffix, 1); countedTees.add(node.point); }
    else if (directions.length === 4) { addComponent('Крестовина трубы' + suffix, 1); countedTees.add(node.point); }
    else if (directions.length > 4) issues.push('Для узла с пятью и более ветвями задайте фитинги вручную.');
    else if (directions.length === 2 && node.useElbow && !directions[0].every((v, i) => v === -directions[1][i])) addComponent('Уголок трубы' + suffix, 1);
  }
  for (const item of equipment) {
    const rows = pipeEquipmentRows(item);
    for (const row of rows) if (row.quantity > 0) addComponent(row.name, row.quantity);
    if (!item.pipeKit) issues.push((item.label || item.kind) + ': проверьте комплект и укажите количество деталей.');
  }
  return item => countedTees.has(pointKey({ ...item, z: item.height }));
}
