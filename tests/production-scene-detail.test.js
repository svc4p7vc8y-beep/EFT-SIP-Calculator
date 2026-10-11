import test from 'node:test';
import assert from 'node:assert/strict';
import { beamFrame } from '../src/react/calculations/beam-frame.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
const dot=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0);
test('sloping rafters keep thickness across plan and section depth on edge',()=>{
 for(const end of [[5000,0,1800],[0,5000,1800],[5000,0,-1800],[0,-5000,1800],[0,0,3000]]){
  const f=beamFrame([0,0,0],end);assert.ok(f);assert.ok(Math.abs(f.across[2])<1e-8);
  for(const a of [f.along,f.across,f.depth])assert.ok(Math.abs(dot(a,a)-1)<1e-8);
  assert.ok(Math.abs(dot(f.along,f.across))<1e-8);assert.ok(Math.abs(dot(f.depth,f.along))<1e-8);
 }
 assert.equal(beamFrame([0,0,0],[0,0,0]),null);
 const diagonal=beamFrame([0,0,0],[10,10,10],[1,1,1]);assert.ok(Math.abs(dot(diagonal.along,diagonal.across))<1e-8);assert.ok(Math.abs(dot(diagonal.depth,diagonal.depth)-1)<1e-8);
});
test('floor top matches wall datum and binding is immediately below floor',()=>{
 const p=createDefaultProject(),r=calculateProductionCutting(p,calculateProject(p)),s=productionScene(r,p);
 const floor=r.surfaces.find(s=>s.type==='floor'||s.id==='Э1-ПОЛ');
 assert.ok(floor);const fp=s.placements.get(floor.id);assert.equal(fp.origin[2]+floor.thickness/2,0);
 for(const b of s.beams.filter(b=>b.layer==='binding'))assert.equal(b.a[2]+Number(b.profile.split(/[×xх]/)[1])/2,-p.settings.sip.floorThickness);
});
test('laths and counterlaths use existing IDs and are above the rafter plane',()=>{
 const p=createDefaultProject();p.settings.productionCutting.counterLathProfile='50×50';
 const r=calculateProductionCutting(p,calculateProject(p)),before=JSON.stringify({p,r}),s=productionScene(r,p);
 for(const layer of ['laths','counterLaths']){const beams=s.beams.filter(b=>b.layer===layer);assert.equal(beams.length,r.assembly[layer].length);assert.ok(beams.length);for(const b of beams){assert.ok(r.members.some(m=>m.id===b.id));assert.ok(b.a.every(Number.isFinite));}}
 const counter=s.beams.find(b=>b.layer==='counterLaths'),source=r.assembly.rafters.find(b=>b.name===counter.name),rafter=s.beams.find(b=>b.layer==='rafters'&&b.id===source.id);
 assert.ok(counter.a[2]>rafter.a[2]);assert.equal(JSON.stringify({p,r}),before);
});
test('font scale is retained per construction when reopening and defaults safely for old projects',()=>{
 const p=createDefaultProject();p.settings.productionCutting.drawingFontScales={'walls:Э1-СТ1':1.5,'floor:Э1-ПОЛ':.8,bad:99};
 assert.deepEqual(migrateProject(JSON.parse(JSON.stringify(p))).settings.productionCutting.drawingFontScales,{'walls:Э1-СТ1':1.5,'floor:Э1-ПОЛ':.8});
 delete p.settings.productionCutting.drawingFontScales;assert.deepEqual(migrateProject(p).settings.productionCutting.drawingFontScales,{});
});
