import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { estimateMailContent, ALEXEY_EMAIL } from '../src/react/export/estimate-mail.js';
import { writePlanLibrary, readPlanLibrary } from '../src/react/storage/plan-library.js';

test('flat SIP roof has 3D panels, rests above ceiling, and has no wall plate or its price', () => {
  const project=createDefaultProject();
  Object.assign(project.plan,{house:{w:6,h:3,contourDefined:true},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[],wallHeight:2.5});
  Object.assign(project.settings.roof,{type:'sip',shape:'flat'});
  const calculation=calculateProject(project),report=calculateProductionCutting(project,calculation),scene=productionScene(report,project);
  const wallTop=2500,thickness=Number(project.settings.sip.ceilingThickness);
  assert.equal(calculation.roof.mauerlatLength,0);
  assert.equal(calculation.lines.some(line=>line.id.includes('mauerlat')),false);
  assert.equal(report.assembly.roofTimbers.some(item=>item.name==='Мауэрлат'),false);
  assert.ok(scene.panels.some(item=>item.layer==='roof'));
  assert.equal(scene.missing.includes('КР-С1'),false);
  assert.equal(scene.panels.find(item=>item.layer==='ceiling').placement.origin[2],wallTop+thickness/2);
  assert.equal(report.assembly.roofModel.roofBase,wallTop+thickness*1.5);
});

test('project description and estimate price override survive migration without changing the price list',()=>{
  const project=createDefaultProject();project.meta.projectDescription='Пристройка с тёплой кровлей';
  const first=calculateProject(project).lines.find(line=>line.catalogId&&line.qty>0);
  const sourcePrice=project.priceMat.find(row=>row.id===first.catalogId)?.price ?? project.priceLab.find(row=>row.id===first.catalogId)?.price;
  project.sharedPriceCatalog={source:'server',revision:1};
  project.estimateOverrides=[{lineId:first.id,section:first.section,catalogId:first.catalogId,price:first.price+12}];
  const restored=migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.meta.projectDescription,'Пристройка с тёплой кровлей');
  assert.equal(calculateProject(restored).lines.find(line=>line.id===first.id).price,first.price+12);
  assert.equal((restored.priceMat.find(row=>row.id===first.catalogId)||restored.priceLab.find(row=>row.id===first.catalogId)).price,sourcePrice);
});

test('estimate email includes project name, description and PDF recipient',()=>{
  const mail=estimateMailContent({projectName:'Пристройка',projectNum:'15589',customer:'Иванов',projectDescription:'Тёплая SIP-кровля'});
  assert.equal(ALEXEY_EMAIL,'polikarpov@eftsip.ru');
  assert.match(mail.subject,/Пристройка/);
  assert.match(mail.body,/Тёплая SIP-кровля/);
  assert.match(mail.body,/Иванов/);
});

test('hidden built-in plan remains in library trash without removing user plans',()=>{
  const values=new Map();const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  writePlanLibrary([{id:'empty',name:'Новый чистый план',preset:true,plan:{house:{w:10,h:8}},deletedAt:'2026-10-27'},{id:'mine',name:'Мой план',plan:{house:{w:6,h:4}}}],storage);
  const restored=readPlanLibrary(storage);
  assert.equal(restored.find(item=>item.id==='empty').deletedAt,'2026-10-27');
  assert.ok(restored.some(item=>item.id==='mine'));
});
