import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMonoRoofReactions,
  collectStructuralRequirements,
  preliminaryTimberHeader,
} from '../src/react/calculations/eft-structural-engine.js';
import { calculateStructuralEngineReport } from '../src/react/calculations/structural-engine-adapter.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

function monoRoofProject() {
  const project = createDefaultProject();
  project.plan.house = { ...project.plan.house, w: 8, h: 12, points: [], contourDefined: true };
  project.meta.floors = 1;
  project.settings.roof.shape = 'flat';
  project.settings.roof.flatSlopeMode = 'structural';
  project.settings.roof.flatSlopeDirection = 'right';
  project.settings.roof.flatSlopePercent = 10;
  project.settings.productionCutting.roofSupports = [];
  Object.assign(project.settings.structuralEngine, {
    enabled: true,
    inputsConfirmed: true,
    loadCaseName: 'Испытательный случай',
    deadLoadKPa: 0.5,
    snowLoadKPa: 1,
    windVerticalKPa: 0,
  });
  return project;
}

test('two supports split a uniform downward roof load', () => {
  const result = calculateMonoRoofReactions({ runM: 8, lengthM: 12, deadLoadKPa: 0.5, snowLoadKPa: 1 });
  close(result.checks.overallLoadKN, 144);
  close(result.supports[0].reactionKN, 72);
  close(result.supports[1].lineLoadKNperM, 6);
});

test('sloped dead load is converted to horizontal projection', () => {
  const result = calculateMonoRoofReactions({ runM: 8, lengthM: 12, riseM: 0.8, deadLoadKPa: 1, deadLoadBasis: 'slope' });
  close(result.roofAreaM2, 12 * Math.hypot(8, 0.8));
  close(result.checks.overallLoadKN, result.roofAreaM2);
});

test('uplift remains signed and unsupported schemes fail closed', () => {
  const result = calculateMonoRoofReactions({ runM: 8, lengthM: 12, deadLoadKPa: 0.3, windVerticalKPa: -1 });
  assert.ok(result.supports[0].reactionKN < 0);
  assert.match(result.warnings.join(' '), /uplift/i);
  assert.throws(() => calculateMonoRoofReactions({ runM: 8, lengthM: 12, deadLoadKPa: 0.5, supportScheme: 'three-supports' }));
  assert.throws(() => calculateMonoRoofReactions({ lengthM: 12, deadLoadKPa: 0.5 }));
});

test('header screening uses supplied strengths and never claims structural verification', () => {
  const result = preliminaryTimberHeader({
    clearOpeningM: 3.5,
    bearingLeftM: 0.15,
    bearingRightM: 0.15,
    boardCount: 3,
    boardThicknessMM: 50,
    boardDepthMM: 150,
    lineLoadKNperM: 2,
    designBendingMPa: 15,
    designShearMPa: 2,
    elasticModulusMPa: 11000,
  });
  close(result.spanM, 3.65);
  close(result.demand.momentKNm, 2 * 3.65 ** 2 / 8);
  assert.equal(result.structuralVerified, false);
  assert.notEqual(result.preliminarySectionScreen, 'APPROVED');
  assert.throws(() => preliminaryTimberHeader({ clearOpeningM: 3.5, bearingLeftM: 0.15, bearingRightM: 0.15, lineLoadKNperM: 2 }));
});

test('requirements preserve locked partition seams and diagnose openings without mutation', () => {
  const walls = [{ id: 'W1', heightMM: 4800 }];
  const result = collectStructuralRequirements({ walls, partitionSeams: [{ wallId: 'W1', positionMM: 1200 }], openings: [{ id: 'G1', wallId: 'W1', widthMM: 3500 }] });
  assert.ok(result.requirements.some(item => item.kind === 'mandatory-partition-spline' && item.locked));
  assert.ok(result.requirements.some(item => item.kind === 'opening-header-check'));
  assert.ok(result.issues.some(item => item.code === 'TALL_WALL_REQUIRES_REVIEW'));
  assert.deepEqual(walls, [{ id: 'W1', heightMM: 4800 }]);
});

