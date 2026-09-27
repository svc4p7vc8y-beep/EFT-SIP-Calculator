import { getEftNodeRule } from '../data/eft-node-library.js';

export function nodeRuleKey(node) {
  const type = node?.type;
  if (!getEftNodeRule(type)) return null;
  const template = getEftNodeRule(type).fasteners?.[0]?.size || '';
  if (!template.includes('BY_SIP_THICKNESS')) return type;
  const thickness = Number(node.panelThickness);
  if (!Number.isFinite(thickness) || thickness <= 0) return null;
  if (type === 'MAUERLAT') {
    const selection = node.fastenerSelection === 'anchors' ? 'ANCHORS' : 'SCREWS';
    return `${type}__${thickness}__${selection}`;
  }
  return `${type}__${thickness}`;
}

export function sharedNodeRule(node, rules = {}) {
  const key = nodeRuleKey(node);
  return key ? rules[key] || null : null;
}
