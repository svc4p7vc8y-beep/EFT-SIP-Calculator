import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {createWindowFromReference,normalizeWindowTariffs,WINDOW_REFERENCE,windowGeometry,windowPrice,windowTotals,sectionWidths,validateWindow} from '../src/react/state/window-products.js';
import {createEstimateWorkbook} from '../src/react/export/xlsx.js';
import {unzipSync,strFromU8} from 'fflate';

test('12 supplier fixtures retain exact geometry and kopecks',()=>{
  const products=WINDOW_REFERENCE.items.map(item=>createWindowFromReference(item));
  for(let i=0;i<products.length;i++){
    assert.equal(windowGeometry(products[i]).areaM2,WINDOW_REFERENCE.items[i].areaM2Exact);
    assert.equal(windowPrice(products[i]).unitRub,WINDOW_REFERENCE.items[i].priceRubExact);
  }
  const totals=windowTotals(products);
  assert.equal(totals.quantity,12);
  assert.equal(Math.round(totals.areaM2*10000)/10000,15.0144);
  assert.equal(Math.round(totals.priceRub*100)/100,131676.94);
  assert.equal(Math.round(totals.priceRub),131677);
});

test('changed geometry uses only identified preliminary basis; unknown systems stay unpriced',()=>{
  const product=createWindowFromReference(WINDOW_REFERENCE.items[1]);
  product.widthMm=1300;
  assert.equal(windowPrice(product).mode,'preliminary');
  assert.equal(windowGeometry(product).areaM2,1.56);
  product.profile.installationDepthMm=70;
  assert.equal(windowPrice(product).mode,'unpriced');
  product.price={mode:'manual',amountRub:12345.67,source:'Согласованный тариф',history:[]};
  assert.equal(windowPrice(product).unitRub,12345.67);
});

test('sections validate totals and a linked product replaces preliminary opening rows',()=>{
  const project=createDefaultProject();
  project.plan.openings=[{id:'opening-window-1',type:'window',width:1.12,height:1.2,outer:true,includeInEstimate:true}];
  const legacy=calculateProject(project).sections.find(section=>section.key==='openings').lines;
  assert.ok(legacy.some(line=>line.id==='openings:opening-0'));
  const product=createWindowFromReference(WINDOW_REFERENCE.items[1],{openingId:'opening-window-1'});
  project.windowProducts=[product];
  const lines=calculateProject(project).sections.find(section=>section.key==='openings').lines;
  assert.equal(lines.filter(line=>line.id==='openings:window-product-'+product.id).length,1);
  assert.equal(lines.some(line=>line.id==='openings:opening-0'),false);
  assert.equal(lines.some(line=>line.id==='openings:work-0'),false);
  assert.equal(lines.find(line=>line.id==='openings:window-product-'+product.id).price,11052.28);
  assert.deepEqual(sectionWidths(product).map(Math.round),[560,560]);
  product.sections[0].widthMm=700;
  product.sections[1].widthMm=500;
  assert.ok(validateWindow(product).length);
});

test('old projects load without window products and new products survive JSON roundtrip',()=>{
  const project=createDefaultProject();
  delete project.windowProducts;
  assert.deepEqual(migrateProject(JSON.parse(JSON.stringify(project))).windowProducts,[]);
  project.windowProducts=[createWindowFromReference(WINDOW_REFERENCE.items[10])];
  const loaded=migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(loaded.windowProducts[0].id,project.windowProducts[0].id);
  assert.equal(windowPrice(loaded.windowProducts[0]).unitRub,8966.2);
});

test('Excel includes window register, price source and exact kopecks',async()=>{
  const project=createDefaultProject();
  project.windowProducts=[createWindowFromReference(WINDOW_REFERENCE.items[1])];
  const workbook=unzipSync(new Uint8Array(await createEstimateWorkbook(project,calculateProject(project)).arrayBuffer()));
  const windowSheet=strFromU8(workbook['xl/worksheets/sheet4.xml']);
  assert.match(windowSheet,/ОК-02/);
  assert.match(windowSheet,/11052\.28/);
  assert.match(windowSheet,/Историческая цена поставщика/);
  assert.match(strFromU8(workbook['xl/workbook.xml']),/name="Окна"/);
});

