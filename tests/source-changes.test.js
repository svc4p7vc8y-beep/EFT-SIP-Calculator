import test from 'node:test';
import assert from 'node:assert/strict';
import {captureSourceBaseline,compareSourceBaseline} from '../src/react/calculations/source-changes.js';
import {normalizeSourceBaseline} from '../src/react/state/source-baseline.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {recordProductionRegistry} from '../src/react/state/production-identities.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
const date='2026-10-09T10:00:00.000Z';
const wall=(id,x1=0,x2=6000,y=2000,floor=1)=>({id,name:id,floor,planStart:[x1,y],planEnd:[x2,y],sourceIdentityStatus:'registered-source',constructionSourceId:'source:'+id,sourceContributors:[],width:x2-x1,height:2500,heightStart:2500,heightEnd:2500,thickness:174,geometry:[[[[0,0],[x2-x1,0],[x2-x1,2500],[0,2500],[0,0]]]]});
const compare=(before,after)=>compareSourceBaseline(captureSourceBaseline(before,date),after);
test('no checkpoint or invalid checkpoint never claims a historical comparison',()=>{
 assert.equal(compareSourceBaseline(null,[wall('Э1-ПГ1')]).status,'no-baseline');
 for(const value of [{version:3,items:[]},{version:1,capturedAt:'bad',items:[]},{version:1,capturedAt:date,items:[{a:[Infinity,0]}]}])assert.equal(compareSourceBaseline(value,[]).status,'invalid-baseline');
});
test('reordering surfaces or ring winding does not create a change',()=>{
 const a=wall('Э1-ПГ1'),b=wall('Э1-ПГ2',0,6000,3000),reversed=structuredClone(a);reversed.geometry[0][0].reverse();reversed.planStart=a.planEnd;reversed.planEnd=a.planStart;
 const r=compare([a,b],[b,reversed]);assert.equal(r.changed,0);assert.equal(r.events.length,2);
});
test('one complete old segment covering two new ones is only a split candidate',()=>{
 const r=compare([wall('Э1-ПГ1')],[wall('Э1-ПГ1',0,3000),wall('Э1-ПГ2',3000,6000)]);assert.equal(r.events[0].kind,'split');assert.equal(r.events[0].requiresReview,true);assert.match(r.events[0].label,/Возможное/);assert.equal(r.events[0].before.length,1);assert.equal(r.events[0].after.length,2);
});
test('complete adjacent old segments can become a merge candidate',()=>{
 assert.equal(compare([wall('Э1-ПГ1',0,3000),wall('Э1-ПГ2',3000,6000)],[wall('Э1-ПГ1')]).events[0].kind,'merged');
});
test('gaps, overlapping pieces and incomplete cover stay ambiguous instead of claiming a split',()=>{
 for(const rows of [[wall('Э1-ПГ1',0,2000),wall('Э1-ПГ2',3000,6000)],[wall('Э1-ПГ1',0,4000),wall('Э1-ПГ2',3000,6000)],[wall('Э1-ПГ1',0,3000),wall('Э1-ПГ2',3000,7000)]])assert.equal(compare([wall('Э1-ПГ1')],rows).events[0].kind,'ambiguous');
});
test('many to many overlap does not invent source continuity',()=>{
 assert.equal(compare([wall('Э1-ПГ1',0,3000),wall('Э1-ПГ2',3000,6000)],[wall('Э1-ПГ1',0,2000),wall('Э1-ПГ2',2000,6000)]).events[0].kind,'ambiguous');
});
test('unique source can identify movement, but not duplicate IDs across arbitrary locations',()=>{
 assert.equal(compare([wall('Э1-ПГ1')],[wall('Э1-ПГ1',1000,7000,4000)]).events[0].kind,'modified');
 const a=wall('Э1-ПГ1'),b=wall('Э1-ПГ2',0,6000,3000);b.constructionSourceId=a.constructionSourceId;const moved=wall('Э1-ПГ1',1000,7000,4000);
 const r=compare([a,b],[moved]);assert.equal(r.events.filter(e=>e.kind==='removed').length,2);assert.equal(r.events.filter(e=>e.kind==='added').length,1);
});
test('same coordinates with a replaced source report source change, not unchanged',()=>{
 const a=wall('Э1-ПГ1'),b={...a,constructionSourceId:'new-source'};assert.equal(compare([a],[b]).events[0].kind,'sourceChanged');
 const modified=compare([a],[{...b,height:2700}]).events[0];assert.equal(modified.kind,'modified');assert.equal(modified.sourceChanged,true);
});
test('height, thickness, bearing status and openings are changes even at the same plan line',()=>{
 for(const patch of [{height:2700},{thickness:224},{bearing:true},{geometry:[[[[0,0],[1000,0],[1000,2500],[0,2500],[0,0]]]]}]){
 const a=wall('Э1-ПГ1');assert.equal(compare([a],[{...a,...patch}]).events[0].kind,'modified');
 }
});
test('same coordinates on different floors or exterior/interior classes never match',()=>{
 const a=wall('Э1-ПГ1');for(const b of [wall('Э2-ПГ1',0,6000,2000,2),wall('Э1-С1')])assert.deepEqual(compare([a],[b]).events.map(e=>e.kind),['removed','added']);
});
test('zero-length or repeated technical keys invalidate a baseline without silently dropping entries',()=>{
 const captured=captureSourceBaseline([wall('Э1-ПГ1')],date);captured.items[0].b=[...captured.items[0].a];assert.equal(normalizeSourceBaseline(captured).invalid,true);
 assert.equal(captureSourceBaseline([wall('Э1-ПГ1'),wall('Э1-ПГ1')],date).invalid,true);
});
test('checkpoint is a detached value and comparison never mutates sources',()=>{
 const a=wall('Э1-ПГ1'),captured=captureSourceBaseline([a],date),original=JSON.stringify(captured);a.planStart[0]=2000;assert.equal(captured.items[0].a[0],0);compareSourceBaseline(captured,[a]);assert.equal(JSON.stringify(captured),original);
});
test('automatic mark/UUID reservation does not propagate user checkpoints through undo history',()=>{
 const previous=createDefaultProject(),present=structuredClone(previous);present.settings.productionCutting.sourceBaseline=captureSourceBaseline([wall('Э1-ПГ1')],date);
 const next=recordProductionRegistry({present,past:[previous],future:[]},present,{version:1,entries:[]},['top'],()=> 'uuid');assert.equal(next.past[0].settings.productionCutting.sourceBaseline,null);assert.deepEqual(next.present.settings.productionCutting.sourceBaseline,present.settings.productionCutting.sourceBaseline);
});
test('capture and JSON reopening preserve estimate, cutting, layout keys and approval revision',()=>{
 const p=migrateProject(createDefaultProject()),before=calculateProject(p),r1=calculateProductionCutting(p,before);p.settings.productionCutting.sourceBaseline=captureSourceBaseline(r1.surfaces,date);
 const restored=migrateProject(JSON.parse(JSON.stringify(p))),after=calculateProject(restored),r2=calculateProductionCutting(restored,after);
 assert.deepEqual(after.lines,before.lines);assert.deepEqual(after.totals,before.totals);assert.deepEqual(r2.parts,r1.parts);assert.deepEqual(r2.members,r1.members);assert.equal(r2.revision,r1.revision);assert.deepEqual(r2.surfaces.map(s=>s.layoutKey),r1.surfaces.map(s=>s.layoutKey));assert.equal(compareSourceBaseline(restored.settings.productionCutting.sourceBaseline,r2.surfaces).changed,0);
});
