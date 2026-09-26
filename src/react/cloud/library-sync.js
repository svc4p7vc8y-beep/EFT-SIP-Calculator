function updatedAt(entry) {
  const value = entry?.updatedAt || entry?.savedAt || entry?.createdAt || "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function mergeLibraryEntries(localEntries = [], remoteEntries = [], baseEntries = []) {
  const merged = new Map();
  const localIds = new Set((localEntries || []).map((entry) => entry?.id));
  const remoteIds = new Set((remoteEntries || []).map((entry) => entry?.id));
  const deletedIds = new Set((baseEntries || [])
    .filter((entry) => entry?.id && (!localIds.has(entry.id) || !remoteIds.has(entry.id)))
    .map((entry) => entry.id));
  for (const entry of remoteEntries || []) {
    if (entry?.id && !deletedIds.has(entry.id)) merged.set(entry.id, entry);
  }
  for (const entry of localEntries || []) {
    if (!entry?.id || deletedIds.has(entry.id)) continue;
    const remote = merged.get(entry.id);
    if (!remote || updatedAt(entry) >= updatedAt(remote)) merged.set(entry.id, entry);
  }
  return [...merged.values()].sort((left, right) => updatedAt(right) - updatedAt(left));
}
