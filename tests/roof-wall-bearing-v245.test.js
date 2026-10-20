import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/react/state/project-model.js';
import { calculateProject } from '../src/react/calculations/estimate-engine.js';
import { calculateProductionCutting } from '../src/react/calculations/production-cutting.js';
import { productionScene } from '../src/react/calculations/production-scene.js';

const projectWithFrame = gableType => {
  const project = createDefaultProject();
  project.plan = { ...project.plan, house: { w: 10, h: 8 }, rooms: [], walls: [], openings: [], wallGaps: [], platforms: [] };
  Object.assign(project.settings.roof, { structureMode: 'manual', rafterSystem: 'layered', ridgeAxis: 'x', gableType });
  return project;
};

test('automatic purlins place SIP connector studs in both end walls and SIP gables', () => {
  const project = projectWithFrame('sip');
  const originalPlan = structuredClone(project.plan), originalPrices = structuredClone(project.priceMat);
  const report = calculateProductionCutting(project, calculateProject(project));
  const walls = report.surfaces.filter(surface => surface.exterior && surface.roofSupportSeams?.length);
  assert.equal(walls.length, 2);
  for (const wall of walls) {
    assert.equal(wall.roofSupportSeams.length, 2);
    for (const position of wall.roofSupportSeams)
      assert.ok(report.parts.filter(part => part.surfaceId === wall.id).every(part =>
        !(part.x < position - .01 && part.x + part.width > position + .01)));
    const connectors = report.members.filter(member => member.surfaceId === wall.id && member.roofBearingSeam);
    assert.equal(connectors.length, 2);
    assert.ok(connectors.every(member => member.source.includes('под прогоном')));
    const scene = productionScene(report, project);
    assert.ok(connectors.every(member => scene.panels.some(board => board.id === member.id && board.timber)));
  }
  const gables = report.surfaces.filter(surface => surface.id.startsWith('ФР-'));
  assert.equal(gables.length, 2);
  assert.ok(gables.every(surface => surface.gableColumns?.length && surface.roofSupportSeams?.length === 2));
  assert.ok(gables.every(surface => report.members.filter(member => member.surfaceId === surface.id && member.roofBearingSeam).length === 2));
  assert.deepEqual(project.plan, originalPlan);
  assert.deepEqual(project.priceMat, originalPrices);
  assert.ok(report.issues.some(item => item.code === 'ROOF_WALL_SUPPORT_CHECK'));
});

test('cold gable frame receives studs on the same purlin bearing axes', () => {
  const project = projectWithFrame('cold');
  const report = calculateProductionCutting(project, calculateProject(project));
  for (const gable of report.surfaces.filter(surface => surface.id.startsWith('ФР-'))) {
    assert.equal(gable.gableSupportColumns.length, 2);
    const studs = report.members.filter(member => member.surfaceId === gable.id && member.material === 'Стойка фронтона под прогоном');
    assert.equal(studs.length, 2);
    assert.deepEqual(studs.map(member => Math.round(member.a[0])).sort((a, b) => a - b), gable.gableSupportColumns);
  }
});

test('near-window purlin support keeps the wall and SIP gable drawable with a separate header', () => {
  const project=projectWithFrame('sip');
  project.plan.openings=[{id:'near',type:'window',outer:true,x:10,y:2.1,width:1,height:1.2,sillHeight:.85,orientation:'v'}];
  const before=structuredClone(project.plan),report=calculateProductionCutting(project,calculateProject(project));
  const header=report.members.find(member=>member.role==='roof-opening-header');
  assert.ok(header);
  assert.equal(header.profile,'145×150');
  assert.equal(header.length,1000);
  assert.equal(report.incompleteSurfaces.length,0);
  assert.ok(report.surfaces.filter(surface=>surface.id.startsWith('ФР-')).every(surface=>
    report.parts.some(part=>part.surfaceId===surface.id)));
  const gable=report.surfaces.find(surface=>surface.id==='ФР-1');
  assert.ok(gable.height>project.settings.roof.ridgeHeight*1000);
  assert.ok(gable.geometry[0][0].some(([x,y])=>x===0&&y>0));
  assert.ok(report.issues.some(item=>item.code==='ROOF_OPENING_HEADER_CHECK'));
  assert.deepEqual(project.plan,before);
  project.settings.productionCutting.memberOverrides[header.key]={length:1150,profile:'145×200',nodeRef:'Узел У-1'};
  const revised=calculateProductionCutting(project,calculateProject(project));
  assert.equal(revised.members.find(member=>member.key===header.key).length,1150);
  assert.equal(revised.members.find(member=>member.key===header.key).profile,'145×200');
});

test('a manual wall grid is retained and a purlin crossing an opening is flagged', () => {
  const project = projectWithFrame('sip');
  const first = calculateProductionCutting(project, calculateProject(project));
  const wall = first.surfaces.find(surface => surface.exterior && surface.roofSupportSeams?.length);
  project.settings.productionCutting.layouts[wall.layoutKey] = { originX: 0 };
  const manual = calculateProductionCutting(project, calculateProject(project));
  assert.deepEqual(manual.surfaces.find(surface => surface.id === wall.id).roofSupportSeams, []);
  assert.ok(manual.issues.some(item => item.code === 'ROOF_WALL_ALIGNMENT'));
  project.settings.productionCutting.layouts = {};
  project.plan.openings = [{ id: 'window', type: 'window', outer: true, x: 10, y: 2.667, width: 1, height: 1.2, sillHeight: .85, orientation: 'v' }];
  const opening = calculateProductionCutting(project, calculateProject(project));
  assert.ok(opening.issues.some(item => item.code === 'ROOF_OPENING_HEADER_CHECK' && item.message.includes('проём')));
  const header=opening.members.find(member=>member.role==='roof-opening-header');
  assert.ok(header);
  assert.equal(header.profile,'145×150');
  assert.ok(productionScene(opening,project).panels.some(board=>board.id===header.id&&board.timber));
  assert.equal(project.plan.openings[0].y, 2.667);
});
