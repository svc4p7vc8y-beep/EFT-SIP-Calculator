import { normalizeConstructionSources, registerConstructionSources } from './construction-sources.js';
// Group identity is NOT the identity of a physical installed part.
// Keys contain the complete existing grouping definition, not a geometry hash.
const markPattern = /^(П|У|С|Д|Ш|Б|СТ|О|К|ПР|Р)([1-9]\d*)$/;
export function normalizeMarkRegistry(value) {
  const entries = [], keys = new Set(), marks = new Set();
  let invalid = value?.invalid === true || (value?.version != null && value.version !== 1);
  for (const entry of Array.isArray(value?.entries) ? value.entries : []) {
    if (!entry || typeof entry.key !== 'string' || !/^(panel|member):\[/.test(entry.key) ||
      typeof entry.mark !== 'string' || !markPattern.test(entry.mark) || !Number.isSafeInteger(Number(entry.mark.match(markPattern)?.[2])) ||
      keys.has(entry.key) || marks.has(entry.mark)) { invalid = true; continue; }
    if (entry.key.startsWith('panel:') !== /^П\d+$/.test(entry.mark)) { invalid = true; continue; }
    keys.add(entry.key); marks.add(entry.mark); entries.push({ key: entry.key, mark: entry.mark });
  }
  return { version: 1, entries, ...(invalid ? { invalid: true } : {}) };
}
export function createMarkAllocator(saved) {
  const registry = normalizeMarkRegistry(saved);
  const byKey = new Map(registry.entries.map(entry => [entry.key, entry.mark]));
  const counts = new Map();
  for (const { mark } of registry.entries) {
    const [, prefix, serial] = mark.match(markPattern);
    counts.set(prefix, Math.max(counts.get(prefix) || 0, Number(serial)));
  }
  return { registry, allocate(key, prefix) {
    if (byKey.has(key)) return byKey.get(key);
    const serial = (counts.get(prefix) || 0) + 1;
    if (!Number.isSafeInteger(serial)) throw new Error('Исчерпан диапазон марок деталей');
    const mark = `${prefix}${serial}`;
    counts.set(prefix, serial); byKey.set(key, mark); registry.entries.push({ key, mark });
    return mark;
  } };
}
// Source position + quantity ordinal: project identity, not a factory serial number.
export function sourceIdentity(kind, sourceId, ordinal = 1) {
  return { persistentId: `${kind}:${encodeURIComponent(sourceId)}:${ordinal}`,
    sourceRef: { kind, id: sourceId, ordinal }, identityStatus: 'source-position' };
}
// No undo checkpoint or cleared redo. Reserve marks in every history snapshot.
// Reject late Worker results after any edit or project replacement.
export function recordProductionRegistry(state, expectedPresent, value, requests = [], allocate) {
  if (state.present !== expectedPresent) return state;
  const registry = normalizeMarkRegistry(value);
  const current = normalizeMarkRegistry(state.present.settings?.productionCutting?.markRegistry);
  const sources=registerConstructionSources(state.present.settings?.productionCutting?.constructionSources,requests,allocate);
  const currentSources=normalizeConstructionSources(state.present.settings?.productionCutting?.constructionSources);
  if (JSON.stringify(current) === JSON.stringify(registry)&&JSON.stringify(sources)===JSON.stringify(currentSources)) return state;
  const merge = project => {
    // Only automatic reservations propagate through history. User declarations remain undoable.
    const {selections,...automaticSources}=sources;
    const own=normalizeConstructionSources(project.settings?.productionCutting?.constructionSources);
    return { ...project, settings: { ...project.settings,
      productionCutting: { ...project.settings.productionCutting, markRegistry: registry,
        constructionSources:{...automaticSources,...(own.selections?{selections:own.selections}:{})} } } };
  };
  return { present: merge(state.present), past: state.past.map(merge), future: state.future.map(merge) };
}
