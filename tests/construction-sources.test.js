import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {normalizeProductionCutting} from '../src/react/state/production-cutting.js';
import {normalizeConstructionSources,registerConstructionSources} from '../src/react/state/construction-sources.js';
import {recordProductionRegistry} from '../src/react/state/production-identities.js';
import {constructionSource,rectangleRole} from '../src/react/calculations/construction-sources.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';

const registered={version:1,exterior:{top:'a',bottom:'b',left:'c',right:'d'}};
const fixture=()=>{const p=createDefaultProject();Object.assign(p.plan,{house:{w:3,h:6,contourDefined:true},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[]});Object.assign(p.settings.productionCutting,{constructionSources:registered,kerfMm:3,endAllowanceMm:0});return p;};
const run=p=>calculateProductionCutting(p,calculateProject(p));
const internal=(a,b)=>({a,b,outer:false});
const wall=(id,x1=0,y1=2,x2=3,y2=2)=>({id,x1,y1,x2,y2});

test('first-floor rectangle roles are independent of vertex origin and winding',()=>{
 const p=fixture();for(const points of [[{x:0,y:0},{x:3,y:0},{x:3,y:6},{x:0,y:6}],[{x:3,y:6},{x:3,y:0},{x:0,y:0},{x:0,y:6}]]){
 p.plan.house.points=points;const r=run(p);assert.equal(r.geometryDiagnostics.comparison.status,'matched');
 assert.deepEqual(Object.fromEntries(r.surfaces.filter(s=>s.sourceRole).map(s=>[s.sourceRole,s.constructionSourceId])),{top:'exterior:a',bottom:'exterior:b',left:'exterior:c',right:'exterior:d'});
 }});
test('rectangle resize changes geometry but not registered source identity or saved overrides',()=>{
 const p=fixture(),before=run(p),top=before.surfaces.find(s=>s.sourceRole==='top');
 p.settings.productionCutting.layouts[top.layoutKey]={step:625};const overrides=structuredClone(p.settings.productionCutting.layouts);
 p.plan.house.w=4;const after=run(p),changed=after.surfaces.find(s=>s.sourceRole==='top');
 assert.equal(changed.constructionSourceId,top.constructionSourceId);assert.notEqual(changed.width,top.width);assert.notEqual(changed.layoutKey,top.layoutKey);
 assert.deepEqual(p.settings.productionCutting.layouts,overrides);assert.deepEqual(changed.layout,{});assert.ok(after.issues.some(i=>i.code==='STALE_LAYOUT'));
});
test('pure calculation proposes source registration without allocating IDs or mutating project',()=>{
 const p=fixture();delete p.settings.productionCutting.constructionSources;const before=structuredClone(p),a=run(p),b=run(p);
 assert.deepEqual(a.constructionSourceRequests.sort(),['bottom','left','right','top']);
 assert.deepEqual(a.surfaces,b.surfaces);assert.deepEqual(p,before);
 assert.ok(a.surfaces.filter(s=>s.sourceRole).every(s=>s.sourceIdentityStatus==='needs-registration'&&!s.constructionSourceId));
});
test('source registration persists once without undo steps and preserves redo',()=>{
 const p=fixture();delete p.settings.productionCutting.constructionSources;const state={present:p,past:[structuredClone(p)],future:[structuredClone(p)]},r=run(p);let serial=0;
 const next=recordProductionRegistry(state,p,r.markRegistry,r.constructionSourceRequests,()=>`source-${++serial}`);
 assert.equal(serial,4);assert.equal(next.past.length,1);assert.equal(next.future.length,1);
 const again=recordProductionRegistry(next,next.present,r.markRegistry,r.constructionSourceRequests,()=>{throw new Error('must not allocate');});assert.equal(again,next);
 for(const snapshot of [next.present,...next.past,...next.future])assert.deepEqual(snapshot.settings.productionCutting.constructionSources,next.present.settings.productionCutting.constructionSources);
});
test('late construction registration cannot write to another snapshot',()=>{
 const p=fixture(),state={present:structuredClone(p),past:[],future:[]};
 assert.equal(recordProductionRegistry(state,p,run(p).markRegistry,['top'],()=>{throw new Error('late allocation');}),state);
});
test('single explicit partition keeps source ID across resize, movement and array reorder',()=>{
 const p=fixture();p.plan.walls=[wall('original')];const a=run(p).surfaces.find(s=>s.constructionSourceRef?.id==='original');assert.ok(a);
 assert.equal(run(p).geometryDiagnostics.model.partitionSources.find(s=>s.constructionSourceRef?.id==='original').constructionSourceId,a.constructionSourceId);
 p.plan.walls=[wall('new',0,4,3,4),wall('original',0,2.5,2.5,2.5)];const b=run(p).surfaces.find(s=>s.constructionSourceRef?.id==='original');
 assert.equal(a.constructionSourceId,b.constructionSourceId);assert.notEqual(a.id,b.id);assert.notDeepEqual(a.planStart,b.planStart);
});
test('merged and split partition segments never inherit an arbitrary source ID',()=>{
 const p=fixture().plan;p.walls=[wall('a',0,2,1.5,2),wall('b',1.5,2,3,2)];
 assert.equal(constructionSource(p,internal({x:0,y:2},{x:3,y:2}),registered).sourceIdentityStatus,'needs-review');
 p.walls=[wall('a')];assert.equal(constructionSource(p,internal({x:0,y:2},{x:1.5,y:2}),registered).constructionSourceId,undefined);
});
test('coincident sources, duplicate IDs and missing source IDs remain unresolved',()=>{
 const p=fixture().plan,edge=internal({x:0,y:2},{x:3,y:2});
 for(const walls of [[wall('a'),wall('b')],[wall('a'),wall('a',0,4,3,4)],[wall('')]]){
 p.walls=walls;assert.equal(constructionSource(p,edge,registered).sourceIdentityStatus,'needs-review');
 }});
