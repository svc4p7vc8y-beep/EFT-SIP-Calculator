import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {WINDOW_REFERENCE_ITEMS,WINDOW_SUPPLIER_QUOTES,createWindowFromReference,createWindowFromDesign,WINDOW_DESIGN_LIBRARY,windowPrice,resizeWindowProduct,windowGeometry,supplierAreaEstimate} from '../src/react/state/window-products.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {fitWindowChoice} from '../src/react/state/window-choice.js';
import {openingSymbolPaths} from '../src/react/state/window-opening-symbol.js';
import {createWindowRequestWorkbook,windowRequestFields} from '../src/react/export/window-request.js';

test('two November supplier quotations retain 24 technical products and reconcile separate accessories',()=>{
 assert.equal(WINDOW_REFERENCE_ITEMS.length,36);
 for(const q of WINDOW_SUPPLIER_QUOTES.slice(1)){
  assert.equal(q.issueDate,'2026-11-02');assert.equal(q.items.length,12);
  assert.equal(Math.round(q.items.reduce((s,i)=>s+i.priceRubExact,0)*100),Math.round(q.totals.productRowsRub*100));
  assert.equal(Math.round((q.totals.productRowsRub+q.totals.accessoriesRub)*100),Math.round(q.totals.specificationRub*100));
  for(const i of q.items){const p=createWindowFromReference(i);assert.ok(Math.abs(windowGeometry(p).areaM2-i.areaM2Exact)<1e-8);assert.equal(windowPrice(p).unitRub,i.priceRubExact);assert.match(windowPrice(p).source,new RegExp(q.quoteId));assert.equal(i.sourcePage,2+Math.floor((i.number-1)/2));}
  const door=createWindowFromReference(q.items[6]);assert.equal(door.profile.brand,'KBE');assert.equal(door.sections[0].openingMode,'door_left');assert.equal(door.sections[0].handleSide,'right');assert.match(door.threshold,/холодный/i);assert.equal(door.supportProfile.heightMm,null);
 }
});
test('resizing identical door samples keeps quote identity, project overrides and import compatibility',()=>{
 const p=createDefaultProject(),item=WINDOW_REFERENCE_ITEMS.find(i=>i.quoteId==='239430'&&i.number===7),product=createWindowFromReference(item,{openingId:'door-glazing'});
 const next=resizeWindowProduct(product,{widthMm:1800});assert.equal(windowPrice(next).unitRub,44385.06);assert.match(windowPrice(next).source,/239430/);
 p.plan.openings.push({id:'door-glazing',type:'window',width:1.8,height:2});p.windowProducts=[product];const fit=fitWindowChoice(p,product);assert.equal(fit.price.referenceQuoteId,'239430');assert.equal(windowPrice(fit).unitRub,44385.06);
 p.windowProducts=[next];const reopened=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(windowPrice(reopened.windowProducts[0]).unitRub,44385.06);
 assert.equal(windowPrice({...next,price:{mode:'manual',amountRub:98765,source:'Договор'}}).unitRub,98765);
});
test('all three window-door constructions use actual glazed entrance door as clearly approximate source',()=>{
 const p=createDefaultProject();for(const design of WINDOW_DESIGN_LIBRARY.filter(d=>d.id.startsWith('door-block'))){const product=createWindowFromDesign(design),result=windowPrice(product,[],p.priceMat);assert.ok(result.unitRub>0);assert.match(result.source,/239422|239430/);assert.match(result.source,/образец № 7/);assert.match(result.source,/отличаются/);assert.doesNotMatch(result.source,/× 2 \(/);}
 const product=createWindowFromReference(WINDOW_REFERENCE_ITEMS.find(i=>i.quoteId==='239422'&&i.number===12));assert.equal(supplierAreaEstimate({...product,widthMm:2000,heightMm:1732}).unitRub,22270.04);
});
test('linked legacy unpriced windows use source area rather than old linear regression',()=>{
 const p=createDefaultProject(),product=createWindowFromDesign(WINDOW_DESIGN_LIBRARY.find(d=>d.id==='turn-right'),{openingId:'plan-window',price:{mode:'unpriced'}});const price=windowPrice(product,[],p.priceMat);assert.equal(price.unitRub,supplierAreaEstimate(product).unitRub);assert.equal(price.estimated,true);
});

test('opening symbols retain bottom hinge and apex opposite side hinges in both coordinate systems',()=>{
 assert.deepEqual(openingSymbolPaths('tilt',{left:0,right:100,bottom:0,top:100}),['M0 0L50 100L100 0']);
 assert.deepEqual(openingSymbolPaths('tilt',{left:0,right:100,bottom:100,top:0}),['M0 100L50 0L100 100']);
 assert.deepEqual(openingSymbolPaths('door_left',{left:0,right:100,bottom:0,top:100}),['M0 0L100 50L0 100']);
 assert.deepEqual(openingSymbolPaths('tilt_turn_right',{left:0,right:100,bottom:0,top:100}),['M100 0L0 50L100 100','M0 0L50 100L100 0']);
});
test('manufacturer workbook includes every section, geometry, doors and unknown gaps without estimate prices or customer data',async()=>{
 const p=createDefaultProject();p.meta.customer='PRIVATE CUSTOMER';p.meta.address='PRIVATE ADDRESS';p.windowProducts=[createWindowFromReference(WINDOW_REFERENCE_ITEMS.find(i=>i.quoteId==='239430'&&i.number===7)),createWindowFromDesign(WINDOW_DESIGN_LIBRARY.find(d=>d.id==='triangle'))];
 const bytes=new Uint8Array(await createWindowRequestWorkbook(p).arrayBuffer()),files=unzipSync(bytes),sheet=strFromU8(files['xl/worksheets/sheet1.xml']);
 assert.match(sheet,/Дверь · петли слева/);assert.match(sheet,/Вершина от левого края/);assert.match(sheet,/Не задано/);assert.match(sheet,/Изнутри/);assert.match(sheet,/холодный/i);assert.doesNotMatch(sheet,/22192|PRIVATE|Сумма|Цена за/);
 assert.ok(windowRequestFields(p.windowProducts[0],p).some(([k,v])=>k==='Количество'&&v===1));
});
