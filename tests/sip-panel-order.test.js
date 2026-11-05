import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateSipOrderRow, newSipOrderPanel, SIP_ORDER_SECTION, sipOrderRates } from '../src/react/calculations/sip-panel-order.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';

test('v18 calculates a 124 mm panel from the current catalog and core dimensions', () => {
  const project = createDefaultProject();
  const result = calculateSipOrderRow(newSipOrderPanel(), sipOrderRates(project));
  assert.equal(result.skins, 2200);
  assert.equal(result.volume, 0.276);
  assert.ok(Math.abs(result.glueKg - 1.2144) < 1e-9);
  assert.equal(result.price, 6422.75);
});

test('order lines survive migration, reprice locally and stay separate from mixed house stock', () => {
  const project = createDefaultProject();
  project.settings.sip.panelStockMode = 'mixed';
  const catalog = JSON.stringify(project.priceMat);
  const baseline = calculateProject(project);
  project.sipPanelOrder.rows = [
    { ...newSipOrderPanel(), id: 'batch', qty: 2 },
    { ...newSipOrderPanel('csp3200'), id: 'batch2', core: 'wool' },
    { id: 'cut', type: 'cut', mode: 'split', split: 1, length: 2500, width: 1250, qty: 2 },
  ];
  const reopened = migrateProject(JSON.parse(JSON.stringify(project)));
  const linesOf = result => result.lines.filter(line => line.section === SIP_ORDER_SECTION);
  const result = calculateProject(reopened);
  const [panel, csp, cut] = linesOf(result);
  assert.equal(panel.qty, 2);
  assert.match(csp.name, /ЦСП.*3200 × 1250 × 120 мм/);
  assert.equal(cut.qty, 6.25);
  assert.equal(cut.price, 650);
  assert.deepEqual(result.lines.filter(line => line.section !== SIP_ORDER_SECTION), baseline.lines);
  reopened.sipPanelOrder.rates.osb2500 = 1200;
  const [repriced] = linesOf(calculateProject(reopened));
  assert.equal(repriced.price, 6689.43);
  assert.equal(JSON.stringify(reopened.priceMat), catalog);
});
