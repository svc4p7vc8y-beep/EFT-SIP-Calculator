import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting,polygonAreaMm} from '../src/react/calculations/production-cutting.js';
import {facadeEnvelope,createFacade,applyFacade} from '../src/react/calculations/facade-design.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
const run=p=>calculateProductionCutting(p,calculateProject(p));
function fixture(){
 const p=createDefaultProject();Object.assign(p.plan,{house:{w:13.1,h:8.5,contourDefined:true,points:[{x:0,y:0},{x:0,y:8.5},{x:13.1,y:8.5},{x:13.1,y:0}]},wallHeight:2.5,wallThickness:.174,rooms:[],walls:[],openings:[],platforms:[]});
 Object.assign(p.settings.roof,{shape:'gable',type:'cold',gableType:'sip',gableCount:2,ridgeAxis:'x',ridgeHeight:1.8,rafterSection:'50x150'});p.settings.productionCutting.roofSupports=[];
 const r=run(p),g=r.surfaces.find(s=>s.id==='ФР-1'),e=facadeEnvelope(r,g.parentWallId),f=createFacade(e);Object.assign(f,{posts:[1964.5714285714284,3073.7142857142862,4076,5140.5714285714275,6201],postRefs:['p0','p1','p2','p3','p4'],transomMm:2774,headInsetMm:300});return applyFacade(p,f,e);
}
for(const minimum of [1,100,250])test(`fractional facade pockets produce complete gable cutting at ${minimum} mm without changing openings`,()=>{
 const p=fixture();p.settings.productionCutting.minPanelWidthMm=minimum;const before=JSON.stringify(p),r=run(p),g=r.surfaces.find(s=>s.id==='ФР-1'),parts=r.parts.filter(x=>x.surfaceId===g.id);assert.equal(g.blocked,false);assert.ok(parts.length>0);assert.ok(!r.issues.some(i=>i.code==='MIN_PANEL_WIDTH'&&i.target===g.id));assert.ok(Math.abs(parts.reduce((v,p)=>v+p.area,0)-g.geometry.reduce((v,p)=>v+polygonAreaMm(p),0))<1);assert.ok(parts.every(p=>Math.min(p.width,p.height)>=minimum-.01));assert.equal(JSON.stringify(p),before);const reopened=migrateProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(reopened.plan.openings.map(({x,y,width,height,sillHeight,outline})=>({x,y,width,height,sillHeight,outline})),p.plan.openings.map(({x,y,width,height,sillHeight,outline})=>({x,y,width,height,sillHeight,outline})));assert.equal(run(reopened).surfaces.find(s=>s.id===g.id).blocked,false);
});
test('gable upper edges match the actual rafter upper face above ceiling and plate, with SIP between the paired rafters',()=>{
 const p=fixture(),r=run(p),scene=productionScene(r,p),g=r.surfaces.find(s=>s.id==='ФР-1'),place=scene.placements.get(g.id),rafters=scene.beams.filter(b=>b.layer==='rafters'),topRing=g.grossShape[0][0];
 const slope=1.8/4.25,upperOffset=75*Math.sqrt(1+slope*slope);
 for(const [x,z]of topRing.filter(p=>p[1]>100)){const world=scene.world(place,x,z),expected=scene.roofBase+1800-Math.abs(world[1]-4250)*slope+upperOffset;assert.ok(Math.abs(world[2]-expected)<.001,`${world[2]} != ${expected}`);}
 const bounds=[place.origin[0]-g.thickness/2,place.origin[0]+g.thickness/2],centres=[...new Set(rafters.map(b=>b.a[0]))];assert.ok(centres.some(c=>Math.abs(c+25-bounds[0])<.001));assert.ok(centres.some(c=>Math.abs(c-25-bounds[1])<.001));assert.ok(g.topExtensionAreaMm2>2500000);
});

test('legacy roof datum is recognized exactly, while a genuinely changed roof still blocks the facade',()=>{
 const p=fixture(),f=p.plan.facades[0],e=facadeEnvelope(run(p),f.wallId);assert.ok(e.legacyRoofDatumKey);f.sourceKey=e.legacyRoofDatumKey;const before=JSON.stringify(p),r=run(p);assert.ok(!r.surfaces.find(s=>s.id===f.wallId).blocked);assert.ok(!r.issues.some(i=>i.code==='FACADE_STALE'));assert.equal(JSON.stringify(p),before);p.settings.roof.ridgeHeight+=.2;const changed=run(p);assert.ok(changed.issues.some(i=>i.code==='FACADE_STALE'));assert.equal(changed.surfaces.find(s=>s.id===f.wallId).blocked,true);
});
