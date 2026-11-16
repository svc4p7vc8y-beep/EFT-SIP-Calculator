import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {railingLayout,projectRailingLayouts,railingEstimateLines} from '../src/react/calculations/platform-railings.js';
import {addRailing,addStairRailing,moveRailing,removeRailing} from '../src/react/planner/railing-editing.js';
import {foundationGrid,createFoundationGrid,moveFoundationRow,moveFoundationPile} from '../src/react/planner/foundation-editing.js';
import {calculateFoundation,pileRowPoints} from '../src/react/calculations/foundation-model.js';
import {applySharedPriceCatalog} from '../src/react/cloud/price-catalog.js';

function fixture(){const p=createDefaultProject();Object.assign(p.plan,{house:{...p.plan.house,w:6,h:6,points:[],contourDefined:true},rooms:[],walls:[],openings:[],platforms:[],pileRows:[],bindingLines:[],piles:[]});p.plan.platforms.push({id:'t',kind:'terrace',x:0,y:6,w:6,h:2,include:true,steps:3,tread:.3,riser:.18,stairWidth:1.2,stairSide:'bottom',roof:{mode:'cold',shape:'shed',postSection:'150x100'},railings:[{id:'r',a:[0,2],b:[6,2]}]});return p;}
test('guard reuses three roof posts and inserts only two infill posts without breaking the handrails',()=>{
 const p=fixture(),before=JSON.stringify(p),calculation=calculateProject(p),layout=projectRailingLayouts(p,calculation.roof)[0];
 assert.equal(layout.posts.length,5);assert.equal(layout.members.filter(m=>m.kind==='post').length,2);assert.equal(layout.members.filter(m=>m.kind==='handrail').length,2);assert.equal(layout.members.filter(m=>m.kind==='rail').length,12);
 assert.ok(layout.members.filter(m=>m.kind==='rail').every(m=>Math.hypot(m.b[0]-m.a[0],m.b[1]-m.a[1])<=1500));
 assert.ok(layout.members.filter(m=>m.kind==='handrail').every(m=>m.profile==='90×45'&&m.materialProfile==='45×90'&&m.a[2]+22.5===950));
 assert.ok(layout.members.filter(m=>m.kind==='rail').some(m=>m.a[2]-75===100));assert.ok(layout.members.filter(m=>m.kind==='post').every(m=>m.b[2]===905&&m.profile==='150×100'));
 const labor=calculation.lines.find(l=>l.catalogId==='LAB-RAILING-ASSEMBLY');assert.equal(labor.qty,6);assert.equal(labor.price,2500);assert.equal(labor.qty*labor.price,15000);assert.equal(JSON.stringify(p),before);
});
test('stair first post uses project section and stops at the sloping handrail; both sides can be added and selected',()=>{
 const p=fixture(),id=addStairRailing(p.plan,'t',0);assert.ok(id);const calc=calculateProject(p),layout=projectRailingLayouts(p,calc.roof)[0],bottom=layout.posts.find(s=>s.a[2]===-540);assert.ok(bottom);assert.equal(bottom.profile,'150×100');assert.equal(bottom.b[2],365);assert.ok(layout.runs.some(r=>Math.abs(r.lengthMm-Math.hypot(900,540))<1e-6));assert.ok(addStairRailing(p.plan,'t',1));
});
test('missing guards change no quantities, duplicate runs/posts are not billed twice, and small or invalid settings report a problem',()=>{
 const p=fixture(),calc=calculateProject(p),first=projectRailingLayouts(p,calc.roof)[0];p.plan.platforms[0].railings.push({id:'duplicate',a:[6,2],b:[0,2]});assert.equal(projectRailingLayouts(p,calc.roof)[0].members.length,first.members.length);
 p.plan.platforms[0].railingSettings={maxSpanMm:1600};assert.ok(projectRailingLayouts(p,calc.roof)[0].issues.length);p.plan.platforms[0].railings=[];assert.equal(railingEstimateLines(p,calc.roof).length,0);
 const tiny=railingLayout({...p.plan.platforms[0],railingSettings:{},railings:[{id:'short',a:[0,0],b:[.1,0]}]});assert.equal(tiny.members.length,0);assert.ok(tiny.issues.length);
});
test('physical parts reach cutting and 3D once; project import preserves guards, clear spans and price overrides',()=>{
 const p=fixture(),calc=calculateProject(p),report=calculateProductionCutting(p,calc),parts=report.members.filter(m=>m.id.startsWith('railing:'));assert.equal(parts.length,16);const scene=productionScene(report,p);assert.equal(scene.beams.filter(m=>m.id.startsWith('railing:')).length,16);
 const restored=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(projectRailingLayouts(restored,calculateProject(restored).roof)[0].members.length,16);restored.priceLab.find(r=>r.id==='LAB-RAILING-ASSEMBLY').price=3000;assert.equal(calculateProject(restored).lines.find(l=>l.id==='terrace:railing-work').price,3000);
});
test('plan drawing, movement, endpoint editing, deletion and rectangular/stair local coordinates survive round trips',()=>{
 const p=fixture();p.plan.platforms[0].railings=[];const id=addRailing(p.plan,{x:0,y:8},{x:6,y:8},'t');assert.ok(id);assert.equal(addRailing(p.plan,{x:6,y:8},{x:0,y:8},'t'),id);moveRailing(p.plan,id,0,-.1);assert.equal(p.plan.platforms[0].railings[0].a[1],1.9);moveRailing(p.plan,id,0,0,1,{x:5.8,y:7.9});assert.deepEqual(p.plan.platforms[0].railings[0].b,[5.8,1.9]);removeRailing(p.plan,id);assert.equal(p.plan.platforms[0].railings.length,0);assert.equal(addRailing(p.plan,{x:100,y:100},{x:101,y:100}),null);
});
test('new labor item is supplied when an older shared catalog lacks it; existing server rates are kept',()=>{
 const p=fixture(),catalog={priceMat:p.priceMat,priceLab:p.priceLab.filter(r=>r.id!=='LAB-RAILING-ASSEMBLY')},before=JSON.stringify(catalog);const applied=applySharedPriceCatalog(p,catalog,1);assert.equal(applied.priceLab.find(r=>r.id==='LAB-RAILING-ASSEMBLY').price,2500);assert.equal(JSON.stringify(catalog),before);catalog.priceLab=[...catalog.priceLab,{id:'LAB-RAILING-ASSEMBLY',price:2800,unit:'м.п.',kind:'labor'}];assert.equal(applySharedPriceCatalog(p,catalog,2).priceLab.find(r=>r.id==='LAB-RAILING-ASSEMBLY').price,2800);
});
test('equal foundation grid creates rows and binding on user action, does not duplicate them, and clips an L contour',()=>{
 const p=fixture();p.plan.platforms=[];p.plan.foundationGrid={enabled:true,columns:3,rows:2};assert.equal(foundationGrid(p.plan).width,6);createFoundationGrid(p.plan);assert.equal(p.plan.pileRows.length,3);assert.equal(calculateFoundation(p.plan).points.length,12);createFoundationGrid(p.plan);assert.equal(p.plan.pileRows.length,3);createFoundationGrid(p.plan,'binding');assert.equal(p.plan.bindingLines.length,7);
 p.plan.house.points=[{x:0,y:0},{x:6,y:0},{x:6,y:3},{x:3,y:3},{x:3,y:6},{x:0,y:6}];createFoundationGrid(p.plan,'piles',true);assert.ok(calculateFoundation(p.plan).points.every(q=>q.x<=3||q.y<=3));
});
test('any endpoint pile can move in both axes; counts stay fixed, row moves also move its detached pile and linked binding',()=>{
 const p=fixture();p.plan.platforms=[];p.plan.pileRows=[{id:'a',x1:0,y1:0,x2:6,y2:0,count:4}];p.plan.bindingLines=[{id:'binding-a',x1:0,y1:0,x2:6,y2:0,auto:true}];const id=moveFoundationPile(p.plan,{x:0,y:0},{x:.2,y:.3});assert.ok(id);assert.equal(calculateFoundation(p.plan).points.length,4);assert.ok(calculateFoundation(p.plan).points.some(q=>q.x===.2&&q.y===.3));moveFoundationRow(p.plan,'a',0,1);assert.equal(p.plan.piles[0].y,1.3);assert.equal(p.plan.bindingLines[0].y1,1);assert.equal(calculateFoundation(p.plan).points.length,4);assert.deepEqual(pileRowPoints(p.plan.pileRows[0])[1],{x:2,y:1,source:'house'});
});
