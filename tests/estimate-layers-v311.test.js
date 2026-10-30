import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { buildClientEstimate, unpricedClientLines } from '../src/react/calculations/client-estimate.js';
import { buildCommercialScope } from '../src/react/calculations/commercial-scope.js';
import { estimateLayerId, estimateLayerStages } from '../src/react/calculations/estimate-layer-scope.js';

test('client may send SIP panels and assembly timber without cutting or installation', () => {
  const project=createDefaultProject(),calculation=calculateProject(project);
  const stages=estimateLayerStages(calculation);
  const sip=stages.filter(stage=>stage.sectionKey==='sip');
  assert.ok(sip.some(stage=>stage.layers.some(layer=>layer.id.endsWith('|panel'))));
  assert.ok(sip.some(stage=>stage.layers.some(layer=>layer.id.endsWith('|timber'))));
  const keep=new Set(sip.flatMap(stage=>stage.layers.filter(layer=>['panel','timber'].some(role=>layer.id.endsWith(`|${role}`))).map(layer=>layer.id)));
  const options={excludedEstimateLayers:stages.flatMap(stage=>stage.layers.map(layer=>layer.id)).filter(id=>!keep.has(id))};
  const client=buildClientEstimate(calculation,options);
  assert.deepEqual(client.sections.map(section=>section.key),['sip']);
  assert.ok(client.sections[0].lines.some(line=>line.id==='sip:panel-floor'));
  assert.ok(client.sections[0].lines.some(line=>line.id==='sip:floor-connector'));
  assert.ok(client.sections[0].lines.every(line=>line.kind==='material'&&!/раскрой/iu.test(line.name)));
  assert.equal(client.totals.total,client.sections[0].lines.reduce((sum,line)=>sum+line.qty*line.price,0));
  assert.deepEqual(buildCommercialScope(project,calculation,options).map(item=>item.key),['sip']);
});

test('excluded layer does not block printing for an unpriced row, and project amounts stay untouched', () => {
  const calculation={sections:[{key:'sip',title:'СИП',lines:[{id:'sip:panel-floor',name:'СИП-панель',qty:2,price:100,kind:'material',estimateGroup:'Пол'},{id:'sip:cut-floor',name:'Раскрой панелей',qty:1,price:0,kind:'labor',estimateGroup:'Пол'}]}]};
  const options={excludedEstimateLayers:[estimateLayerId(calculation.sections[0],calculation.sections[0].lines[1])]};
  assert.deepEqual(unpricedClientLines(calculation,options),[]);
  assert.equal(buildClientEstimate(calculation,options).totals.total,200);
  assert.equal(calculation.sections[0].lines[1].price,0);
});

test('gable selection is independent and material consolidation preserves quantities and money',()=>{
 const c={sections:[{key:'roof',title:'Кровля',lines:[{id:'roof:gable-frame',name:'Каркас фронтона',kind:'material',qty:2,price:100,unit:'м³'},{id:'roof:rafters',name:'Стропила',kind:'material',qty:3,price:100,unit:'м³'}]},{key:'sip',title:'СИП',lines:[{id:'a',name:'Доска 45×145 · пол',catalogId:'wood',kind:'material',qty:2,price:200,unit:'м³'},{id:'b',name:'Доска 45×145 · потолок',catalogId:'wood',kind:'material',qty:3,price:200,unit:'м³'}]}]};
 assert.notEqual(estimateLayerId(c.sections[0],c.sections[0].lines[0]),estimateLayerId(c.sections[0],c.sections[0].lines[1]));
 const result=buildClientEstimate(c,{mergeConstructionMaterials:true});
 assert.equal(result.totals.total,1500);
 assert.equal(result.sections[0].lines.find(l=>l.catalogId==='wood').qty,5);
});

test('warm SIP roofing panels remain priced in client estimate and have a panel layer',()=>{
 const p=createDefaultProject();p.settings.roof.type='sip';
 const c=calculateProject(p),roof=c.sections.find(s=>s.key==='roof');
 const panel=roof.lines.find(l=>l.id==='roof:sip-panel');
 assert.ok(panel.qty>0&&panel.price>0);
 assert.ok(estimateLayerId(roof,panel).endsWith('|panel'));
 assert.ok(buildClientEstimate(c).sections.find(s=>s.key==='roof').lines.some(l=>l.id===panel.id));
});
