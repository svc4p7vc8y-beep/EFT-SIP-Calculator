import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {roofSupportFrame,roofFrameSource} from '../src/react/calculations/roof-support-frame.js';
import {clearGapPositions} from '../src/react/calculations/clear-gap-framing.js';
import {rafterEndOutline} from '../src/react/calculations/rafter-end-cuts.js';
import {beamFrame} from '../src/react/calculations/beam-frame.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {partitionFrameMembers} from '../src/react/calculations/partition-cutting.js';
const run=p=>calculateProductionCutting(p,calculateProject(p));
const base=()=>{const p=createDefaultProject();p.plan={...p.plan,house:{w:6,h:4},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[]};return p;};
test('590 is a clear gap, not axis pitch; final shortened bays do not overlap',()=>{
 for(const thickness of [45,50])for(const L of [800,6400,8400,23000]){const xs=clearGapPositions(thickness/2,L-thickness/2,thickness,590);for(let i=1;i<xs.length;i++){const gap=xs[i]-xs[i-1]-thickness;assert.ok(gap>=0);assert.ok(gap<=590+.001);if(i<xs.length-2)assert.equal(gap,590);}assert.equal(xs.at(-1),L-thickness/2);}
});
test('partition has 11 main studs instead of 12 at 6.4m and legacy mode is retained',()=>{
 const surface={id:'ПГ',name:'ПГ',width:6400,height:2500,frameProfile:'50×150',openings:[]},settings=base().settings.productionCutting;
 const old=partitionFrameMembers(surface,settings).filter(m=>m.material==='Стойка перегородки'),fresh=partitionFrameMembers(surface,{...settings,partitionClearGapMm:590}).filter(m=>m.material==='Стойка перегородки');assert.equal(old.length,12);assert.equal(fresh.length,11);
});
test('frame has flat chords, correct board catalog and perpendicular upright section for both axes',()=>{
 for(const ridgeAxis of ['x','y'])for(const profile of ['50×150','50×100']){const p=base();p.settings.roof.ridgeAxis=ridgeAxis;const r=run(p),before=JSON.stringify({p,r}),f=roofSupportFrame(p,r,{profile,variant:'double'});assert.deepEqual(f.errors,[]);assert.equal(f.counts.frames,2);assert.ok(f.counts.posts>0);
 for(const m of f.items){assert.equal(m.estimateCatalogId,profile==='50×150'?'MAT-023':'MAT-027');if(m.type==='post'){assert.ok(m.z2>m.z1);const axes=beamFrame([m.x1,m.y1,m.z1],[m.x2,m.y2,m.z2],m.normal);assert.ok(Math.abs(axes.across[r.assembly.axis==='x'?0:1])>.999);}else assert.equal(m.flat,true);}assert.equal(JSON.stringify({p,r}),before);}
});
test('generated supports appear once in stock, estimate and 3D and survive JSON migration',()=>{
 const p=base(),r=run(p),f=roofSupportFrame(p,r);p.settings.productionCutting.roofSupports=f.items;p.settings.productionCutting.roofFrameConfig={variant:'double',profile:'50×150',gapMm:590};
 const saved=migrateProject(JSON.parse(JSON.stringify(p))),e=calculateProject(saved),next=calculateProductionCutting(saved,e),scene=productionScene(next,saved);
 assert.equal(next.assembly.supports.length,f.items.length);assert.equal(scene.beams.filter(b=>b.layer==='supports').length,f.items.length);assert.equal(e.lines.filter(l=>l.id.startsWith('production-support-')).length,f.items.length);
 assert.ok(next.issues.some(i=>i.message.includes('путь нагрузки')));assert.equal(saved.settings.productionCutting.roofSupports[0].flat,true);
});
test('raft clear positions agree with estimate count and do not collapse onto last axis',()=>{
 for(const w of [6,8.4,23]){const p=base();p.plan.house.w=w;p.settings.roof.ridgeAxis='x';p.settings.productionCutting.rafterClearGapMm=590;const e=calculateProject(p),r=calculateProductionCutting(p,e),lines=r.assembly.rafters.filter(s=>s.name==='Первый скат');assert.equal(lines.length,e.roof.rafterStructure.pairCount);assert.equal(new Set(lines.map(s=>s.a[0])).size,lines.length);}
});
test('upper rafter cut is vertical in world coordinates, lower remains square',()=>{
 const a=[0,0,0],b=[3000,0,3000*Math.tan(Math.PI/8)],cut=rafterEndOutline(a,b,150),axes=beamFrame(a,b);
 const world=p=>axes.along.map((n,i)=>n*p[0]+axes.depth[i]*p[1]);const lower=cut.outline.filter(p=>p[0]===cut.outline[0][0]);assert.equal(lower.length,2);
 const top=cut.outline.slice(1,3).map(world);assert.ok(Math.abs(top[0][0]-top[1][0])<.001);assert.ok(cut.blankLength>Math.hypot(...b));
 const p=base();p.settings.productionCutting.rafterEndCuts=true;const r=run(p);assert.ok(r.members.filter(m=>m.material==='Стропило').every(m=>m.endCutOutline&&m.cutLength>m.length));
});
test('wall panel seam is created at partition attachment without moving the saved plan',()=>{
 const p=base();p.plan.walls=[{id:'w',x1:2.2,y1:0.174,x2:2.2,y2:3.826}];p.settings.productionCutting.partitionSipAlignment=true;const before=JSON.stringify(p.plan),r=run(p),s=r.surfaces.find(s=>s.exterior&&s.partitionSeams?.some(x=>Math.abs(x-2200)<1));assert.ok(s);const parts=r.parts.filter(p=>p.surfaceId===s.id);assert.ok(parts.length);assert.ok(parts.every(p=>!(p.x<2200-.1&&p.x+p.width>2200+.1)));assert.equal(JSON.stringify(p.plan),before);
});
test('central frame replaces only old timber ridge, not roof ridge covering or prices',()=>{
 const p=base();p.settings.roof.structureMode='manual';p.settings.roof.rafterSystem='layered';const old=calculateProject(p),r=run(p),f=roofSupportFrame(p,r,{variant:'single'});assert.equal(f.errors.length,0);const price=JSON.stringify(p.priceMat);p.settings.productionCutting.roofSupports=f.items;p.settings.productionCutting.roofFrameConfig={variant:'single',replaceRidge:true};const next=calculateProject(p);assert.equal(next.roof.layeredRidgeBoardCount,0);assert.equal(next.roof.ridgeBeamLength,old.roof.ridgeBeamLength);assert.equal(JSON.stringify(p.priceMat),price);
});
test('23m chords split at studs within stock length; roof changes invalidate placement',()=>{
 const p=base();p.plan.house.w=23;p.settings.roof.ridgeAxis='x';const r=run(p),f=roofSupportFrame(p,r);assert.deepEqual(f.errors,[]);
 const chords=f.items.filter(m=>m.flat);assert.ok(chords.length>4);assert.ok(chords.every(m=>Math.hypot(m.x2-m.x1,m.y2-m.y1)<=r.settings.stockLengthMm));
 p.settings.productionCutting.roofSupports=f.items;p.settings.productionCutting.roofFrameConfig={sourceKey:roofFrameSource(p,r.assembly,r.settings)};
 assert.ok(!run(p).issues.some(i=>i.code==='STALE_ROOF_FRAME'));
 p.settings.roof.ridgeHeight+=.3;assert.ok(run(p).issues.some(i=>i.code==='STALE_ROOF_FRAME'));
});
