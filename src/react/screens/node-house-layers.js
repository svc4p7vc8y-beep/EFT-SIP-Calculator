export const NODE_HOUSE_LAYERS = [
  ['foundation', 'Фундамент'],
  ['floor', 'Пол'],
  ['walls', 'Стены'],
  ['roof', 'Кровля'],
];

export function layerForNode(node = {}) {
  const value = `${node.id || ''} ${node.type || ''} ${node.section || ''}`.toLowerCase();
  if (/roof|rafter|mauerlat|строп|кров|обреш/.test(value)) return 'roof';
  if (/pile|binding|сва|обвяз/.test(value)) return 'foundation';
  if (/floor|slab|пол|перекры/.test(value)) return 'floor';
  return 'walls';
}
