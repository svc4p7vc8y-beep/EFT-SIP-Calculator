import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { clipFlatRoofBeam, flatRoofDisplayContour } from '../src/react/calculations/flat-roof-visual.js';

const rectangle = [[0,0],[6000,0],[6000,4000],[0,4000]];
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 0.01, `${value} != ${expected}`);

test('the displayed roof stays inside the parapet while an open drainage side keeps its selected overhang', () => {
  assert.deepEqual(flatRoofDisplayContour(rectangle,{flatParapetMode:'closed'},174),[[178,178],[5822,178],[5822,3822],[178,3822]]);
  assert.deepEqual(flatRoofDisplayContour(rectangle,{flatParapetMode:'open',flatOpenSide:'left',flatOpenOverhangMm:700},174),[[-700,178],[5822,178],[5822,3822],[-700,3822]]);
  const segment={id:'visual-only',a:[-300,1000,100],b:[6300,1000,200]};
  const clipped=clipFlatRoofBeam(segment,flatRoofDisplayContour(rectangle,{flatParapetMode:'closed'},174));
  assert.equal(clipped.length,1);
  near(clipped[0].a[0],178);near(clipped[0].b[0],5822);
  assert.ok(clipped[0].a[2]>100&&clipped[0].b[2]<200);
  assert.deepEqual(segment.a,[-300,1000,100],'display clipping must not rewrite the production member');
});

test('a concave house outline does not draw beams across its empty corner', () => {
  const lShape=[[0,0],[6000,0],[6000,2000],[2000,2000],[2000,6000],[0,6000]];
  const inside=flatRoofDisplayContour(lShape,{flatParapetMode:'closed'},174);
  const pieces=clipFlatRoofBeam({id:'lath',a:[-200,3000,300],b:[6200,3000,300]},inside);
  assert.equal(pieces.length,1);
  near(pieces[0].a[0],178);
  near(pieces[0].b[0],1822);
});

test('flat parapet scene builds panel joints and membrane returns without changing the estimate', () => {
  const project=createDefaultProject();
  Object.assign(project.settings.roof,{shape:'flat',type:'cold',flatSlopeMode:'tapered',flatSlopePercent:5,flatParapetMode:'closed',flatCoverSystem:'bitumen',flatDeckMaterial:'csp',flatDeckLayers:2,flatDrainCount:2});
  const calculation=calculateProject(project),total=calculation.totals.total,report=calculateProductionCutting(project,calculation),scene=productionScene(report,project);
  const parapet=scene.panels.filter(item=>item.layer==='parapet'),roofLaths=scene.beams.filter(item=>item.layer==='laths');
  assert.ok(parapet.length>4,'SIP parapet panels must show joints');
  assert.ok(parapet.every(item=>item.shape[0][1][0]<=1250.01));
  assert.ok(scene.panels.some(item=>item.id.startsWith('flat-waterproof-cap:')));
  assert.ok(scene.panels.some(item=>item.id.startsWith('flat-waterproofing:')));
  assert.equal(scene.beams.filter(item=>item.layer==='drains').length,2);
  assert.ok(roofLaths.length>0&&roofLaths.every(item=>Math.max(item.a[2],item.b[2])<5000),'laths must follow the flat roof plane, not a stale gable drawing');
  assert.ok(scene.parapetRequirement.shortfall>0,'a parapet shorter than the roof build-up must be diagnosed');
  assert.equal(calculateProject(project).totals.total,total);
});

test('sheet flashing and the open side are drawn only for their selected roof forms', () => {
  const project=createDefaultProject();
  Object.assign(project.settings.roof,{shape:'flat',type:'cold',flatParapetMode:'open',flatOpenSide:'back',flatOpenOverhangMm:500,flatCoverSystem:'sheet'});
  const scene=productionScene(calculateProductionCutting(project,calculateProject(project)),project);
  assert.equal(scene.panels.filter(item=>item.layer==='flashing').length,scene.panels.filter(item=>item.layer==='parapet').length);
  assert.equal(scene.panels.filter(item=>item.layer==='sheetCover').length,1);
  assert.equal(scene.beams.filter(item=>item.layer==='drains').length,0);
  assert.ok(scene.beams.filter(item=>item.layer==='rafters').some(item=>Math.max(item.a[1],item.b[1])>project.plan.house.h*1000),'roof overhang must stay visible beyond the open side');
});
