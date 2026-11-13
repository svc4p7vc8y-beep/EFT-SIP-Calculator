import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { roofAt, roofLocal } from '../src/react/calculations/roof-project.js';
import { roofJunctionSketch } from '../src/react/calculations/roof-junction-sketch.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { roofSupportFrame } from '../src/react/calculations/roof-support-frame.js';
import { roofLathRows } from '../src/react/calculations/roof-lathing.js';

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

const tee = [[0,0],[10,0],[10,4],[7,4],[7,8],[3,8],[3,4],[0,4]];
const bay = [[0,0],[10,0],[10,6],[6,6],[5.5,7],[4.5,7],[4,6],[0,6]];
const frontBay = [[2,0],[2.5,-1],[3.5,-1],[4,0]];
const recess = [[0,0],[8,0],[8,5],[2.5,5],[2.5,2.5],[0,2.5]];
const deck = { id: 'deck', kind: 'terrace', x: 0, y: 2.5, w: 2.5, h: 2.5, roof: { mode: 'shared' } };
const roofGeometryErrors = new Set(['ROOF_FORM', 'ROOF_FACE', 'ROOF_GAP', 'ROOF_AREA', 'ROOF_OVERLAP']);

for (const shape of ['gable', 'hip']) {
  for (const [form, points, valleys] of [['L', L, 1], ['T', tee, 2]]) {
    test(`${form} ${shape} keeps its valleys with a chamfered bay`, () => {
      const { calculation, report } = run(project(shape, 'cold', [points[0], ...frontBay, ...points.slice(1)]));
      const model = report.assembly.roofModel;
      assert.ok(roofAt(model, 3000, -800).length);
      assert.equal(roofAt(model, 1000, -800).length, 0);
      assert.ok(model.edges.filter(edge => edge.kind === 'valley').length >= valleys);
      assert.ok(Math.abs(model.mainArea - calculation.roof.geometry.totalSlopeArea) < .01);
      assert.ok(model.issues.every(issue => !roofGeometryErrors.has(issue.code)));
    });
  }

  test(`pitched ${shape} follows a T with eaves and two valleys`, () => {
    const p = project(shape, 'cold', tee);
    p.settings.roof.eaveOverhang = .4;
    p.settings.roof.gableOverhang = .25;
    const { calculation, report } = run(p);
    const model = report.assembly.roofModel;
    assert.ok(model.edges.filter(edge => edge.kind === 'valley').length >= 2);
    assert.equal(roofAt(model, 1000, 7000).length, 0);
    assert.ok(roofAt(model, 5000, 7900).length);
    assert.ok(Math.abs(model.mainArea - calculation.roof.geometry.totalSlopeArea) < .01);
    assert.ok(model.issues.every(issue => !roofGeometryErrors.has(issue.code)));
  });

  test(`pitched ${shape} encloses the angled bay in plan and the model`, () => {
    const { calculation, report } = run(project(shape, 'cold', bay));
    const model = report.assembly.roofModel;
    assert.ok(roofAt(model, 5000, 6800).length);
    assert.equal(roofAt(model, 3800, 6800).length, 0);
    assert.ok(Math.abs(model.projection - 61.5) < .001);
    assert.ok(Math.abs(model.mainArea - calculation.roof.geometry.totalSlopeArea) < .01);
    assert.ok(model.issues.every(issue => !roofGeometryErrors.has(issue.code)));
  });

  test(`shared ${shape} roof fills a terrace recess without a second roof or moving walls`, () => {
    const p = project(shape, 'cold', recess);
    p.plan.platforms = [deck];
    p.settings.roof.eaveOverhang = .4;
    p.settings.roof.gableOverhang = .25;
    const reopened = migrateProject(JSON.parse(JSON.stringify(p)));
    const before = JSON.stringify(reopened.plan);
    const { calculation, report } = run(reopened);
    const model = report.assembly.roofModel;
    assert.equal(JSON.stringify(reopened.plan), before);
    assert.deepEqual(calculation.roof.footprint.included, ['deck']);
    assert.equal(calculation.roof.terraceRoofs[0].result.netArea, 0);
    assert.equal(calculation.roof.extensionLines.length, 2);
    assert.ok(calculation.roof.extensionLines.every(line=>/posts|outer-tie/.test(line.id)));
    assert.ok(calculation.roof.terraceRoofs[0].result.postCount>0);
    assert.ok(model.faces.every(face => face.group === 'main'));
    assert.ok(roofAt(model, 1200, 3700).length);
    assert.ok(Math.abs(model.mainArea - calculation.roof.geometry.totalSlopeArea) < .01);
    assert.ok(model.issues.every(issue => !roofGeometryErrors.has(issue.code)));
    assert.ok(report.assembly.usesRoofPlanes);
    assert.ok(model.issues.some(issue => issue.code === 'ROOF_SHARED_SUPPORT'));
  });
}

