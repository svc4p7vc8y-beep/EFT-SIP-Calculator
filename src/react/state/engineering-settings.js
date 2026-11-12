export function engineeringSettings(value = {}) {
  return { material: String(value.material || '').slice(0,100), diameterMm: Number(value.diameterMm)>0?Number(value.diameterMm):null, clearanceMm: Math.max(0,Math.min(300,value.clearanceMm==null?30:Number.isFinite(Number(value.clearanceMm))?Number(value.clearanceMm):30)), distribution: value.distribution === 'collector' ? 'collector' : 'tee',
    builtInPump: value.builtInPump === true, builtInExpansion: value.builtInExpansion === true,
    builtInSafety: value.builtInSafety === true, wallRef: typeof value.wallRef === 'string' ? value.wallRef.slice(0, 100) : '' };
}
export function normalizeEngineeringSettings(value) {
  return Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).filter(([key, settings]) => /^(plumbing|heating|sewer)-[12]$/.test(key) && settings && typeof settings === 'object').map(([key, settings]) => [key, engineeringSettings(settings)]));
}
