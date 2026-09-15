const KEY = 'eft-local-project-number';

// Offline numbering is browser-local; the shared workspace uses the server counter.
export async function reserveLocalProjectNumber(current, storage = localStorage, locks = globalThis.navigator?.locks) {
  const reserve = () => {
    const numeric = value => /^\d+$/.test(String(value || '')) ? Number(value) : 0;
    const next = Math.max(numeric(current), numeric(storage.getItem(KEY))) + 1;
    if (!Number.isSafeInteger(next)) throw new Error('Исчерпан диапазон номеров проектов');
    storage.setItem(KEY, String(next));
    return String(next).padStart(4, '0');
  };
  return locks ? locks.request(KEY, reserve) : reserve();
}
