import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {fitFoundationToFloor,foundationFootprint} from '../src/react/state/foundation-fit.js';
import {createProjectWorkspace,projectWorkspaceReducer} from '../src/react/state/project-tabs.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {purchasingRegister} from '../src/react/calculations/purchasing-register.js';
import {timberProcurement} from '../src/react/calculations/timber-procurement.js';
import {purchaseCsv,purchaseDocument} from '../src/react/export/purchasing-register.js';
import {timberOrderCsv,timberOrderDocument} from '../src/react/export/timber-procurement.js';
const line=(name,qty,unit,price=200)=>({kind:'material',section:'foundation',name,qty,unit,price});
function fixture(){const p=createDefaultProject();p.plan={...p.plan,house:{w:10,h:4},rooms:[],walls:[],openings:[],platforms:[],piles:[],pileRows:[],bindingLines:[],excludedPiles:[]};p.settings.piles.autoLayoutMode='contour';return p;}
test('10×4 outside binding datum gives 9.85×3.85 pile axes and identical floor/wall/physical binding edges',()=>{
  const p=fixture(),before=JSON.stringify(p.plan.house);fitFoundationToFloor(p);const b=foundationFootprint(p);
  assert.equal(JSON.stringify(p.plan.house),before);assert.equal(b.outside.width,10);assert.equal(b.outside.height,4);assert.ok(Math.abs(b.axes.width-9.85)<1e-8);assert.ok(Math.abs(b.axes.height-3.85)<1e-8);
  const report=calculateProductionCutting(p,calculateProject(p));assert.ok(report.assembly.bindingFloorAlignment.every(a=>a.matches));
  const restored=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(restored.settings.piles.externalBindingDatum,true);assert.deepEqual(restored.plan.house,p.plan.house);
});
test('shared binding datum tracks outside size and package width with undo/redo; preserved manual objects and estimate overrides',()=>{
  const p=fixture(),manual={id:'manual',auto:false,x1:1,y1:1,x2:2,y2:1,count:2};p.plan.pileRows=[manual];p.plan.piles=[{id:'separate',x:1,y:2}];p.estimateOverrides=[{lineId:'x',section:'foundation',qty:10,price:99}];fitFoundationToFloor(p);
  let state=createProjectWorkspace(p);const initial=structuredClone(state.tabs[0].history.present);
  state=projectWorkspaceReducer(state,{type:'commit',update:n=>{n.plan.house.w=12;n.settings.piles.bindingLayers=4;return n;}});
  const next=state.tabs[0].history.present;assert.equal(Math.max(...next.plan.pileRows.filter(r=>r.auto).map(r=>Math.max(r.x1,r.x2))),11.9);assert.deepEqual(next.plan.pileRows.find(r=>r.id==='manual'),manual);assert.deepEqual(next.plan.piles,p.plan.piles);assert.deepEqual(next.estimateOverrides,p.estimateOverrides);
  state=projectWorkspaceReducer(state,{type:'undo'});assert.deepEqual(state.tabs[0].history.present,initial);state=projectWorkspaceReducer(state,{type:'redo'});assert.equal(state.tabs[0].history.present.plan.house.w,12);
  const legacy=fixture(),old=JSON.stringify(legacy.plan);migrateProject(legacy);assert.equal(JSON.stringify(legacy.plan),old);
});
test('procurement adds independent units, hides all monetary values in exports, and leaves unknown conversions blank',()=>{
  const r=purchasingRegister({lines:[line('Доска 50×150 мм · 2 шт × 6 м',.09,'м³'),line('Свая 108 мм',5,'шт'),line('Мембрана',50,'м²')]});
  assert.equal(r.materials[0].lengthM,12);assert.equal(r.materials[0].volumeM3,.09);assert.equal(r.materials[0].pieces,2);assert.equal(r.materials[1].pieces,5);assert.equal(r.materials[1].volumeM3,null);assert.equal(r.materials[2].lengthM,null);
  for(const document of [purchaseCsv(r,'Дом',{showPrices:false}),purchaseDocument(r,'Дом','Все',undefined,{showPrices:false})]){assert.ok(document.includes('м³'));assert.ok(!document.includes('Цена, ₽'));assert.ok(!document.includes('Сумма, ₽'));assert.ok(!document.includes('Итого материалы по смете'));}
  assert.ok(purchaseDocument(r,'Дом','Все').includes('Цена, ₽'));
});
test('board purchase rounds full pieces per stock length, preserves demand, uses component price not package price',()=>{
  const p=fixture(),c={lines:[line('Термобрус 95×145 мм',10,'м.п.',1682)]},before=JSON.stringify(c),r=timberProcurement(p,c),row=r.rows[0];
  assert.equal(row.lengthM,20);assert.equal(row.pieces,4);assert.equal(row.orderLengthM,24);assert.equal(row.orderVolumeM3,.1566);assert.ok(Math.abs(row.amount-8160)<.001);assert.ok(row.priceSource.includes('Доска'));assert.equal(JSON.stringify(c),before);
  for(const document of [timberOrderCsv(r,{showPrices:false}),timberOrderDocument(r,{showPrices:false})]){assert.ok(document.includes('Шт.'));assert.ok(!document.includes('Цена, ₽'));assert.ok(!document.includes('Сумма, ₽'));}
  assert.ok(timberOrderDocument(r,{showPrices:true}).includes('Цена, ₽/м³'));
});
test('mixed stock lengths remain separate and stock purchasing never rounds clean details into extra blanks',()=>{
  const p=fixture(),report={settings:{stockLengthMm:6000},timberStock:{bars:[{id:'a',material:'Доска',profile:'50×150',stockLength:4000},{id:'b',material:'Доска',profile:'50×150',stockLength:6000}]}};
  const r=timberProcurement(p,{},report,{source:'cutting'});assert.equal(r.rows.length,2);assert.equal(r.rows.reduce((n,r)=>n+r.pieces,0),2);assert.equal(r.rows.reduce((n,r)=>n+r.orderLengthM,0),10);
});
test('rounded estimate volume does not create a fourth stock board; manual quantity takes priority',()=>{
  const p=fixture(),input=line('Стропильная доска 50×150 мм · 3 шт × 6 м',.14,'м³');
  assert.equal(timberProcurement(p,{lines:[input]}).rows[0].pieces,3);
  input.projectOverride=true;input.qty=.18;assert.equal(timberProcurement(p,{lines:[input]}).rows[0].pieces,4);
  const ties=line('Ригели 25×150 мм · 17 шт × 2 м · 10 досок × 6 м с запасом 10%',.225,'м³');const row=timberProcurement(p,{lines:[ties]}).rows[0];assert.equal(row.stockLengthM,6);assert.equal(row.pieces,10);assert.equal(row.orderLengthM,60);
});
