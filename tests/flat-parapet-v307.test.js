import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, ensureProjectFloorCount, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { flatRoofFootprint, flatRoofParapetRuns, flatRoofProjectedArea } from '../src/react/calculations/flat-roof-assembly.js';

const rectangle=[[0,0],[6000,0],[6000,4000],[0,4000]];
const line=(result,key)=>result.roof.lines.find(item=>item.id===`roof:${key}`);

test('open parapet omits the drainage side and extends only that roof edge',()=>{
  const roof={flatParapetMode:'open',flatOpenSide:'back',flatOpenOverhangMm:500};
  const footprint=flatRoofFootprint(rectangle,roof);
  assert.deepEqual(footprint,[[0,0],[6000,0],[6000,4500],[0,4500]]);
  assert.equal(flatRoofProjectedArea(footprint),27);
  assert.equal(flatRoofParapetRuns(rectangle,roof).reduce((sum,run)=>sum+run.length,0),14000);
});

test('two-layer bitumen roof counts sheet stock, two different rolls, fasteners and one combined labor rate',()=>{
  const project=createDefaultProject();
  Object.assign(project.settings.roof,{shape:'flat',type:'cold',flatSlopeMode:'tapered',flatSlopePercent:5,flatParapetMode:'closed',flatCoverSystem:'bitumen',flatOsbThicknessMm:9,flatOsbLayers:2,flatDrainCount:2});
  const before=calculateProject(project);
  assert.equal(line(before,'flat-osb').catalogId,'MAT-FLAT-OSB9');
  assert.equal(line(before,'flat-osb').price,700);
  assert.equal(line(before,'flat-waterproof-base').catalogId,'MAT-FLAT-HPP');
  assert.equal(line(before,'flat-waterproof-top').catalogId,'MAT-FLAT-HKP');
  assert.equal(line(before,'flat-waterproof-work').price,1000);
  assert.equal(line(before,'flat-csp').catalogId,'MAT-FLAT-CSP12');
  assert.equal(line(before,'flat-csp').qty,Math.ceil(before.roof.flatWaterproofArea*1.1/4)*2);
  assert.equal(line(before,'flat-csp-work').qty,Math.round(before.roof.flatWaterproofArea*2*100)/100);
  assert.ok(line(before,'flat-csp-fasteners').qty>0);
  assert.ok(line(before,'flat-primer').qty>0);
  assert.equal(line(before,'flat-parapet-drains').qty,2);
  assert.ok(line(before,'flat-osb-fasteners').qty>0);
  assert.equal(before.roof.lines.some(item=>item.id==='roof:cover'),false,'the old sheet covering must not be charged twice');
  assert.equal(line(before,'flat-osb').qty,Math.ceil(before.roof.geometry.totalSlopeArea*1.1*2/3.125));
  project.settings.roof.flatOsbLayers=1;
  const one=calculateProject(project);
  assert.ok(line(one,'flat-osb').qty<line(before,'flat-osb').qty);
  assert.equal(line(one,'flat-waterproof-base').qty,line(before,'flat-waterproof-base').qty,'waterproofing still has two layers');
  assert.equal(migrateProject(JSON.parse(JSON.stringify(project))).settings.roof.flatOsbLayers,1);
});

test('the roof model and estimate share an open edge, while the 3D scene shows parapet and bitumen',()=>{
  const project=createDefaultProject();
  Object.assign(project.settings.roof,{shape:'flat',type:'cold',flatSlopeMode:'tapered',flatSlopePercent:5,flatParapetMode:'open',flatOpenSide:'left',flatOpenOverhangMm:700,flatCoverSystem:'bitumen'});
  const estimate=calculateProject(project),report=calculateProductionCutting(project,estimate),scene=productionScene(report,project);
  const modelArea=report.assembly.roofModel.faces.filter(face=>face.group==='main').reduce((sum,face)=>sum+face.area,0);
  assert.ok(Math.abs(modelArea-estimate.roof.geometry.totalSlopeArea)<0.02);
  assert.ok(scene.panels.some(item=>item.layer==='parapet'));
  assert.ok(scene.panels.some(item=>item.layer==='flatOsb'));
  assert.ok(scene.panels.some(item=>item.layer==='flatCsp'));
  assert.ok(scene.panels.some(item=>item.layer==='waterproofing'));
  assert.equal(report.assembly.roofModel.issues.some(item=>item.code==='ROOF_AREA'),false);
});

test('second-floor deck is independently visible as an interfloor 3D layer',()=>{
  const project=createDefaultProject();
  ensureProjectFloorCount(project,2);
  const report=calculateProductionCutting(project,calculateProject(project));
  const scene=productionScene(report,project);
  assert.ok(scene.panels.some(item=>item.layer==='interfloor'&&item.surfaceId==='Э2-ПОЛ'));
  assert.ok(scene.panels.some(item=>item.layer==='floor'&&item.surfaceId==='Э1-ПОЛ'));
});
