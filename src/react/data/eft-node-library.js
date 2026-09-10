import rawLibrary from '../../../EFT_NODE_LIBRARY.json' with { type: 'json' };

export const EFT_NODE_LIBRARY = Object.freeze(
  Object.fromEntries(rawLibrary.nodes.map((node) => [node.code, Object.freeze(node)])),
);

export const EFT_NODE_TYPES = Object.freeze(rawLibrary.nodes.map((node) => ({
  value: node.code,
  label: node.name,
  marker: node.marker,
  section: node.section,
})));

export const EFT_NODE_LIBRARY_VERSION = rawLibrary.schemaVersion;

export function getEftNodeRule(code) {
  return EFT_NODE_LIBRARY[code] || null;
}

