const cleanPart = value => String(value || '')
  .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
  .replace(/[.\s]+$/g, '')
  .trim()
  .replace(/\s+/g, '_')
  .slice(0, 80);

export function suggestedProjectFilename(meta = {}) {
  const name = cleanPart(meta.projectName || meta.customer || 'Проект');
  const number = cleanPart(meta.projectNum);
  const date = cleanPart(meta.date);
  return [name, number && `№${number}`, date].filter(Boolean).join('_') + '.eft.json';
}

export function normalizedProjectFilename(value, meta = {}) {
  const stem = cleanPart(String(value || '').replace(/(?:\.eft)?\.json$/i, ''));
  return (stem || suggestedProjectFilename(meta).slice(0, -'.eft.json'.length)) + '.eft.json';
}
