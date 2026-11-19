import test from 'node:test';import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {partitionDepth} from '../src/react/planner/geometry.js';
import {assignPartitionMaterial,assignBearingEdges,assignSipThickness} from '../src/react/planner/bearing-selection.js';
import {bearingWallKey} from '../src/react/calculations/bearing-walls.js';
import {partitionMaterialQuantities} from '../src/react/calculations/partition-material-quantities.js';
function fixture(global='frame') {const p=createDefaultProject();p.plan.house={w:8,h:6};p.plan.rooms=[];p.plan.walls=[{id:'a',x1:2,y1:0,x2:2,y2:6,include:true},{id:'b',x1:5,y1:0,x2:5,y2:6,include:true}];p.plan.openings=[];p.plan.partitionThickness=global==='sip'?.124:.1;p.settings.sip.partitionType=global;p.settings.sip.partitionThickness='124';p.settings.sip.partitionCalculationMode='linear';return p;}
test('one project has SIP and frame partitions in quantities and production, with no duplicated frame on SIP',()=>{
 const p=fixture();p.plan.walls[0].partitionType='sip';p.plan.walls[0].sipThickness=174;
 const c=calculateProject(p),r=calculateProductionCutting(p,c),walls=r.surfaces.filter(s=>s.id.includes('-ПГ'));
 assert.equal(walls.length,2);assert.equal(walls[0].frameOnly,false);assert.equal(walls[0].thickness,174);assert.equal(walls[1].frameOnly,true);
 assert.ok(r.members.some(m=>m.surfaceId===walls[1].id));assert.ok(c.lines.some(l=>l.id==='sip:partition-board'&&l.qty>0));assert.ok(c.lines.some(l=>l.id==='sip:install-partitions'&&l.qty>0));
 const sip=partitionMaterialQuantities(p,c.metrics,'sip')[0],frame=partitionMaterialQuantities(p,c.metrics,'frame')[0];assert.equal(sip.length,5.65);assert.equal(frame.length,5.65);assert.equal(sip.area+frame.area,c.metrics.firstFloorPartitionNetArea);
 assert.equal(partitionDepth(p.plan,{x:2,y:0},{x:2,y:6}),.174);
 const restored=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(restored.plan.walls[0].partitionType,'sip');assert.equal(calculateProductionCutting(restored,calculateProject(restored)).surfaces.find(s=>s.id==='Э1-ПГ1').thickness,174);
});
test('a local frame overrides common SIP and its door opening is charged to the correct material once',()=>{
 const p=fixture('sip');p.plan.walls[1].partitionType='frame';p.plan.walls[1].frameProfile='50x150';p.plan.openings=[{id:'door',type:'door',outer:false,x:5,y:3,width:1,height:2,orientation:'v',include:true}];
 const c=calculateProject(p),r=calculateProductionCutting(p,c),sip=partitionMaterialQuantities(p,c.metrics,'sip')[0],frame=partitionMaterialQuantities(p,c.metrics,'frame')[0];
 assert.equal(sip.area,14.13);assert.equal(frame.area,12.13);assert.equal(sip.area+frame.area,c.metrics.firstFloorPartitionNetArea);assert.equal(r.surfaces.find(s=>s.id==='Э1-ПГ2').frameOnly,true);
 assert.ok(c.lines.some(l=>l.id==='sip:partition-board-50×150'||l.id==='sip:partition-board-50x150'));assert.equal(partitionDepth(p.plan,{x:5,y:0},{x:5,y:6}),.15);
});
test('room-side material assignment preserves bearing status and local thickness through changes',()=>{
 const p=fixture();p.plan.walls=[];p.plan.rooms=[{id:'r',x:0,y:0,w:4,h:6}];const key=bearingWallKey({x:4,y:0},{x:4,y:6});
 assignPartitionMaterial(p.plan,[key],'sip',{sipThickness:224});assignBearingEdges(p.plan,[key],true,'50x150');
 assert.equal(p.plan.rooms[0].bearingWalls[key].partitionType,'sip');assert.equal(partitionDepth(p.plan,{x:4,y:0},{x:4,y:6}),.224);
 assignSipThickness(p.plan,[key],174);assert.equal(partitionDepth(p.plan,{x:4,y:0},{x:4,y:6}),.174);
 assignPartitionMaterial(p.plan,[key],'frame',{frameProfile:'50x150'});assert.equal(partitionDepth(p.plan,{x:4,y:0},{x:4,y:6}),.15);
});
test('mixed materials retain butt joints at intersections and split a collinear material boundary',()=>{
 const p=fixture();p.plan.walls=[{id:'a',x1:1,y1:3,x2:4,y2:3,partitionType:'sip',sipThickness:174},{id:'b',x1:4,y1:3,x2:7,y2:3,partitionType:'frame',frameProfile:'50x100'},{id:'c',x1:4,y1:1,x2:4,y2:5,partitionType:'frame',frameProfile:'50x150'}];
 const c=calculateProject(p),r=calculateProductionCutting(p,c);assert.equal(r.surfaces.filter(s=>s.id.includes('-ПГ')&&!s.frameOnly).length,1);
 const a=partitionMaterialQuantities(p,c.metrics,'sip')[0],b=partitionMaterialQuantities(p,c.metrics,'frame')[0];assert.ok(Math.abs(a.area+b.area-c.metrics.firstFloorPartitionNetArea)<.011);
 assert.ok(r.surfaces.some(s=>s.partitionFrame&&s.thickness===150));
});
