import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceBuildingContour,newHouseAtExistingCorner,existingWallLength} from '../src/react/planner/existing-building.js';
import {createDefaultProject,createBlankPlan,createUpperFloorPlan,ensureProjectFloorCount,migrateProject,REACT_PROJECT_VERSION} from '../src/react/state/project-model.js';
import {calculatePlanMetrics,polygonArea} from '../src/calculations/plan-metrics.js';
import {exteriorWallConstruction} from '../src/react/calculations/wall-construction.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {allOpeningSegments} from '../src/react/planner/geometry.js';

const host=[{x:0,y:0},{x:8,y:0},{x:8,y:6},{x:0,y:6}];
const outline=[{x:8,y:3},{x:12,y:3},{x:12,y:9},{x:5,y:9},{x:5,y:6}];
function attached(){
  const plan=createBlankPlan(),reference=referenceBuildingContour(host);
  plan.existingBuilding=reference.building;
  const result=newHouseAtExistingCorner(plan,outline);
  assert.equal(result.error,undefined);
  plan.house={w:7,h:6,points:result.points,contourDefined:true};
  plan.existingBuilding=result.existingBuilding;plan.attachment=result.attachment;
  return {plan,result};
}

test('new footprint wraps the host corner, meets adjacent walls, and prices only new area',()=>{
  const {plan,result}=attached();
  assert.equal(result.addedArea,33);
  assert.equal(polygonArea(plan.existingBuilding.points),48);
  assert.equal(calculatePlanMetrics(plan).floorArea,33);
  assert.equal(existingWallLength(plan),6);
  assert.equal(calculatePlanMetrics(plan).perimeter,20);
  assert.equal(calculatePlanMetrics(plan).exteriorWallGrossArea,50);
  assert.equal(exteriorWallConstruction(plan).length,4);
  assert.equal(exteriorWallConstruction(plan).reduce((sum,wall)=>sum+wall.externalLength,0),20);
  assert.equal(allOpeningSegments(plan).filter(segment=>segment.outer).length,4);
});

test('open footprint closes against one existing wall without pricing that wall',()=>{
  const plan=createBlankPlan();plan.existingBuilding=referenceBuildingContour(host).building;
  const result=newHouseAtExistingCorner(plan,[{x:8,y:0},{x:12,y:0},{x:12,y:6},{x:8,y:6}]);
  assert.equal(result.error,undefined);
  assert.equal(result.addedArea,24);
  assert.equal(result.sharedLength,6);
  assert.deepEqual(result.attachment.hostEdgeIndices,[1]);
  assert.equal(result.attachment.sharedEdges.length,1);
  plan.house={w:4,h:6,points:result.points,contourDefined:true};
  plan.existingBuilding=result.existingBuilding;plan.attachment=result.attachment;
  assert.equal(calculatePlanMetrics(plan).floorArea,24);
  assert.equal(calculatePlanMetrics(plan).perimeter,14);
  assert.equal(exteriorWallConstruction(plan).length,3);
  assert.equal(existingWallLength(plan),6);
  const project=createDefaultProject();project.plan=plan;
  const restored=migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(calculateProject(restored).metrics.floorArea,24);
  assert.equal(existingWallLength(restored.plan),6);
});

test('invalid endpoints and overlap with host are rejected',()=>{
  const plan=createBlankPlan();plan.existingBuilding=referenceBuildingContour(host).building;
  assert.match(newHouseAtExistingCorner(plan,[{x:8,y:1},{x:12,y:1},{x:12,y:3},{x:0,y:3}]).error,/соседних/);
  assert.match(newHouseAtExistingCorner(plan,[{x:8,y:3},{x:7,y:3},{x:7,y:7},{x:5,y:7},{x:5,y:6}]).error,/пересекает/);
});

test('JSON migration keeps host reference and the same counted walls',()=>{
  const project=createDefaultProject(),{plan}=attached();project.plan=plan;
  const restored=migrateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored.plan.existingBuilding,plan.existingBuilding);
  assert.deepEqual(restored.plan.attachment,plan.attachment);
  assert.equal(calculatePlanMetrics(restored.plan).floorArea,33);
  assert.equal(calculatePlanMetrics(restored.plan).perimeter,20);
  assert.equal(calculateProject(restored).metrics.floorArea,33);
});

test('production surfaces omit both existing walls and 3D host is reference only',()=>{
  const project=createDefaultProject(),{plan}=attached();project.plan=plan;
  const calculation=calculateProject(project),report=calculateProductionCutting(project,calculation),scene=productionScene(report,project);
  const host=scene.panels.filter(item=>item.layer==='existingBuilding');
  assert.equal(host.length,4);
  assert.ok(host.every(item=>item.referenceOnly));
  assert.equal(report.surfaces.filter(item=>item.exterior&&item.planStart).length,4);
  assert.ok(report.surfaces.every(item=>!item.id.startsWith('existing:')));
  assert.ok(calculation.lines.every(item=>!item.id.startsWith('existing:')));
});

test('old project without a host retains its original metrics',()=>{
  const project=createDefaultProject(),original=calculateProject(project);
  const restored=migrateProject(JSON.parse(JSON.stringify(project)));
  const again=calculateProject(restored);
  assert.equal(again.metrics.floorArea,original.metrics.floorArea);
  assert.equal(again.metrics.perimeter,original.metrics.perimeter);
  assert.equal(restored.plan.attachment,null);
});

test('second floor inherits both existing-wall joints without new SIP panels or duplicate wall cost',()=>{
  const project=createDefaultProject(),{plan}=attached();project.plan=plan;
  ensureProjectFloorCount(project,2);
  const upper=project.upperFloors[0];
  assert.deepEqual(upper.house.points,plan.house.points);
  assert.deepEqual(upper.attachment.sharedEdges,plan.attachment.sharedEdges);
  assert.notEqual(upper.attachment,plan.attachment);
  const calculation=calculateProject(project),report=calculateProductionCutting(project,calculation);
  assert.equal(report.surfaces.filter(surface=>surface.floor===2&&surface.exterior&&surface.planStart).length,4);
  assert.equal(report.surfaces.some(surface=>['Э2-С5','Э2-С6'].includes(surface.id)),false);
  assert.equal(report.parts.some(part=>['Э2-С5','Э2-С6'].includes(part.surfaceId)),false);
  assert.equal(calculation.metrics.floorArea,33);
  assert.deepEqual(migrateProject(JSON.parse(JSON.stringify(project))).upperFloors[0].attachment,upper.attachment);
});

test('old copied upper contour migrates its host joints, while an independently edited upper contour stays untouched',()=>{
  const project=createDefaultProject(),{plan}=attached();project.plan=plan;project.meta.floors=2;
  project.upperFloors=[createUpperFloorPlan(plan)];
  const correctTotal=calculateProject(project).totals.total;
  project.appVersion=229; // The host-joint repair applies to files saved before format 230.
  project.upperFloors[0].attachment=null;
  project.upperFloors[0].existingBuilding=null;
  const oldTotal=calculateProject(project).totals.total;
  assert.ok(oldTotal>correctTotal);
  const restored=migrateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored.upperFloors[0].attachment,plan.attachment);
  assert.equal(calculateProject(restored).totals.total,correctTotal);
  project.upperFloors[0].house.points[0].x+=.5;
  const edited=migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(edited.upperFloors[0].attachment,null);
  project.appVersion=REACT_PROJECT_VERSION;
  project.upperFloors[0].house.points=structuredClone(plan.house.points);
  assert.equal(migrateProject(JSON.parse(JSON.stringify(project))).upperFloors[0].attachment,null);
});
