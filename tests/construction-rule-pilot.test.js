import test from 'node:test';
import assert from 'node:assert/strict';
import { BINDING_STRAIGHT_SUPPORT_RULE } from '../src/react/data/construction-rules.js';
import { declaredStraightBindingJoints, evaluateBindingStraightSupport } from '../src/react/calculations/construction-rules.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { normalizeProductionCutting } from '../src/react/state/production-cutting.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { cuttingRevision } from '../src/react/calculations/production-controls.js';

const lines = [{ id: 'A', a: [0, 0], b: [3000, 0] }, { id: 'B', a: [3000, 0], b: [6000, 0] }];
const input = () => ({ enabled: true, foundationType: 'screw', bindingType: 'timber', lines: structuredClone(lines), supports: [[0, 0], [3000, 0], [6000, 0]], toleranceMm: '' });

test('rule retains verified source locator, candidate status and unconfirmed parameters', () => {
  const rule = BINDING_STRAIGHT_SUPPORT_RULE;
  assert.equal(rule.source.pdfPage, 4); assert.equal(rule.source.printedPage, null);
  assert.equal(rule.status, 'formalized-candidate');
  assert.equal(rule.parameters[0].default, null);
  assert.ok(rule.notAutomated.includes('Крепёж'));
});

test('only straight opposite endpoint junctions are selected, independent of line direction', () => {
  for (const reverse of [false, true]) {
    const selected = reverse ? lines.map(l => ({ ...l, a: l.b, b: l.a })).reverse() : lines;
    const report = declaredStraightBindingJoints(selected);
    assert.equal(report.joints.length, 1);
    assert.deepEqual(report.joints[0].point, [3000, 0]);
    assert.deepEqual(report.joints[0].lineIds.toSorted(), ['A', 'B']);
  }
  const diagonal = [{ id: 'a', a: [0, 0], b: [1000, 1000] }, { id: 'b', a: [1000, 1000], b: [2000, 2000] }];
  assert.equal(declaredStraightBindingJoints(diagonal).joints.length, 1);
});

test('corners, T junctions, crossings and excluded lines are not certified as straight joints', () => {
  const corner = [{ id: 'a', a: [0, 0], b: [1000, 0] }, { id: 'b', a: [1000, 0], b: [1000, 1000] }];
  assert.equal(declaredStraightBindingJoints(corner).outsideScopeJunctions, 1);
  assert.equal(declaredStraightBindingJoints([...lines, { id: 'T', a: [3000, 0], b: [3000, 1000] }]).joints.length, 0);
  assert.equal(declaredStraightBindingJoints([lines[0], { ...lines[1], include: false }]).joints.length, 0);
  assert.equal(declaredStraightBindingJoints([{ id: 'a', a: [0, 0], b: [6000, 0] }, { id: 'b', a: [3000, -1000], b: [3000, 1000] }]).joints.length, 0);
});

test('missing deviation stays unconfirmed even when joint and pile centres coincide', () => {
  const result = evaluateBindingStraightSupport(input());
  assert.equal(result.status, 'needs-project-parameter');
  assert.equal(result.toleranceMm, null);
  assert.equal(result.checks[0].distanceMm, 0);
  assert.equal(result.engineeringVerified, false);
});

test('project zero means exact position; moving a pile changes diagnosis without moving the joint', () => {
  const options = input(); options.toleranceMm = 0;
  assert.equal(evaluateBindingStraightSupport(options).status, 'geometry-checked');
  options.supports[1] = [3030, 0];
  const before = structuredClone(options), result = evaluateBindingStraightSupport(options);
  assert.equal(result.status, 'geometry-conflict');
  assert.equal(result.checks[0].distanceMm, 30);
  assert.equal(result.checks[0].status, 'outside-project-tolerance');
  assert.deepEqual(options, before);
  options.toleranceMm = 30;
  assert.equal(evaluateBindingStraightSupport(options).status, 'geometry-checked');
});

test('removing supports, invalid coordinates, wrong units and invalid tolerances do not pass', () => {
  const options = input(); options.toleranceMm = 0;
  options.supports = [];
  assert.equal(evaluateBindingStraightSupport(options).checks[0].status, 'missing-support');
  for (const tolerance of [-1, NaN, Infinity, 'abc', false, true, [], {}]) {
    assert.equal(evaluateBindingStraightSupport({ ...input(), toleranceMm: tolerance }).status, 'needs-data');
  }
  assert.equal(evaluateBindingStraightSupport({ ...input(), units: 'm' }).status, 'needs-data');
  assert.equal(evaluateBindingStraightSupport({ ...input(), supports: [[NaN, 0]], toleranceMm: 0 }).status, 'needs-data');
  assert.equal(evaluateBindingStraightSupport({ ...input(), lines: [{ id: 'bad', a: [0, 0], b: [0, 0] }] }).status, 'needs-data');
});

