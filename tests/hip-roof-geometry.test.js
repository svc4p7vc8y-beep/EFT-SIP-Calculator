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
 p.settings.roof.shape='hip';p.settings.roof.eaveOverhang=0;p.settings.roof.ridgeHeight=4*Math.tan(Math.PI/6);
 const legacyTotal=calculateProject(p).totals.total;
 p.settings.productionCutting.roofDesign.enabled=true;
 const legacy=calculateProductionCutting(p,calculateProject(p)).assembly;
 p.settings.productionCutting.roofDesign.hipGeometry={mode:'contour',angleDeg:30,eaveZ:'',edgeAngles:{}};
 const estimate=calculateProject(p).totals.total,reopened=migrateProject(JSON.parse(JSON.stringify(p)));
 const report=calculateProductionCutting(reopened,calculateProject(reopened)),model=report.assembly.roofModel;
 assert.equal(model.faces.filter(f=>f.group==='main').length,4);
 assert.equal(model.edges.filter(e=>e.kind==='hip').length,4);
 assert.equal(model.edges.filter(e=>e.kind==='ridge').length,1);
 close(model.edges.find(e=>e.kind==='ridge').length,2000);
 close(model.area,legacy.roofModel.area,.002);
 assert.equal(report.assembly.rafters.length,legacy.rafters.length);
 assert.equal(report.assembly.laths.length,legacy.laths.length);
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
 assert.equal(result.assembly.roofTimbers.filter(item=>item.roofMemberKind==='hip').length,4);
 assert.equal(result.assembly.roofTimbers.filter(item=>item.roofMemberKind==='ridge').length,1);
 assert.ok(result.assembly.roofTimbers.filter(item=>['hip','ridge'].includes(item.roofMemberKind)).every(item=>item.profileSource==='rafter-section-proposal'));
 const firstHip=result.assembly.roofModel.edges.find(edge=>edge.kind==='hip');
 p.settings.productionCutting.roofDesign.edgeProfiles={[firstHip.id]:'50×200'};
 result=calculateProductionCutting(p,calculateProject(p));
 const rafters=result.assembly.rafters,diagonals=result.assembly.roofTimbers.filter(item=>item.roofMemberKind==='hip');
 assert.ok(rafters.some(item=>item.rafterKind==='common'));
 assert.ok(rafters.some(item=>item.rafterKind==='jack'&&item.compoundCutRequired));
 assert.equal(diagonals.length,4);
 assert.equal(diagonals.find(item=>item.id===`КР-${firstHip.id}`).profile,'50×200');
 assert.equal(diagonals.find(item=>item.id===`КР-${firstHip.id}`).profileSource,'project-override');
 assert.ok(rafters.every(item=>item.length>0&&item.volumeM3>0&&Number.isFinite(item.plumbCutDeg)));
 const scene=productionScene(result,p);
 assert.ok(rafters.every(item=>scene.beams.some(beam=>beam.id===item.id&&beam.layer==='rafters')));
 assert.ok(diagonals.every(item=>scene.beams.some(beam=>beam.id===item.id&&beam.layer==='roofTimbers')));
});

