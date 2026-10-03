import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject,migrateProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { roomBearingEdges, bearingWallKey, splitAtBearingEdges, partitionProfileShares,splitConnectorsAtBearing } from '../src/react/calculations/bearing-walls.js';
const base=()=>{const p=createDefaultProject();p.plan={...p.plan,house:{w:5,h:4},wallHeight:2.5,rooms:[],walls:[],openings:[],wallGaps:[],platforms:[],bindingLines:[],pileRows:[],piles:[]};Object.assign(p.settings.productionCutting,{kerfMm:3,endAllowanceMm:0});return p;};
const run=p=>calculateProductionCutting(p,calculateProject(p));
test('bearing side selection persists and does not silently follow moved geometry',()=>{
  const p=base(),room={id:'r',x:0,y:0,w:2.5,h:4};p.plan.rooms=[room];const edge=roomBearingEdges(room)[1];room.bearingWalls={[edge.key]:{enabled:true,profile:'50x150'}};
  const restored=migrateProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(restored.plan.rooms[0].bearingWalls,room.bearingWalls);
  assert.equal(roomBearingEdges(restored.plan.rooms[0]).filter(e=>e.bearing).length,1);room.x=1;assert.equal(roomBearingEdges(room).filter(e=>e.bearing).length,0);
});
test('framed partition has two jambs, no board through door, two top plates, no SIP parts',()=>{
  const p=base();p.plan.walls=[{x1:0,y1:2,x2:5,y2:2,bearing:true,bearingProfile:'50x150'}];p.plan.openings=[{id:'d',type:'door',outer:false,x:2.5,y:2,width:.8,height:2,orientation:'h'}];const r=run(p),s=r.surfaces.find(s=>s.partitionFrame),m=r.members.filter(m=>m.surfaceId===s.id);
  assert.equal(s.frameProfile,'50×150');assert.equal(r.parts.filter(p=>p.surfaceId===s.id).length,0);
  assert.equal(m.filter(m=>m.material==='Верхняя обвязка перегородки').length,2);
  assert.ok(m.filter(m=>m.material==='Нижняя обвязка перегородки').every(m=>m.b[0]<=2100||m.a[0]>=2900));
  for(const x of [2075,2925])assert.ok(m.some(m=>m.material==='Стойка перегородки'&&m.a[0]===x));
});
test('ceiling joints align to selected bearing axis while preserving area and project geometry',()=>{
  const p=base();p.plan.walls=[{x1:0,y1:2,x2:5,y2:2,bearing:true}];const saved=structuredClone(p),r=run(p),parts=r.parts.filter(p=>p.surfaceId==='Э1-ПТ');
  assert.ok(parts.length);assert.ok(parts.every(p=>!(p.y<2000-.01&&p.y+p.height>2000+.01)));assert.equal(parts.reduce((s,p)=>s+p.area,0),20e6);assert.deepEqual(p,saved);
  p.settings.productionCutting.ceilingBearingAlignment=false;assert.ok(run(p).parts.some(p=>p.surfaceId==='Э1-ПТ'&&p.y<2000&&p.y+p.height>2000));
});
test('solid binding uses existing timber price, no pack screws and one production layer',()=>{
  const p=base();p.plan.bindingLines=[{id:'a',x1:0,y1:0,x2:5,y2:0}];let c=calculateProject(p);assert.equal(c.foundation.requiredBoardLength,15);assert.equal(run(p).members.filter(m=>m.id.startsWith('ОБ-')).length,3);
  p.settings.piles.bindingType='timber';c=calculateProject(p);assert.equal(c.foundation.requiredBoardLength,5);assert.equal(c.foundation.boardVolume,.135);assert.equal(run(p).members.filter(m=>m.id.startsWith('ОБ-')).length,1);
  const line=c.lines.find(l=>l.id.includes('binding-board'));assert.equal(line.catalogId,'MAT-019');assert.ok(!c.lines.some(l=>l.id.includes('binding-screws')&&l.qty>0));
});
test('bearing profile changes split runs and estimate catalogue without double counting',()=>{
  const p=base(),r={id:'r',x:0,y:0,w:2.5,h:4};p.plan.rooms=[r];const a={x:2.5,y:0},b={x:2.5,y:4};r.bearingWalls={[bearingWallKey(a,b)]:{enabled:true,profile:'50x150'}};
  assert.deepEqual(partitionProfileShares(p.plan,'50x100'),[{profile:'50x150',share:1}]);const c=calculateProject(p);const lines=c.lines.filter(l=>l.id.includes('partition-board'));assert.equal(lines.length,1);assert.equal(lines[0].catalogId,'MAT-023');
  const split=splitAtBearingEdges(p.plan,[[{x:2.5,y:-1},{x:2.5,y:5}]]);assert.equal(split.length,3);
});
test('frame opening outside wall blocks its members rather than drawing a false frame',()=>{
  const p=base();p.plan.walls=[{x1:0,y1:2,x2:5,y2:2}];p.plan.openings=[{id:'d',type:'door',outer:false,x:.1,y:2,width:.8,height:2,orientation:'h'}];const r=run(p),s=r.surfaces.find(s=>s.partitionFrame);assert.equal(s.blocked,true);assert.equal(r.members.filter(m=>m.surfaceId===s.id).length,0);
});
test('continuous connectors are cut at an actual bearing crossing, not outside its ends',()=>{
  const edges=[{a:{x:1,y:2},b:{x:4,y:2}}];const segments=[{a:[2500,0],b:[2500,4000],length:4000},{a:[500,0],b:[500,4000],length:4000}];const cut=splitConnectorsAtBearing(segments,edges);assert.equal(cut.length,3);assert.deepEqual(cut.map(s=>s.length),[2000,2000,4000]);
});
test('lath uses roof step, stays within stock, counterlath is opt-in and does not change estimate',()=>{
  const p=base(),before=calculateProject(p).totals.total;let r=run(p);assert.ok(r.assembly.laths.length>0);assert.ok(r.assembly.laths.every(m=>m.length<=6000));assert.equal(r.assembly.counterLaths.length,0);p.settings.productionCutting.counterLathProfile='50×50';r=run(p);assert.equal(r.assembly.counterLaths.length,r.assembly.rafters.length);assert.equal(calculateProject(p).totals.total,before);p.settings.roof.includeCovering=false;r=run(p);assert.equal(r.assembly.laths.length,0);assert.equal(r.assembly.counterLaths.length,0);
});
test('full-height partition gaps interrupt both top and bottom plates',()=>{
  const p=base();p.plan.walls=[{x1:0,y1:2,x2:5,y2:2}];p.plan.wallGaps=[{id:'g',outer:false,x:2.5,y:2,width:1,orientation:'h'}];const r=run(p);const plates=r.members.filter(m=>m.surfaceId?.includes('ПГ')&&m.material.includes('обвязка'));assert.ok(plates.length);assert.ok(plates.every(m=>m.b[0]<=2000||m.a[0]>=3000));
});
test('overlapping explicit walls do not skew the profile shares',()=>{
  const p=base();p.plan.walls=[{x1:0,y1:2,x2:5,y2:2},{x1:0,y1:2,x2:2,y2:2,bearing:true,bearingProfile:'50x150'}];const shares=partitionProfileShares(p.plan,'50x100');assert.equal(shares.find(s=>s.profile==='50x150').share,.4);assert.equal(shares.find(s=>s.profile==='50x100').share,.6);
});
test('saved upper plate layer count is respected by framing',()=>{
  const p=base();p.plan.walls=[{x1:0,y1:2,x2:5,y2:2}];p.settings.formulas.partitionTopPlateLayers=3;const r=run(p),members=r.members.filter(m=>m.surfaceId?.includes('ПГ'));assert.equal(members.filter(m=>m.material==='Верхняя обвязка перегородки').length,3);assert.ok(members.filter(m=>m.material==='Стойка перегородки').every(m=>m.length===2300));
});
