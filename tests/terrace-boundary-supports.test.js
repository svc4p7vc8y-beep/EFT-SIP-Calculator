import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {roofAt} from '../src/react/calculations/roof-project.js';
import {productionScene} from '../src/react/calculations/production-scene.js';

test('gable-end terrace beams meet the house at roof elevation instead of falling to zero',()=>{
 const p=createDefaultProject();p.plan.house.w=11.25;p.plan.house.h=8.5;p.services.terrace=true;
 p.settings.roof.shape='gable';p.settings.roof.ridgeAxis='x';p.settings.roof.type='cold';
 p.plan.platforms=[{id:'left',x:-2.5,y:0,w:2.5,h:8.5,include:true,roof:{mode:'cold',shape:'continuation'}},{id:'right',x:11.25,y:0,w:1,h:8.326,include:true,roof:{mode:'cold',shape:'continuation'}}];
 const original=JSON.stringify(p),c=calculateProject(p),report=calculateProductionCutting(p,c);
 const scene=productionScene(report,p);
 assert.equal(JSON.stringify(p),original,'saved geometry and prices stay intact');
 for(const {platform,result} of c.roof.terraceRoofs){
  const {posts,ties}=result.supportLayout;
  const sideBeams=ties.filter(tie=>tie.name!=='Стяжка между столбами террасы');
  const outerTies=ties.filter(tie=>tie.name==='Стяжка между столбами террасы');
  assert.equal(sideBeams.length,2);
  assert.equal(outerTies.length,3);
  assert.equal(posts.length,4);
  for(const tie of ties){
   assert.ok(tie.a[2]>1000&&tie.b[2]>1000);
   assert.ok(Math.abs(tie.a[2]-tie.b[2])<.01,'beam follows the eave level');
   if(sideBeams.includes(tie))assert.ok(Math.abs(Math.hypot(tie.a[0]-tie.b[0],tie.a[1]-tie.b[1])-platform.w*1000)<.01);
   assert.equal(report.members.filter(member=>member.id===tie.id).length,1,'same beam is included in cutting once');
  }
  assert.ok(Math.abs(result.tieLength-(platform.w*2+platform.h))<.001);
  const outerX=(platform.id==='left'?platform.x:platform.x+platform.w)*1000;
  assert.ok(posts.every(post=>post.a[0]===outerX));
  assert.ok(outerTies.every(tie=>tie.a[0]===outerX&&tie.b[0]===outerX));
  assert.ok(outerTies.every(tie=>Math.hypot(tie.a[0]-tie.b[0],tie.a[1]-tie.b[1])<=3000));
  for(const post of posts){
   assert.equal(report.members.filter(member=>member.id===post.id).length,1);
   assert.deepEqual(scene.beams.find(beam=>beam.id===post.id)?.b,post.b,'3D post uses its full calculated height');
   assert.ok(outerTies.some(tie=>[tie.a,tie.b].some(end=>Math.hypot(end[0]-post.b[0],end[1]-post.b[1])<.1&&end[2]-50<=post.b[2]+.1)));
   const roofHit=roofAt({faces:report.assembly.roofModel.faces.filter(face=>face.group===`terrace:${platform.id}`)},post.b[0],post.b[1])[0];
   assert.ok(roofHit);
   const rafterDepth=Number(p.settings.roof.rafterSection.split(/[x×х]/)[1]);
   assert.ok(Math.abs(post.b[2]-(roofHit.z-rafterDepth/(2*roofHit.face.normal[2])-100))<.1,'post reaches the underside of the roof bearing beam');
  }
  const intermediate=posts.filter(post=>post.a[1]>platform.y*1000+.1&&post.a[1]<(platform.y+platform.h)*1000-.1);
  assert.equal(intermediate.length,2);
  assert.ok(intermediate.every(post=>post.b[2]>outerTies[0].a[2]+500),'both intermediate posts pass through the horizontal tie');
 }
 const right=c.roof.terraceRoofs.find(entry=>entry.platform.id==='right');
 const corner=right.result.supportLayout.posts.find(post=>Math.abs(post.a[1]-8326)<.1);
 p.plan.platforms[1].roofSupportOverrides={[corner.id]:{topZMm:1500}};
 assert.equal(calculateProject(p).roof.terraceRoofs.find(entry=>entry.platform.id==='right').result.supportLayout.posts.find(post=>post.id===corner.id).b[2],1500,'manual corner height wins over an intersecting automatic beam');
});
