import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';

const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]];
const project = (shape, type = 'cold', points = L) => {
  const p = createDefaultProject();
  p.plan.house = { w: 10, h: 8, points: points.map(([x, y]) => ({ x, y })) };
  p.plan.rooms = [];
  p.plan.openings = [];
  p.plan.platforms = [];
  p.settings.roof.shape = shape;
  p.settings.roof.type = type;
  p.settings.roof.eaveOverhang = 0;
  p.settings.roof.gableOverhang = 0;
  p.settings.roof.flatSlopeMode = 'structural';
  p.settings.roof.flatSlopePercent = 5;
  return p;
};
const run = p => {
  const calculation = calculateProject(p);
  return { calculation, report: calculateProductionCutting(p, calculation) };
};

for (const type of ['cold', 'sip']) test(`L-shaped flat ${type} roof follows contour in estimate, cutting and 3D`, () => {
  const { calculation, report } = run(project('flat', type));
  const model = report.assembly.roofModel;
  assert.equal(model.faces.length, 1);
  assert.equal(model.faces[0].vertices.length, 6);
  assert.ok(Math.abs(model.mainArea - 56 * Math.hypot(1, .05)) < .001);
  assert.ok(Math.abs(model.mainArea - calculation.roof.geometry.totalSlopeArea) < .01);
  assert.equal(model.issues.some(issue => ['ROOF_FORM', 'ROOF_GAP', 'ROOF_AREA'].includes(issue.code)), false);
  assert.equal(report.assembly.usesRoofPlanes, true);
  if (type === 'cold') assert.ok(report.assembly.rafters.length > 0);
  else assert.ok(report.surfaces.some(surface => surface.roofFaceId === model.faces[0].id));
});

test('flat roof overhang and drainage direction preserve concave footprint', () => {
  const p = project('flat', 'sip');
  p.settings.roof.eaveOverhang = .3;
  p.settings.roof.gableOverhang = .5;
  p.settings.roof.flatSlopeDirection = 'left';
  const { calculation, report } = run(p);
  const face = report.assembly.roofModel.faces[0];
  assert.equal(face.vertices.length, 6);
  assert.ok(face.vertices.every(vertex => Number.isFinite(vertex[2])));
  assert.ok(Math.abs(face.area - calculation.roof.geometry.totalSlopeArea) < .01);
  assert.equal(report.assembly.roofModel.issues.some(issue => issue.code === 'ROOF_GAP'), false);
});

for (const type of ['cold', 'sip']) test(`L-shaped tiered ${type} roof covers both levels`, () => {
  const { calculation, report } = run(project('tiered', type));
  const model = report.assembly.roofModel;
  assert.equal(model.faces.length, 2);
  assert.equal(model.issues.some(issue => ['ROOF_FORM', 'ROOF_GAP', 'ROOF_AREA'].includes(issue.code)), false);
  assert.ok(Math.abs(model.mainArea - calculation.roof.geometry.totalSlopeArea) < .01);
  assert.equal(report.assembly.usesRoofPlanes, true);
  if (type === 'cold') assert.ok(report.assembly.rafters.length > 0);
  else assert.equal(report.surfaces.filter(surface => surface.roofFaceId).length, 2);
});

for (const shape of ['gable', 'hip']) test(`existing L-shaped ${shape} remains drawn`, () => {
  const { calculation, report } = run(project(shape));
  assert.ok(report.assembly.roofModel.faces.length >= 6);
  assert.ok(report.assembly.rafters.length > 0);
  assert.equal(report.assembly.roofModel.issues.some(issue => issue.code === 'ROOF_GAP'), false);
  assert.ok(Math.abs(report.assembly.roofModel.mainArea - calculation.roof.geometry.totalSlopeArea) < .01);
});

test('U-shaped flat roof is one continuous concave surface', () => {
  const U = [[0, 0], [10, 0], [10, 8], [7, 8], [7, 3], [3, 3], [3, 8], [0, 8]];
  const { calculation, report } = run(project('flat', 'sip', U));
  assert.equal(report.assembly.roofModel.faces.length, 1);
  assert.equal(report.assembly.roofModel.faces[0].vertices.length, 8);
  assert.ok(Math.abs(report.assembly.roofModel.mainArea - calculation.roof.geometry.totalSlopeArea) < .01);
});

test('U-shaped tiered roof splits disconnected wings without gaps', () => {
  const U = [[0, 0], [10, 0], [10, 8], [7, 8], [7, 3], [3, 3], [3, 8], [0, 8]];
  const p = project('tiered', 'cold', U);
  p.settings.roof.tiered.upperSide = 'second';
  const { calculation, report } = run(p);
  assert.ok(report.assembly.roofModel.faces.length >= 3);
  assert.ok(Math.abs(report.assembly.roofModel.mainArea - calculation.roof.geometry.totalSlopeArea) < .01);
  assert.equal(report.assembly.roofModel.issues.some(issue => issue.code === 'ROOF_GAP'), false);
});
