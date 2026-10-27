import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { buildCommercialScope } from '../src/react/calculations/commercial-scope.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { mauerlatProfile } from '../src/react/calculations/roof-wall-plate.js';

test('cold flat roof has a lower chord and vertical posts at no more than one metre', () => {
  const project = createDefaultProject();
  project.settings.roof.shape = 'flat';
  project.settings.roof.type = 'cold';
  const calculation = calculateProject(project);
  const roofDescription = buildCommercialScope(project, calculation).find(section => section.key === 'roof');
  assert.match(roofDescription.details, /нижний пояс и стойки через 1 м/);
  assert.match(roofDescription.details, /в цену не включены/);
  assert.doesNotMatch(roofDescription.details, /висячая система|конёк включён/);
  const report = calculateProductionCutting(project, calculation);
  const frame = report.assembly.flatFrame;
  const chords = report.assembly.roofTimbers.filter(item => item.roofMemberKind === 'flat-frame-chord');
  const posts = report.assembly.roofTimbers.filter(item => item.roofMemberKind === 'flat-frame-post');
  assert.equal(frame.rafterCount, report.assembly.rafters.length);
  assert.equal(chords.length, frame.chordCount);
  assert.equal(posts.length, frame.postCount);
  assert.ok(chords.length >= frame.rafterCount);
  assert.ok(posts.length > frame.rafterCount);
  assert.ok(posts.every(item => item.worldA[0] === item.worldB[0] && item.worldA[1] === item.worldB[1] && item.worldB[2] > item.worldA[2]));
  assert.ok(chords.every(item => item.length + report.settings.endAllowanceMm * 2 <= report.settings.stockLengthMm));
  const oneRafter = report.assembly.rafters[0];
  const stations = posts.filter(item => item.id.startsWith(`${oneRafter.id}-`)).map(item => Math.hypot(item.worldA[0] - oneRafter.worldA[0], item.worldA[1] - oneRafter.worldA[1]));
  assert.ok(stations.every((distance, index) => index === 0 || distance - stations[index - 1] <= 1000.01));
  assert.ok(report.members.some(item => item.roofMemberKind === 'flat-frame-post'));
  assert.ok(report.assembly.issues.some(message => message.includes('несущая способность не подтверждены')));
  project.settings.roof.flatFrameDepthMm = 450;
  const changed = calculateProject(project);
  assert.equal(changed.totals.total, calculation.totals.total, 'unverified geometric members do not silently change prices');
  const taller = calculateProductionCutting(project, changed);
  assert.ok(taller.assembly.roofTimbers.find(item => item.id === chords[0].id).worldA[2] < chords[0].worldA[2]);
});

test('SIP and tapered roofs without structural rafters do not invent a flat timber frame', () => {
  for (const type of ['sip', 'cold']) {
    const project = createDefaultProject();
    project.settings.roof.shape = 'flat';
    project.settings.roof.type = type;
    project.settings.roof.flatSlopeMode = 'tapered';
    project.settings.productionCutting.roofDesign.enabled = true;
    const report = calculateProductionCutting(project, calculateProject(project));
    assert.equal(report.assembly.roofTimbers.filter(item => item.roofMemberKind?.startsWith('flat-frame')).length, 0);
  }
});

test('older projects receive an editable flat frame depth without losing their roof settings', () => {
  const original = createDefaultProject();
  delete original.settings.roof.flatFrameDepthMm;
  const restored = migrateProject(JSON.parse(JSON.stringify(original)));
  assert.equal(restored.settings.roof.flatFrameDepthMm, 300);
  assert.equal(restored.settings.roof.shape, original.settings.roof.shape);
});

test('flat cold roof slope modes place their load-bearing members in the right sequence', () => {
  for (const mode of ['none', 'structural', 'tapered']) {
    const project = createDefaultProject();
    Object.assign(project.settings.roof, { shape: 'flat', type: 'cold', flatSlopeMode: mode, flatSlopePercent: 5 });
    const calculation = calculateProject(project);
    const report = calculateProductionCutting(project, calculation);
    const rafters = report.assembly.rafters;
    const bearing = rafters.filter(item => item.bearingStatus === 'geometry-only');
    if(mode !== 'tapered') assert.ok(bearing.length >= rafters.length - 2, `${mode}: rafters inside the wall plate must meet it`);
    assert.ok(bearing.every(item => item.bearingPoint && item.bearingNotchMm <= 50));
    const wallReview = report.assembly.roofModel.issues.filter(item => item.code === 'ROOF_WALL_ALIGNMENT');
    if (mode === 'structural') {
      assert.match(wallReview[0]?.message || '', /SIP-панели подрезаны/);
      assert.equal(report.assembly.flatFrame, undefined);
      assert.ok(report.assembly.roofTimbers.some(item => item.name === 'Мауэрлат' && item.worldA[2] !== item.worldB[2]));
    }
    else assert.equal(wallReview.length, 0);
    if (mode === 'tapered') {
      assert.ok(rafters.every(item => Math.abs(item.worldA[2] - item.worldB[2]) > 0.01));
      assert.ok(rafters.every(item => item.lowerChordJoinAngleDeg > 0 && ['A','B'].includes(item.lowerChordJoinEnd)));
      assert.ok(report.assembly.roofModel.faces[0].slopePercent > 0);
      const chords = report.assembly.roofTimbers.filter(item => item.roofMemberKind === 'flat-frame-chord');
      const plate = report.assembly.roofTimbers.find(item => item.name === 'Мауэрлат');
      assert.ok(chords.length > 0);
      assert.ok(chords.some(item => item.bearingStatus === 'geometry-only'));
      assert.ok(chords.every(item => Math.abs(item.worldA[2] - Number(item.profile.split('×')[1]) / 2 - plate.plateTopZ) < 1));
    }
    assert.equal(calculateProject(project).totals.total, calculation.totals.total);
  }
});

test('structural wall slope tilts the SIP ceiling under the mauerlat', () => {
  const project = createDefaultProject();
  Object.assign(project.settings.roof, {shape:'flat',type:'cold',flatSlopeMode:'structural',flatSlopePercent:5,flatSlopeDirection:'back'});
  const calculation = calculateProject(project), report = calculateProductionCutting(project, calculation);
  const scene = productionScene(report, project);
  const ceiling = report.surfaces.find(surface => surface.id === 'Э1-ПТ');
  const placement = scene.placements.get(ceiling.id);
  assert.ok(placement.u[2] !== 0 || placement.v[2] !== 0);
  const plate = report.assembly.roofTimbers.find(item => item.name === 'Мауэрлат' && item.worldA[2] !== item.worldB[2]);
  assert.ok(plate);
  for (const point of [plate.worldA, plate.worldB]) {
    const ceilingCenter = scene.world(placement, point[0], point[1])[2];
    assert.ok(Math.abs(point[2] - mauerlatProfile(project.settings.roof).heightMm / 2 - ceilingCenter - ceiling.thickness / 2) < 1);
  }
});
