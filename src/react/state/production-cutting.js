export function normalizeProductionCutting(value = {}) {
  value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const number = (key, fallback, min, max) => value[key] != null && Number.isFinite(Number(value[key])) && value[key] !== '' ? Math.min(max, Math.max(min, Number(value[key]))) : fallback;
  const record = source => source && typeof source === 'object' && !Array.isArray(source) ? Object.fromEntries(Object.entries(source).slice(0, 2000).map(([key, item]) => [key, item !== '' && item != null && Number.isFinite(Number(item)) && Number(item) >= 0 && Number(item) <= 30000 ? Number(item) : ''])) : {};
  return {
    frameStepMm: number('frameStepMm', 625, 100, 2500),
    kerfMm: number('kerfMm', '', 0, 20),
    endAllowanceMm: number('endAllowanceMm', '', 0, 100),
    stockLengthMm: number('stockLengthMm', 6000, 500, 15000),
    splineWidthMm: number('splineWidthMm', 90, 20, 300),
    edgeWidthMm: number('edgeWidthMm', 45, 20, 300),
    staggered: value.staggered !== false,
    openingSills: record(value.openingSills),
    wallAdditions: record(value.wallAdditions),
    manualParts: Array.isArray(value.manualParts) ? value.manualParts.filter(item => item && typeof item === 'object').slice(0, 500).map((item, index) => ({ id: String(item.id || `manual-${index + 1}`), name: String(item.name || '').slice(0, 200), profile: String(item.profile || '').slice(0, 100), length: item.length !== '' && Number.isFinite(Number(item.length)) ? Number(item.length) : '', quantity: item.quantity !== '' && Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : '' })) : [],
    notes: typeof value.notes === 'string' ? value.notes.slice(0, 10000) : '',
  };
}
