import test from 'node:test';
import assert from 'node:assert/strict';
import {constructionSource,sourceBindingKey} from '../src/react/calculations/construction-sources.js';
import {normalizeConstructionSources,registerConstructionSources} from '../src/react/state/construction-sources.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {recordProductionRegistry} from '../src/react/state/production-identities.js';
const edge={a:{x:0,y:2},b:{x:6,y:2},outer:false};
const plan=()=>({house:{w:6,h:4,contourDefined:true},rooms:[{id:'a',name:'Кухня',x:0,y:0,w:6,h:2},{id:'b',name:'Парная',x:0,y:2,w:6,h:2}],walls:[{id:'w',x1:0,y1:2,x2:6,y2:2}]});
const saved=ref=>({version:1,exterior:{},selections:{[sourceBindingKey(edge)]:ref}});
test('automatic mark reservations do not copy manual selections into undo snapshots',()=>{
 const previous=createDefaultProject(),present=structuredClone(previous);present.settings.productionCutting.constructionSources=saved({kind:'plan-wall',id:'w'});
 const state={present,past:[previous],future:[previous]};const next=recordProductionRegistry(state,present,{version:1,entries:[{key:'panel:[]',mark:'П1'}]},['top'],()=> 'registered');
 assert.equal(next.present.settings.productionCutting.constructionSources.selections[sourceBindingKey(edge)].id,'w');
 assert.equal(next.past[0].settings.productionCutting.constructionSources.selections,undefined);assert.equal(next.future[0].settings.productionCutting.constructionSources.selections,undefined);
});
test('explicit full-wall selection resolves mixed contributors without removing them',()=>{
 const p=plan();assert.equal(constructionSource(p,edge,{}).sourceTopology,'mixed-sources');
 const r=constructionSource(p,edge,saved({kind:'plan-wall',id:'w'}));assert.equal(r.constructionSourceId,'partition:w');assert.equal(r.sourceContributors.length,3);assert.equal(r.sourceBinding.id,'w');
});
test('whole room side can be explicitly selected; winding and ordering do not change reference',()=>{
 const p=plan(),s=saved({kind:'room-side',id:'b',role:'top'});const r=constructionSource(p,edge,s);
 p.rooms.reverse();assert.equal(constructionSource(p,{...edge,a:edge.b,b:edge.a},s).constructionSourceId,r.constructionSourceId);assert.equal(r.constructionSourceId,'room-boundary:[["b","top"]]');
});
test('partial, missing, disabled and duplicate selected sources never get an ID',()=>{
 for(const change of [p=>p.walls[0].x2=3,p=>p.walls=[],p=>p.walls[0].include=false,p=>p.walls.push({...p.walls[0]})]){
 const p=plan();change(p);const r=constructionSource(p,edge,saved({kind:'plan-wall',id:'w'}));assert.equal(r.sourceIdentityStatus,'needs-review');assert.equal(r.constructionSourceId,undefined);assert.match(r.sourceIdentityReason,/Ручная привязка/);
 }
});
test('moved target does not inherit manual choice by ordinal or source ID',()=>{
 const p=plan();p.walls[0].y1=p.walls[0].y2=3;const moved={a:{x:0,y:3},b:{x:6,y:3},outer:false};
 assert.equal(constructionSource(p,moved,saved({kind:'plan-wall',id:'w'})).sourceBinding,undefined);
});
test('selection survives normalization, exterior registration and JSON migration',()=>{
 const s=saved({kind:'room-side',id:'a',role:'bottom'});assert.deepEqual(normalizeConstructionSources(s).selections,s.selections);
 assert.deepEqual(registerConstructionSources(s,['top'],()=> 'external').selections,s.selections);
 const p=createDefaultProject();p.settings.productionCutting.constructionSources=s;assert.deepEqual(migrateProject(JSON.parse(JSON.stringify(p))).settings.productionCutting.constructionSources.selections,s.selections);
 assert.equal(normalizeConstructionSources(saved({kind:'room-side',id:'a',role:'unknown'})).invalid,true);
});
test('manual declaration changes neither material quantities nor estimate or old layout keys',()=>{
 const p=createDefaultProject();Object.assign(p.plan,plan());const before=calculateProject(p),r1=calculateProductionCutting(p,before);
 p.settings.productionCutting.constructionSources=saved({kind:'plan-wall',id:'w'});const after=calculateProject(p),r2=calculateProductionCutting(p,after);
 assert.deepEqual(after.lines,before.lines);assert.deepEqual(after.totals,before.totals);assert.deepEqual(r2.parts,r1.parts);assert.deepEqual(r2.members,r1.members);assert.deepEqual(r2.surfaces.map(s=>s.layoutKey),r1.surfaces.map(s=>s.layoutKey));
 assert.equal(r2.geometryDiagnostics.model.partitionSources[0].constructionSourceId,'partition:w');
});
