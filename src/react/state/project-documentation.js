const text = value => typeof value === 'string' ? value.trim().slice(0, 2000) : '';
export function normalizeDocumentation(value = {}) {
  const records = list => Array.isArray(list) ? list.filter(r => r && typeof r === 'object' && !Array.isArray(r)).map(r => ({key:text(r.key), revision:text(r.revision), evidence:text(r.evidence), reviewer:text(r.reviewer), note:text(r.note)})) : [];
  return {
    projectNumber:text(value?.projectNumber), note:text(value?.note),
    confirmations:records(value?.confirmations), resolutions:records(value?.resolutions),
    // Archives are not migrated/recalculated with the live project. Integrity is
    // verified before display/export; status in an imported file is not trusted.
    releases:Array.isArray(value?.releases) ? value.releases.filter(r => r?.format === 'eft-document-archive' && r.schemaVersion === 1 && typeof r.data === 'string' && r.data.length <= 20000000 && typeof r.digest === 'string').map(r => ({...r, date:text(r.date), revision:text(r.revision), projectNumber:text(r.projectNumber), number:Number.isSafeInteger(r.number)&&r.number>0?r.number:0})) : [],
  };
}
