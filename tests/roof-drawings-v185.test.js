import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {roofAxonometricLines,snapAssemblyPoint} from '../src/react/calculations/roof-drawings.js';
const run=p=>calculateProductionCutting(p,calculateProject(p));

test('roof drawings preserve default quantities, estimate and project inputs',()=>{
 const p=createDefaultProject(),before=structuredClone(p),c=calculateProject(p),r=run(p);
 // v207 fixes missing partition backing: +0.12 m³ at the unchanged 26400 ₽/m³.
 assert.ok(Math.abs(c.totals.total-3745480.29248)<.001);assert.equal(r.assembly.rafters.length,30);assert.equal(r.assembly.laths.length,88);
 assert.equal(r.assembly.roofDrawing.sections.length,2);assert.deepEqual(p,before);
 assert.equal(r.assembly.roofDrawing.warnings.length,0);
 for(const line of roofAxonometricLines(r.assembly)){const length=Math.hypot(...line.a.map((a,i)=>line.b[i]-a));assert.ok(Math.abs(length-r.assembly.rafters.find(r=>r.id===line.id).length)<1);}
 assert.ok(r.assembly.roofDrawing.estimateDifference>30);
 const section=r.assembly.roofDrawing.sections[0],t=-section.a[0]/(section.b[0]-section.a[0]);assert.ok(Math.abs(section.a[1]+t*(section.b[1]-section.a[1]))<.01);
 p.settings.productionCutting.rafterGeometry='estimate';const old=run(p);assert.equal(old.assembly.rafters[0].length,7216);assert.ok(old.assembly.roofDrawing.warnings.some(s=>s.includes('уклон')));
});
test('two-level rafters include eaves and junction overhang for both axes and mirrored sides',()=>{
 for(const ridgeAxis of ['x','y'])for(const upperSide of ['first','second'])for(const upperSlopeDirection of ['towardJunction','awayJunction']){
  const p=createDefaultProject();Object.assign(p.settings.roof,{shape:'tiered',ridgeAxis,type:'cold',tiered:{...p.settings.roof.tiered,upperSide,upperSlopeDirection}});
  const r=run(p),a=r.assembly,across=a.axis==='x'?1:0,c=calculateProject(p);
  for(const s of a.roofDrawing.sections){const roofRun=c.roof.geometry[s.name==='Верхний уровень'?'upperRun':'lowerRun']*1000;
   assert.ok(Math.abs(Math.abs(s.b[0]-s.a[0])-roofRun)<2);assert.ok(Number.isFinite(s.angle));
  }
  assert.ok(a.rafters.some(r=>r.a[across]<[a.bounds.x,a.bounds.y][across]||r.a[across]>[a.bounds.x+a.bounds.width,a.bounds.y+a.bounds.height][across]));
  assert.equal(roofAxonometricLines(a).length,a.rafters.length);
 }
});
test('additional roof elements migrate and contribute 3D lengths without mutating estimate',()=>{
 const p=createDefaultProject(),before=calculateProject(p).totals.total;
 p.settings.productionCutting.roofSupports=['rafter','brace','tie'].map((type,i)=>({id:type,type,profile:'50×150',x1:0,y1:i*500,z1:0,x2:3000,y2:i*500,z2:4000,nodeRef:'Узел 1'}));
 const restored=migrateProject(JSON.parse(JSON.stringify(p))),r=run(restored);
 assert.deepEqual(restored.settings.productionCutting.roofSupports.map(s=>s.type),['rafter','brace','tie']);
 assert.ok(r.assembly.supports.every(s=>s.length===5000));assert.equal(r.assembly.supports.length,3);
 assert.equal(calculateProject(restored).totals.total,before);assert.ok(r.assembly.supports.every(s=>!s.loadPath.complete));
});
test('snap uses actual vertices and grid outside tolerance',()=>{
 const a=run(createDefaultProject()).assembly,p=a.rafters[0].a;
 assert.deepEqual(snapAssemblyPoint(a,p[0]+3,p[1]-2),p);
 assert.deepEqual(snapAssemblyPoint(a,-20005,-20005,10),[-20000,-20000]);
});
test('binding plan keeps separate package layers and roof timbers match their member lengths',()=>{
 const p=createDefaultProject(),a=run(p).assembly;
 assert.ok(a.binding.every(b=>b.layers===3));
 for(const b of a.roofTimbers)assert.ok(Math.abs(Math.hypot(b.b[0]-b.a[0],b.b[1]-b.a[1])-b.length)<1);
 p.settings.piles.bindingType='timber';assert.ok(run(p).assembly.binding.every(b=>b.layers===1&&b.profile==='150×150'));
});
test('complex roof does not fabricate a section or perspective',()=>{
 const p=createDefaultProject();p.settings.roof.shape='hip';const a=run(p).assembly;
 assert.equal(a.roofDrawing.sections.length,0);assert.deepEqual(roofAxonometricLines(a),[]);
});
test('shed profile falls toward the chosen direction, not away from it',()=>{
 for(const direction of ['front','back','left','right']){
  const p=createDefaultProject();Object.assign(p.settings.roof,{shape:'flat',flatSlopeMode:'structural',flatSlopePercent:5,flatSlopeDirection:direction});
  const s=run(p).assembly.roofDrawing.sections[0];assert.ok(s);
  assert.equal(s.a[1]>s.b[1],['back','right'].includes(direction));
 }
});
