import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {createBearingTruss,expandBearingTrusses} from '../src/react/calculations/bearing-truss.js';
import {scopedWorkbenchItems,scopedWorkbenchStock,workbenchSurfaces} from '../src/react/screens/workbench-model.js';
import {timberProcurement} from '../src/react/calculations/timber-procurement.js';
import {timberOrderDocument,timberOrderCsv} from '../src/react/export/timber-procurement.js';
const data=JSON.parse(fs.readFileSync(new URL('./fixtures/terrace-0022.json',import.meta.url),'utf8'));
function fixture(){const p=createDefaultProject();p.plan={...p.plan,house:structuredClone(data.house),rooms:[],walls:[],openings:[],wallGaps:[],platforms:structuredClone(data.platforms)};p.settings.roof={...p.settings.roof,...data.roof};p.services.terrace=true;return migrateProject(p);}
const run=p=>{const c=calculateProject(p);return {c,r:calculateProductionCutting(p,c)};};

test('0022 terrace has two actual bearing contacts per rafter and one wall-plate takeoff',()=>{
 const p=fixture(),{c,r}=run(p),platform=r.assembly.platforms[0];assert.equal(platform.posts.length,5);
 const rafters=r.assembly.rafters.filter(m=>m.bearingContacts);assert.equal(rafters.length,17);assert.ok(rafters.every(m=>m.bearingContacts.length===2&&m.bearingStatus==='geometry-only'));
 const ledgers=platform.ties.filter(m=>m.wallLedger);assert.equal(ledgers.length,2);assert.ok(ledgers.every(m=>m.profile==='50×150'&&m.flat));
 const lines=c.lines.filter(l=>l.id.endsWith('wall-plate'));assert.equal(lines.length,1);assert.equal(lines[0].qty,.075);assert.equal(lines[0].price,26400);
 for(const beam of ledgers)assert.equal(r.members.filter(m=>m.id===beam.id).length,1);
 assert.ok(!r.timberStock.unplaced.some(id=>id.includes(':ledger:')));
 const scene=productionScene(r,p);for(const beam of ledgers)assert.equal(scene.beams.filter(m=>m.id===beam.id).length,1);
});

test('all terrace parts have accessible scope and are either packed or explicitly unplaced',()=>{
 const p=fixture(),{c,r}=run(p),surface=workbenchSurfaces(r).find(s=>s.workbenchCategory==='platforms');assert.ok(surface);
 const items=scopedWorkbenchItems(r,{surface,category:'platforms'}),stock=scopedWorkbenchStock(r,items,{scope:'surface',category:'platforms'});
 assert.equal(items.members.length,r.members.filter(m=>m.surfaceId===surface.id&&!m.excluded).length);
 const packed=stock.timberStock.bars.flatMap(b=>b.parts.map(p=>p.id));for(const m of items.members)assert.equal(packed.filter(id=>id===m.id).length+Number(stock.timberStock.unplaced.includes(m.id)),1,m.id);
 const register=timberProcurement(p,c,stock,{source:'cutting'});assert.ok(register.rows.some(r=>r.name.startsWith('Брус ')));assert.ok(register.rows.some(r=>r.name==='Доска 50×150 мм'));
 assert.equal(register.unplacedMembers.filter(m=>m.id.includes(':frame:rim:')).length,2);
 const html=timberOrderDocument(register),csv=timberOrderCsv(register);assert.ok(html.includes('10 пог. м'));assert.ok(csv.includes('Не помещается в хлыст'));assert.ok(!register.unplacedMembers.some(m=>m.id.startsWith('КР-М')));
});

test('bearing truss seats upper rafters, butts lower chords, accounts every board once and survives reopen',()=>{
 const p=fixture(),before=run(p),axis=createBearingTruss(p,before.r.assembly);p.settings.productionCutting.roofSupports.push(axis);
 const saved=migrateProject(JSON.parse(JSON.stringify(p))),{c,r}=run(saved),parts=expandBearingTrusses([axis],r.settings.stockLengthMm);
 assert.equal(r.assembly.supports.filter(m=>m.bearingTrussId===axis.id).length,parts.length);
 assert.equal(c.lines.filter(l=>l.id.startsWith(`production-support-${axis.id}:`)).length,parts.length);
 const rafters=r.assembly.rafters.filter(m=>m.bearingTrussId===axis.id);assert.equal(rafters.length,17);assert.ok(rafters.every(m=>m.bearingStatus==='geometry-only'));
 assert.equal(r.assembly.roofTimbers.filter(m=>m.bearingTrussId===axis.id).length,17);
 assert.ok(c.totals.total>before.c.totals.total);assert.deepEqual(saved.priceMat,p.priceMat);
 for(const m of r.members.filter(m=>m.supportId?.startsWith(axis.id+':')))assert.equal(r.timberStock.bars.flatMap(b=>b.parts).filter(p=>p.id===m.id).length,1,m.id);
 const scoped=scopedWorkbenchItems(r,{category:'supports',scope:'category'});assert.equal(scoped.members.filter(m=>m.supportId?.startsWith(axis.id+':')).length,parts.length);
});

test('truss and rafter overhangs are editable; roof contour and unrelated rafters stay saved',()=>{
 const p=fixture(),base=run(p),axis=createBearingTruss(p,base.r.assembly);axis.trussOverhangStartMm=200;axis.trussOverhangEndMm=300;axis.trussRafterOverhangMm=250;p.settings.productionCutting.roofSupports.push(axis);
 const plan=JSON.stringify(p.plan),{r}=run(p);assert.equal(JSON.stringify(p.plan),plan);
 const rafter=r.assembly.rafters.find(m=>m.bearingTrussId===axis.id);assert.ok(rafter.worldB[1]>3750);assert.ok(rafter.length>base.r.assembly.rafters.find(m=>m.id===rafter.id).length);
 const children=r.assembly.supports.filter(m=>m.bearingTrussId===axis.id);assert.ok(Math.min(...children.flatMap(m=>[m.a[0],m.b[0]]))<0);assert.ok(Math.max(...children.flatMap(m=>[m.a[0],m.b[0]]))>10000);
 const moved=structuredClone(p);moved.settings.productionCutting.roofSupports[0].z1+=100;moved.settings.productionCutting.roofSupports[0].z2+=100;assert.ok(run(moved).r.assembly.issues.some(s=>s.includes('не совпадает с низом стропила')));
});

test('disabling terrace removes its ledger, posts, frame, stock and quantities',()=>{
 const p=fixture();p.services.terrace=false;const {c,r}=run(p);assert.equal(r.assembly.platforms.length,0);assert.ok(!r.members.some(m=>String(m.surfaceId).startsWith('platform:')));assert.ok(!c.lines.some(l=>l.id.endsWith('wall-plate')));
});
