import test from 'node:test';import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateDeliveryVolume} from '../src/react/calculations/delivery-volume.js';
test('delivery volumes use purchased panels and lumber, keeping unknown materials visible',()=>{
 const p=createDefaultProject(),c=calculateProject(p),v=calculateDeliveryVolume(p,c),panels=v.categories.find(g=>g.key==='panels');
 assert.ok(panels.autoVolume>0);assert.equal(panels.complete,true);assert.equal(v.complete,false);
 assert.ok(v.categories.find(g=>g.key==='timber').autoVolume>0);const ids=v.categories.flatMap(g=>g.rows.map(r=>r.id));assert.equal(ids.length,new Set(ids).size);assert.ok(ids.every(id=>!id.startsWith('delivery:')));
 const row=panels.rows.find(r=>r.id==='sip:panel-floor');assert.equal(row.volume,row.qty*2.5*1.25*.224);
});
test('manual category replaces rather than adds to automatic volume; prices unchanged and JSON retained',()=>{
 const p=createDefaultProject(),c=calculateProject(p),v=calculateDeliveryVolume(p,c),old=v.categories.find(g=>g.key==='panels').effectiveVolume;
 p.settings.delivery.volumeGroups={panels:{mode:'manual',volume:80}};const saved=migrateProject(JSON.parse(JSON.stringify(p))),next=calculateDeliveryVolume(saved,calculateProject(saved));
 assert.ok(Math.abs(next.total-(v.total-old+80))<1e-8);assert.equal(calculateProject(saved).totals.total,c.totals.total);
 saved.settings.delivery.volumeGroups.panels.volume='';assert.equal(calculateDeliveryVolume(saved,c).categories.find(g=>g.key==='panels').effectiveVolume,null);
});
test('zero manual volume is explicit; inactive categories and transport/labor are not counted',()=>{
 const p=createDefaultProject();p.settings.delivery.volumeGroups={unused:{mode:'manual',volume:999},roof:{mode:'manual',volume:0}};
 const c={sections:[{key:'roof',title:'Кровля'}],lines:[{id:'r',kind:'material',section:'roof',name:'Покрытие',unit:'м²',qty:10},{id:'l',kind:'labor',section:'roof',name:'Работа',unit:'м³',qty:100},{id:'d',kind:'material',section:'roof',name:'Доставка печи',unit:'шт',qty:1}]};
 const v=calculateDeliveryVolume(p,c);assert.equal(v.categories.length,1);assert.equal(v.categories[0].rows.length,1);assert.equal(v.total,0);assert.equal(v.complete,true);
});
