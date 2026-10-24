import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';

test('exclusion bound to an old catalog entry cannot hide a changed estimate line', () => {
  const project = createDefaultProject();
  const baseline = calculateProject(project);
  const line = baseline.lines.find((item) => item.id === 'foundation:axes');
  project.estimateOverrides = [{ lineId: line.id, catalogId: 'LAB-OLD', excluded: true }];
  const stale = calculateProject(project);
  assert.ok(stale.lines.some((item) => item.id === line.id));
  assert.equal(stale.totals.total, baseline.totals.total);
  project.estimateOverrides[0].catalogId = line.catalogId;
  const current = calculateProject(project);
  assert.ok(!current.lines.some((item) => item.id === line.id));
  assert.equal(current.totals.total, baseline.totals.total - line.qty * line.price);
});
