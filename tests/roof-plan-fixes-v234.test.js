import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { wallTopView } from '../src/react/calculations/wall-top-view.js';
import { roofLathRows } from '../src/react/calculations/roof-lathing.js';

const report = project => calculateProductionCutting(project, calculateProject(project));

test('automatic SIP hip facets create visible roof panels on all four faces', () => {
  const project = createDefaultProject();
  project.settings.roof.shape = 'hip';
  project.settings.roof.type = 'sip';
  const production = report(project), scene = productionScene(production, project);
  const faces = production.assembly.roofModel.faces.filter(face => face.warm);
  assert.equal(faces.length, 4);
  assert.equal(production.assembly.usesRoofPlanes, true);
  assert.equal(production.surfaces.filter(surface => surface.roofPlacement).length, 4);
  assert.deepEqual(new Set(scene.panels.filter(panel => panel.layer === 'roof' && panel.faceId).map(panel => panel.faceId)), new Set(faces.map(face => face.id)));
});

test('butt partition changes the physical panel start in top plan and 3D without moving saved axes', () => {
  const project = createDefaultProject();
  Object.assign(project.plan, {house:{w:6,h:4,contourDefined:true},rooms:[],openings:[],wallGaps:[],platforms:[],walls:[
    {id:'h',x1:.174,y1:2,x2:5.826,y2:2}, {id:'v',x1:3,y1:.174,x2:3,y2:2},
  ]});
  const saved = structuredClone(project.plan.walls);
  const axes = report(project), initial = axes.surfaces.find(s => s.id.includes('-ПГ') && s.planStart[0] === 3000);
  project.plan.partitionJunctions = 'butt';
  const butt = report(project), trimmed = butt.surfaces.find(s => s.id.includes('-ПГ') && s.planStart[0] === 3000);
  assert.equal(trimmed.width, 1776);
  assert.equal(trimmed.planEnd[1], 1950);
  assert.notEqual(initial.planEnd[1], trimmed.planEnd[1]);
  const top = wallTopView(butt).walls.find(wall => wall.surface.id === trimmed.id);
  assert.equal(top.surface.planEnd[1], 1950);
  const scene = productionScene(butt, project), placement = scene.placements.get(trimmed.id);
  assert.deepEqual(scene.world(placement, trimmed.width, 0).slice(0, 2), trimmed.planEnd);
  assert.deepEqual(project.plan.walls, saved);
});

test('lath rows have three touching 100 mm boards at both ends and never exceed chosen pitch', () => {
  const rows = roofLathRows(5000, 350);
  assert.deepEqual(rows.slice(0, 3), [50, 150, 250]);
  assert.deepEqual(rows.slice(-3), [4750, 4850, 4950]);
  assert.ok(rows.slice(1).every((row, i) => row - rows[i] <= 350 + 1e-9));
  for (const shape of ['gable', 'hip']) {
    const project = createDefaultProject(); project.settings.roof.type = 'cold'; project.settings.roof.shape = shape;
    const calculation = calculateProject(project), production = calculateProductionCutting(project, calculation);
    assert.ok(production.assembly.laths.length > 0);
    assert.ok(production.assembly.laths.every(item => item.length <= production.settings.stockLengthMm));
    assert.equal(calculation.roof.mainLathBoardCount, Math.ceil(calculation.roof.mainLathRequiredLength / 6));
  }
});
