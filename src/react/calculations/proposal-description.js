import { formatNumber } from '../utils/format.js';

const PANEL_FAMILIES = { pps: 'ОСП с пенополистиролом', 'mineral-wool': 'ОСП с минеральной ватой', 'csp-pps': 'ЦСП с пенополистиролом' };
const panel = (thickness, family) => `СИП-панели ${thickness} мм (${PANEL_FAMILIES[family] || PANEL_FAMILIES.pps})`;

// Describe the assemblies already present in the final estimate, never add them.
export function constructionDescription(project, lines) {
  const s = project.settings.sip;
  const groups = new Set(lines.map(line => line.estimateGroup));
  const blocks = [
    ['Пол', 'Пол 1 этажа', s.floorThickness, s.floorPanelFamily],
    ['Межэтажное перекрытие / пол 2 этажа', 'Межэтажное перекрытие', s.secondFloorThickness, s.secondFloorPanelFamily],
    ['Наружные стены 1 этажа', 'Наружные стены 1 этажа', s.wallThickness, s.wallPanelFamily],
    ['Наружные стены 2 этажа', 'Наружные стены 2 этажа', s.wallThickness, s.wallPanelFamily],
    ['Потолок', 'Потолок', s.ceilingThickness, s.ceilingPanelFamily],
  ].filter(([group]) => groups.has(group)).map(([, title, thickness, family]) => ({ title, text: panel(thickness, family) }));
  for (const floor of [1, 2]) {
    const title = `Перегородки ${floor} этажа`;
    if (!groups.has(title)) continue;
    const section = s.partitionFrameSection === '50x150' ? '50×150' : '50×100';
    blocks.push({ title, text: s.partitionType === 'sip'
      ? `${panel(s.partitionThickness, s.partitionPanelFamily)}. Отделка поверх панелей описана отдельно.`
      : `Деревянный каркас из доски ${section} мм: вертикальные стойки, нижняя и верхняя обвязки, обрамление проёмов. Толщина каркаса ${s.partitionFrameSection === '50x150' ? 150 : 100} мм без обшивки. Обшивка и изоляция не входят в сам каркас: учитываются только при выборе в разделе внутренней отделки.` });
  }
  return blocks;
}

const FINISH_MATERIALS = [
  ['MAT-111', 'основание из ОСП-3 12 мм'], ['MAT-206', 'ГВЛВ 12,5 мм'], ['MAT-207', 'элементы пола ГВЛВ 20 мм'],
  ['MAT-116', 'подложка под ламинат'], ['MAT-108', 'ламинат'], ['MAT-106', 'плитка / керамогранит'],
  ['MAT-103', 'гидроизоляция'], ['MAT-115', 'плиточный клей'], ['MAT-104', 'затирка швов'],
  ['MAT-114', 'плинтус'], ['MAT-105', 'имитация бруса'], ['MAT-213', 'обрешётка 25×50 мм'],
  ['MAT-102', 'обрешётка 50×50 мм'], ['MAT-100', 'тепло- и звукоизоляция'], ['MAT-112', 'пароизоляция'],
  ['MAT-208', 'гипсокартон 12,5 мм'], ['MAT-209', 'влагостойкий гипсокартон 12,5 мм'],
  ['MAT-210', 'огнестойкий гипсокартон 12,5 мм'], ['MAT-211', 'каркасный профиль ПП 60×27'], ['MAT-212', 'направляющий профиль ПН 28×27'],
  ['MAT-219', 'шпаклёвка для швов'], ['MAT-224', 'интерьерная краска'], ['MAT-225', 'обои'],
  ['MAT-107', 'краска для дерева'], ['MAT-110', 'натяжной потолок ПВХ'], ['MAT-233', 'тканевый натяжной потолок'],
  ['MAT-229', 'ниша для карниза'], ['MAT-227', 'закладные светильников'],
];
const FINISH_ORDER = ['MAT-211','MAT-212','MAT-213','MAT-102','MAT-100','MAT-112','MAT-111','MAT-206','MAT-207','MAT-208','MAT-209','MAT-210','MAT-219','MAT-103','MAT-115','MAT-116','MAT-108','MAT-106','MAT-104','MAT-105','MAT-107','MAT-224','MAT-225','MAT-110','MAT-233','MAT-114','MAT-229','MAT-227'];
const SAUNA_FEATURES = [
  [['MAT-SAUNA-LINING', 'MAT-SAUNA-LININGPACK'], 'обшивка парной вагонкой'],
  [['MAT-SAUNA-BATTEN', 'MAT-SAUNA-BATTENSTOCK'], 'деревянная обрешётка'],
  [['MAT-SAUNA-INSULATION'], 'утепление'], [['MAT-SAUNA-FOIL', 'MAT-SAUNA-FOILROLL'], 'фольгированная пароизоляция'],
  [['MAT-SAUNA-COUNTERBATTEN', 'MAT-SAUNA-COUNTERSTOCK'], 'контррейка вентиляционного зазора'],
  [['MAT-SAUNA-BENCH'], 'полки с опорным каркасом'], [['MAT-SAUNA-BACKREST'], 'спинки полков'],
  [['MAT-SAUNA-SHIELD'], 'теплозащитный экран печи'], [['MAT-SAUNA-GUARD'], 'ограждение печи'],
  [['MAT-SAUNA-LAMP'], 'термостойкий светильник'], [['MAT-SAUNA-WIRE'], 'термостойкий провод'],
  [['MAT-SAUNA-VENT'], 'комплект притока и вытяжки'],
];