test('cold hip selected in the plan draws mauerlat and geometric rafter bearings without a separate design toggle',()=>{
 const p=createDefaultProject();p.settings.roof.shape='hip';p.settings.roof.type='cold';
 const before=calculateProject(p).totals.total;
 assert.equal(p.settings.productionCutting.roofDesign.enabled,false);
 const report=calculateProductionCutting(p,calculateProject(p)),assembly=report.assembly,scene=productionScene(report,p);
 const mauerlats=assembly.roofTimbers.filter(item=>item.name==='Мауэрлат');
 assert.equal(mauerlats.length,4);
 assert.equal(assembly.rafters.length,70);
 assert.equal(assembly.roofTimbers.filter(item=>item.roofMemberKind==='hip').length,4);
 assert.equal(assembly.roofTimbers.filter(item=>item.roofMemberKind==='ridge').length,1);
 assert.equal(scene.beams.filter(item=>item.layer==='roofTimbers'&&item.name==='Мауэрлат').length,4);
 assert.equal(scene.bearingPoints.length,70);
 assert.equal(assembly.rafters.filter(item=>item.bearingStatus==='unresolved').length,4);
 for(const item of assembly.rafters.filter(item=>item.bearingStatus==='geometry-only')){
  const mauerlat=mauerlats.find(line=>line.id===item.bearingMauerlatId);
  assert.ok(mauerlat,item.id);
  const [a,b]=[mauerlat.worldA,mauerlat.worldB],point=item.bearingPoint;
  const fraction=Math.abs(b[0]-a[0])>1?(point[0]-a[0])/(b[0]-a[0]):(point[1]-a[1])/(b[1]-a[1]);
  assert.ok(fraction>=-.001&&fraction<=1.001,item.id);
  assert.ok(Math.hypot(point[0]-a[0]-fraction*(b[0]-a[0]),point[1]-a[1]-fraction*(b[1]-a[1]))<1,item.id);
  assert.ok(Math.abs(point[2]-mauerlat.plateTopZ)<=5,item.id);
  assert.ok(item.bearingNotchMm<=50,item.id);
 }
 assert.equal(calculateProject(p).totals.total,before);
 assert.equal(p.settings.productionCutting.roofDesign.enabled,false);
});

test('disabled mauerlat leaves hip rafter bearing unresolved',()=>{
 const p=createDefaultProject();p.settings.roof.shape='hip';p.settings.roof.type='cold';p.settings.roof.mauerlatLayout='none';
 const report=calculateProductionCutting(p,calculateProject(p));
 assert.equal(report.assembly.roofTimbers.filter(item=>item.name==='Мауэрлат').length,0);
 assert.ok(report.assembly.rafters.length>0);
 assert.ok(report.assembly.rafters.every(item=>item.bearingStatus==='unresolved'));
 assert.match(report.assembly.issues.join(' '),/Опирание/);
});

test('manual exclusion of a mauerlat segment removes its 3D support points and opens a bearing check',()=>{
 const p=createDefaultProject();p.settings.roof.shape='hip';p.settings.roof.type='cold';
 const baseline=calculateProductionCutting(p,calculateProject(p)),mauerlat=baseline.members.find(item=>item.id==='КР-М1');
 const affected=baseline.assembly.rafters.filter(item=>item.bearingMauerlatId==='КР-М1');
 assert.ok(mauerlat?.key&&affected.length>0);
 p.settings.productionCutting.memberOverrides[mauerlat.key]={exclude:true,nodeRef:'Узел М1'};
 const report=calculateProductionCutting(p,calculateProject(p)),scene=productionScene(report,p);
 assert.ok(report.assembly.roofTimbers.find(item=>item.id==='КР-М1').excluded);
 assert.ok(affected.every(item=>report.assembly.rafters.find(rafter=>rafter.id===item.id).bearingStatus==='unresolved'));
 assert.ok(!scene.beams.some(item=>item.id==='КР-М1'));
 assert.ok(!scene.bearingPoints.some(item=>item.mauerlatId==='КР-М1'));
 assert.ok(report.issues.some(item=>item.code==='ROOF_BEARING'));
});

