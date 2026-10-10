import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject,migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { combinedWall,gableLinks,purchaseRows } from '../src/react/calculations/drawing-workbench.js';
import { scopedWorkbenchItems,scopedWorkbenchStock,scopedPurchases,locateWorkbenchItem,CONSTRUCTION_CATEGORIES,WORKBENCH_MODES } from '../src/react/screens/workbench-model.js';
const fixture=()=>{const p=createDefaultProject();p.plan={...p.plan,house:{w:5,h:4},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[],wallHeight:2.5};p.settings.roof.gableType='sip';p.settings.productionCutting.kerfMm=3;p.settings.productionCutting.endAllowanceMm=0;return p;};
const run=p=>calculateProductionCutting(p,calculateProject(p));
test('construction navigation excludes actions and preserves four distinct work modes',()=>{
 assert.equal(WORKBENCH_MODES.length,4);assert.equal(new Set(WORKBENCH_MODES.map(x=>x[0])).size,4);
 assert.ok(!CONSTRUCTION_CATEGORIES.some(([id])=>['stock','sheets','nodes','starter','supports'].includes(id)));
 assert.equal(CONSTRUCTION_CATEGORIES.find(x=>x[0]==='piles')[1],'Основание');
});
test('selected combined wall includes its gable, not every wall of the project',()=>{
 const r=run(fixture()),links=gableLinks(r),wall=links.find(l=>l.wall)?.wall;
 const drawing=combinedWall(r,wall,links),items=scopedWorkbenchItems(r,{surface:wall,drawing,category:'walls',floor:1});
 assert.deepEqual(items.parts.map(p=>p.id),drawing.parts.map(p=>p.id));assert.ok(items.parts.some(p=>p.surfaceId!==wall.id));
 assert.ok(items.parts.length<r.parts.length);assert.ok(items.members.every(m=>!m.excluded));
});
test('floor scope excludes other floors and project scope includes every active detail',()=>{
 const r=run(fixture()),first=r.surfaces[0];r.surfaces.push({...first,id:'upper',floor:2});r.parts.push({...r.parts[0],id:'upper-P',surfaceId:'upper'});r.members.push({...r.members[0],id:'upper-M',surfaceId:'upper',excluded:false});
 const floor=scopedWorkbenchItems(r,{scope:'floor',floor:2});assert.deepEqual(floor.parts.map(p=>p.id),['upper-P']);assert.deepEqual(floor.members.map(m=>m.id),['upper-M']);
 const all=scopedWorkbenchItems(r,{scope:'project'});assert.equal(all.parts.length,r.parts.length);assert.equal(all.members.length,r.members.filter(m=>!m.excluded).length);
});
test('base and overview never silently use all timber for the selected-construction scope',()=>{
 const r=run(fixture());for(const category of ['overview','piles','starter'])assert.deepEqual(scopedWorkbenchItems(r,{category}),{parts:[],members:[]});
 const binding=scopedWorkbenchItems(r,{category:'binding'});assert.ok(binding.members.every(m=>m.surface==='Обвязка'));
});
test('shared stock sheets are whole blanks, with no fractional counts or changed cut parts',()=>{
 const r=run(fixture()),p=r.parts[0],items={parts:[p],members:[]},before=structuredClone(r);
 const filtered=scopedWorkbenchStock(r,items,{scope:'surface',category:'walls'});
 assert.ok(filtered.panelStock.sheets.every(s=>s.parts.some(x=>x.id===p.id)));assert.ok(filtered.timberStock.bars.length===0);
 const rows=scopedPurchases(r,items,{scope:'surface',category:'walls'});assert.ok(rows.every(row=>Number.isInteger(row.qty)));
 assert.deepEqual(r,before);assert.deepEqual(scopedPurchases(r,items,{scope:'project'}),purchaseRows(r));
});
test('selection and issue navigation resolve physical IDs and saved layout keys',()=>{
 const r=run(fixture()),p=r.parts[0],m=r.members.find(m=>m.surfaceId&&m.key),s=r.surfaces.find(s=>s.id===p.surfaceId);
 assert.equal(locateWorkbenchItem(r,p.id).panel,p);assert.equal(locateWorkbenchItem(r,p.id).surface,s);
 assert.equal(locateWorkbenchItem(r,s.layoutKey).surface,s);if(m)assert.equal(locateWorkbenchItem(r,m.key).member,m);
 assert.equal(locateWorkbenchItem(r,'missing').category,null);
});

test('stock scope includes fabrication pieces of the selected spliced assembly member',()=>{
 const r=run(fixture()),member=r.members[0];r.fabricationMembers=[{id:'piece-1',assemblyMemberId:member.id},{id:'piece-2',assemblyMemberId:member.id}];
 r.timberStock.bars=[{id:'bar-1',parts:[{id:'piece-1'}]},{id:'bar-2',parts:[{id:'piece-2'}]},{id:'other',parts:[{id:'unrelated'}]}];
 const filtered=scopedWorkbenchStock(r,{parts:[],members:[member]},{scope:'surface',category:'binding'});
 assert.deepEqual(filtered.timberStock.bars.map(b=>b.id),['bar-1','bar-2']);assert.equal(r.timberStock.bars.length,3);
 assert.equal(locateWorkbenchItem(r,'piece-1').member,member);
});
test('all view scopes leave project, prices, estimates and imported manual overrides unchanged',()=>{
 const p=fixture();p.settings.productionCutting.notes='Узел по проекту';const before=structuredClone(p),total=calculateProject(p).totals.total,r=run(p);
 for(const scope of ['surface','floor','project']){const surface=r.surfaces[0],drawing={surface,parts:r.parts.filter(p=>p.surfaceId===surface.id),members:r.members.filter(m=>m.surfaceId===surface.id)};const items=scopedWorkbenchItems(r,{scope,surface,drawing,category:'walls',floor:1});scopedPurchases(r,items,{scope,category:'walls'});}
 assert.deepEqual(p,before);assert.equal(calculateProject(p).totals.total,total);assert.equal(migrateProject(JSON.parse(JSON.stringify(p))).settings.productionCutting.notes,'Узел по проекту');
});
