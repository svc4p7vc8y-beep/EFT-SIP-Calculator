import test from "node:test";
import assert from "node:assert/strict";
import { mergeLibraryEntries } from "../src/react/cloud/library-sync.js";
import { writePlanLibrary, readPlanLibrary } from "../src/react/storage/plan-library.js";

test("conflict merge preserves deletions on either side", () => {
  const before = [{ id: "removed", savedAt: "2026-01-01" }, { id: "kept", savedAt: "2026-01-01" }];
  const changed = [{ id: "removed", savedAt: "2026-02-01" }, before[1]];
  assert.deepEqual(mergeLibraryEntries([before[1]], changed, before).map((item) => item.id), ["kept"]);
  assert.deepEqual(mergeLibraryEntries(changed, [before[1]], before).map((item) => item.id), ["kept"]);
});

test("plan library does not silently truncate a conflict merge", () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  const plans = Array.from({ length: 25 }, (_, index) => ({ id: `p-${index}`, plan: { house: {} } }));
  assert.equal(writePlanLibrary(plans, storage).length, 25);
  assert.equal(readPlanLibrary(storage).length, 25);
});

test('folder moves and trash status survive an older concurrent library revision', () => {
  const base = [{ id: 'plan-1', name: 'Дом', savedAt: '2026-01-01T00:00:00Z' }];
  const local = [{ id: 'folder-1', kind: 'folder', name: 'Заказы', updatedAt: '2026-01-02T00:00:00Z' },
    { ...base[0], folderId: 'folder-1', deletedAt: '2026-01-03T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z' }];
  const remote = [{ ...base[0], name: 'Дом заказчика', updatedAt: '2026-01-02T12:00:00Z' }];
  const merged = mergeLibraryEntries(local, remote, base);
  assert.ok(merged.some(item => item.kind === 'folder'));
  assert.equal(merged.find(item => item.id === 'plan-1').folderId, 'folder-1');
  assert.ok(merged.find(item => item.id === 'plan-1').deletedAt);
});
