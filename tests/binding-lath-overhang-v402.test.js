import {structuralDimensions} from '../src/react/calculations/drawing-dimensions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {generateAutoPileRows,bindingLinesWithManual} from '../src/react/calculations/foundation-model.js';
import {bindingPackageWidthMm} from '../src/react/calculations/foundation-reference.js';
import {bindingPlanRows} from '../src/react/calculations/binding-rows.js';
const run=p=>{const c=calculateProject(p);return {c,r:calculateProductionCutting(p,c)}};
function fixture(){const p=createDefaultProject();p.plan={...p.plan,house:{w:10,h:6},rooms:[],walls:[],openings:[],platforms:[],piles:[],pileRows:[],bindingLines:[],excludedPiles:[]};Object.assign(p.settings.roof,{shape:'gable',type:'cold',ridgeAxis:'x',ridgeHeight:2,eaveOverhang:0,gableOverhang:0,includeCovering:true,rafterAutomatic:false,rafterSection:'50x150'});return p;}
function align(p,reference){p.settings.piles.layoutReference=reference;p.plan.pileRows=generateAutoPileRows(p.plan,2.5,{mode:'contour',reference,wallThicknessMm:p.settings.sip.wallThickness,bindingWidthMm:bindingPackageWidthMm(p.settings.piles)});p.plan.bindingLines=bindingLinesWithManual(p.plan,p.plan.pileRows);}
const close=(a,b,e=.01)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
for(const thickness of ['124','174','224'])test(`outside timber matches SIP floor, independent of wall thickness ${thickness}`,()=>{
 const p=fixture();p.settings.sip.wallThickness=thickness;const house=JSON.stringify(p.plan.house);align(p,'wallAxes');const old=run(p);assert.ok(old.r.assembly.bindingFloorAlignment.some(a=>!a.matches));
 align(p,'floorEdges');const {r}=run(p);assert.equal(JSON.stringify(p.plan.house),house);assert.ok(r.assembly.bindingFloorAlignment.every(a=>a.matches));
 const rows=r.assembly.binding.flatMap(bindingPlanRows),xs=rows.flatMap(r=>[r.a[0],r.b[0]]),ys=rows.flatMap(r=>[r.a[1],r.b[1]]);close(Math.min(...xs),0);close(Math.max(...xs),10000);close(Math.min(...ys),25);close(Math.max(...ys),5975);
 const restored=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(restored.settings.piles.layoutReference,'floorEdges');assert.ok(run(restored).r.assembly.bindingFloorAlignment.every(a=>a.matches));
});
test('L-shaped timber corners and custom package width use the same outside floor datum',()=>{
 const p=fixture();p.plan.house.points=[[0,0],[10,0],[10,6],[6,6],[6,4],[0,4]].map(([x,y])=>({x,y}));Object.assign(p.settings.piles,{bindingBoardWidthMm:45,bindingLayers:4});align(p,'floorEdges');const {r}=run(p);assert.equal(bindingPackageWidthMm(p.settings.piles),180);assert.ok(r.assembly.bindingFloorAlignment.every(a=>a.matches));
 const manual={id:'manual',x1:1,y1:1,x2:3,y2:1,auto:false};p.plan.bindingLines.push(manual);align(p,'floorEdges');assert.deepEqual(p.plan.bindingLines.find(m=>m.id==='manual'),manual);
});
for(const warm of [false,true])for(const planes of [false,true])test(`lath-only overhang extends cover and stock without extending ${warm?'SIP':'rafters'}; planes=${planes}`,()=>{
 const p=fixture();p.settings.roof.type=warm?'sip':'cold';p.settings.productionCutting.roofDesign.enabled=planes;Object.assign(p.settings.productionCutting.roofSheets,{usefulWidth:1000,grossWidth:1100,stockLength:5000,overlap:150});const before=run(p),geometry=JSON.stringify(p.plan);Object.assign(p.settings.roof,{lathOverhangFrontM:.4,lathOverhangBackM:.7});const {c,r}=run(p);
 assert.equal(JSON.stringify(p.plan),geometry);assert.deepEqual(r.assembly.rafters,before.r.assembly.rafters);assert.deepEqual(r.parts,before.r.parts);assert.deepEqual(p.priceMat,fixture().priceMat);
 close(c.roof.lathExtensionArea,1.1*2*Math.hypot(3,2));assert.ok(c.roof.lathExtensionLength>0);close(c.roof.mainLathRequiredLength-before.c.roof.mainLathRequiredLength,c.roof.lathExtensionLength);
 close((r.assembly.laths.reduce((s,m)=>s+m.length,0)-before.r.assembly.laths.reduce((s,m)=>s+m.length,0))/1000,c.roof.lathExtensionLength,.1);
 assert.ok(r.assembly.laths.every(m=>m.length<=6000));const coverage=r.roofCover.slopes;assert.equal(coverage.length,2);close(structuralDimensions(r.assembly).roof.width,11100);close(structuralDimensions(r.assembly).house.width,10000);coverage.forEach(s=>close(s.width,11100));assert.ok(productionScene(r,p).panels.some(m=>m.layer==='roofSurface'&&m.shape.flat(1).some(q=>Math.abs(q[0])>10000)));
});
test('both ordinary rafter overhang and lath-only overhang retain a station on both building ends',()=>{
 for(const planes of [false,true])for(const structural of [0,.5]){const p=fixture();p.settings.productionCutting.roofDesign.enabled=planes;p.settings.roof.gableOverhang=structural;p.settings.roof.lathOverhangFrontM=.4;const {c,r}=run(p);for(const x of [0,10000])assert.ok(r.assembly.rafters.some(m=>Math.abs(m.a[0]-x)<.01),`missing ${x}, planes=${planes}, structural=${structural}`);assert.ok(c.roof.rafterStructure.positions.some(x=>Math.abs(x)<.01));}
});
test('legacy imports default to zero lath-only extension; unsupported manual faces are not changed',()=>{
 const p=fixture(),old=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(old.settings.roof.lathOverhangFrontM,0);const a=run(old);old.settings.productionCutting.roofDesign.manualFaces=[{id:'manual',name:'Косой',vertices:[[0,0,3000],[5000,1000,3000],[5000,6000,5000],[0,5000,5000]]}];const base=run(old);old.settings.roof.lathOverhangFrontM=.4;const next=run(old);assert.deepEqual(next.r.assembly.roofModel.faces,base.r.assembly.roofModel.faces);assert.equal(next.c.roof.lathExtensionArea,0);assert.ok(next.c.roof.lathExtensionIssues.length);
});

test('flat roof on either axis shares lath and cover extension with the estimate',()=>{
 for(const direction of ['front','left']){const p=fixture();Object.assign(p.settings.roof,{shape:'flat',flatSlopeMode:'structural',flatSlopeDirection:direction,flatSlopePercent:10});const before=run(p);Object.assign(p.settings.roof,{lathOverhangFrontM:.3,lathOverhangBackM:.5});const next=run(p);assert.deepEqual(next.r.assembly.rafters,before.r.assembly.rafters);assert.ok(next.c.roof.lathExtensionArea>0);close((next.r.assembly.laths.reduce((s,m)=>s+m.length,0)-before.r.assembly.laths.reduce((s,m)=>s+m.length,0))/1000,next.c.roof.lathExtensionLength,.1);}
});