test('room boundary contributions are not mistaken for an explicit independent wall',()=>{
 const p=fixture().plan;p.walls=[wall('a')];p.rooms=[{id:'room',x:0,y:0,w:3,h:2}];
 assert.equal(constructionSource(p,internal({x:0,y:2},{x:3,y:2}),registered).sourceIdentityStatus,'needs-review');
});
test('nonrectangular outlines and upper floors do not borrow first-floor rectangle IDs',()=>{
 const p=fixture().plan;p.house.points=[{x:0,y:0},{x:3,y:0},{x:2,y:6},{x:0,y:6}];const edge={a:{x:0,y:0},b:{x:3,y:0},outer:true};
 assert.equal(rectangleRole(p,edge.a,edge.b),null);assert.equal(constructionSource(p,edge,registered).sourceIdentityStatus,'needs-review');
 delete p.house.points;assert.equal(constructionSource(p,edge,registered,2).constructionSourceId,undefined);
});
test('IDs survive project JSON normalization and leave estimate, revision and physical parts unchanged',()=>{
 const p=migrateProject(JSON.parse(JSON.stringify(fixture())));delete p.settings.productionCutting.constructionSources;
 const old=run(p),estimate=calculateProject(p);p.settings.productionCutting.constructionSources=registered;
 const restored=migrateProject(JSON.parse(JSON.stringify(p))),next=run(restored);
 assert.deepEqual(restored.settings.productionCutting.constructionSources,registered);assert.equal(next.revision,old.revision);
 assert.deepEqual(next.parts,old.parts);assert.deepEqual(next.members,old.members);assert.deepEqual(calculateProject(restored).lines,estimate.lines);assert.deepEqual(calculateProject(restored).totals,estimate.totals);
 assert.ok(next.parts.every(part=>!part.persistentId));
});
test('duplicate source IDs are flagged, invalid roles are not allocated',()=>{
 const r=normalizeConstructionSources({version:1,exterior:{top:'a',bottom:'a',left:''}});assert.equal(r.invalid,true);assert.deepEqual(r.exterior,{top:'a'});
 assert.deepEqual(registerConstructionSources({},['unknown'],()=>{throw new Error('unexpected');}).exterior,{});
 assert.deepEqual(normalizeProductionCutting({constructionSources:registered}).constructionSources,registered);
});