test('parametric tariff requires supplier dates and explicit production measures',()=>{
  const product=createWindowFromReference(WINDOW_REFERENCE.items[1]);
  product.price={mode:'parametric',tariffId:'supplier-aero',history:[]};
  const tariff={id:'supplier-aero',supplierId:'supplier-1',currency:'RUB',source:'Прайс поставщика 2026',validFrom:'2020-01-01',validTo:'2099-12-31',profile:{brand:'BRUSBOX',system:'AERO',installationDepthMm:60,color:'white'},glazing:{formula:'4M1-10-4M1-10-4M1',thicknessMm:32},sealColor:'black',glazingBead:'straight',supportProfileHeightMm:30,hardwareSystem:'Vorne',rates:{baseRub:1000,profileRubPerMeter:500,glassRubPerM2:1000,impostRubPerMeter:300,hardwareRubByMode:{fixed:0,tilt_turn_right:1500},shapeSurchargeRubByShape:{rectangle:0}}};
  assert.equal(windowPrice(product,[tariff]).mode,'unpriced');
  product.productionMeasures={profileLinearMeters:5,glassAreaM2:1,impostMeters:1};
  assert.equal(windowPrice(product,[tariff]).unitRub,6300);
  assert.equal(normalizeWindowTariffs([tariff]).length,1);
  assert.equal(windowPrice(product,[{...tariff,validTo:'2021-01-01'}]).mode,'unpriced');
  assert.equal(windowPrice(product,[{...tariff,profile:{...tariff.profile,installationDepthMm:70}}]).mode,'unpriced');
});

test('removed opening does not leave a priced product or duplicate the same opening',()=>{
  const project=createDefaultProject();
  project.plan.openings=[{id:'window-1',type:'window',width:1.12,height:1.2,outer:true}];
  const item=createWindowFromReference(WINDOW_REFERENCE.items[1],{openingId:'window-1'});
  project.windowProducts=[item,{...structuredClone(item),id:'duplicate'}];
  let rows=calculateProject(project).sections.find(section=>section.key==='openings').lines;
  assert.equal(rows.filter(row=>row.id.includes('window-product-')).length,1);
  project.plan.openings=[];
  rows=calculateProject(project).sections.find(section=>section.key==='openings')?.lines||[];
  assert.equal(rows.filter(row=>row.id.includes('window-product-')).length,0);
});

test('optional installation appears only after rate and source are explicitly supplied',()=>{
  const project=createDefaultProject();
  const item=createWindowFromReference(WINDOW_REFERENCE.items[0]);
  item.extraLines=[{id:'installation',name:'Монтаж окна',kind:'labor',enabled:true,quantity:1,priceRub:null,source:''}];
  project.windowProducts=[item];
  const lines=()=>calculateProject(project).sections.find(section=>section.key==='openings').lines;
  assert.equal(lines().filter(line=>line.id.includes('window-'+item.id+'-installation')).length,0);
  item.extraLines[0].priceRub=2200;
  assert.equal(lines().filter(line=>line.id.includes('window-'+item.id+'-installation')).length,0);
  item.extraLines[0].source='Договор с монтажником';
  const installation=lines().find(line=>line.id.includes('window-'+item.id+'-installation'));
  assert.equal(installation.price,2200);
  assert.equal(installation.kind,'labor');
});

test('sections can split height or width with exact and proportional dimensions',()=>{
  const product=createWindowFromReference(WINDOW_REFERENCE.items[1]);
  product.sectionAxis='horizontal';
  assert.deepEqual(sectionWidths(product).map(Math.round),[600,600]);
  product.sections[0].widthMm=300;
  assert.deepEqual(sectionWidths(product).map(Math.round),[300,900]);
  assert.equal(validateWindow(product).length,0);
  product.sections[1].widthMm=1000;
  assert.ok(validateWindow(product).length>0);
  assert.equal(windowPrice(product).mode,'invalid');
});

test('project template survives migration and matching geometry retains historical reference',()=>{
  const original=createWindowFromReference(WINDOW_REFERENCE.items[1]);
  const project=createDefaultProject();
  project.windowPresets=[{id:'custom-template',label:'Окно спальни',product:{...structuredClone(original),openingId:null}}];
  const loaded=migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(loaded.windowPresets[0].label,'Окно спальни');
  const reused={...loaded.windowPresets[0].product,id:'reused-window',presetId:'custom-template'};
  assert.equal(windowPrice(reused).unitRub,11052.28);
});