test('scope excludes board packages, blocks, prepared concrete and disabled foundations', () => {
  for (const patch of [{ bindingType: 'boards' }, { foundationType: 'concreteBlock' }, { foundationType: 'preparedConcrete' }, { enabled: false }]) {
    assert.equal(evaluateBindingStraightSupport({ ...input(), ...patch }).status, 'not-applicable');
  }
  assert.equal(evaluateBindingStraightSupport({ ...input(), foundationType: 'reinforcedConcrete', toleranceMm: 0 }).status, 'geometry-checked');
});

test('no declared joints is incomplete coverage, not automatic success or a stock-length splice', () => {
  const result = evaluateBindingStraightSupport({ ...input(), lines: [{ id: 'long', a: [0, 0], b: [12000, 0] }], toleranceMm: 0 });
  assert.equal(result.status, 'no-declared-joints');
  assert.equal(result.checks.length, 0);
  assert.equal(result.engineeringVerified, false);
});

test('old projects retain blank parameter; explicit zero and manual deviation survive JSON migration', () => {
  assert.equal(normalizeProductionCutting().bindingJointToleranceMm, '');
  assert.equal(normalizeProductionCutting({ bindingJointToleranceMm: false }).bindingJointToleranceMm, 'Некорректный тип параметра');
  for (const value of ['', 0, 15.5]) {
    const p = createDefaultProject(); p.settings.productionCutting.bindingJointToleranceMm = value;
    assert.equal(migrateProject(JSON.parse(JSON.stringify(p))).settings.productionCutting.bindingJointToleranceMm, value);
  }
});

test('production report evaluates actual binding endpoints and preserves material, price and plan', () => {
  const p = createDefaultProject();
  p.services.foundation = true; p.settings.piles.bindingType = 'timber';
  Object.assign(p.plan, { house: { w: 6, h: 3, contourDefined: true }, rooms: [], walls: [], openings: [], wallGaps: [], platforms: [], pileRows: [],
    piles: [{ id: 'left', x: 0, y: 0 }, { id: 'middle', x: 3, y: 0 }, { id: 'right', x: 6, y: 0 }],
    bindingLines: [{ id: 'a', x1: 0, y1: 0, x2: 3, y2: 0 }, { id: 'b', x1: 3, y1: 0, x2: 6, y2: 0 }] });
  Object.assign(p.settings.productionCutting, { kerfMm: 3, endAllowanceMm: 0 });
  const first = calculateProject(p), report = calculateProductionCutting(p, first), plan = structuredClone(p.plan);
  assert.equal(report.constructionRuleChecks.bindingStraightSupport.status, 'needs-project-parameter');
  p.settings.productionCutting.bindingJointToleranceMm = 0;
  const next = calculateProject(p), checked = calculateProductionCutting(p, next);
  assert.equal(checked.constructionRuleChecks.bindingStraightSupport.status, 'geometry-checked');
  assert.deepEqual(checked.members, report.members);
  assert.deepEqual(next.lines, first.lines);
  assert.deepEqual(next.totals, first.totals);
  assert.deepEqual(p.plan, plan);
});

test('blank diagnostic parameter retains current model revision; v211 aligned gables and braces require fresh review', () => {
  const p = createDefaultProject();
  Object.assign(p.settings.productionCutting, { kerfMm: 3, endAllowanceMm: 0 });
  const calculation = calculateProject(p), report = calculateProductionCutting(p, calculation);
  const { approval, ...oldSettings } = report.settings;
  delete oldSettings.bindingJointToleranceMm;
  delete oldSettings.ceilingMaxSpanMm; // v207 unset project-only diagnostic parameter.
  delete oldSettings.markRegistry; // v199 did not contain derived mark metadata.
  delete oldSettings.constructionSources;
  delete oldSettings.sourceBaseline; // Explicit comparison metadata was also absent in v199.
  const oldRevision = cuttingRevision({ plans: calculation.metrics.floorPlans.map(f => f.plan), sip: p.settings.sip,
    services: p.services, formulas: p.settings.formulas, roof: p.settings.roof, settings: oldSettings,
    nodes: p.nodes, construction: p.construction, estimate: calculation.lines, reviewer: approval.reviewer || '', nodeRef: approval.nodeRef || '' });
  assert.notEqual(report.revision, oldRevision); // v209 changes fabrication lengths, invalidating older approvals.
  const currentRevision = cuttingRevision({ fabricationModel:211, plans: calculation.metrics.floorPlans.map(f => f.plan), sip: p.settings.sip,
    services:p.services, formulas:p.settings.formulas, roof:p.settings.roof, settings:oldSettings,
    nodes:p.nodes, construction:p.construction, estimate:calculation.lines, reviewer:approval.reviewer||'', nodeRef:approval.nodeRef||'' });
  assert.equal(report.revision,currentRevision);
  p.settings.productionCutting.bindingJointToleranceMm = 0;
  assert.notEqual(calculateProductionCutting(p, calculation).revision, currentRevision);
});
