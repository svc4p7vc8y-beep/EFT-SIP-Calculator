import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { applyPlanTransfer, createPlanTransfer } from '../src/react/storage/plan-transfer.js';

test('EFT node library has unique manufacturer-independent rules and traceable sources', async () => {
  const library = JSON.parse(await readFile(new URL('../EFT_NODE_LIBRARY.json', import.meta.url), 'utf8'));
  const codes = library.nodes.map((node) => node.code);
  assert.equal(library.manufacturerIndependent, true);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of ['SIP_SPLINE', 'SIP_EDGE_BOARD', 'SIP_START_BOARD_THROUGH_224', 'SIP_WALL_CORNER', 'SIP_WALL_T', 'SIP_FLOOR_SUPPORT', 'SIP_CEILING_SUPPORT', 'MAUERLAT', 'RAFTER_TO_MAUERLAT', 'RAFTER_TO_RIDGE', 'ROOF_LATH', 'ROOF_COUNTERLATH', 'TERRACE_LEDGER', 'PORCH_FRAME']) {
    const node = library.nodes.find((item) => item.code === code);
    assert.ok(node, `${code} is present`);
    assert.ok(node.source?.type, `${code} has a source status`);
    assert.equal(typeof node.requiresEngineeringReview, 'boolean');
  }
});

test('224 mm floor separates 8x320 starter fasteners from 8x220 wall fasteners', () => {
  const project = createDefaultProject();
  project.settings.sip.floorThickness = '224';
  project.settings.sip.wallThickness = '174';
  const result = calculateProject(project);
  const starter = result.nodeFasteners.rows.find((row) => row.type === 'SIP_START_BOARD_THROUGH_224');
  const wall = result.nodeFasteners.rows.find((row) => row.type === 'SIP_TOP_BOARD');
  assert.equal(starter.size, '8×320');
  assert.equal(wall.size, '8×220');
  assert.ok(starter.calculatedQty > 0);
  assert.ok(result.lines.some((line) => line.id.startsWith('sip:fasteners-walls-') && line.name.includes('8×320')));
  assert.ok(result.lines.some((line) => line.id === 'sip:fasteners-walls' && line.name.includes('8×220')));
});

test('node report exposes geometry formulas, reserve and a consolidated purchase order', () => {
  const project = createDefaultProject();
  project.settings.nodeFasteners.reservePercent = 10;
  project.settings.nodeFasteners.packSizes = { '8×320': 50 };
  const report = calculateProject(project).nodeFasteners;
  assert.equal(report.mode, 'node');
  assert.equal(report.stats.SIP_WALL_CORNER, 4);
  assert.ok(report.nodes.every((node) => node.id && node.type && node.formula));
  const starter = report.rows.find((row) => row.type === 'SIP_START_BOARD_THROUGH_224');
  assert.equal(starter.withReserve, Math.ceil(starter.calculatedQty * 1.1));
  assert.equal(starter.purchasePacks, Math.ceil(starter.withReserve / 50));
  assert.equal(starter.purchaseQty, starter.purchasePacks * 50);
  assert.ok(report.purchase.some((item) => item.size === '8×320'));
});

test('T junctions use 6x120 while unknown terrace and counterlath rules stay under review', () => {
  const project = createDefaultProject();
  project.settings.sip.partitionType = 'sip';
  project.settings.roof.showCounterLath = true;
  const report = calculateProject(project).nodeFasteners;
  const tNodes = report.nodes.filter((node) => node.type === 'SIP_WALL_T');
  assert.ok(tNodes.length > 0);
  assert.ok(tNodes.every((node) => node.fastener.size === '6×120' && node.calculatedQty === project.settings.formulas.sipUniversalScrewsPerTNode));
  const counterLath = report.nodes.find((node) => node.type === 'ROOF_COUNTERLATH');
  assert.equal(counterLath.calculatedQty, 0);
  assert.equal(counterLath.requiresEngineeringReview, true);
  assert.ok(counterLath.warnings.some((warning) => warning.code === 'MISSING_FASTENER_RULE'));
});

test('insufficient manual fastener length produces an explicit model error', () => {
  const project = createDefaultProject();
  const initial = calculateProject(project).nodeFasteners.nodes.find((node) => node.type === 'SIP_START_BOARD_THROUGH_224');
  project.nodes = [{
    id: initial.id,
    type: initial.type,
    source: 'auto',
    fastenerOverride: { type: 'structural-screw', size: '8×280', diameterMm: 8, lengthMm: 280 },
  }];
  const node = calculateProject(project).nodeFasteners.nodes.find((item) => item.id === initial.id);
  assert.ok(node.warnings.some((warning) => warning.code === 'FASTENER_TOO_SHORT' && warning.severity === 'error'));
});

test('plan schema 4 round-trips construction and node overrides while schema 3 remains loadable', () => {
  const source = createDefaultProject();
  const report = calculateProject(source).nodeFasteners;
  source.construction = report.construction;
  source.nodes = [{ ...report.nodes[0], enabled: false }];
  const payload = createPlanTransfer(source);
  assert.equal(payload.schemaVersion, 4);
  const opened = applyPlanTransfer(createDefaultProject(), payload);
  assert.equal(opened.nodes[0].enabled, false);
  assert.ok(opened.construction.splines.length > 0);

  const legacy = structuredClone(payload);
  legacy.schemaVersion = 3;
  delete legacy.construction;
  delete legacy.nodes;
  const legacyOpened = applyPlanTransfer(createDefaultProject(), legacy);
  assert.deepEqual(legacyOpened.nodes, []);
  assert.deepEqual(legacyOpened.construction, {});
  assert.equal(migrateProject(legacyOpened).nodes.length, 0);
});

