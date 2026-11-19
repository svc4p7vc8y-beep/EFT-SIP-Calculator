import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {editPlatformPost,platformPostAnchor} from '../src/react/calculations/platform-roof-support-layout.js';
function fixture(){const p=createDefaultProject();p.services.terrace=true;p.plan.platforms=[{id:'t',kind:'terrace',x:1,y:p.plan.house.h,w:4,h:6,include:true,foundation:{mode:'none'},binding:{mode:'none'},roof:{mode:'cold',shape:'gable',postSection:'100x100'}}];return p;}
const report=p=>calculateProductionCutting(p,calculateProject(p));
test('terrace rafters have two bearing edges, matching stock, estimate and base anchors',()=>{
 const p=fixture(),c=calculateProject(p),r=report(p),a=r.assembly.platforms[0];
 assert.equal(a.posts.length,4);assert.equal(new Set(a.posts.map(p=>p.runId)).size,2);
 assert.equal(c.roof.terraceRoofs[0].result.tieLength,12);
 assert.ok(a.ties.every(t=>t.a[0]===t.b[0]));
 for(const post of a.posts)assert.ok(r.members.some(m=>m.id===post.id&&m.length>0));
 const line=c.lines.find(l=>l.id==='terrace:post-anchor-base');assert.equal(line.qty,4);assert.equal(line.price,4000);
 assert.equal(platformPostAnchor(a.posts[0],{points:[{x:a.posts[0].a[0]/1000,y:a.posts[0].a[1]/1000}]}),'pile');
});
test('removing actual deck and joists preserves roof posts and omits their purchase and meshes',()=>{
 const p=fixture(),original=calculateProject(p);p.plan.platforms[0].deckEnabled=false;p.plan.platforms[0].joistsEnabled=false;
 const c=calculateProject(p),r=report(p),scene=productionScene(r,p),a=r.assembly.platforms[0];
 assert.equal(a.posts.length,4);assert.equal(a.frameMembers.length,0);
 assert.ok(!c.lines.some(l=>['terrace:deck','terrace:frame','terrace:deck-work','terrace:frame-work','terrace:screws'].includes(l.id)));
 assert.ok(!scene.panels.some(m=>String(m.id).includes('platform:t:deck')));
 assert.ok(c.totals.total<original.totals.total);
});
test('manual posts, movement, bottom elevation, exclusion and anchor overrides survive reopening',()=>{
 const p=fixture(),post=report(p).assembly.platforms[0].posts[0];editPlatformPost(p,'t',post.id,{xMm:post.a[0]+25,baseZMm:-300,anchorMode:'pile'});
 const restored=migrateProject(JSON.parse(JSON.stringify(p))),moved=report(restored).assembly.platforms[0].posts.find(s=>s.id===post.id);
 assert.equal(moved.a[0],post.a[0]+25);assert.equal(moved.a[2],-300);
 assert.equal(calculateProject(restored).lines.find(l=>l.id==='terrace:post-anchor-pile').price,1500);
 restored.plan.platforms[0].roofPosts=[{id:'manual-post',runId:post.runId,xMm:post.a[0],yMm:post.a[1]+500}];assert.ok(report(restored).assembly.platforms[0].posts.some(p=>p.id==='manual-post'));
 editPlatformPost(restored,'t',post.id,{exclude:true});assert.ok(!report(restored).assembly.platforms[0].posts.some(p=>p.id===post.id));
});
test('excluding one gable removes its panels and members while retaining other gables and saved geometry',()=>{
 const p=fixture(),initial=report(p),option=initial.gableOptions[0],plan=JSON.stringify(p.plan);assert.ok(option);
 p.settings.productionCutting.excludedGables=[option.id];const r=report(p);
 assert.ok(!r.surfaces.some(s=>s.id===option.id));assert.ok(!r.members.some(m=>m.surfaceId===option.id));assert.ok(r.gableOptions.find(g=>g.id===option.id).excluded);
 assert.equal(r.gableOptions.length,initial.gableOptions.length);assert.equal(JSON.stringify(p.plan),plan);
 assert.ok(calculateProject(p).totals.total<calculateProject(fixture()).totals.total);
 p.settings.productionCutting.excludedGables=[];assert.ok(report(p).surfaces.some(s=>s.id===option.id));
});
test('anchor catalog prices remain project editable',()=>{
 const p=fixture();p.priceMat.find(m=>m.id==='MAT-POST-BASE-ANCHOR').price=3200;
 assert.equal(calculateProject(p).lines.find(l=>l.id==='terrace:post-anchor-base').price,3200);
});
test('warm main SIP roof with a cold terrace does not acquire terrace rafters below its panels',()=>{
 const p=fixture();p.settings.roof.type='sip';p.settings.productionCutting.counterLathProfile='50×50';
 const c=calculateProject(p),r=report(p),scene=productionScene(r,p),faces=r.assembly.roofModel.faces;
 assert.equal(c.roof.mainColdSlopeArea,0);assert.ok(c.roof.coldSlopeArea>0);
 assert.ok(r.assembly.rafters.length>0);assert.ok(r.assembly.rafters.every(m=>faces.find(f=>f.id===m.faceId)?.group==='terrace:t'));
 const warm=faces.filter(f=>f.warm);assert.ok(warm.length);
 for(const f of warm){
  assert.ok(r.assembly.laths.some(m=>m.faceId===f.id));
  const lath=scene.beams.find(m=>m.layer==='laths'&&m.faceId===f.id);assert.ok(lath);
  const normalDistance=lath.a.reduce((n,v,i)=>n+(v-f.origin[i])*f.normal[i],0);
  assert.ok(Math.abs(normalDistance-(f.thickness/2+50+12.5))<.01);
 }
});