test('one hip contour can be built from boards or SIP panels without duplicate roof members',()=>{
 const p=createDefaultProject();p.plan.house={w:10,h:8};p.plan.rooms=[];p.plan.openings=[];
 p.settings.roof.shape='hip';p.settings.roof.ridgeHeight=4*Math.tan(Math.PI/6);p.settings.roof.eaveOverhang=0;
 p.settings.productionCutting.roofDesign.enabled=true;
 p.settings.productionCutting.roofDesign.hipGeometry={mode:'contour',angleDeg:30,eaveZ:'',edgeAngles:{}};
 p.settings.roof.type='cold';
 const legacy=migrateProject(JSON.parse(JSON.stringify(p)));
 legacy.settings.productionCutting.roofDesign.hipGeometry.mode='height';
 const legacyReport=calculateProductionCutting(legacy,calculateProject(legacy));
 assert.equal(legacyReport.assembly.roofTimbers.filter(item=>['hip','ridge'].includes(item.roofMemberKind)).length,0);
 const boards=calculateProductionCutting(p,calculateProject(p));
 assert.ok(boards.assembly.rafters.length>0);
 assert.equal(boards.parts.filter(part=>boards.assembly.roofModel.faces.some(face=>face.id===part.surfaceId)).length,0);
 assert.equal(boards.assembly.roofTimbers.filter(item=>['hip','ridge'].includes(item.roofMemberKind)).length,5);
 p.settings.roof.type='sip';
 const reopened=migrateProject(JSON.parse(JSON.stringify(p))),panels=calculateProductionCutting(reopened,calculateProject(reopened));
 const roofFaceIds=new Set(panels.assembly.roofModel.faces.filter(face=>face.group==='main').map(face=>face.id));
 const roofParts=panels.parts.filter(part=>roofFaceIds.has(part.surfaceId));
 assert.equal(panels.assembly.rafters.length,0);
 assert.equal(panels.assembly.roofTimbers.filter(item=>['hip','ridge'].includes(item.roofMemberKind)).length,0);
 assert.ok(roofParts.length>0);
 const scene=productionScene(panels,reopened);
 assert.ok(roofParts.every(part=>scene.panels.some(panel=>panel.id===part.id&&panel.layer==='roof')));
});

test('automatic SIP grid closes both triangular hips on the default 8.66 × 12.975 m plan',()=>{
 const p=createDefaultProject();p.settings.roof.shape='hip';p.settings.roof.type='sip';
 p.settings.productionCutting.roofDesign.enabled=true;
 p.settings.productionCutting.roofDesign.hipGeometry={mode:'contour',angleDeg:22.57,eaveZ:'',edgeAngles:{}};
 const estimate=calculateProject(p).totals.total,report=calculateProductionCutting(p,calculateProject(p));
 const faces=report.assembly.roofModel.faces.filter(face=>face.group==='main');
 assert.equal(faces.length,4);
 for(const face of faces){
  const surface=report.surfaces.find(item=>item.id===face.id),parts=report.parts.filter(part=>part.surfaceId===face.id);
  assert.ok(parts.length>0,face.id);
  assert.ok(!surface.panelLayoutIncomplete,face.id);
  assert.ok(parts.every(part=>Math.min(part.width,part.height)>=250-.001),face.id);
  close(parts.reduce((sum,part)=>sum+part.area,0),face.area*1e6,.01);
 }
 assert.equal(faces.filter(face=>report.surfaces.find(surface=>surface.id===face.id)?.automaticRoofGrid).length,2);
 assert.equal(report.issues.filter(issue=>issue.code==='MIN_PANEL_WIDTH').length,0);
 assert.equal(calculateProject(p).totals.total,estimate);
});

test('concave contours and incompatible common-eave inputs stop before manufacturing geometry',()=>{
 const l=[[0,0],[10000,0],[10000,4000],[4000,4000],[4000,8000],[0,8000]];
 assert.throws(()=>hipRoofFromContour(l,{angleDeg:30,roofBase:2500}),/выпуклым/);
 const key=hipEdgeKey(rectangle[0],rectangle[1]);
 assert.throws(()=>hipRoofFromContour(rectangle,{angleDeg:30,edgeAngles:{[key]:35},overhangMm:500,roofBase:2500}),/отметку карниза/);
 assert.throws(()=>hipRoofFromContour(rectangle,{angleDeg:0,roofBase:2500}),/угол ската/);
});
