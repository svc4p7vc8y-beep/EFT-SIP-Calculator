import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,ensureProjectFloorCount,migrateProject} from '../src/react/state/project-model.js';
import {normalizeConstructionSources,registerConstructionSources} from '../src/react/state/construction-sources.js';
import {constructionSource,sourceBindingKey} from '../src/react/calculations/construction-sources.js';
import {recordProductionRegistry} from '../src/react/state/production-identities.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
const edge={a:{x:0,y:2},b:{x:6,y:2},outer:false};
const exterior={a:{x:0,y:0},b:{x:6,y:0},outer:true};
const plan=()=>({house:{w:6,h:4,contourDefined:true},rooms:[{id:'a',name:'Комната',x:0,y:0,w:6,h:2}],walls:[],openings:[],wallGaps:[],platforms:[]});
const fixture=()=>{const p=createDefaultProject();Object.assign(p.plan,plan());ensureProjectFloorCount(p,2);Object.assign(p.upperFloors[0],plan());return p;};
const run=p=>calculateProductionCutting(p,calculateProject(p));
test('copied room and wall IDs on two floors have distinct source identities',()=>{
 const p=plan();assert.equal(constructionSource(p,edge,{},1).constructionSourceId,'room-boundary:[["a","bottom"]]');assert.equal(constructionSource(p,edge,{},2).constructionSourceId,'floor:2:room-boundary:[["a","bottom"]]');
 p.rooms=[];p.walls=[{id:'same',x1:0,y1:2,x2:6,y2:2}];assert.equal(constructionSource(p,edge,{},2).constructionSourceId,'floor:2:partition:same');assert.equal(constructionSource(p,edge,{},1).constructionSourceId,'partition:same');
});
test('upper exterior does not borrow existing first-floor role UUID',()=>{
 const p=plan(),s={version:1,exterior:{top:'first'}};assert.equal(constructionSource(p,exterior,s,2).sourceIdentityStatus,'needs-registration');
 const next=registerConstructionSources(s,[{floor:2,role:'top'}],()=> 'upper');assert.equal(next.exterior.top,'first');assert.equal(constructionSource(p,exterior,next,2).constructionSourceId,'floor:2:exterior:upper');
 assert.deepEqual(registerConstructionSources(next,[{floor:2,role:'top'}],()=>{throw Error('duplicate allocation');}),next);
});
test('unsupported floor numbers and duplicate exterior UUIDs are not accepted',()=>{
 assert.equal(constructionSource(plan(),edge,{},3).sourceIdentityStatus,'needs-review');assert.deepEqual(registerConstructionSources({},[{floor:3,role:'top'}]).exterior,{});
 const next=normalizeConstructionSources({version:1,exterior:{top:'same'},upperExterior:{2:{top:'same',bottom:'unique'},3:{top:'third'}}});assert.equal(next.invalid,true);assert.deepEqual(next.upperExterior,{2:{bottom:'unique'}});
});
test('manual selections are isolated by floor and validated against that floor plan',()=>{
 const p=plan();p.walls=[{id:'w',x1:0,y1:2,x2:6,y2:2}];const saved={version:1,exterior:{},selections:{[sourceBindingKey(edge,2)]:{kind:'plan-wall',id:'w'}}};
 assert.equal(constructionSource(p,edge,saved,1).sourceIdentityStatus,'needs-review');assert.equal(constructionSource(p,edge,saved,2).constructionSourceId,'floor:2:partition:w');
 const changed=structuredClone(p);changed.walls[0].x2=3;assert.equal(constructionSource(changed,edge,saved,2).constructionSourceId,undefined);
 assert.equal(constructionSource(p,edge,saved,2).constructionSourceId,'floor:2:partition:w');
});
test('upper room identity survives resize, movement and winding without retaining geometry overrides',()=>{
 const p=plan(),before=constructionSource(p,edge,{},2);p.rooms[0]={...p.rooms[0],x:2,y:3,w:7,h:2};const moved={a:{x:2,y:5},b:{x:9,y:5},outer:false};assert.equal(constructionSource(p,moved,{},2).constructionSourceId,before.constructionSourceId);
 p.rooms[0].points=[{x:2,y:5},{x:9,y:5},{x:9,y:3},{x:2,y:3}];assert.equal(constructionSource(p,{...moved,a:moved.b,b:moved.a},{},2).constructionSourceId,before.constructionSourceId);
 assert.notEqual(sourceBindingKey(edge,2),sourceBindingKey(moved,2));
});
test('production requests all first and upper roles once without allocating during calculation',()=>{
 const p=fixture(),snapshot=JSON.stringify(p),r=run(p);assert.equal(JSON.stringify(p),snapshot);assert.equal(r.constructionSourceRequests.length,8);assert.equal(r.constructionSourceRequests.filter(v=>typeof v==='object'&&v.floor===2).length,4);
 let n=0;const next=registerConstructionSources({},r.constructionSourceRequests,()=>`uuid-${++n}`);p.settings.productionCutting.constructionSources=next;const finished=run(p);assert.deepEqual(finished.constructionSourceRequests,[]);
 const ids=finished.surfaces.filter(s=>s.sourceRole).map(s=>s.constructionSourceId);assert.equal(new Set(ids).size,8);
});
test('second-floor reservation does not add undo or copy upper manual declarations backwards',()=>{
 const previous=fixture(),present=structuredClone(previous);present.settings.productionCutting.constructionSources={version:1,exterior:{},selections:{[sourceBindingKey(edge,2)]:{kind:'room-side',id:'a',role:'bottom'}}};
 const state={present,past:[previous],future:[]},next=recordProductionRegistry(state,present,{version:1,entries:[]},[{floor:2,role:'top'}],()=> 'upper');assert.equal(next.past.length,1);assert.equal(next.past[0].settings.productionCutting.constructionSources.selections,undefined);assert.equal(next.present.settings.productionCutting.constructionSources.upperExterior[2].top,'upper');
 assert.equal(recordProductionRegistry(next,present,{version:1,entries:[]},[{floor:2,role:'bottom'}]),next);
});
test('upper source registration and selections survive JSON migration without changing materials or estimate',()=>{
 const p=migrateProject(fixture()),before=calculateProject(p),r1=run(p);let n=0;p.settings.productionCutting.constructionSources=registerConstructionSources({},r1.constructionSourceRequests,()=>`id-${++n}`);
 p.settings.productionCutting.constructionSources.selections={[sourceBindingKey(edge,2)]:{kind:'room-side',id:'a',role:'bottom'}};
 const restored=migrateProject(JSON.parse(JSON.stringify(p))),after=calculateProject(restored),r2=run(restored);assert.deepEqual(after.lines,before.lines);assert.deepEqual(after.totals,before.totals);assert.deepEqual(r2.parts,r1.parts);assert.deepEqual(r2.members,r1.members);assert.equal(r2.revision,r1.revision);assert.deepEqual(r2.surfaces.map(s=>s.layoutKey),r1.surfaces.map(s=>s.layoutKey));assert.deepEqual(restored.settings.productionCutting.constructionSources,p.settings.productionCutting.constructionSources);
});
test('attic zero knee walls do not invent exterior parts or registration requests',()=>{
 const p=fixture();p.upperFloors[0].floorType='attic';p.upperFloors[0].wallHeight=0;p.upperFloors[0].atticHorizontalCeiling=false;
 const r=run(p);assert.equal(r.surfaces.filter(s=>s.floor===2&&s.sourceRole).length,0);assert.equal(r.constructionSourceRequests.filter(v=>v?.floor===2).length,0);assert.ok(r.surfaces.some(s=>s.floor===2&&s.constructionSourceId==='floor:2:room-boundary:[["a","bottom"]]'));
});
