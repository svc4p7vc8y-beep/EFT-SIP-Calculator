import test from 'node:test';
import assert from 'node:assert/strict';
import {constructionSource} from '../src/react/calculations/construction-sources.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
const room=(id,x=0,y=0,w=6,h=2)=>({id,name:id,x,y,w,h});
const plan=()=>({house:{w:6,h:4,contourDefined:true},rooms:[room('a'),room('b',0,2)],walls:[]});
const edge=(x1=0,y1=2,x2=6,y2=2)=>({a:{x:x1,y:y1},b:{x:x2,y:y2},outer:false});
const source=p=>constructionSource(p,edge(),{});
test('two opposite whole room sides share a source identity independent of room order',()=>{
 const p=plan(),s=source(p);assert.equal(s.sourceTopology,'shared-room-boundary');assert.equal(s.sourceIdentityStatus,'registered-source');
 assert.deepEqual(s.constructionSourceRef.sides,[['a','bottom'],['b','top']]);
 p.rooms.reverse();assert.equal(source(p).constructionSourceId,s.constructionSourceId);
});
test('source role identity survives room resize and translation but not replacing the room',()=>{
 const p=plan(),s=source(p);p.rooms=[room('a',1,1,7,2),room('b',1,3,7,2)];
 assert.equal(constructionSource(p,edge(1,3,8,3),{}).constructionSourceId,s.constructionSourceId);
 p.rooms[1].id='new';assert.notEqual(constructionSource(p,edge(1,3,8,3),{}).constructionSourceId,s.constructionSourceId);
});
test('one whole room side is a registered source; extension and excluded rooms do not contribute',()=>{
 const p=plan();p.rooms[1].include=false;const s=source(p);assert.equal(s.sourceTopology,'single-room-side');assert.equal(s.sourceContributors.length,1);
 p.rooms[1].include=true;p.rooms[1].extension=true;assert.equal(source(p).constructionSourceId,s.constructionSourceId);
});
test('partial shared boundaries are diagnosed as split without inheriting the whole source ID',()=>{
 const s=constructionSource(plan(),edge(0,2,3,2),{});assert.equal(s.sourceTopology,'split-source');assert.equal(s.constructionSourceId,undefined);assert.equal(s.sourceContributors.length,2);
});
test('adjacent room sides merged into a longer production wall are listed without assigning one ID',()=>{
 const p=plan();p.rooms=[room('a',0,0,3,2),room('b',3,0,3,2)];const s=source(p);
 assert.equal(s.sourceTopology,'merged-sources');assert.equal(s.constructionSourceId,undefined);assert.ok(s.sourceContributors.every(r=>!r.complete));
});
test('same-side coincident rooms, too many contributors and duplicate room IDs are ambiguous',()=>{
 const p=plan();for(const rooms of [[room('a'),room('b')],[room('a'),room('b',0,2),room('c')],[room('a'),room('a',0,2)]]){
 p.rooms=rooms;assert.equal(source(p).sourceTopology,'ambiguous-sources');assert.equal(source(p).constructionSourceId,undefined);
 }});
test('explicit wall mixed with room sources remains unresolved and lists all contributors',()=>{
 const p=plan();p.walls=[{id:'w',x1:0,y1:2,x2:6,y2:2}];const s=source(p);
 assert.equal(s.sourceTopology,'mixed-sources');assert.equal(s.sourceContributors.length,3);assert.equal(s.constructionSourceId,undefined);
});
test('polygon room without stable side roles is not registered by its vertex index',()=>{
 const p=plan();p.rooms=[{id:'a',points:[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:0,y:3}]}];
 const s=constructionSource(p,edge(6,0,6,2),{});assert.equal(s.sourceTopology,'unsupported-room-contour');assert.equal(s.constructionSourceId,undefined);
});
test('room winding does not change semantic side identity, missing IDs stay unresolved',()=>{
 const p=plan(),s=source(p);p.rooms[0].points=[{x:6,y:2},{x:6,y:0},{x:0,y:0},{x:0,y:2}];
 assert.equal(source(p).constructionSourceId,s.constructionSourceId);delete p.rooms[0].id;
 assert.equal(source(p).sourceTopology,'ambiguous-sources');
});
test('explicit line topology distinguishes splitting, merging and coincident ambiguity',()=>{
 const p=plan();p.rooms=[];p.walls=[{id:'a',x1:0,y1:2,x2:6,y2:2}];
 assert.equal(constructionSource(p,edge(0,2,3,2),{}).sourceTopology,'split-source');
 p.walls.push({...p.walls[0],id:'b'});assert.equal(source(p).sourceTopology,'ambiguous-sources');
 p.walls[0].x2=3;p.walls[1].x1=3;assert.equal(source(p).sourceTopology,'merged-sources');
});
test('production and geometry adapter expose matching room sources and preserve JSON and calculation inputs',()=>{
 const p=createDefaultProject();Object.assign(p.plan,plan(),{openings:[],wallGaps:[],platforms:[]});Object.assign(p.settings.productionCutting,{kerfMm:3,endAllowanceMm:0});
 const before=structuredClone(p),estimate=calculateProject(p),r=calculateProductionCutting(p,estimate),s=r.surfaces.find(s=>s.sourceTopology==='shared-room-boundary');assert.ok(s);
 assert.equal(r.geometryDiagnostics.model.partitionSources.find(s=>s.constructionSourceId).constructionSourceId,s.constructionSourceId);
 assert.deepEqual(p,before);assert.deepEqual(calculateProject(p).lines,estimate.lines);assert.deepEqual(calculateProject(p).totals,estimate.totals);
 const restored=migrateProject(JSON.parse(JSON.stringify(p))),next=calculateProductionCutting(restored,calculateProject(restored));
 assert.equal(next.surfaces.find(s=>s.sourceTopology==='shared-room-boundary').constructionSourceId,s.constructionSourceId);
 assert.ok(r.parts.every(part=>!part.persistentId));
});
