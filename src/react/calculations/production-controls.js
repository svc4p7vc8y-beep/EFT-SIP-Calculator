// A content revision, not a security signature. Approval is always tied to exact inputs.
export function cuttingRevision(value) {
  const stable = item => Array.isArray(item) ? item.map(stable) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, stable(item[key])])) : item;
  const text = JSON.stringify(stable(value));
  let a = 2166136261, b = 5381;
  for (const char of text) { a = Math.imul(a ^ char.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ char.charCodeAt(0); }
  return `РК2-${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

export const productionLimits = {
  frameStepMm: [100, 2500], kerfMm: [0, 20], endAllowanceMm: [0, 100],
  stockLengthMm: [500, 15000], splineWidthMm: [20, 300], edgeWidthMm: [20, 300],
};

export function validateProductionSettings(settings) {
  if(!/^\d+[×хx]\d+$/.test(settings.gableFrameProfile)||settings.gableFrameProfile.split(/[×хx]/).some(value=>!(Number(value)>0)))throw new Error('Каркас фронтонов: задайте положительное сечение в формате 50×150 мм.');
  for (const [key, [min, max]] of Object.entries(productionLimits)) {
    if (settings[key] === '' && ['kerfMm', 'endAllowanceMm'].includes(key)) continue;
    if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) throw new Error(`${key}: допустимо от ${min} до ${max} мм; введённое значение не заменено автоматически`);
  }
}

export function parseManualPanel(item) {
  const rings = typeof item.contour === 'string' ? JSON.parse(item.contour) : item.contour;
  if (!item.name?.trim() || ![124, 174, 224].includes(Number(item.thickness)) || !['pps', 'mineral-wool', 'csp-pps'].includes(item.family)) throw new Error('Укажите название, семейство PPS/минвата/CSP PPS и толщину 124/174/224');
  if (!Array.isArray(rings) || !rings.length || rings.length > 30) throw new Error('Нужен массив контуров: внешний и затем вырезы');
  return rings.map(ring => {
    if (!Array.isArray(ring) || ring.length < 3 || ring.length > 200) throw new Error('Контур: от 3 до 200 вершин');
    const points = ring.map(p => {
      if (!Array.isArray(p) || p.length !== 2 || !p.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100000)) throw new Error('Координаты — числа в мм, не более 100 000');
      return [...p];
    });
    if (points[0][0] !== points.at(-1)[0] || points[0][1] !== points.at(-1)[1]) points.push([...points[0]]);
    // Reject self-intersections rather than letting clipping repair production geometry.
    const cross = (a, b, c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    for (let i=0;i<points.length-1;i++) for(let j=i+2;j<points.length-1;j++) {
      if(i===0 && j===points.length-2) continue;
      if(cross(points[i],points[i+1],points[j])*cross(points[i],points[i+1],points[j+1]) <= 0 && cross(points[j],points[j+1],points[i])*cross(points[j],points[j+1],points[i+1]) <= 0 && Math.max(Math.min(points[i][0],points[i+1][0]),Math.min(points[j][0],points[j+1][0])) <= Math.min(Math.max(points[i][0],points[i+1][0]),Math.max(points[j][0],points[j+1][0])) && Math.max(Math.min(points[i][1],points[i+1][1]),Math.min(points[j][1],points[j+1][1])) <= Math.min(Math.max(points[i][1],points[i+1][1]),Math.max(points[j][1],points[j+1][1]))) throw new Error('Самопересечение контура');
    }
    return points;
  });
}

export function reconcileCutting(report, calculation) {
  const rows = new Map();
  const profileKey = s => String(s).replace(/[хx]/gi, '×').split('×').map(Number).sort((a,b)=>a-b).join('×');
  const add = (key, name, unit, field, qty) => {
    if (!rows.has(key)) rows.set(key, { key, name, unit, required: 0, purchased: 0 });
    rows.get(key)[field] += qty;
  };
  for (const sheet of report.panelStock.sheets) add(`panel:${sheet.family}:${sheet.thickness}`, `SIP ${sheet.family.toUpperCase()} ${sheet.thickness} мм`, 'шт.', 'required', 1);
  for (const bar of report.timberStock.bars) add(`${bar.material}:${profileKey(bar.profile)}`, `${bar.material} ${bar.profile}`, 'м.п.', 'required', report.settings.stockLengthMm / 1000);
  for (const line of calculation.lines || []) {
    if (line.kind !== 'material') continue;
    const panel = line.name.match(/СИП-панель\s+(PPS|минвата|CSP PPS)\s+\d+×\d+×(\d+)/i);
    if (panel) { const family = panel[1].toLowerCase() === 'минвата' ? 'mineral-wool' : panel[1].toLowerCase().replace(' ', '-'); add(`panel:${family}:${panel[2]}`, `SIP ${panel[1]} ${panel[2]} мм`, 'шт.', 'purchased', Number(line.qty) || 0); continue; }
    if (!/joints|edges|sip-frame/.test(line.source || '') && !/connector|edge-board|sip-frame/.test(line.id || '')) continue;
    const profile = line.name.match(/(\d+)×(\d+)\s*мм/);
    const material = /Термобрус/.test(line.name) ? 'Термобрус' : /Пакет клеёных/.test(line.name) ? 'Клеёный пакет' : /Брус соединительный/.test(line.name) ? 'Брус' : /Доска сухая строганая/.test(line.name) ? 'Торцевая / обрамляющая доска' : null;
    if (profile && material && line.unit === 'м.п.') add(`${material}:${profileKey(`${profile[1]}×${profile[2]}`)}`, `${material} ${profile[1]}×${profile[2]}`, 'м.п.', 'purchased', Number(line.qty) || 0);
  }
  return [...rows.values()].map(row => ({ ...row, difference: Math.round((row.required-row.purchased)*1000)/1000 }));
}
