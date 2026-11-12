export function engineeringSettings(value = {}) {
  return { distribution: value.distribution === 'collector' ? 'collector' : 'tee',
    builtInPump: value.builtInPump === true, builtInExpansion: value.builtInExpansion === true,
    builtInSafety: value.builtInSafety === true, wallRef: typeof value.wallRef === 'string' ? value.wallRef.slice(0, 100) : '' };
}
export function normalizeEngineeringSettings(value) {
  return Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).filter(([key, settings]) => /^(plumbing|heating|sewer)-[12]$/.test(key) && settings && typeof settings === 'object').map(([key, settings]) => [key, engineeringSettings(settings)]));
}
