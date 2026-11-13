import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {removePlanRoofGroup} from '../src/react/planner/roof-support-plan.js';
import {cornerRafterPoints} from '../src/react/calculations/corner-rafters.js';
import {roofAt} from '../src/react/calculations/roof-project.js';
import {productionScene} from '../src/react/calculations/production-scene.js';

export function sharedTerraceFixture(){
 const p=createDefaultProject();p.meta.projectName='Терраса под общей крышей';
 p.plan.house={w:10,h:5.7,points:[[0,0],[10,0],[10,5.7],[6.5,5.7],[6.5,3.8],[0,3.8]].map(([x,y])=>({x,y}))};
 p.plan.rooms=[];p.plan.openings=[];p.services.terrace=true;p.settings.roof.type='cold';p.settings.roof.shape='gable';p.settings.roof.gableType='cold';p.settings.roof.ridgeAxis='x';
 p.plan.platforms=[{id:'t',kind:'terrace',x:0,y:3.8,w:6.5,h:1.9,include:true,roof:{mode:'shared'}}];return p;
}
test('delete a support frame removes all its members and keeps other project supports',()=>{
 const items=[{id:'a',type:'purlin',frameGroup:'frame',x1:0,y1:0,x2:1000,y2:0},{id:'b',type:'post',frameGroup:'frame',x1:0,y1:0,x2:0,y2:0},{id:'manual',type:'purlin',x1:0,y1:500,x2:1000,y2:500}];
 assert.deepEqual(removePlanRoofGroup(items,'frame').map(i=>i.id),['manual']);assert.equal(items.length,3);
});
test('a notched house with a shared terrace has posts in the scene and matching material quantities without another roof cover',()=>{
 const p=sharedTerraceFixture(),before=JSON.stringify(p.plan),c=calculateProject(p),r=calculateProductionCutting(p,c),platform=r.assembly.platforms[0],result=c.roof.terraceRoofs[0].result;
 assert.equal(platform.posts.length,4);assert.equal(result.netArea,0);assert.equal(platform.faces.length,0);
 assert.equal(result.postCount,platform.posts.length);assert.ok(Math.abs(result.postLength-platform.posts.reduce((n,s)=>n+(s.b[2]-s.a[2])/1000,0))<.001);
 for(const post of platform.posts)assert.ok(roofAt(r.assembly.roofModel,...post.b).some(h=>Math.abs(h.z-post.b[2])<1));
 assert.ok(c.lines.some(l=>l.id==='roof:platform-t-posts-150x100'&&l.qty>0));
 assert.equal(productionScene(r,p).beams.filter(b=>b.id.startsWith('platform:t:post:')).length,4);
 assert.equal(JSON.stringify(p.plan),before);assert.equal(calculateProject(migrateProject(JSON.parse(JSON.stringify(p)))).roof.terraceRoofs[0].result.postCount,4);
});
test('shared rectangular roof builds and anchors both end gables to house walls, independently of manual support frames',()=>{
 const p=sharedTerraceFixture(),c=calculateProject(p),r=calculateProductionCutting(p,c),gables=r.surfaces.filter(s=>s.id.startsWith('ФР-'));
 assert.equal(gables.length,2);assert.ok(gables.every(s=>s.frameOnly&&s.parentWallId));assert.equal(p.settings.productionCutting.roofSupports.length,0);
 assert.ok(r.members.some(m=>m.surfaceId===gables[0].id&&m.source==='Каркас фронтона'));
 p.settings.roof.gableType='none';assert.equal(calculateProductionCutting(p,calculateProject(p)).surfaces.filter(s=>s.id.startsWith('ФР-')).length,0);
});
test('each corner under a cold shared roof has a rafter station on the intersecting slope',()=>{
 const p=sharedTerraceFixture(),c=calculateProject(p),r=calculateProductionCutting(p,c);
 for(const point of cornerRafterPoints(p)){
  const hits=roofAt(r.assembly.roofModel,...point);assert.ok(hits.length);
  assert.ok(r.assembly.rafters.some(s=>{
   const [a,b]=[s.worldA,s.worldB];if(!a||!b)return false;
   const dx=b[0]-a[0],dy=b[1]-a[1],t=((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy);
   return t>=0&&t<=1&&Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy)<1;
  }),`corner ${point}`);
 }
});
