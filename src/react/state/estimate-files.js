export const MAX_ESTIMATE_FILES = 20;
const safeId = /^[A-Za-z0-9-]{1,80}$/;
const sourceActions = { shared: 'file-download', questionnaire: 'attachment', crm: 'files.download' };

export function normalizeEstimateFiles(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = new Set();
  return value.slice(0, MAX_ESTIMATE_FILES).flatMap((entry) => {
    const source = entry?.source;
    const sourceId = String(entry?.sourceId || '');
    if (!sourceActions[source] || !(source === 'crm' ? /^\d{1,18}$/.test(sourceId) : safeId.test(sourceId))) return [];
    const key = `${source}:${sourceId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const proposedId = typeof entry.id === 'string' && safeId.test(entry.id) ? entry.id : '';
    const id = proposedId && !ids.has(proposedId) ? proposedId : crypto.randomUUID();
    ids.add(id);
    return [{
      id,
      source,
      sourceId,
      name: String(entry.name || 'Файл').slice(0, 180),
      mime: String(entry.mime || '').slice(0, 100),
    }];
  });
}

export function estimateFileUrl(file, apiBase) {
  const normalized = normalizeEstimateFiles([file])[0];
  if (!normalized) return '';
  const url = new URL(normalized.source === 'crm' ? 'https://crm.eftsip.ru/api/api.php' : apiBase, globalThis.location?.href || 'https://eftsip.ru/');
  url.searchParams.set('action', sourceActions[normalized.source]);
  url.searchParams.set('id', normalized.sourceId);
  return url.href;
}
