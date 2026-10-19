import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { platformDeckFrame } from '../src/react/calculations/platform-deck-frame.js';

test('terrace and porch receive closed frames, short-span joists at at most 500 mm and two stair stringers', () => {
  const project=createDefaultProject();
  const originalPlan=structuredClone(project.plan),originalPrices=structuredClone(project.priceMat);
  const calculation=calculateProject(project),report=calculateProductionCutting(project,calculation);
  const scene=productionScene(report,project);
  assert.equal(report.assembly.platforms.length,2);
  for(const platform of report.assembly.platforms){
    assert.equal(platform.frameMembers.filter(member=>member.kind==='rim').length,4);
    assert.ok(platform.frameMembers.some(member=>member.kind==='joist'));
    assert.equal(platform.stringers.length,2);
    assert.ok([...platform.frameMembers,...platform.stringers].every(member=>member.profile==='50×150' && member.structuralStatus==='unverified'));
    assert.ok([...platform.frameMembers,...platform.stringers].every(member=>scene.beams.some(beam=>beam.id===member.id)));
    const original=project.plan.platforms.find(item=>item.id===platform.id);
    const long=Math.max(original.w,original.h)*1000-100;
    const bays=platform.frameMembers.filter(member=>member.kind==='joist').length+1;
    assert.ok(long/bays<=500+.001);
  }
  assert.equal(calculation.lines.find(line=>line.id==='terrace:frame-board')?.qty,.579);
  assert.equal(calculation.lines.find(line=>line.id==='terrace:stair-stringers')?.qty,.034);
  assert.deepEqual(project.plan,originalPlan);
  assert.deepEqual(project.priceMat,originalPrices);
});

test('editable joist spacing changes the geometry and estimate, while legacy projects default to 500 mm', () => {
  const project=createDefaultProject();
  const saved=migrateProject(JSON.parse(JSON.stringify(project)));
  assert.ok(saved.plan.platforms.every(platform=>platform.joistSpacingMm===500));
  const before=calculateProject(saved).lines.find(line=>line.id==='terrace:frame-board').qty;
  const oldCount=platformDeckFrame(saved.plan.platforms[0]).members.length;
  saved.plan.platforms[0].joistSpacingMm=400;
  assert.ok(platformDeckFrame(saved.plan.platforms[0]).members.length>oldCount);
  assert.ok(calculateProject(saved).lines.find(line=>line.id==='terrace:frame-board').qty>before);
  saved.settings.formulas.terraceFrameBoardM3PerM2=.03;
  const override=calculateProject(saved).lines.find(line=>line.id==='terrace:frame-board');
  const area=saved.plan.platforms.reduce((sum,platform)=>sum+platform.w*platform.h,0);
  const perimeter=saved.plan.platforms.reduce((sum,platform)=>sum+2*(platform.w+platform.h),0);
  assert.equal(override.qty,Math.round((perimeter*.05*.15+area*.03)*1000)/1000);
});

test('terrace wall plates and house purlins reach the last rafter on both ends of X and Y continuations', () => {
  for(const axis of ['x','y']){
    const project=createDefaultProject();
    project.plan={...project.plan,house:axis==='x'?{w:10,h:8}:{w:8,h:10},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[axis==='x'
      ?{id:'end',x:10,y:0,w:3,h:8,kind:'terrace',roof:{mode:'cold',shape:'continuation'}}
      :{id:'end',x:0,y:10,w:8,h:3,kind:'terrace',roof:{mode:'cold',shape:'continuation'}}]};
    Object.assign(project.settings.roof,{structureMode:'manual',rafterSystem:'layered',ridgeAxis:axis});
    const calculation=calculateProject(project),report=calculateProductionCutting(project,calculation);
    const along=axis==='x'?0:1;
    const plates=report.assembly.roofTimbers.filter(item=>item.material==='Мауэрлат' && item.a[1-along]===item.b[1-along]);
    const main=report.assembly.supports.filter(item=>item.role==='purlin' && !item.scope);
    const terrace=report.assembly.supports.filter(item=>item.scope==='terrace');
    assert.equal(plates.length,2);
    assert.ok(plates.every(item=>Math.max(item.a[along],item.b[along])===13300));
    assert.ok(main.some(item=>item.a[along]===-300));
    assert.ok(main.some(item=>item.b[along]===10300));
    assert.ok(terrace.every(item=>item.a[along]===10300 && item.b[along]===13300));
  }
});
