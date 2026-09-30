import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { buildClientEstimate, mergeIdenticalEstimateLines } from '../src/react/calculations/client-estimate.js';
import { buildCommercialScope } from '../src/react/calculations/commercial-scope.js';
import { formatMoney } from '../src/react/utils/format.js';
import { createEstimateWorkbook } from '../src/react/export/xlsx.js';
import { unzipSync, strFromU8 } from 'fflate';

test('deck price converts linear 145x45 board price to cubic metres; old custom rates survive', () => {
  const p=createDefaultProject();
  assert.equal(p.priceMat.find(x=>x.id==='MAT-028').price,52107.28);
  p.appVersion=164;p.priceMat.find(x=>x.id==='MAT-028').price=26400;
  p.priceMat.find(x=>x.id==='MAT-006').price=400;
  const migrated=migrateProject(p);
  assert.equal(migrated.priceMat.find(x=>x.id==='MAT-028').price,61302.68);
  p.priceMat.find(x=>x.id==='MAT-028').price=45000;
  assert.equal(migrateProject(p).priceMat.find(x=>x.id==='MAT-028').price,45000);
  assert.deepEqual(migrateProject(migrated).priceMat,migrated.priceMat);
  const result=calculateProject(createDefaultProject());
  const deck=result.lines.find(x=>x.id==='terrace:deck');
  assert.ok(deck);assert.equal(deck.price,52107.28);assert.equal(deck.unit,'м³');
});

test('foam counts estimated windows/exterior doors only; internal doors are counted once in their section', () => {
  for(const assemblyVersion of [0,1]) {
    const p=createDefaultProject();p.services.openings=true;p.services.internalFinish=true;
    p.settings.internal.assemblyVersion=assemblyVersion;
    p.plan.openings=[
      {id:'w',type:'window',width:1.2,height:1.4,outer:true},
      {id:'d',type:'door',doorType:'entrance',width:.9,height:2,outer:true},
      {id:'i',type:'door',doorType:'interior',width:.8,height:2,outer:false},
      {id:'g',type:'door',doorType:'garage',width:3,height:2,outer:true},
      {id:'x',type:'window',width:1,height:1,includeInEstimate:false},
    ];
    const c=calculateProject(p),foam=c.lines.filter(x=>x.catalogId==='MAT-OPENING-FOAM');
    assert.equal(foam.filter(x=>x.section==='openings').reduce((s,x)=>s+x.qty,0),2);
    assert.equal(foam.filter(x=>x.section==='internal').reduce((s,x)=>s+x.qty,0),c.inputs.internal.doors);
    assert.ok(foam.every(x=>x.price===600));
    const client=buildClientEstimate(c);
    assert.ok(client.sections.flatMap(x=>x.lines).some(x=>x.includedLineIds?.some(id=>id.includes('foam-'))));
    p.services.openings=false;p.services.internalFinish=false;
    assert.equal(calculateProject(p).lines.filter(x=>x.catalogId==='MAT-OPENING-FOAM').length,0);
  }
});

test('legacy ventilation includes priced duct and grille installation, detailed has no duplicates', () => {
  for(const assemblyVersion of [0,1]) {
    const p=createDefaultProject();p.services.engineeringVentilation=true;
    Object.assign(p.settings.engineering,{assemblyVersion,ventilationAuto:false,ventDuct:20,ventGrilles:4,ventilationStage:'complete'});
    const c=calculateProject(p),work=c.lines.filter(x=>['LAB-103','LAB-106'].includes(x.catalogId));
    assert.equal(work.filter(x=>x.catalogId==='LAB-103').length,1);
    assert.equal(work.filter(x=>x.catalogId==='LAB-106').length,1);
    assert.equal(work.find(x=>x.catalogId==='LAB-103').price,400);
    assert.equal(work.find(x=>x.catalogId==='LAB-106').price,800);
    p.priceLab.find(x=>x.id==='LAB-103').price=555;
    assert.equal(calculateProject(p).lines.find(x=>x.catalogId==='LAB-103').price,555);
  }
});

test('identical compact lines merge across groups without combining dimensions or custom prices', () => {
  const a={id:'a',catalogId:'X',name:'Окно 1200×1400',kind:'material',unit:'м²',qty:2,price:100,estimateGroup:'Первый этаж'};
  const lines=[a,{...a,id:'b',qty:3,estimateGroup:'Второй этаж'},{...a,id:'c',price:200},{...a,id:'d',name:'Окно 1200×1500'},{...a,id:'e',unit:'шт'},{...a,id:'f',kind:'labor'}];
  const merged=mergeIdenticalEstimateLines(lines);
  assert.equal(merged.length,5);assert.equal(merged[0].qty,5);assert.deepEqual(merged[0].includedLineIds,['a','b']);
  assert.equal(a.qty,2);
  const c={sections:[{key:'openings',title:'Окна',lines}]};
  assert.equal(buildClientEstimate(c,{maximumCompact:true}).sections[0].lines.length,5);
  assert.equal(buildClientEstimate(c,{maximumCompact:true}).totals.total,buildClientEstimate(c).totals.total);
  c.sections.push({key:'other',title:'Другой раздел',lines:[{...a,id:'other:a'}]});
  assert.equal(buildClientEstimate(c,{maximumCompact:true}).compactLines.find(x=>x.id==='a').qty,7);
});

test('compact roof overlap never counts lumber twice', () => {
  const line={id:'r',name:'Доска торцевая',kind:'material',unit:'м³',qty:2,price:100};
  const c={sections:[{key:'roof',title:'Крыша',lines:[line]}]};
  assert.equal(buildClientEstimate(c,{maximumCompact:true}).totals.total,200);
});

test('proposal coverage and section totals follow client filters, and super mode survives JSON', () => {
  const p=createDefaultProject();p.settings.print.superCompact=true;
  const c=calculateProject(p);
  for(const includeLabor of [false,true])for(const includeAccessories of [false,true]) {
    const options={includeLabor,includeAccessories};
    const client=buildClientEstimate(c,options),scope=buildCommercialScope(p,c,options);
    for(const s of client.sections) {
      const item=scope.find(x=>x.key===s.key);
      assert.equal(item.total,formatMoney(s.lines.reduce((sum,x)=>sum+x.qty*x.price,0)));
      assert.ok(item.expanded);
    }
  }
  assert.equal(migrateProject(JSON.parse(JSON.stringify(p))).settings.print.superCompact,true);
});

test('compact Excel also consolidates identical rows across sections and widens nomenclature', async () => {
  const p=createDefaultProject();p.settings.print.maximumCompact=true;
  const c=calculateProject(p),a={id:'a',name:'Одинаковое изделие',catalogId:'X',unit:'шт',kind:'material',qty:2,price:100};
  c.sections=[{key:'one',title:'Один',lines:[a]},{key:'two',title:'Два',lines:[{...a,id:'b',qty:3}]}];
  const files=unzipSync(new Uint8Array(await createEstimateWorkbook(p,c).arrayBuffer()));
  const xml=strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.equal(xml.split('Одинаковое изделие').length-1,1);
  assert.match(xml,/min="3" max="3" width="92"/);
  assert.match(xml,/<v>500<\/v>/);
});
