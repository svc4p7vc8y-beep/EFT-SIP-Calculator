// Server catalog is an overlay, never an undoable edit to the house plan.
export function applySharedPriceCatalog(project, catalog, revision) {
  if (project.localPriceCatalog || !catalog || !(revision > 0)) return project;
  const byId = new Map([...catalog.priceMat, ...catalog.priceLab].map(row => [row.id, row]));
  const currentPrice = line => {
    if (!line.catalogId) return { ...line, price: Math.max(0, Number(line.price) || 0), pricePending: !(Number(line.price) > 0) };
    const row = byId.get(line.catalogId);
    const price = line.priceOverride !== undefined ? Number(line.priceOverride) : Number(row?.price);
    return { ...line, ...(row ? { kind: row.kind, unit: row.unit } : {}), price: Number.isFinite(price) ? price : 0, pricePending: !(price > 0) };
  };
  return { ...project, priceMat: catalog.priceMat, priceLab: catalog.priceLab, sharedPriceCatalog: { revision, source: 'server' },
    customEstimateLines: (project.customEstimateLines || []).map(currentPrice),
    request: project.request ? { ...project.request, items: (project.request.items || []).map(currentPrice) } : project.request };
}

export function catalogChanges(before, after) {
  const changes = [];
  for (const key of ['priceMat', 'priceLab']) {
    const previous = new Map((before[key] || []).map(row => [row.id, row]));
    for (const row of after[key] || []) {
      const old = previous.get(row.id) || null;
      if (JSON.stringify(old) !== JSON.stringify(row)) changes.push({ key, id: row.id, before: old, after: row });
    }
  }
  return changes;
}

// Restoring a backup affects this project only; it never writes the shared catalog.
export function restoreLocalPrices(project, data, name='Резервный прайс') {
  for (const key of ['priceMat','priceLab']) {
    if (!Array.isArray(data?.[key]) || !data[key].length || data[key].some(row => !row || typeof row.id!=='string' || !Number.isFinite(Number(row.price)) || Number(row.price)<0)) throw new Error('В файле нет корректного прайса материалов и работ');
    if (new Set(data[key].map(row=>row.id)).size!==data[key].length) throw new Error('В прайсе повторяются коды позиций');
  }
  return {...project,priceMat:data.priceMat.map(row=>({...row})),priceLab:data.priceLab.map(row=>({...row})),localPriceCatalog:{name,restoredAt:new Date().toISOString()}};
}
