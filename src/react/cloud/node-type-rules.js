import { getEftNodeRule } from '../data/eft-node-library.js';

export function normalizeNodeTypeRules(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return Object.fromEntries(Object.entries(payload).flatMap(([type, rule]) => {
    if (!getEftNodeRule(type.split('__')[0]) || !rule || typeof rule !== 'object') return [];
    const fastener = rule.fastener;
    if (!fastener || typeof fastener !== 'object') return [];
    const size = String(fastener.size || '').trim().replace(/[xх]/gi, '×').slice(0, 40);
    const name = String(fastener.type || '').trim().slice(0, 80);
    if (!size || !name) return [];
    const parts = size.match(/^(?:M)?(\d+(?:[.,]\d+)?)×(\d+(?:[.,]\d+)?)$/i);
    const kgEach = fastener.kgEach === null || fastener.kgEach === '' ? null : Number(fastener.kgEach);
    return [[type, {
      fastener: {
        type: name,
        size,
        diameterMm: parts ? Number(parts[1].replace(',', '.')) : null,
        lengthMm: parts ? Number(parts[2].replace(',', '.')) : null,
        kgEach: Number.isFinite(kgEach) && kgEach >= 0 ? kgEach : null,
      },
      note: String(rule.note || '').trim().slice(0, 500),
      updatedAt: String(rule.updatedAt || ''),
    }]];
  }));
}