test('adapter maps the 8x12 mono roof to two concrete exterior wall segments', () => {
  const project = monoRoofProject();
  const report = calculateStructuralEngineReport(project, calculateProject(project));
  assert.equal(report.compatible, true);
  assert.equal(report.status, 'PRELIMINARY_UNVERIFIED');
  assert.equal(report.geometry.runM, 8);
  assert.equal(report.geometry.lengthM, 12);
  close(report.reaction.checks.overallLoadKN, 144);
  assert.equal(report.reaction.supports.length, 2);
  assert.ok(report.reaction.supports.every(item => item.wallId.startsWith('Э1-С')));
});

test('unconfirmed loads, gable roofs, extra supports and second floors are rejected', () => {
  const project = monoRoofProject();
  project.settings.structuralEngine.inputsConfirmed = false;
  assert.equal(calculateStructuralEngineReport(project, calculateProject(project)).reaction, null);
  project.settings.structuralEngine.inputsConfirmed = true;
  project.settings.roof.shape = 'gable';
  assert.ok(calculateStructuralEngineReport(project, calculateProject(project)).issues.some(item => item.code === 'ROOF_FORM'));
  project.settings.roof.shape = 'flat';
  project.settings.productionCutting.roofSupports = [{ id: 'P1', type: 'purlin', x1: 0, y1: 1000, z1: 3000, x2: 12000, y2: 1000, z2: 3000 }];
  assert.ok(calculateStructuralEngineReport(project, calculateProject(project)).issues.some(item => item.code === 'SUPPORT_SCHEME'));
  project.settings.productionCutting.roofSupports = [];
  project.meta.floors = 2;
  assert.ok(calculateStructuralEngineReport(project, calculateProject(project)).issues.some(item => item.code === 'FLOOR_SCOPE'));
});

test('an opening on the support wall stays unverified and uses the existing 3x50x150 package', () => {
  const project = monoRoofProject();
  project.plan.openings = [{ id: 'W1', type: 'window', outer: true, x: 0, y: 6, width: 3.5, height: 2, sillHeight: 0.3, orientation: 'v' }];
  project.settings.structuralEngine.header = {
    enabled: true,
    openingId: 'W1',
    designBendingMPa: 15,
    designShearMPa: 2,
    elasticModulusMPa: 11000,
    deflectionLimitRatio: 300,
  };
  const report = calculateStructuralEngineReport(project, calculateProject(project));
  assert.ok(report.issues.some(item => item.code === 'SUPPORT_OPENING'));
  assert.equal(report.headerScreen.sectionMM.width, 150);
  assert.equal(report.headerScreen.sectionMM.depth, 150);
  assert.equal(report.headerScreen.structuralVerified, false);
});

test('enabling structural diagnostics changes neither estimate nor cutting', () => {
  const project = monoRoofProject();
  project.settings.structuralEngine.enabled = false;
  const beforeCalculation = calculateProject(project);
  const beforeCutting = calculateProductionCutting(project, beforeCalculation);
  const beforeTotal = beforeCalculation.totals.total;
  const beforeParts = beforeCutting.parts.map(item => [item.id, item.width, item.height]);
  project.settings.structuralEngine.enabled = true;
  const afterCalculation = calculateProject(project);
  const afterCutting = calculateProductionCutting(project, afterCalculation);
  assert.equal(afterCalculation.totals.total, beforeTotal);
  assert.deepEqual(afterCutting.parts.map(item => [item.id, item.width, item.height]), beforeParts);
});

test('old projects get a disabled engine and user inputs survive JSON reopen', () => {
  const legacy = createDefaultProject();
  delete legacy.settings.structuralEngine;
  assert.equal(migrateProject(JSON.parse(JSON.stringify(legacy))).settings.structuralEngine.enabled, false);
  const project = monoRoofProject();
  project.settings.structuralEngine.gammaSnow = 1.4;
  const restored = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.settings.structuralEngine.enabled, true);
  assert.equal(restored.settings.structuralEngine.gammaSnow, 1.4);
  assert.equal(restored.settings.structuralEngine.inputsConfirmed, true);
});
