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

test('flat roof counts only selected CSP deck, layers, laths and two roll coats',()=>{
  const project=createDefaultProject();
  Object.assign(project.settings.roof,{shape:'flat',type:'cold',flatSlopeMode:'tapered',flatSlopePercent:5,flatParapetMode:'closed',flatCoverSystem:'bitumen',flatDeckMaterial:'csp',flatDeckLayers:2,flatDrainCount:2});
  const before=calculateProject(project);
  assert.equal(line(before,'flat-osb'),undefined);
  assert.equal(line(before,'flat-waterproof-base').catalogId,'MAT-FLAT-HPP');
  assert.equal(line(before,'flat-waterproof-top').catalogId,'MAT-FLAT-HKP');
  assert.equal(line(before,'flat-waterproof-work').price,1000);
  assert.equal(line(before,'flat-csp').catalogId,'MAT-FLAT-CSP12');
  assert.equal(line(before,'flat-csp').qty,Math.ceil(before.roof.flatWaterproofArea*1.1/4)*2);
  assert.equal(line(before,'flat-csp-work').qty,Math.round(before.roof.flatWaterproofArea*2*100)/100);
  assert.ok(line(before,'flat-deck-fasteners').qty>0);
  assert.ok(line(before,'flat-primer').qty>0);
  assert.ok(line(before,'lath').qty>0);
  assert.equal(line(before,'flat-parapet-drains').qty,2);
  assert.equal(before.roof.lines.some(item=>item.id==='roof:cover'),false,'the old sheet covering must not be charged twice');
  project.settings.roof.flatDeckLayers=1;
  const one=calculateProject(project);
  assert.ok(line(one,'flat-csp').qty<line(before,'flat-csp').qty);
  assert.equal(line(one,'flat-waterproof-base').qty,line(before,'flat-waterproof-base').qty,'waterproofing still has two layers');
  assert.equal(migrateProject(JSON.parse(JSON.stringify(project))).settings.roof.flatDeckLayers,1);
});

test('OSB deck replaces CSP, changes the membrane system and preserves the selected layer count',()=>{
  const project=createDefaultProject();
  Object.assign(project.settings.roof,{shape:'flat',type:'cold',flatCoverSystem:'bitumen',flatDeckMaterial:'osb',flatDeckLayers:3,flatOsbThicknessMm:9});
  const result=calculateProject(project);
  assert.equal(line(result,'flat-csp'),undefined);
  assert.equal(line(result,'flat-osb').catalogId,'MAT-FLAT-OSB9');
  assert.equal(line(result,'flat-osb').qty,Math.ceil(result.roof.flatWaterproofArea*1.1/3.125)*3);
  assert.equal(line(result,'flat-waterproof-base').catalogId,'MAT-FLAT-SELF-BASE');
  assert.equal(line(result,'flat-waterproof-top').catalogId,'MAT-FLAT-SELF-TOP');
  assert.equal(line(result,'flat-primer').catalogId,'MAT-FLAT-PRIMER-OSB');
  assert.ok(line(result,'lath').qty>0);
});

test('the roof model and estimate share an open edge, while the 3D scene shows parapet and bitumen',()=>{
  const project=createDefaultProject();
  Object.assign(project.settings.roof,{shape:'flat',type:'cold',flatSlopeMode:'tapered',flatSlopePercent:5,flatParapetMode:'open',flatOpenSide:'left',flatOpenOverhangMm:700,flatCoverSystem:'bitumen'});
  const estimate=calculateProject(project),report=calculateProductionCutting(project,estimate),scene=productionScene(report,project);
  const modelArea=report.assembly.roofModel.faces.filter(face=>face.group==='main').reduce((sum,face)=>sum+face.area,0);
  assert.ok(Math.abs(modelArea-estimate.roof.geometry.totalSlopeArea)<0.02);
  assert.ok(scene.panels.some(item=>item.layer==='parapet'));
  assert.ok(scene.panels.some(item=>item.layer==='flatCsp'));
  assert.equal(scene.panels.some(item=>item.layer==='flatOsb'),false);
  assert.ok(scene.panels.some(item=>item.layer==='waterproofing'));
  assert.equal(report.assembly.roofModel.issues.some(item=>item.code==='ROOF_AREA'),false);
});

test('3D deck rests above the laths for cold and warm flat roofs',()=>{
  for(const type of ['cold','sip']){
    const project=createDefaultProject();
    Object.assign(project.settings.roof,{shape:'flat',type,flatCoverSystem:'bitumen',flatDeckMaterial:'osb',flatDeckLayers:1});
    const scene=productionScene(calculateProductionCutting(project,calculateProject(project)),project);
    const deck=scene.panels.find(item=>item.layer==='flatOsb');
    const laths=scene.beams.filter(item=>item.layer==='laths');
    assert.ok(deck&&laths.length>0,`${type}: missing deck or laths`);
    const lathTop=Math.max(...laths.map(item=>Math.max(item.a[2],item.b[2])+12.5));
    const deckBottom=deck.placement.origin[2]-deck.thickness/2;
    assert.ok(deckBottom>=lathTop-1,`${type}: deck intersects laths`);
  }
});

test('second-floor deck is independently visible as an interfloor 3D layer',()=>{
  const project=createDefaultProject();
  ensureProjectFloorCount(project,2);
  const report=calculateProductionCutting(project,calculateProject(project));
  const scene=productionScene(report,project);
  assert.ok(scene.panels.some(item=>item.layer==='interfloor'&&item.surfaceId==='Э2-ПОЛ'));
  assert.ok(scene.panels.some(item=>item.layer==='floor'&&item.surfaceId==='Э1-ПОЛ'));
});
