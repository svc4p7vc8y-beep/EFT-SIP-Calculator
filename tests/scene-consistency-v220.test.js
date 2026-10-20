import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,createUpperFloorPlan,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {gableLinks} from '../src/react/calculations/drawing-workbench.js';
import {productionLevels} from '../src/react/calculations/production-levels.js';
import {roofSupportFrame} from '../src/react/calculations/roof-support-frame.js';
import {profileHeight} from '../src/react/calculations/attic-partition-profile.js';
import {boardFootprint} from '../src/react/calculations/partition-geometry.js';
const run=p=>calculateProductionCutting(p,calculateProject(p));
const house=()=>{const p=createDefaultProject();p.plan={...p.plan,house:{w:5,h:7},wallHeight:2.5,rooms:[],walls:[],openings:[],wallGaps:[],platforms:[]};return p;};
const attic=()=>{const p=house();p.meta.floors=2;p.upperFloors=[createUpperFloorPlan(p.plan)];Object.assign(p.upperFloors[0],{floorType:'attic',wallHeight:0,partitionHeight:2.5,atticHorizontalCeiling:false});p.services.sipSecondFloor=true;return p;};
test('exterior wall mesh stays inside the 5x7 outer contour for all thicknesses',()=>{
 for(const thickness of [124,174,224]){const p=house();p.settings.sip.wallThickness=thickness;const r=run(p),before=JSON.stringify({p,r}),s=productionScene(r,p);
 for(const wall of r.surfaces.filter(w=>w.exterior)){const placement=s.placements.get(wall.id);for(const x of [0,wall.width])for(const side of [-1,1]){const at=s.world(placement,x,0).map((n,i)=>n+placement.normal[i]*side*wall.thickness/2);assert.ok(at[0]>=-.001&&at[0]<=5000.001);assert.ok(at[1]>=-.001&&at[1]<=7000.001);}}assert.equal(JSON.stringify({p,r}),before);}
});
test('zero knee walls do not place attic gables on the first floor',()=>{
 for(const axis of ['x','y']){const p=attic();p.settings.roof.ridgeAxis=axis;const r=run(p),scene=productionScene(r,p),base=productionLevels(p,2).roofBase;const gables=r.surfaces.filter(s=>s.id.startsWith('ФР-'));assert.equal(gables.length,2);
 for(const link of gableLinks(r)){assert.equal(link.wall,null);assert.ok(link.gable.gableAnchor);const placement=scene.placements.get(link.gable.id);assert.ok(placement);assert.equal(placement.origin[2],base);assert.equal(scene.missing.includes(link.gable.id),false);}
 assert.equal(r.surfaces.some(s=>s.exterior&&s.floor===2),false);assert.equal(scene.placements.get('Э2-ПОЛ').origin[2]+Number(p.settings.sip.secondFloorThickness)/2,base);}
});
test('stale manual gable link is not replaced by the zero-height fallback',()=>{
 const p=attic(),r=run(p),g=r.surfaces.find(s=>s.id==='ФР-1');p.settings.productionCutting.gableLinks={[g.layoutKey]:{wallKey:'missing'}};const next=run(p),scene=productionScene(next,p);assert.ok(scene.missing.includes(g.id));assert.equal(scene.placements.has(g.id),false);
});
test('attic partition follows the roof, retaining saved maximum height and estimate',()=>{
 const p=attic();p.settings.roof.ridgeAxis='y';p.upperFloors[0].walls=[{id:'a',x1:.174,y1:3,x2:4.826,y2:3}];const snapshot=JSON.stringify(p),total=calculateProject(p).totals.total,r=run(p);assert.ok(r.issues.some(i=>i.code==='ATTIC_PARTITION_CUT'));assert.equal(r.issues.some(i=>i.code==='PARTITION_ROOF_INTERSECTION'),false);const wall=r.surfaces.find(s=>s.id==='Э2-ПГ1');assert.equal(wall.height,Number(p.settings.roof.ridgeHeight)*1000);assert.ok(wall.topProfile.length>=3);assert.equal(JSON.stringify(p),snapshot);assert.equal(calculateProject(migrateProject(JSON.parse(snapshot))).totals.total,total);
});
test('manual roof posts above the slope are reported, not moved or hidden',()=>{
 const p=house();p.settings.productionCutting.roofSupports=[{id:'high',type:'post',name:'Высокая',profile:'50×150',x1:1000,y1:1000,z1:2500,x2:1000,y2:1000,z2:9000}];const before=JSON.stringify(p),r=run(p);assert.ok(r.issues.some(i=>i.code==='SUPPORT_ROOF_INTERSECTION'));assert.equal(productionScene(r,p).beams.find(s=>s.layer==='supports').b[2],9000);assert.equal(JSON.stringify(p),before);
});
test('frame uses the enabled master roof datum rather than the legacy wall-top datum',()=>{
 const p=house();Object.assign(p.settings.productionCutting.roofDesign,{enabled:true,baseZ:4000});const r=run(p),f=roofSupportFrame(p,r,{variant:'double'});assert.deepEqual(f.errors,[]);assert.equal(f.baseZ,4000+Number(p.settings.sip.ceilingThickness)/2);assert.ok(f.items.filter(m=>m.type==='post').every(m=>m.z1>4000));
});
test('attic framing, including corner backing and upper plates, stays below its roof profile',()=>{
 for(const axis of ['x','y']){const p=attic();p.settings.roof.ridgeAxis=axis;p.upperFloors[0].wallHeight=1;p.settings.sip.partitionType='frame';p.upperFloors[0].walls=[{id:'a',x1:.174,y1:.174,x2:4.826,y2:6.826}];const r=run(p),wall=r.surfaces.find(s=>s.id==='Э2-ПГ1'),members=r.members.filter(m=>m.surfaceId===wall.id&&!m.excluded);assert.ok(members.length);assert.ok(members.some(m=>m.material==='Верхняя обвязка перегородки'&&m.a[1]!==m.b[1]));for(const m of members)for(const [x,y] of boardFootprint(m)||[])assert.ok(y<=profileHeight(wall.topProfile,x)+.01,`${m.id} above roof`);}
});
function windowHouse(sill){const p=attic();p.upperFloors[0].wallHeight=1;p.settings.roof.ridgeAxis='y';p.settings.roof.type='sip';p.settings.roof.gableType='sip';p.settings.roof.ridgeHeight=1.5;p.upperFloors[0].openings=[{id:'win',type:'window',outer:true,orientation:'h',x:3.2140926248084782,y:7,width:1.2,height:1.2,sillHeight:sill,subtractFromSip:true}];return p;}
test('valid window crossing the knee wall is cut in both the wall and gable',()=>{
 const p=windowHouse(.3);Object.assign(p.upperFloors[0].openings[0],{x:3.125,width:1.25});const before=JSON.stringify(p),r=run(p),row=r.openings.find(o=>o.id==='win'),wall=r.surfaces.find(s=>s.id===row.wallId),gable=r.surfaces.find(s=>s.id===row.gableId);assert.ok(gable);assert.equal(wall.blocked,false);assert.equal(gable.blocked,false);assert.ok(r.parts.some(s=>s.surfaceId===wall.id));assert.ok(r.parts.some(s=>s.surfaceId===gable.id));const area=s=>s.geometry.reduce((sum,p)=>sum+Math.abs(p[0].reduce((v,a,i)=>{const b=p[0][(i+1)%p[0].length];return v+a[0]*b[1]-a[1]*b[0];},0))/2,0);assert.ok(area(wall)<5000*1000);assert.ok(area(gable)<5000*1500/2);assert.equal(r.issues.some(i=>i.code==='GABLE_OPENING'),false);assert.equal(JSON.stringify(p),before);
});
test('window above the gable envelope blocks manufacturing but remains visible as a warning preview',()=>{
 const p=windowHouse(.85),r=run(p),row=r.openings.find(o=>o.id==='win'),scene=productionScene(r,p);assert.ok(r.issues.some(i=>i.code==='GABLE_OPENING'));assert.ok(row.topClearance<0);assert.equal(r.parts.some(p=>[row.wallId,row.gableId].includes(p.surfaceId)),false);assert.ok(scene.previews.some(s=>s.surfaceId===row.wallId));assert.ok(scene.previews.some(s=>s.surfaceId===row.gableId));assert.equal(p.upperFloors[0].openings[0].sillHeight,.85);
});
test('5x7 SIP roof uses an 8m ridge length with half-metre overhangs and the saved slope',()=>{
 const p=windowHouse(.85);p.settings.roof.gableOverhang=.5;p.settings.roof.eaveOverhang=.5;const c=calculateProject(p),before=JSON.stringify(p),r=run(p),scene=productionScene(r,p),roofs=r.surfaces.filter(s=>s.roofFaceId);assert.equal(roofs.length,2);
 for(const roof of roofs){const panels=scene.panels.filter(s=>s.surfaceId===roof.id);assert.ok(panels.length);assert.ok(panels.every(s=>s.placement===scene.placements.get(roof.id)));assert.ok(Math.abs(roof.width-8000)<.001);assert.ok(Math.abs(roof.height-Math.hypot(2500,1500)*1.2)<.001);}
 assert.ok(r.issues.some(i=>i.code==='ROOF_LAYOUT_ESTIMATE'));assert.equal(scene.missing.some(id=>/^КР-М/.test(id)),false);assert.equal(calculateProject(p).totals.total,c.totals.total);assert.equal(JSON.stringify(p),before);
});
