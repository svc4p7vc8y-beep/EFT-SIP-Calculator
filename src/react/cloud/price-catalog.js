// Server catalog is an overlay, never an undoable edit to the house plan.
export function applySharedPriceCatalog(project, catalog, revision) {
  if (!catalog || !(revision > 0)) return project;
  const byId = new Map([...catalog.priceMat, ...catalog.priceLab].map(row => [row.id, row]));
  const currentPrice = line => {
    const row = byId.get(line.catalogId);
    return { ...line, ...(row ? { kind: row.kind, unit: row.unit } : {}), price: Number(row?.price) || 0, pricePending: !(Number(row?.price) > 0) };
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
