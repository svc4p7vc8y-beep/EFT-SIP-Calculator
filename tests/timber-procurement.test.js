import test from 'node:test';import assert from 'node:assert/strict';
import {timberProcurement,timberComposition} from '../src/react/calculations/timber-procurement.js';
import {normalizeTimberProcurement} from '../src/react/state/timber-procurement.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {timberOrderCsv,timberOrderDocument} from '../src/react/export/timber-procurement.js';
const fixture=()=>({settings:{productionCutting:{}},priceMat:[]});
const material=(name,qty,unit='м.п.',extra={})=>({id:name,kind:'material',section:'sip',source:'sip-walls',name,qty,unit,...extra});
test('EFT 95×145 products decompose into two 45×145 boards; metres and cubic metres are both explicit',()=>{
 for(const name of ['Термобрус 95×145 мм','Пакет клеёных досок 95×145 мм','Комплект для пакета досок 95×145 мм']){
  const c={lines:[material(name,10)]},copy=JSON.stringify(c),r=timberProcurement(fixture(),c);
  assert.equal(r.rows.length,1);assert.equal(r.rows[0].thicknessMm,45);assert.equal(r.rows[0].widthMm,145);assert.equal(r.totalLengthM,20);assert.equal(r.totalVolumeM3,.1305);assert.equal(JSON.stringify(c),copy);
 }
});
test('95 and 90 wide production representations use the same project recipe; explicit triple package remains triple',()=>{
 assert.equal(timberComposition('Клеёный пакет','145×90').key,timberComposition('Клеёный пакет','95×145').key);
 const c={lines:[material('Пакет клеёных досок 3×50×150 мм (145×150 мм)',10)]},r=timberProcurement(fixture(),c);
 assert.equal(r.totalLengthM,30);assert.equal(r.totalVolumeM3,.225);assert.equal(r.rows[0].thicknessMm,50);
});
test('purchasing uses final estimate quantities including overrides, excludes labor and hardware and filters before aggregation',()=>{
 const c={lines:[material('Доска сухая строганая 45×145 мм',.1305,'м³'),material('Термобрус 95×145 мм',10,'м.п.',{projectOverride:true,source:'sip-floor'}),material('Монтаж доски 45×145 мм',100,'м.п.',{kind:'labor'}),material('Саморез для доски 45×145 мм',100)]};
 const all=timberProcurement(fixture(),c);assert.equal(all.rows.length,1);assert.equal(all.totalLengthM,40);assert.equal(all.totalVolumeM3,.261);
 const floor=timberProcurement(fixture(),c,null,{layers:['sip:floor']});assert.equal(floor.totalLengthM,20);assert.equal(timberProcurement(fixture(),c,null,{layers:[]}).rows.length,0);
});
test('stock purchasing counts full blanks once, not clean members, and does not unfold already individual binding boards twice',()=>{
 const report={settings:{stockLengthMm:6000},timberStock:{bars:[{id:'a',material:'Клеёный пакет',profile:'145×90',parts:[{id:'x',length:500}]},{id:'b',material:'Доска пакета обвязки',profile:'50×150',parts:[{id:'y',length:700}]}],unplaced:['too-long']}};
 const r=timberProcurement(fixture(),{},report,{source:'cutting'});assert.equal(r.totalLengthM,18);assert.equal(r.totalVolumeM3,.1233);assert.equal(r.warnings.length,1);assert.equal(r.unresolved.length,0);
});
test('recipe overrides survive project JSON migration and affect board demand without changing the estimate',()=>{
 const p=createDefaultProject();p.settings.productionCutting.timberProcurement={customer:'Заказчик',recipient:'Поставщик',recipes:{'pack:95x145':{count:3,thicknessMm:45,widthMm:145}}};
 const restored=migrateProject(JSON.parse(JSON.stringify(p))),c={lines:[material('Пакет клеёных досок 95×145 мм',10,'м.п.',{price:841})]};
 const r=timberProcurement(restored,c);assert.equal(r.totalLengthM,30);assert.equal(r.totalVolumeM3,.19575);assert.equal(r.settings.customer,'Заказчик');assert.equal(c.lines[0].price,841);assert.equal(c.lines[0].qty,10);
});
test('unknown package and unspecified piece length stay unresolved, not invented; invalid recipe is not silently rounded',()=>{
 const p=fixture(),c={lines:[material('Клеёный пакет 200×200 мм',10),material('Доска 45×145 мм',2,'шт')]};
 assert.equal(timberProcurement(p,c).rows.length,0);assert.equal(timberProcurement(p,c).unresolved.length,2);
 assert.equal(normalizeTimberProcurement({recipes:{a:{count:2.5,thicknessMm:45,widthMm:145}}}).recipes.a.count,0);
 const piece=timberProcurement(p,{lines:[material('Доска 45×145 мм · 2 шт × 6 м',2,'шт')]});assert.equal(piece.totalLengthM,12);
});
test('default estimate and production export boards with no changes to project, quantities or prices',()=>{
 const p=createDefaultProject(),c=calculateProject(p),report=calculateProductionCutting(p,c),before=JSON.stringify([p,c]);
 for(const source of ['estimate','cutting']){const r=timberProcurement(p,c,report,{source});assert.ok(r.rows.length>2);assert.ok(r.totalVolumeM3>0);assert.ok(!r.unresolved.some(x=>/Клеёный пакет|Термобрус/.test(x.name)));}
 assert.equal(JSON.stringify([p,c]),before);
});
test('supplier document contains selected board quantities, both units and parties, with safe HTML/CSV',()=>{
 const r=timberProcurement(fixture(),{lines:[material('Термобрус 95×145 мм',10)]}),details={title:'<Дом>',customer:'=формула',recipient:'ООО <Поставщик>',note:'Привезти утром'};
 const html=timberOrderDocument(r,details),csv=timberOrderCsv(r,details);assert.ok(html.includes('0,1305'));assert.ok(html.includes('пог. м'));assert.ok(html.includes('м³'));assert.ok(html.includes('&lt;Поставщик&gt;'));assert.ok(!html.includes('<Поставщик>'));assert.ok(csv.includes("'=формула"));assert.ok(csv.includes('45×145'));
});
