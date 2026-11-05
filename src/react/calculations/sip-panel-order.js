import { SIP_ORDER_FORMATS, SIP_ORDER_RATES } from '../data/sip-panel-order.js';

export const SIP_ORDER_SECTION = 'sip-panel-order';
export const SIP_ORDER_TITLE = 'Панели на заказ';
export const SIP_CUT_MODES = ['along', 'across', 'split'];
export const SIP_ORDER_LIMIT = 250;

const finiteRange = (value, low, high) =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
  && Number.isFinite(Number(value)) && Number(value) >= low && Number(value) <= high;
const positiveSize = (value) => finiteRange(value, 1, 30000);
const cash = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const formatOf = (key) => SIP_ORDER_FORMATS.find(item => item.value === key) || SIP_ORDER_FORMATS[0];
const validRate = (key, value) => finiteRange(value, 0, key === 'discount' ? 100 : 100000000);

export function newSipOrderPanel(format = 'osb2500') {
  const { value, length, width } = formatOf(format);
  return { type: 'panel', format: value, length, width, coreLength: length - 100, coreWidth: width - 100,
    thickness: 100, core: 'pps', customCore: '', customRate: 0, qty: 1 };
}

export function validSipOrderRow(row) {
  if (!row || !positiveSize(row.length) || !positiveSize(row.width)
      || !finiteRange(row.qty, 1, 100000) || !Number.isInteger(Number(row.qty))) return false;
  if (row.type === 'cut') {
    return SIP_CUT_MODES.includes(row.mode) && [0, 1, 2].includes(Number(row.split));
  }
  return row.type === 'panel'
    && ['pps', 'wool', 'custom'].includes(row.core)
    && [100, 150, 200].includes(Number(row.thickness))
    && finiteRange(row.coreLength, 1, Number(row.length))
    && finiteRange(row.coreWidth, 1, Number(row.width))
    && (row.core !== 'custom' || (typeof row.customCore === 'string' && row.customCore.trim() && finiteRange(row.customRate, 0, 100000000)));
}

export function normalizeSipPanelOrder(value) {
  const rates = {};
  for (const [key] of SIP_ORDER_RATES) {
    if (validRate(key, value?.rates?.[key])) rates[key] = Number(value.rates[key]);
  }
  const ids = new Set();
  const rows = (Array.isArray(value?.rows) ? value.rows : []).slice(0, SIP_ORDER_LIMIT).flatMap(row => {
    if (!validSipOrderRow(row) || typeof row.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(row.id) || ids.has(row.id)) return [];
    ids.add(row.id);
    const base = { id: row.id, type: row.type, length: Number(row.length), width: Number(row.width), qty: Number(row.qty) };
    return row.type === 'cut'
      ? [{ ...base, mode: row.mode, split: Number(row.split) }]
      : [{ ...base, format: formatOf(row.format).value, core: row.core, thickness: Number(row.thickness),
        coreLength: Number(row.coreLength), coreWidth: Number(row.coreWidth),
        customCore: String(row.customCore || '').trim().slice(0, 80), customRate: Number(row.customRate) || 0 }];
  });
  return { rates, rows };
}

export function sipOrderRates(project) {
  const catalog = [...(project.priceMat || []), ...(project.priceLab || [])];
  return Object.fromEntries(SIP_ORDER_RATES.map(([key, , , fallback, catalogId]) => {
    const saved = project.sipPanelOrder?.rates?.[key];
    const linked = catalogId ? catalog.find(item => item.id === catalogId)?.price : null;
    return [key, validRate(key, saved) ? Number(saved) : validRate(key, linked) ? Number(linked) : fallback];
  }));
}

export function calculateSipOrderRow(row, rates) {
  if (!validSipOrderRow(row)) return null;
  const length = Number(row.length), width = Number(row.width), count = Number(row.qty);
  const discounted = (price) => cash(price * (1 - rates.discount / 100));
  if (row.type === 'cut') {
    const split = row.mode === 'split' ? Number(row.split) : 0;
    const meters = (row.mode === 'across' ? width : length + split * width / 2) / 1000;
    const pieces = row.mode === 'across' ? [[2, length / 2, width]]
      : [[2 - split, length, width / 2], [split * 2, length / 2, width / 2]];
    const detail = pieces.filter(([qty]) => qty).map(([qty, l, w]) => `${qty * count} шт. ${l} × ${w} мм`).join(' + ');
    return { name: `Раскрой СИП-панелей ${length} × ${width} мм`, unit: 'м.п.', qty: Math.round(meters * count * 100000) / 100000,
      price: discounted(rates.cut), kind: 'labor', detail, meters, count };
  }
  const area = length * width / 1e6;
  const coreArea = Number(row.coreLength) * Number(row.coreWidth) / 1e6;
  const thickness = Number(row.thickness);
  const volume = coreArea * thickness / 1000;
  const csp = row.format === 'csp3200';
  const pps = row.core === 'pps';
  const skinRate = csp
    ? (length === 3200 && width === 1250 ? rates.csp3200 : area * rates.csp3200 / 4)
    : length === 2800 && width === 1250 ? rates.osb2800 : length === 2500 && width === 1250
      ? rates.osb2500 : area * rates.osb2500 / 3.125;
  const glueKg = coreArea * 2 * (pps ? rates.gluePps : rates.glueWool) / 1000 * (1 + rates.glueReserve / 100);
  const skins = skinRate * 2;
  const coreCost = volume * (pps ? rates.pps : row.core === 'wool' ? rates.wool : Number(row.customRate));
  const glue = glueKg * rates.glue;
  const labor = pps ? rates.laborPps : rates[`laborWool${thickness}`];
  const cost = skins + coreCost + glue + labor;
  const core = pps ? 'ППС' : row.core === 'wool' ? 'минвата' : row.customCore.trim();
  return { name: `СИП-панель ${csp ? 'ЦСП' : 'ОСП'} · ${core} · ${length} × ${width} × ${thickness + (csp ? 20 : 24)} мм`,
    unit: 'шт.', qty: count, price: discounted(cost * (1 + rates.markup / 100)), kind: 'material',
    area, volume, glueKg, skins, coreCost, glue, labor, cost };
}

export function sipPanelOrderLines(project) {
  if (!project.sipPanelOrder?.rows?.length) return [];
  const rates = sipOrderRates(project);
  return normalizeSipPanelOrder(project.sipPanelOrder).rows.map(row => {
    const { name, unit, qty, price, kind } = calculateSipOrderRow(row, rates);
    return { id: `${SIP_ORDER_SECTION}:${row.id}`, section: SIP_ORDER_SECTION,
      source: SIP_ORDER_SECTION, name, unit, qty, price, kind, exactQuantity: true };
  });
}