test('a detached terrace stays outside the shared roof and receives a diagnostic', () => {
  const p = project('gable', 'cold', recess);
  p.plan.platforms = [{ ...deck, x: -5 }];
  const { calculation, report } = run(p);
  assert.deepEqual(calculation.roof.footprint.included, []);
  assert.ok(report.assembly.roofModel.issues.some(issue => issue.code === 'ROOF_SHARED_FOOTPRINT' && issue.target === 'deck'));
  assert.equal(roofAt(report.assembly.roofModel, -4000, 3700).length, 0);
});

const skewedL = [[0,0],[10,0],[10,5],[3,5],[3,9.23],[0,9]];
const wideT = [[0,0],[10,0],[10,4],[9,4],[9,5],[1,5],[1,4],[0,4]];
for (const shape of ['gable','hip']) for (const [form,points] of [['L',skewedL],['T',wideT]]) {
  test(`${form} ${shape} has perpendicular ridges at the same height and jack rafters in both wings`,()=>{
    const p=project(shape,'cold',points);
    Object.assign(p.settings.roof,{ridgeHeight:1.8,eaveOverhang:.5,gableOverhang:.3});
    const {report}=run(p),{roofModel,roofTimbers,rafters}=report.assembly;
    const ridges=roofModel.edges.filter(e=>e.kind==='ridge');
    assert.ok(ridges.some(e=>Math.abs(e.a[0]-e.b[0])>100));
    assert.ok(ridges.some(e=>Math.abs(e.a[1]-e.b[1])>100));
    assert.ok(ridges.every(e=>[e.a,e.b].every(v=>Math.abs(v[2]-roofModel.roofBase-1800)<.001)));
    assert.ok(roofTimbers.some(member=>member.roofMemberKind==='valley'));
    if(shape==='hip')assert.ok(roofTimbers.some(member=>member.roofMemberKind==='hip'));
    assert.ok(rafters.some(r=>r.rafterKind==='jack'&&Math.abs(r.a[0]-r.b[0])>100));
    assert.ok(rafters.some(r=>r.rafterKind==='jack'&&Math.abs(r.a[1]-r.b[1])>100));
    assert.ok(roofModel.issues.every(issue=>!roofGeometryErrors.has(issue.code)));
  });
}

