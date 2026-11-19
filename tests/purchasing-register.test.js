import test from 'node:test';
import assert from 'node:assert/strict';
import {purchasingRegister} from '../src/react/calculations/purchasing-register.js';
import {purchaseCsv,purchaseDocument} from '../src/react/export/purchasing-register.js';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
test('purchasing reflects final material quantities and prices without adding stock or labor',()=>{
 const p=createDefaultProject(),c=calculateProject(p),before=JSON.stringify(c),r=purchasingRegister(c);
 assert.ok(r.materials.length);assert.ok(r.fasteners.length);assert.ok(r.nodeFasteners.length);
 assert.ok(Math.abs(r.total-c.totals.materials)<1e-6);
 assert.ok(Math.abs([...r.materials,...r.fasteners].reduce((n,r)=>n+r.qty,0)-c.lines.filter(l=>l.kind==='material').reduce((n,r)=>n+r.qty,0))<1e-6);
 const floor=purchasingRegister(c,['sip:floor']);assert.ok(floor.materials.some(r=>r.name.includes('Пакет клеёных')));
 assert.equal(JSON.stringify(c),before);
});
test('layer selection and grouping combine identical products across layers but retain unit, size and project price boundaries',()=>{
 const line={section:'sip',source:'sip-walls',kind:'material',catalogId:'screw',name:'Саморез 6×200',unit:'шт',qty:10,price:5,estimateGroup:'Стены'};
 const c={lines:[line,{...line,qty:3,projectOverride:true},{...line,unit:'кг',qty:1},{...line,name:'Саморез 6×240'},{...line,price:7},{...line,estimateGroup:'Другой комплект'},{...line,source:'sip-floor'},{...line,kind:'labor'},{...line,qty:0}]};
 const all=purchasingRegister(c),walls=purchasingRegister(c,['sip:walls']);
 assert.equal(all.fasteners.length,4);assert.equal(walls.fasteners.length,4);
 assert.equal(walls.fasteners[0].qty,23);assert.equal(all.fasteners[0].qty,33);assert.equal(purchasingRegister(c,null,{mergeIdentical:false}).fasteners.length,7);assert.equal(walls.fasteners[0].manual,true);
 assert.equal(purchasingRegister(c,[]).total,0);assert.equal(purchasingRegister(c,[]).layers.length,2);
});
test('selected node fasteners keep project sizes, packs and reserves separate from estimate totals',()=>{
 const c={lines:[{section:'roof',kind:'material',name:'Крепёж',unit:'кг',qty:2,price:100}],nodeFasteners:{rows:[{section:'Кровля',fastenerType:'Саморез',size:'8×240',purchaseQty:100,purchasePacks:2,packSize:50},{section:'Кровля',fastenerType:'Саморез',size:'8×240',purchaseQty:50,purchasePacks:1,packSize:50},{section:'Стены',fastenerType:'Гвоздь',size:'3×90',purchaseQty:0}]}};
 const r=purchasingRegister(c);assert.equal(r.total,200);assert.equal(r.nodeFasteners.length,1);assert.equal(r.nodeFasteners[0].qty,150);assert.equal(r.nodeFasteners[0].packs,3);
 const only=purchasingRegister(c,['nodes:Кровля']);assert.equal(only.total,0);assert.equal(only.nodeFasteners[0].size,'8×240');
});
test('equal-price windows with different dimensions or custom material specifications never merge',()=>{
 const common={section:'openings',kind:'material',catalogId:'supplier',unit:'шт',qty:1,price:10000};
 const c={lines:[{...common,name:'Витражный фасад · 1000×2000 мм'},{...common,name:'Витражный фасад · 2000×1000 мм'},{...common,section:'sip',custom:true,name:'Доска · сорт A'},{...common,section:'sip',custom:true,name:'Доска · сорт B'}]};
 assert.equal(purchasingRegister(c).materials.length,4);
});
test('supplier documents include chosen scope and all lists, escape HTML and spreadsheet formulas',()=>{
 const r=purchasingRegister({lines:[{section:'roof',kind:'material',name:'=1+1 <доска>',qty:2,unit:'м.п.',price:12}],nodeFasteners:{rows:[{section:'Кровля',fastenerType:'Саморез',size:'6×200',purchaseQty:50}]}});
 const html=purchaseDocument(r,'<Проект>','Кровля','19.11.2026'),csv=purchaseCsv(r,'Проект');
 assert.ok(html.includes('&lt;Проект&gt;'));assert.ok(!html.includes('<доска>'));assert.ok(html.includes('6×200'));assert.ok(html.includes('не складывать автоматически'));
 assert.ok(csv.includes("'=1+1"));assert.ok(csv.includes('6×200'));assert.ok(csv.startsWith('\uFEFF'));
});
