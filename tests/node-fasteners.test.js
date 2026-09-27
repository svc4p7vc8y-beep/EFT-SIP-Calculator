import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { applyPlanTransfer, createPlanTransfer } from '../src/react/storage/plan-transfer.js';
import { normalizeNodeTypeRules } from '../src/react/cloud/node-type-rules.js';
import { nodeRuleKey } from '../src/react/cloud/node-rule-scope.js';

test('aggregate markers use representative physical joints without changing estimate quantities', () => {
  const project = createDefaultProject();
  const result = calculateProject(project);
  const nodes = result.nodeFasteners.nodes;
  const floorSeam = nodes.find(node => node.id === 'node-1-floor-splines');
  const floorEdge = nodes.find(node => node.id === 'node-1-floor-edges');
  const ceilingSeam = nodes.find(node => node.id === 'node-1-ceiling-splines');
  const wallSeam = nodes.find(node => node.id === 'node-1-walls-splines');
  const roofEave = nodes.find(node => node.type === 'RAFTER_TO_MAUERLAT');
  const roofRidge = nodes.find(node => node.type === 'RAFTER_TO_RIDGE');
  assert.ok(floorSeam && floorEdge && ceilingSeam && wallSeam && roofEave && roofRidge);
  assert.notDeepEqual([floorSeam.x, floorSeam.y], [floorEdge.x, floorEdge.y]);
  assert.notDeepEqual([roofEave.x, roofEave.y], [roofRidge.x, roofRidge.y]);
  assert.equal(wallSeam.y, floorEdge.y);
  const saved = structuredClone(project);
  saved.nodes = [{ id: floorSeam.id, type: floorSeam.type, xOverride: 3.1, yOverride: 4.2 }];
  const changed = calculateProject(saved);
  const moved = changed.nodeFasteners.nodes.find(node => node.id === floorSeam.id);
  assert.deepEqual([moved.x, moved.y], [3.1, 4.2]);
  assert.equal(moved.calculatedQty, floorSeam.calculatedQty);
  assert.equal(changed.totals.total, result.totals.total);
});

test('shared fastener rule applies across projects while an explicit project override wins', () => {
  const first = createDefaultProject();
  const second = createDefaultProject();
  const baseline = calculateProject(first);
  const target = baseline.nodeFasteners.nodes.find(node => node.type === 'PILE_BINDING');
  assert.ok(target && !target.fastener?.size);
  const rules = normalizeNodeTypeRules({ PILE_BINDING: { fastener: { type: 'lag-screw', size: '8x120' }, note: 'Решение конструктора КР-1' } });
  const firstReport = calculateProject(first, { nodeTypeRules: rules });
  const secondReport = calculateProject(second, { nodeTypeRules: rules });
  assert.equal(firstReport.nodeFasteners.nodes.find(node => node.id === target.id).fastener.size, '8×120');
  assert.equal(secondReport.nodeFasteners.nodes.find(node => node.id === target.id).fastenerScope, 'shared');
  assert.ok(firstReport.nodeFasteners.purchase.some(row => row.fastenerType === 'lag-screw' && row.size === '8×120'));
  assert.equal(firstReport.totals.total, baseline.totals.total);
  first.nodes.push({ id: target.id, type: target.type, fastenerOverride: { type: 'lag-screw', size: '10×140', lengthMm: 140 } });
  const overridden = calculateProject(first, { nodeTypeRules: rules }).nodeFasteners.nodes.find(node => node.id === target.id);
  assert.equal(overridden.fastener.size, '10×140');
  assert.equal(overridden.fastenerScope, 'project');
});

test('shared rule normalization rejects unknown nodes and malformed records', () => {
  assert.deepEqual(normalizeNodeTypeRules({ UNKNOWN: { fastener: { type: 'nail', size: '4×80' } }, PILE_BINDING: { fastener: {} } }), {});
  assert.deepEqual(normalizeNodeTypeRules([]), {});
});

test('changing panel thickness in a node card updates its derived fastener size', () => {
  const project = createDefaultProject();
  project.settings.sip.wallThickness = '174';
  const baseline = calculateProject(project).nodeFasteners.nodes.find(node => node.type === 'SIP_WALL_CORNER');
  assert.equal(baseline.fastener.size, '8×220');
  project.nodes.push({ id: baseline.id, type: baseline.type, panelThicknessOverride: 224 });
  const edited = calculateProject(project).nodeFasteners.nodes.find(node => node.id === baseline.id);
  assert.equal(edited.fastener.size, '8×280');
});

test('shared SIP rules are scoped to panel thickness across projects', () => {
  const thin = createDefaultProject();
  const thick = createDefaultProject();
  thin.settings.sip.wallThickness = '124';
  thick.settings.sip.wallThickness = '224';
  const thinNode = calculateProject(thin).nodeFasteners.nodes.find(node => node.type === 'SIP_WALL_CORNER');
  const thickNode = calculateProject(thick).nodeFasteners.nodes.find(node => node.type === 'SIP_WALL_CORNER');
  assert.equal(nodeRuleKey(thinNode), 'SIP_WALL_CORNER__124');
  assert.equal(nodeRuleKey(thickNode), 'SIP_WALL_CORNER__224');
  const rules = normalizeNodeTypeRules({ SIP_WALL_CORNER__124: { fastener: { type: 'structural-screw', size: '8×200' }, note: 'КР-2' } });
  assert.equal(calculateProject(thin, { nodeTypeRules: rules }).nodeFasteners.nodes.find(node => node.id === thinNode.id).fastener.size, '8×200');
  assert.equal(calculateProject(thick, { nodeTypeRules: rules }).nodeFasteners.nodes.find(node => node.id === thickNode.id).fastener.size, thickNode.fastener.size);
});

