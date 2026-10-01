function filenamePart(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

export function estimatePdfTitle(meta = {}) {
  const parts = ['Смета', 'ЭФТ', meta.projectNum, meta.projectName || meta.name || meta.buildingType, meta.customer]
    .map(filenamePart)
    .filter(Boolean);
  return parts.join('_');
}
