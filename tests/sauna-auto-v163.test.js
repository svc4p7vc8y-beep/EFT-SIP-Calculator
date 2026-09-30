import test from 'node:test';
import assert from 'node:assert/strict';
import { saunaLines } from '../src/react/calculations/sauna-model.js';
import { enableAutoSauna, resolveSauna } from '../src/react/calculations/sauna-auto.js';
import { saunaIncomplete } from '../src/react/calculations/sauna-details.js';
import { createDefaultProject, migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
const room=()=>({id:'a',name:'Парная',floor:1,area:6,wallArea:10,ceilingArea:6,perimeter:10,saunaGeometry:{height:2.5,ridgeHeight:1.8,passages:1},settings:{sauna:enableAutoSauna()}});
const find=(lines,key)=>lines.find(l=>l.catalogId.endsWith('-'+key.toUpperCase()));
test('one action supplies automatic lining, chimney and drain with nonzero budget prices',()=>{
 const r=room(),lines=saunaLines(r);
 assert.equal(find(lines,'liningPack').qty,8);assert.equal(find(lines,'liningPack').projectPrice,3840);
 assert.equal(find(lines,'drain').qty,1);assert.equal(find(lines,'drain').projectPrice,6000);
 assert.equal(find(lines,'chimneySandwich').qty,9);
 assert.ok(lines.every(l=>l.projectPrice>0));
 assert.ok(!find(lines,'lining'));assert.ok(!find(lines,'chimney'));assert.ok(!find(lines,'batten'));assert.ok(!find(lines,'foil'));
 assert.equal(find(lines,'heaterDelivery').priceMultiplier,1);assert.equal(find(lines,'liningPack').priceMultiplier,1.25);
 assert.ok(saunaIncomplete(r).some(w=>w.includes('бюджетная')));
 const total=lines.reduce((sum,l)=>sum+l.qty*l.projectPrice*l.priceMultiplier,0);
 console.log('v163 sample 16 m² total:',total);
});
test('automatic calculations follow areas/heights but retain zero and manual overrides',()=>{
 const r=room();const base=saunaLines(r);r.settings.wallArea=30;
 assert.ok(find(saunaLines(r),'liningPack').qty>find(base,'liningPack').qty);
 r.saunaGeometry.upperHeight=3;assert.ok(find(saunaLines(r),'chimneySandwich').qty>find(base,'chimneySandwich').qty);
 r.settings.sauna.quantities={drain:0};r.settings.sauna.prices={heater:123,liningPack:0};
 assert.ok(!find(saunaLines(r),'drain'));assert.equal(find(saunaLines(r),'heater').projectPrice,123);
 assert.equal(find(saunaLines(r),'liningPack').projectPrice,0);
 const before=JSON.stringify(r);saunaLines(r);assert.equal(JSON.stringify(r),before);
});
test('electric and no-heater variants never include wood chimney',()=>{
 const r=room();r.settings.sauna.heaterType='electric';
 assert.ok(!saunaLines(r).some(l=>l.catalogId.includes('CHIMNEY')));
 assert.equal(find(saunaLines(r),'heater').projectPrice,0);
 r.settings.sauna.heaterType='none';assert.ok(!find(saunaLines(r),'heaterDelivery'));
});
test('old manual assemblies stay manual; automatic settings survive migration and feed estimate',()=>{
 const manual={enabled:true,quantities:{drain:2},prices:{heater:111}};
 assert.deepEqual(resolveSauna({settings:{sauna:manual}}),manual);
 const p=createDefaultProject();p.services.internalFinish=true;
 p.plan.house={w:3,h:2};p.plan.rooms=[{id:'a',name:'Парная',x:0,y:0,w:3,h:2}];p.plan.openings=[];
 p.settings.internal.roomFinishes['1:a']={wallArea:10,ceilingArea:6,sauna:enableAutoSauna()};
 const before=calculateProject(p),after=calculateProject(migrateProject(JSON.parse(JSON.stringify(p))));
 assert.deepEqual(after.sections,before.sections);
 const lines=before.sections.find(s=>s.key==='internal').lines;
 assert.equal(find(lines,'drain').price,7500);assert.equal(find(lines,'heater').price,52512.5);
 assert.equal(p.priceMat.find(l=>l.id==='MAT-SAUNA-DRAIN').price,0);
});
