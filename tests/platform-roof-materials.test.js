import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';
import { roofLathRows } from '../src/react/calculations/roof-lathing.js';
import { scopedWorkbenchItems, timberMaterialSummary } from '../src/react/screens/workbench-model.js';
import { assemblyPlatformView } from '../src/react/calculations/platform-assembly.js';

function fixture(kind='terrace',mode='cold',shape='shed') {
  const project=createDefaultProject();
  project.plan.house={w:6,h:8};
  project.plan.rooms=[];
  project.plan.openings=[];
  project.settings.roof.type='cold';
  project.plan.platforms=[{id:'addition',kind,x:1,y:8,w:4,h:2,include:true,
    roof:{mode,shape,areaMode:'auto',frontOverhang:.3,sideOverhang:.3,highHeight:2.6,lowHeight:2.2,ridgeHeight:.8}}];
  return project;
}

for(const kind of ['terrace','porch'])for(const shape of ['shed','gable'])test(`${kind} ${shape}: drawn timber and estimate use the same lath rows`,()=>{
  const project=fixture(kind,'cold',shape),calculation=calculateProject(project),result=calculation.roof.terraceRoofs[0].result;
  const report=calculateProductionCutting(project,calculation),scene=productionScene(report,project);
  const platformFaces=new Set(report.assembly.roofModel.faces.filter(face=>face.group==='terrace:addition').map(face=>face.id));
  const rafters=report.assembly.rafters.filter(item=>platformFaces.has(item.faceId));
  const laths=report.assembly.laths.filter(item=>platformFaces.has(item.faceId));
  const rows=roofLathRows(result.slopeLength*1000,calculation.roof.lathStep*1000);
  const expectedLength=result.netArea/result.slopeLength*rows.length;
  const line=calculation.roof.extensionLines.find(item=>item.id==='roof:platform-addition-lath');
  assert.ok(rafters.length>0);
  assert.ok(laths.length>0);
  assert.ok(scene.beams.some(item=>item.layer==='rafters'&&platformFaces.has(item.faceId)));
  assert.ok(scene.beams.some(item=>item.layer==='laths'&&platformFaces.has(item.faceId)));
  const hidden=assemblyPlatformView(report.assembly,false);
  assert.ok(!hidden.laths.some(item=>platformFaces.has(item.faceId)));
  assert.ok(!hidden.rafters.some(item=>platformFaces.has(item.faceId)));
  assert.ok(Math.abs(laths.reduce((sum,item)=>sum+item.length,0)/1000-expectedLength)<.1);
  assert.ok(line);
  assert.equal(line.qty,Math.round(Math.ceil(expectedLength/6)*6*.025*.1*1000)/1000);
});

test('warm porch roof creates physical SIP parts, and whole-category timber totals remain separate from project stock',()=>{
  const project=fixture('porch','warm','gable'),calculation=calculateProject(project),report=calculateProductionCutting(project,calculation);
  const faces=report.assembly.roofModel.faces.filter(face=>face.group==='terrace:addition');
  assert.ok(faces.length>0);
  assert.ok(faces.every(face=>report.surfaces.some(surface=>surface.roofFaceId===face.id)));
  assert.ok(productionScene(report,project).panels.some(panel=>panel.layer==='roof'&&faces.some(face=>face.id===panel.faceId)));
  const roof=scopedWorkbenchItems(report,{scope:'category',category:'roof'});
  const partitions=scopedWorkbenchItems(report,{scope:'category',category:'partitions'});
  assert.ok(roof.parts.some(part=>faces.some(face=>face.id===part.surfaceId)));
  assert.ok(roof.members.every(member=>member.surface==='Кровля'||report.surfaces.some(surface=>surface.id===member.surfaceId)));
  assert.ok(partitions.members.every(member=>report.surfaces.some(surface=>surface.id===member.surfaceId)));
  assert.ok(timberMaterialSummary(roof.members).every(row=>row.qty>0&&row.volumeM3>0));
});

test('manual platform roof area changes the estimate without silently moving drawn rafters or changing the catalog',()=>{
  const project=fixture(),before=calculateProject(project),originalPrice=before.roof.extensionLines.find(line=>line.id==='roof:platform-addition-lath').price;
  const baseline=calculateProductionCutting(project,before).assembly.rafters.filter(item=>item.faceId?.startsWith('КП-')).map(item=>[item.worldA,item.worldB]);
  project.plan.platforms[0].roof.areaMode='manual';
  project.plan.platforms[0].roof.manualArea=14;
  const after=calculateProject(project),line=after.roof.extensionLines.find(item=>item.id==='roof:platform-addition-lath');
  assert.equal(after.roof.terraceRoofs[0].result.netArea,14);
  assert.ok(line.qty>before.roof.extensionLines.find(item=>item.id===line.id).qty);
  assert.equal(line.price,originalPrice);
  assert.deepEqual(calculateProductionCutting(project,after).assembly.rafters.filter(item=>item.faceId?.startsWith('КП-')).map(item=>[item.worldA,item.worldB]),baseline);
});

test('terrace laths remain drawn when only the main roof covering is disabled',()=>{
  const project=fixture();
  project.settings.roof.includeCovering=false;
  const calculation=calculateProject(project),report=calculateProductionCutting(project,calculation);
  assert.equal(calculation.roof.mainLathBoardCount,0);
  assert.ok(report.assembly.laths.some(item=>item.faceId?.startsWith('КП-')));
  assert.ok(calculation.roof.extensionLines.some(item=>item.id==='roof:platform-addition-lath'));
});
