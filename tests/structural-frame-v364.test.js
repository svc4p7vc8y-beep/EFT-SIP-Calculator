import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {framePost,structuralStuds,wallPoint,wallStation} from '../src/react/calculations/structural-frame.js';
import {gableLinks} from '../src/react/calculations/drawing-workbench.js';
import {productionEstimateLines} from '../src/react/calculations/production-estimate.js';
const report=p=>calculateProductionCutting(p,calculateProject(p));
test('50x100 is an explicit manual rafter section with correct purchase volume and catalogue',()=>{
 const p=createDefaultProject();Object.assign(p.settings.roof,{type:'cold',shape:'gable',structureMode:'manual',rafterSection:'50x150'});
 const before=calculateProject(p);p.settings.roof.rafterSection='50x100';const after=calculateProject(p);
 assert.equal(after.roof.rafterStructure.section,'50x100');
 const a=before.lines.find(l=>l.id==='roof:rafters'),b=after.lines.find(l=>l.id==='roof:rafters');
 assert.ok(a&&b);assert.ok(Math.abs(b.qty/a.qty-2/3)<.01);assert.match(b.name,/50×100/);
 assert.notEqual(a.catalogId,b.catalogId);
 const r=report(p);assert.ok(r.assembly.rafters.length);assert.ok(r.assembly.rafters.every(m=>m.profile==='50×100'));
 p.settings.roof.structureMode='auto';assert.equal(calculateProject(p).roof.rafterStructure.section,before.roof.rafterStructure.section);
});
test('structural stud displacement retains its source key and survives save/open without accumulation',()=>{
 const p=createDefaultProject(),r=report(p),wall=r.surfaces.find(s=>s.exterior),stud=structuralStuds(r,wall).find(m=>m.a[0]>500&&m.a[0]<wall.width-500);
 assert.ok(stud);p.settings.productionCutting.memberOverrides[stud.key]={frameOffsetMm:50,nodeRef:'КР-1: паз и положение согласованы'};p.plan.showStructuralFrame=true;
 const next=migrateProject(JSON.parse(JSON.stringify(p))),m=report(next).members.find(m=>m.key===stud.key);
 assert.equal(m.a[0],stud.a[0]+50);assert.equal(report(next).members.find(m=>m.key===stud.key).a[0],m.a[0]);assert.equal(next.plan.showStructuralFrame,true);
 assert.equal(m.length,stud.length);
 p.settings.productionCutting.memberOverrides[stud.key].frameOffsetMm=100000;
 const bad=report(p);assert.equal(bad.members.find(m=>m.key===stud.key).a[0],stud.a[0]);assert.ok(bad.issues.some(i=>i.code==='FRAME_OFFSET'));
});
test('packets of 2/3 boards become actual support stock, keep endpoints and survive migration',()=>{
 for(const plies of [2,3]){const p=createDefaultProject(),wall=report(p).surfaces.find(s=>s.exterior),post=framePost(p,wall,{x:1000,height:2500,plies,nodeRef:'КР-1',foundationRef:'Ф-1'});p.settings.productionCutting.roofSupports.push(post);
 const next=migrateProject(JSON.parse(JSON.stringify(p))),r=report(next),support=r.assembly.supports.find(s=>s.id===post.id),pieces=r.members.filter(m=>m.id.startsWith(support.mark));
 assert.equal(next.settings.productionCutting.roofSupports[0].packageCount,plies);assert.equal(wallStation(wall,wallPoint(wall,1000)),1000);
 assert.ok(r.assembly.supports.some(s=>s.id===post.id));assert.ok(productionScene(r,next).beams.some(s=>s.id===support.mark));
 assert.ok(pieces.length>=plies,JSON.stringify(pieces.map(m=>m.id)));
 const line=productionEstimateLines(next).find(l=>l.id==='production-support-'+post.id);assert.ok(line);assert.equal(line.qty,Math.ceil(2.5*.05*.15*plies*1e6)/1e6);assert.ok(line.catalogId);
 }
});
test('opening visuals survive a manufacturing blocker, and gross gable width retains placement',()=>{
 const p=createDefaultProject();p.plan.openings.push({id:'visible',type:'window',outer:true,x:2,y:0,width:1,height:1,sillHeight:.8,orientation:'h'});
 const r=report(p),wall=r.surfaces.find(s=>s.openings?.some(o=>o.id==='visible'));assert.ok(wall);wall.blocked=true;
 assert.ok(productionScene(r,p).panels.some(p=>p.id.startsWith('window:visible')));
 const gable=r.surfaces.find(s=>s.parentWallId);if(gable){const parent=r.surfaces.find(s=>s.id===gable.parentWallId);gable.geometry=[[[[100,0],[200,0],[150,100]]]];assert.equal(gableLinks(r).find(l=>l.gable.id===gable.id).wall.id,parent.id);}
});
