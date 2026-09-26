function updatedAt(entry) {
  const value = entry?.updatedAt || entry?.savedAt || entry?.createdAt || "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function mergeLibraryEntries(localEntries = [], remoteEntries = []) {
  const merged = new Map();
  for (const entry of remoteEntries || []) {
    if (entry?.id) merged.set(entry.id, entry);
  }
  for (const entry of localEntries || []) {
    if (!entry?.id) continue;
    const remote = merged.get(entry.id);
    if (!remote || updatedAt(entry) >= updatedAt(remote)) merged.set(entry.id, entry);
  }
  return [...merged.values()].sort((left, right) => updatedAt(right) - updatedAt(left));
}
