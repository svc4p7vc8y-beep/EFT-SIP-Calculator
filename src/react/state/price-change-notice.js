export function priceCatalogFingerprint(project) {
  return [project.priceMat || [], project.priceLab || []]
    .flatMap((list) => list.map((row) => `${row.id}:${row.price}`))
    .join('|');
}

export function showLocalPriceChangeNotice(teamUser, changes, fingerprint, dismissedFingerprint) {
  return !teamUser && changes.total > 0 && fingerprint !== dismissedFingerprint;
}
