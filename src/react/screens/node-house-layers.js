export const NODE_HOUSE_LAYERS = [
  ['foundation', 'Фундамент'],
  ['floor', 'Пол'],
  ['walls', 'Стены'],
  ['ceiling', 'Потолок'],
  ['roof', 'Кровля'],
];

export function layerForNode(node = {}) {
  const value = `${node.id || ''} ${node.type || ''} ${node.section || ''}`.toLowerCase();
  if (/roof|rafter|mauerlat|строп|кров|обреш/.test(value)) return 'roof';
  if (/pile|binding|сва|обвяз/.test(value)) return 'foundation';
  if (/ceiling|потол/.test(value)) return 'ceiling';
  if (/floor|slab|пол|перекры/.test(value)) return 'floor';
  return 'walls';
}

export function groupNodesAtAnchors(nodes, { separateLayers = false } = {}) {
  const groups = new Map();
  for (const node of nodes) {
    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    const layer = layerForNode(node);
    const floor = Math.max(1, Number(node.floor) || 1);
    const key = `${x.toFixed(4)}:${y.toFixed(4)}:${floor}${separateLayers ? `:${layer}` : ''}`;
    if (!groups.has(key)) groups.set(key, { key, x, y, floor, layer, nodes: [] });
    groups.get(key).nodes.push(node);
  }
  return [...groups.values()];
}

export function nextNodeAtAnchor(group, selectedId) {
  const nodes = group?.nodes || [];
  if (!nodes.length) return null;
  const current = nodes.findIndex(node => node.id === selectedId);
  return nodes[(current + 1) % nodes.length];
}