function finishText(lines, settings, surface) {
  const ids = new Set(lines.filter(line => line.kind !== 'labor').map(line => line.catalogId));
  const parts = FINISH_MATERIALS.filter(([id]) => ids.has(id))
    .sort(([a], [b]) => FINISH_ORDER.indexOf(a) - FINISH_ORDER.indexOf(b)).map(([, label]) => label);
  if (surface === 'Стены' && ['MAT-206','MAT-208','MAT-209','MAT-210'].some(id => ids.has(id))) {
    parts.push(`листовая обшивка: ${Math.max(1, Math.ceil(Number(settings.drywallLayers) || 1))} сл.`);
  }
  if (surface === 'Пол' && settings.floorSubstrate === 'gvl-double' && ids.has('MAT-206')) parts.push('ГВЛВ в два слоя');
  if (surface === 'Стены' && ids.has('MAT-106') && settings.wetZone && Number(settings.waterproofWallShare) > 0) {
    parts.push(`плиточная зона — ${formatNumber(Number(settings.waterproofWallShare) * 100)}% площади стен`);
  }
  const work = lines.some(line => line.kind === 'labor');
  return `${parts.length ? parts.join(', ') : work ? 'Подготовительные и монтажные работы по выбранной комплектации' : 'Сопутствующие материалы по выбранной комплектации'}${work && parts.length ? '; работы включены' : ''}.`;
}

export function internalDescription(calculation, lines) {
  const blocks = [];
  if (calculation.internal?.mode !== 'rooms') {
    const text = finishText(lines, {}, '');
    return [{ title: 'Отделка по общим объёмам', text }];
  }
  const byId = new Map(lines.map(line => [line.id, line]));
  const descriptors = calculation.internal.lines || [];
  for (const room of calculation.internal.rooms) {
    if (room.settings.enabled === false) continue;
    const prefix = `${room.floor}-${room.id}-`;
    const roomLines = descriptors.filter(row => row.key.startsWith(prefix)).map(row => byId.get(`internal:${row.key}`)).filter(Boolean);
    const parts = [];
    for (const surface of ['Пол', 'Стены', 'Потолок']) {
      const surfaceLines = roomLines.filter(line => line.estimateGroup === `${room.floor} этаж · ${room.name} · ${surface}`);
      if (surfaceLines.length) parts.push(`${surface}: ${finishText(surfaceLines, room.settings, surface)}`);
    }
    const sauna = roomLines.filter(line => line.catalogId?.includes('-SAUNA-') && line.catalogId !== 'MAT-SAUNA-DRAIN');
    if (sauna.length) {
      const ids = new Set(sauna.map(line => line.catalogId));
      const features = SAUNA_FEATURES.filter(([keys]) => keys.some(key => ids.has(key))).map(([, label]) => label);
      const heater = sauna.find(line => line.catalogId === 'MAT-SAUNA-HEATER');
      if (heater) features.push(heater.name.replace('Печь для парной', 'печь'));
      if (sauna.some(line => line.catalogId.startsWith('MAT-SAUNA-CHIMNEY'))) features.push('комплектующие дымохода по расчёту');
      if (sauna.some(line => line.kind === 'labor')) features.push('работы по выбранной комплектации');
      parts.push(`Парная: ${features.length ? features.join(', ') : 'дополнительная комплектация'}.`);
    }
    const drains = roomLines.filter(line => line.catalogId === 'MAT-SAUNA-DRAIN').reduce((sum, line) => sum + line.qty, 0);
    if (drains) parts.push(`Трап: ${formatNumber(drains, 0)} шт.; работы по полу и подключению канализации в эту позицию не входят.`);
    if (parts.length) blocks.push({ title: `${room.floor} этаж · ${room.name}`, text: parts.join(' '), paragraphs: parts });
  }
  const doors = lines.find(line => line.id === 'internal:doors');
  if (doors) blocks.push({ title: 'Межкомнатные двери', text: `${formatNumber(doors.qty, 0)} шт.${lines.some(line => line.id === 'internal:doors-work') ? ' с установкой' : ', без установки'}.` });
  if (lines.some(line => line.estimateGroup === 'Откосы окон и входных дверей')) blocks.push({ title: 'Откосы', text: 'Отделка откосов окон и входных дверей в рассчитанном объёме.' });
  return blocks;
}
