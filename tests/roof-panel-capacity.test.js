import test from 'node:test';
import assert from 'node:assert/strict';
import {roofFacet} from '../src/react/calculations/roof-project.js';
import {roofPanelCapacityChecks} from '../src/react/calculations/roof-panel-capacity.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';

const face=roofFacet('С1','Тёплый скат',[[0,0,3000],[4000,0,3000],[4000,2000,4000],[0,2000,4000]],{warm:true,thickness:174});
const model={faces:[face]};
const engineering={loadCases:[{id:'Н1',name:'Основное сочетание',kind:'downward',pressureKPa:1.2,source:'Расчёт КР, стр. 1'}],panelCapacities:[{id:'П1',thicknessMm:174,maxSpanMm:3000,downwardKPa:1.5,upliftKPa:1,source:'Паспорт, таблица 1'}],spanOverrides:{}};

test('passport check compares actual sloped length with a suitable documented row',()=>{
 const check=roofPanelCapacityChecks(model,engineering).find(c=>c.code==='PANEL_CAPACITY:С1:Н1');
 assert.equal(check.status,'pass');assert.equal(check.spanSource,'geometry');assert.ok(check.spanMm>2000);assert.equal(check.capacityKPa,1.5);assert.ok(Math.abs(check.utilization-.8)<1e-12);
 assert.equal(roofPanelCapacityChecks(model,{...engineering,panelCapacities:[{...engineering.panelCapacities[0],maxSpanMm:2000}]}).at(-1).status,'open');
 assert.equal(roofPanelCapacityChecks(model,{...engineering,loadCases:[{...engineering.loadCases[0],pressureKPa:1.6}]}).at(-1).status,'fail');
 assert.equal(roofPanelCapacityChecks(model,{...engineering,loadCases:[{...engineering.loadCases[0],source:''}]}).at(-1).status,'open');
});
test('a shorter project span needs a recorded support reason',()=>{
 const data={...engineering,spanOverrides:{С1:{spanMm:1500,reason:''}}};
 assert.equal(roofPanelCapacityChecks(model,data).at(-1).status,'open');
 assert.equal(roofPanelCapacityChecks(model,{...data,spanOverrides:{С1:{spanMm:1500,reason:'Прогон П1, чертёж КР-2'}}}).at(-1).status,'pass');
});
test('engineering inputs survive JSON migration and failed capacity blocks release without changing estimate',()=>{
 const p=createDefaultProject();p.settings.roof.type='sip';p.settings.productionCutting.roofDesign.enabled=true;
 const d=p.settings.productionCutting.roofDesign;d.engineering={...engineering,panelCapacities:[{...engineering.panelCapacities[0],thicknessMm:Number(p.settings.sip.ceilingThickness),maxSpanMm:20000,downwardKPa:.5}]};
 const before=calculateProject(p).totals.total,q=migrateProject(JSON.parse(JSON.stringify(p))),r=calculateProductionCutting(q,calculateProject(q));
 assert.deepEqual(q.settings.productionCutting.roofDesign.engineering,d.engineering);
 assert.equal(calculateProject(q).totals.total,before);
 assert.ok(r.roofChecks.some(c=>c.code.startsWith('PANEL_CAPACITY:')&&c.status==='fail'));
 assert.ok(r.issues.some(i=>i.code.startsWith('ROOF_CHECK:PANEL_CAPACITY:')));
 assert.equal(r.approvalStatus,'draft');
});
