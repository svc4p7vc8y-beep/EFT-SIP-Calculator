import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {partitionFrameMembers} from '../src/react/calculations/partition-cutting.js';
import {normalizeProductionCutting} from '../src/react/state/production-cutting.js';
const base=()=>{const p=createDefaultProject();Object.assign(p.plan,{house:{w:6,h:4},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[]});p.settings.roof.gableType='sip';return p;};
const run=p=>calculateProductionCutting(p,calculateProject(p));
test('SIP gable seams use the top wall course instead of independent balanced columns',()=>{
 for(const ridgeAxis of ['x','y']){const p=base();p.settings.roof.ridgeAxis=ridgeAxis;const r=run(p);for(const g of r.surfaces.filter(s=>s.id.startsWith('ФР-'))){assert.ok(g.alignedWallId);assert.ok(!g.blocked);const wall=r.surfaces.find(s=>s.id===g.alignedWallId),xs=new Set(r.parts.filter(p=>p.surfaceId===wall.id).flatMap(p=>p.shape.flat().filter(v=>Math.abs(v[1]-wall.height)<1).map(v=>Math.round(v[0]))));for(const m of r.members.filter(m=>m.surfaceId===g.id&&m.seam&&Math.abs(m.a[0]-m.b[0])<.01))assert.ok(xs.has(Math.round(m.a[0])));}}
});
test('manual gable grid is retained and explicitly diagnosed, not overwritten',()=>{
 const p=base(),g=run(p).surfaces.find(s=>s.id==='ФР-1');p.settings.productionCutting.layouts[g.layoutKey]={step:900,originX:0};const saved=migrateProject(JSON.parse(JSON.stringify(p))),r=run(saved);assert.deepEqual(saved.settings.productionCutting.layouts[g.layoutKey],{step:900,originX:0});assert.ok(r.issues.some(i=>i.code==='GABLE_ALIGNMENT'&&i.target===g.id));assert.equal(r.surfaces.find(s=>s.id===g.id).gableColumns,undefined);
});
test('3D adapter uses production panels and world wall coordinates without changing the project, stock or estimate',()=>{
 const p=base(),r=run(p),before=JSON.stringify({p,r}),total=calculateProject(p).totals.total,d=productionScene(r,p);assert.equal(d.panels.filter(p=>!p.timber).length,r.parts.filter(p=>d.placements.has(p.surfaceId)).length);for(const s of r.surfaces.filter(s=>s.planStart)){const pos=d.placements.get(s.id);assert.deepEqual(d.world(pos,0,0).slice(0,2),s.planStart);const end=d.world(pos,s.width,0);assert.ok(Math.hypot(end[0]-s.planEnd[0],end[1]-s.planEnd[1])<1);}assert.equal(JSON.stringify({p,r}),before);assert.equal(calculateProject(p).totals.total,total);
});
test('3D gable base and reverse manual association coincide with the actual wall top',()=>{
 const p=base(),r=run(p),g=r.surfaces.find(s=>s.id==='ФР-1'),wall=r.surfaces.find(s=>s.id===g.parentWallId);r.settings.gableLinks[g.layoutKey]={wallKey:wall.layoutKey,offset:100,elevation:2500,reverse:true};const d=productionScene(r,p),gp=d.placements.get(g.id),wp=d.placements.get(wall.id);assert.deepEqual(d.world(gp,0,0),d.world(wp,g.width+100,2500));assert.deepEqual(d.world(gp,g.width,0),d.world(wp,100,2500));
});
test('brace has four corners, parallel long sides and exactly one planar cut per end',()=>{
 for(const direction of ['left-right','right-left'])for(const width of [300,1000,3600,7000]){const members=partitionFrameMembers({id:'Э1-ПГ1',width,height:2500,frameProfile:'50×150',bearing:true,openings:[]},{...normalizeProductionCutting({}),partitionBraceDirection:direction}),b=members.find(m=>m.role==='brace');assert.ok(b);assert.equal(b.outline.length,4);assert.equal(b.outline[0][1],b.outline[1][1]);assert.equal(b.outline[2][1],b.outline[3][1]);assert.ok(b.outline.every(([x,y])=>x>=-.001&&x<=width+.001&&y>=50&&y<=2450));const [a,c,d,e]=b.outline;assert.ok(Math.abs((c[0]-d[0])*(a[1]-e[1])-(c[1]-d[1])*(a[0]-e[0]))<.01);assert.equal(b.profile,'25×150');}
});
