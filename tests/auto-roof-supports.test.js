import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject,migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting,groupMembers } from '../src/react/calculations/production-cutting.js';
import { generateRoofSupportLayout,mergeRoofSupportLayout } from '../src/react/calculations/auto-roof-supports.js';
import { changeSupportWithPosts } from '../src/react/calculations/assembly-placement.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { productionEstimateLines } from '../src/react/calculations/production-estimate.js';
import { productionRegisters,releaseValidation } from '../src/react/calculations/project-release.js';
const base=()=>{const p=createDefaultProject();p.plan={...p.plan,house:{w:5,h:4},wallHeight:2.5,rooms:[],walls:[],openings:[],platforms:[]};p.settings.roof.ridgeHeight=1.2;p.settings.productionCutting.kerfMm=3;p.settings.productionCutting.endAllowanceMm=0;return p;};
const run=p=>calculateProductionCutting(p,calculateProject(p));
test('uniform single/double/triple layouts use real slope heights with editable post counts',()=>{
 const p=base(),r=run(p),before=structuredClone(p);
 for(const [variant,n]of [['single',1],['double',2],['triple',3]]){const a=generateRoofSupportLayout(p,r,{variant,postCount:4});assert.deepEqual(a.errors,[]);assert.deepEqual(a.counts,{purlins:n,posts:n*4});
  assert.ok(a.items.filter(i=>i.type==='purlin').every(i=>i.x2-i.x1===5000));assert.ok(a.items.filter(i=>i.type==='post').every(i=>i.x1===i.x2&&i.y1===i.y2&&i.z2>i.z1));
  const heights=a.items.filter(i=>i.type==='purlin').map(i=>i.z1);assert.deepEqual(heights,variant==='single'?[3700]:variant==='double'?[3100,3100]:[3100,3700,3100]);
 }
 assert.deepEqual(p,before);
});
test('roof axis Y and moved rectangular origin are respected',()=>{
 const p=base();p.settings.roof.ridgeAxis='y';const r=run(p);r.assembly.bounds.x=1000;r.assembly.bounds.y=-2000;r.assembly.floors.at(-1).contour=[[1000,-2000],[6000,-2000],[6000,2000],[1000,2000]];
 const a=generateRoofSupportLayout(p,r,{postCount:3});assert.deepEqual(a.errors,[]);const b=a.items[0];assert.equal(b.x1,3500);assert.equal(b.x2,3500);assert.equal(b.y1,-2000);assert.equal(b.y2,2000);
});
test('bearing intersection preset deduplicates shared wall endpoints and adds edge posts',()=>{
 const p=base(),r=run(p);r.assembly.floors.at(-1).bearing=[{a:[2500,0],b:[2500,2000]},{a:[2500,2000],b:[2500,4000]}];
 const a=generateRoofSupportLayout(p,r,{distribution:'bearing'});assert.deepEqual(a.counts,{purlins:1,posts:3});assert.deepEqual(a.items.filter(i=>i.type==='post').map(i=>i.x1),[0,2500,5000]);
 assert.deepEqual(generateRoofSupportLayout(p,r,{distribution:'bearing',postCount:100}).errors,[],'Hidden uniform count must not block intersection layout');
});
test('invalid dimensions, trusses, complex footprints and tapered insulation cannot fake a support model',()=>{
 const p=base(),r=run(p);for(const config of [{postCount:1},{postCount:2.5},{postCount:100},{purlinProfile:''},{baseZ:100000}])assert.ok(generateRoofSupportLayout(p,r,config).errors.length);
 r.assembly.rafterSystem='truss';assert.equal(generateRoofSupportLayout(p,r,{}).items.length,0);r.assembly.rafterSystem='hanging';r.assembly.floors.at(-1).contour.push([1,1]);assert.ok(generateRoofSupportLayout(p,r,{}).errors.length);
});
test('single-slope structural and tiered roofs use existing sections, not a new pitch formula',()=>{
 const p=base();p.settings.roof.shape='flat';p.settings.roof.flatSlopeMode='structural';p.settings.roof.flatSlopePercent=5;
 let r=run(p),a=generateRoofSupportLayout(p,r,{baseZ:2000});assert.deepEqual(a.errors,[]);assert.ok(a.items.filter(i=>i.type==='post').every(i=>i.z2>2000));
 p.settings.roof.flatSlopeMode='tapered';r=run(p);assert.ok(generateRoofSupportLayout(p,r,{}).errors.length);
 p.settings.roof.shape='tiered';p.settings.roof.type='cold';r=run(p);a=generateRoofSupportLayout(p,r,{variant:'double',baseZ:2000});assert.deepEqual(a.errors,[]);assert.equal(a.counts.purlins,2);
});
test('warm gable roof places supports using SIP panel planes when rafters are absent',()=>{
 const p=base();p.settings.roof.type='sip';const r=run(p),a=generateRoofSupportLayout(p,r,{});assert.equal(r.assembly.rafters.length,0);assert.deepEqual(a.errors,[]);assert.equal(a.items[0].z1,3700);
});
test('auto layouts are opt-in, repeated application replaces only unlocked auto items',()=>{
 const p=base(),r=run(p),a=generateRoofSupportLayout(p,r,{});assert.equal(p.settings.productionCutting.roofSupports.length,0);
 const manual={...a.items[0],id:'manual',name:'Ручной',x1:100,y1:10,x2:200,y2:10,autoLayout:undefined};
 const once=mergeRoofSupportLayout([manual],a.items),twice=mergeRoofSupportLayout(once,a.items);assert.deepEqual(twice,once);assert.deepEqual(twice[0],manual);
 const changed=changeSupportWithPosts(twice,'auto-roof-p1',{x1:1000});const again=mergeRoofSupportLayout(changed,a.items);assert.equal(again.find(i=>i.id==='auto-roof-p1').x1,1000);assert.equal(again.length,twice.length);
 assert.deepEqual(again,changed);
 const double=generateRoofSupportLayout(p,r,{variant:'double'}).items,moved=changeSupportWithPosts(double,'auto-roof-p2',{y1:3200,y2:3200});
 assert.deepEqual(mergeRoofSupportLayout(moved,double),moved,'Repeated layout must not renumber surviving positions');
});
test('identical manually placed members are not duplicated and linked IDs are remapped',()=>{
 const p=base(),a=generateRoofSupportLayout(p,run(p),{}),manual={...a.items[0],id:'manual-beam',autoLayout:undefined};
 const merged=mergeRoofSupportLayout([manual],a.items);assert.equal(merged.filter(i=>i.type==='purlin').length,1);assert.ok(merged.filter(i=>i.type==='post').every(i=>i.upperSupport==='manual-beam'));assert.deepEqual(merged[0],manual);
});
test('moving a purlin moves attached posts by the same fractions and adjusts their top heights',()=>{
 const p=base(),a=generateRoofSupportLayout(p,run(p),{}),before=structuredClone(a.items),moved=changeSupportWithPosts(a.items,'auto-roof-p1',{x1:1000,z1:3900});
 assert.deepEqual(a.items,before);const posts=moved.filter(i=>i.type==='post');assert.deepEqual(posts.map(i=>i.x1),[1000,3000,5000]);assert.deepEqual(posts.map(i=>i.z2),[3900,3800,3700]);assert.ok(posts.every(i=>i.x1===i.x2&&i.y1===i.y2&&i.autoLocked));
});
test('generated marks, stock, registers and 3D share the same saved members; unverified supports remain blocked',()=>{
 const p=base(),a=generateRoofSupportLayout(p,run(p),{});p.settings.productionCutting.roofSupports=a.items;const c=calculateProject(p),r=calculateProductionCutting(p,c),members=r.members.filter(m=>m.source==='Проектная опора');
 assert.equal(members.length,4);assert.equal(groupMembers(members).reduce((n,g)=>n+g.qty,0),4);assert.equal(productionScene(r,p).beams.filter(m=>m.layer==='supports').length,4);
 const registers=productionRegisters(r);for(const m of members)assert.ok(registers.timber.some(row=>row.ids.includes(m.id)));
 assert.ok(members.every(m=>m.displayMark));assert.ok(r.assembly.supports.every(s=>!s.loadPath.complete));assert.equal(releaseValidation(p,c,r).canRelease,false);
 assert.ok(members.every(m=>r.timberStock.bars.some(b=>b.parts.some(part=>part.id===m.id))));
});
test('estimate stays unchanged until catalog selection; clean volume is counted once after opt-in',()=>{
 const p=base(),r=run(p),total=calculateProject(p).totals.total,config={purlinCatalogId:'TEST-TIMBER',postCatalogId:'TEST-TIMBER',estimateEnabled:true};
 p.settings.productionCutting.roofSupports=generateRoofSupportLayout(p,r,{}).items;assert.equal(calculateProject(p).totals.total,total);
 p.priceMat.push({id:'TEST-TIMBER',name:'Тестовый брус',unit:'м³',price:10000});const a=generateRoofSupportLayout(p,r,config);p.settings.productionCutting.roofSupports=mergeRoofSupportLayout(p.settings.productionCutting.roofSupports,a.items);
 const lines=productionEstimateLines(p);assert.equal(lines.length,4);assert.ok(Math.abs(lines.reduce((sum,l)=>sum+l.qty,0)-.129)<1e-8);assert.ok(Math.abs(calculateProject(p).totals.total-total-1290)<.01);
 p.settings.productionCutting.roofSupports=mergeRoofSupportLayout(p.settings.productionCutting.roofSupports,a.items);assert.equal(productionEstimateLines(p).length,4);
});
test('legacy projects do not gain roof supports and config plus manual locks survives JSON reopen',()=>{
 const p=base(),saved=JSON.parse(JSON.stringify(p));delete saved.settings.productionCutting.autoRoofSupports;const restored=migrateProject(saved);assert.equal(restored.settings.productionCutting.roofSupports.length,0);assert.equal(restored.settings.productionCutting.autoRoofSupports.distribution,'uniform');
 const a=generateRoofSupportLayout(p,run(p),{variant:'double',postCount:5});p.settings.productionCutting.roofSupports=changeSupportWithPosts(a.items,a.items[0].id,{name:'Мой прогон'});p.settings.productionCutting.autoRoofSupports={variant:'double',postCount:5};const next=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(next.settings.productionCutting.autoRoofSupports.postCount,5);assert.ok(next.settings.productionCutting.roofSupports[0].autoLocked);
});
