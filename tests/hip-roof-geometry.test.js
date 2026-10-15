import test from 'node:test';
import assert from 'node:assert/strict';
import {hipRoofFromContour,hipEdgeKey} from '../src/react/calculations/hip-roof-geometry.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';

const rectangle=[[0,0],[10000,0],[10000,8000],[0,8000]];
const close=(actual,expected,tolerance=.01)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} ≠ ${expected}`);

test('10 × 8 m, 30° equal-eave hip finds a 2 m ridge and four corner hips',()=>{
 const result=hipRoofFromContour(rectangle,{angleDeg:30,roofBase:2500});
 assert.equal(result.facets.length,4);
 close(result.riseMm,4000*Math.tan(Math.PI/6));
 const peak=result.facets.flatMap(f=>f.vertices).filter(p=>Math.abs(p[2]-result.topZ)<.01);
 assert.deepEqual([...new Set(peak.map(p=>`${p[0]},${p[1]}`))].sort(),['4000,4000','6000,4000']);
 const withEave=hipRoofFromContour(rectangle,{angleDeg:30,overhangMm:500,roofBase:2500});
 close(withEave.topZ,result.topZ,.002);
 close(withEave.eaveZ,2500-500*Math.tan(Math.PI/6));
 assert.deepEqual(withEave.eaves.map(point=>point.map(Math.round)),[[-500,-500],[10500,-500],[10500,8500],[-500,8500]]);
 const p=createDefaultProject();p.plan.house={w:10,h:8};p.plan.rooms=[];p.plan.openings=[];
 p.settings.roof.shape='hip';p.settings.roof.eaveOverhang=0;
 const legacyTotal=calculateProject(p).totals.total;
 p.settings.productionCutting.roofDesign.enabled=true;
 p.settings.productionCutting.roofDesign.hipGeometry={mode:'contour',angleDeg:30,eaveZ:'',edgeAngles:{}};
 const estimate=calculateProject(p).totals.total,reopened=migrateProject(JSON.parse(JSON.stringify(p)));
 const report=calculateProductionCutting(reopened,calculateProject(reopened)),model=report.assembly.roofModel;
 assert.equal(model.faces.filter(f=>f.group==='main').length,4);
 assert.equal(model.edges.filter(e=>e.kind==='hip').length,4);
 assert.equal(model.edges.filter(e=>e.kind==='ridge').length,1);
 close(model.edges.find(e=>e.kind==='ridge').length,2000);
 assert.equal(calculateProject(reopened).totals.total,estimate);
 assert.equal(estimate,legacyTotal);
});

test('convex nonrectangular footprint and per-edge pitches form finite common facets',()=>{
 const hex=[[-2000,4000],[0,0],[10000,0],[12000,4000],[10000,8000],[0,8000]];
 const key=hipEdgeKey(hex[1],hex[2]);
 const result=hipRoofFromContour(hex,{angleDeg:30,edgeAngles:{[key]:35},roofBase:2500});
 assert.equal(result.facets.length,6);
 assert.ok(result.facets.every(f=>f.vertices.length>=3&&f.vertices.every(p=>p.every(Number.isFinite))));
 assert.equal(result.edgeAngles.find(item=>item.key===key).angleDeg,35);
 const reversed=hipRoofFromContour([...hex].reverse(),{angleDeg:30,edgeAngles:{[key]:35},roofBase:2500});
 close(result.topZ,reversed.topZ,.002);
 const p=createDefaultProject();p.plan.house={w:14,h:8,points:hex.map(([x,y])=>({x:(x+2000)/1000,y:y/1000}))};p.plan.rooms=[];p.plan.openings=[];
 p.settings.roof.shape='hip';p.settings.roof.eaveOverhang=0;p.settings.productionCutting.roofDesign.enabled=true;
 p.settings.productionCutting.roofDesign.hipGeometry={mode:'contour',angleDeg:30,eaveZ:'',edgeAngles:{}};
 const report=calculateProductionCutting(p,calculateProject(p));
 assert.equal(report.assembly.roofModel.faces.filter(face=>face.group==='main').length,6);
 assert.deepEqual(new Set(report.assembly.roofModel.faces.filter(face=>face.group==='main').map(face=>face.hipEdgeKey)),new Set(hipRoofFromContour(hex.map(([x,y])=>[x+2000,y]),{angleDeg:30,roofBase:2500}).facets.map(facet=>facet.edgeKey)));
 assert.ok(!report.assembly.roofModel.issues.some(issue=>issue.code==='ROOF_HIP_GEOMETRY'));
});

test('hip fabrication identifies common and jack rafters, diagonals and 3D member IDs',()=>{
 const p=createDefaultProject();p.plan.house={w:10,h:8};p.plan.rooms=[];p.plan.openings=[];
 p.settings.roof.shape='hip';p.settings.roof.eaveOverhang=0;p.settings.productionCutting.roofDesign.enabled=true;
 p.settings.productionCutting.roofDesign.hipGeometry={mode:'contour',angleDeg:30,eaveZ:'',edgeAngles:{}};
 let result=calculateProductionCutting(p,calculateProject(p));
 p.settings.productionCutting.roofDesign.edgeProfiles=Object.fromEntries(result.assembly.roofModel.edges.filter(edge=>['hip','ridge'].includes(edge.kind)).map(edge=>[edge.id,'50×200']));
 result=calculateProductionCutting(p,calculateProject(p));
 const rafters=result.assembly.rafters,diagonals=result.assembly.roofTimbers.filter(item=>item.roofMemberKind==='hip');
 assert.ok(rafters.some(item=>item.rafterKind==='common'));
 assert.ok(rafters.some(item=>item.rafterKind==='jack'&&item.compoundCutRequired));
 assert.equal(diagonals.length,4);
 assert.ok(rafters.every(item=>item.length>0&&item.volumeM3>0&&Number.isFinite(item.plumbCutDeg)));
 const scene=productionScene(result,p);
 assert.ok(rafters.every(item=>scene.beams.some(beam=>beam.id===item.id&&beam.layer==='rafters')));
 assert.ok(diagonals.every(item=>scene.beams.some(beam=>beam.id===item.id&&beam.layer==='roofTimbers')));
});

test('concave contours and incompatible common-eave inputs stop before manufacturing geometry',()=>{
 const l=[[0,0],[10000,0],[10000,4000],[4000,4000],[4000,8000],[0,8000]];
 assert.throws(()=>hipRoofFromContour(l,{angleDeg:30,roofBase:2500}),/выпуклым/);
 const key=hipEdgeKey(rectangle[0],rectangle[1]);
 assert.throws(()=>hipRoofFromContour(rectangle,{angleDeg:30,edgeAngles:{[key]:35},overhangMm:500,roofBase:2500}),/отметку карниза/);
 assert.throws(()=>hipRoofFromContour(rectangle,{angleDeg:0,roofBase:2500}),/угол ската/);
});