test('junction sketch appears in 3D once, skips an opening and leaves estimate and fabrication unchanged',()=>{
  const p=project('gable','cold',skewedL);
  p.plan.openings=[{id:'ridge-end-window',type:'window',orientation:'v',x:10,y:2.5,width:1,height:1}];
  const {calculation,report}=run(p);
  const sketch=roofJunctionSketch(p,calculation,report);
  assert.ok(sketch.skippedOpenings>0);
  const posts=sketch.items.filter(item=>item.type==='post');
  assert.ok(posts.length>=2);
  assert.equal(new Set(posts.map(item=>`${item.x1},${item.y1}`)).size,posts.length);
  assert.ok(sketch.items.some(item=>item.type==='brace'));
  const sleepers=sketch.items.filter(item=>item.type==='sleeper');
  assert.ok(sleepers.length);
  for(const sleeper of sleepers){
    assert.equal(sleeper.flat,true);
    assert.match(sleeper.name,/опора требует проверки/);
    const top=sleeper.z1+Number(sleeper.profile.split('×')[0])/2;
    assert.ok(posts.some(post=>post.x1===sleeper.x1&&post.y1===sleeper.y1&&post.z1===top));
    assert.ok(posts.some(post=>post.x1===sleeper.x2&&post.y1===sleeper.y2&&post.z1===top));
  }
  p.settings.productionCutting.roofSupports=sketch.items;
  const reopened=migrateProject(JSON.parse(JSON.stringify(p)));
  const saved=run(reopened);
  assert.deepEqual(saved.calculation.totals,calculation.totals);
  assert.deepEqual(saved.report.members.map(m=>m.id),report.members.map(m=>m.id));
  assert.equal(productionScene(saved.report,reopened).beams.filter(b=>b.roofJunctionSketch).length,sketch.items.length);
  reopened.settings.roof.ridgeHeight+=.2;
  assert.equal(productionScene(run(reopened).report,reopened).beams.filter(b=>b.roofJunctionSketch).length,0);
});

test('hip roof shows all lathing rows and keeps preliminary pieces out of cutting',()=>{
  const p=project('hip','cold',tee);
  p.settings.roof.includeCovering=true;
  const {report}=run(p),{laths,roofModel}=report.assembly;
  for(const face of roofModel.faces){
    const ys=face.polygon.map(p=>p[1]),min=Math.min(...ys);
    const rows=laths.filter(item=>item.faceId===face.id).map(item=>roofLocal(face,item.worldA)[1]);
    assert.ok(roofLathRows(Math.max(...ys)-min,p.settings.roof.lathStep*1000).every(y=>rows.some(row=>Math.abs(row-min-y)<.01)));
  }
  const preview=laths.filter(item=>item.lathPreview);
  assert.ok(preview.length);
  assert.ok(preview.every(item=>!report.members.some(member=>member.id===item.id)));
});

test('the frame generator produces separately editable support groups on both T wings',()=>{
  const p=project('gable','cold',tee);
  const {report}=run(p),frame=roofSupportFrame(p,report,{variant:'single'});
  assert.deepEqual(frame.errors,[]);
  assert.ok(new Set(frame.items.map(item=>item.faceId)).size>=3);
  const beams=frame.items.filter(item=>item.type==='purlin');
  assert.ok(beams.some(item=>Math.abs(item.x2-item.x1)>100));
  assert.ok(beams.some(item=>Math.abs(item.y2-item.y1)>100));
});

for(const [form,contour,gap] of [['L',L,[7000,6000]],['T',tee,[1000,6000]]]){
  test(`${form} tapered flat parapet keeps rafters, horizontal chords, laths and deck inside the outline`,()=>{
    const p=project('flat','cold',contour);
    Object.assign(p.settings.roof,{flatSlopeMode:'tapered',flatParapetMode:'closed',flatCoverSystem:'bitumen',flatDeckMaterial:'csp',flatDeckLayers:2,includeCovering:true});
    const {calculation,report}=run(p),assembly=report.assembly,scene=productionScene(report,p);
    assert.equal(roofAt(assembly.roofModel,...gap).length,0);
    assert.ok(assembly.rafters.some(item=>item.bearingStatus==='upper-chord'&&item.lowerChordJoinAngleDeg>0));
    assert.ok(assembly.flatFrame.chordCount>0&&assembly.flatFrame.postCount>0);
    const chords=assembly.roofTimbers.filter(item=>item.roofMemberKind==='flat-frame-chord');
    assert.ok(chords.every(item=>item.worldA[2]===item.worldB[2]));
    assert.ok(chords.some(item=>item.bearingStatus==='geometry-only'));
    assert.ok(scene.beams.some(item=>item.layer==='laths'));
    assert.ok(scene.panels.some(item=>item.layer==='flatCsp'));
    assert.ok(Math.abs(assembly.roofModel.mainArea-calculation.roof.geometry.totalSlopeArea)<.01);
  });
}
