// Unlinked library samples do not describe additional openings in a drawn house.
export function includeWindowProductInEstimate(product, hasPlanWindows) {
  if (product.openingId) return true; // The estimate also validates that this opening still exists and is included.
  return product.includeInEstimate === true || (!hasPlanWindows && product.includeInEstimate !== false);
}