test('EFT node library has unique manufacturer-independent rules and traceable sources', async () => {
  const library = JSON.parse(await readFile(new URL('../EFT_NODE_LIBRARY.json', import.meta.url), 'utf8'));
  const codes = library.nodes.map((node) => node.code);
  assert.equal(library.manufacturerIndependent, true);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of ['SIP_SPLINE', 'SIP_EDGE_BOARD', 'SIP_START_BOARD_THROUGH_224', 'SIP_WALL_CORNER', 'SIP_WALL_T', 'SIP_FLOOR_SUPPORT', 'SIP_FLOOR_SUPPORT_BOARD', 'SIP_CEILING_SUPPORT', 'SIP_CEILING_SUPPORT_BOARD', 'BINDING_BOARD_PACK', 'MAUERLAT', 'RAFTER_TO_MAUERLAT', 'RAFTER_TO_RIDGE', 'ROOF_LATH', 'ROOF_COUNTERLATH', 'TERRACE_LEDGER', 'PORCH_FRAME']) {
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
  assert.equal(result.nodeFasteners.rows.some((row) => row.type === 'SIP_FLOOR_SUPPORT' && row.size === '8×320'), false);
  const floorSupport = result.nodeFasteners.rows.find((row) => row.type === 'SIP_FLOOR_SUPPORT_BOARD');
  assert.equal(floorSupport.size, '6×120');
  assert.ok(floorSupport.calculatedQty > 0);
});

test('three-board binding counts editable 6x120 assembly screws in nodes and estimate', () => {
  const project = createDefaultProject();
  project.settings.piles.bindingLayers = 3;
  project.settings.formulas.bindingPackScrewSpacingM = 0.5;
  const result = calculateProject(project);
  const row = result.nodeFasteners.rows.find((item) => item.type === 'BINDING_BOARD_PACK');
  const expected = Math.ceil(result.foundation.bindingLength / 0.5) * 2;
  assert.equal(row.size, '6×120');
  assert.equal(row.calculatedQty, expected);
  const estimate = result.lines.find((line) => line.id === 'foundation:binding-screws');
  assert.ok(Math.abs(estimate.qty - expected * project.settings.formulas.sipUniversalScrewKgEach) < 1e-9);
  assert.match(estimate.name, new RegExp(`${expected} шт`));
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
  assert.equal(starter.kgEach, project.settings.formulas.sipStructuralScrewKg320);
  assert.equal(starter.purchaseKg, starter.purchaseQty * starter.kgEach);
  assert.ok(report.purchase.some((item) => item.size === '8×320'));
  assert.ok(report.withoutSize.some((item) => item.type === 'PILE_BINDING' && item.calculatedQty > 0));
  assert.ok(report.withoutSize.every((item) => item.size === '—' && item.calculatedQty > 0));
});

test('T junctions use 6x120 while unknown terrace and counterlath rules stay under review', () => {
  const project = createDefaultProject();
  project.settings.sip.partitionType = 'sip';
  project.settings.roof.showCounterLath = true;
  const report = calculateProject(project).nodeFasteners;
  const tNodes = report.nodes.filter((node) => node.type === 'SIP_WALL_T');
  assert.ok(tNodes.length > 0);
  assert.ok(tNodes.every((node) => node.fastener.size === '6×120' && node.calculatedQty === project.settings.formulas.sipUniversalScrewsPerTNode));
  assert.ok(tNodes.every((node) => node.fastener.kgEach === project.settings.formulas.sipUniversalScrewKgEach));
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

test('all editable node fields survive shared project migration', () => {
  const source = createDefaultProject();
  const initial = calculateProject(source).nodeFasteners.nodes.find((node) => node.type === 'SIP_FLOOR_SUPPORT_BOARD');
  source.nodes = [{
    id: initial.id,
    type: initial.type,
    source: 'auto',
    nameOverride: 'Опорный брус по КР-7',
    sectionOverride: 'Спецузлы',
    markerOverride: 'КР',
    floorOverride: 2,
    xOverride: 1.25,
    yOverride: 2.5,
    lengthOverride: 12.4,
    nodeCountOverride: 7,
    panelThicknessOverride: 224,
    calculatedQtyOverride: 44,
    spacingOverride: 0.4,
    qtyPerNodeOverride: 3,
    reservePercent: 12,
    packSize: 50,
    formulaOverride: '44 шт по КР-7',
    fastenerOverride: { type: 'structural-screw', size: '6×140', diameterMm: 6, lengthMm: 140, kgEach: 0.024 },
    requiresEngineeringReview: false,
  }];
  const reopened = migrateProject(JSON.parse(JSON.stringify(source)));
  const node = calculateProject(reopened).nodeFasteners.nodes.find((item) => item.id === initial.id);
  assert.equal(node.name, 'Опорный брус по КР-7');
  assert.equal(node.section, 'Спецузлы');
  assert.equal(node.marker, 'КР');
  assert.equal(node.floor, 2);
  assert.equal(node.x, 1.25);
  assert.equal(node.y, 2.5);
  assert.equal(node.length, 12.4);
  assert.equal(node.nodeCount, 7);
  assert.equal(node.calculatedQty, 44);
  assert.equal(node.spacing, 0.4);
  assert.equal(node.qtyPerNode, 3);
  assert.equal(node.fastener.size, '6×140');
  assert.equal(node.fastener.kgEach, 0.024);
  assert.equal(node.formula, '44 шт по КР-7');
  assert.equal(node.requiresEngineeringReview, false);
});
