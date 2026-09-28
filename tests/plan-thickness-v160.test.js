import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateClearAreas} from '../src/react/calculations/plan-clear-area.js';
import {synchronizeWallThickness} from '../src/react/state/wall-thickness.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculatePlanMetrics} from '../src/calculations/plan-metrics.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const plan=()=>({house:{w:6,h:4},wallThickness:.174,partitionThickness:.124,rooms:[],walls:[],openings:[]});
test('clear area subtracts full exterior thickness inward, never changes gross SIP floor',()=>{
  const p=plan();const snapshot=structuredClone(p);
  near(calculateClearAreas(p).clearArea,(6-.348)*(4-.348));
  assert.equal(calculatePlanMetrics(p).floorArea,24);assert.deepEqual(p,snapshot);
  p.wallThickness=.224;near(calculateClearAreas(p).clearArea,(6-.448)*(4-.448));
});
test('shared partition deducts half per room and is not counted twice',()=>{
  const p=plan();p.rooms=[{id:'a',x:0,y:0,w:3,h:4},{id:'b',x:3,y:0,w:3,h:4}];
  p.walls=[{x1:3,y1:0,x2:3,y2:4}];
  const r=calculateClearAreas(p);near(r.rooms.a.clearArea,(3-.174-.062)*(4-.348));
  near(r.rooms.a.contourArea,12);near(r.roomsClearArea,r.clearArea);
});
test('rooms already at interior face do not lose exterior thickness twice',()=>{
  const p=plan();p.rooms=[{id:'a',x:.174,y:.174,w:5.652,h:3.652}];
  const r=calculateClearAreas(p);near(r.rooms.a.clearArea,r.rooms.a.contourArea);
});
test('doorways restore floor space, overlapping partitions use union',()=>{
  const p=plan();p.walls=[{x1:3,y1:0,x2:3,y2:4},{x1:3,y1:0,x2:3,y2:4}];
  const before=calculateClearAreas(p).clearArea;p.openings=[{type:'door',orientation:'v',x:3,y:2,width:.8}];
  near(calculateClearAreas(p).clearArea-before,.8*.124);
});
test('orthogonal L contour and overlapping room totals remain finite',()=>{
  const p=plan();p.house.points=[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:3,y:2},{x:3,y:4},{x:0,y:4}];
  p.rooms=[{id:'a',x:0,y:0,w:3,h:4},{id:'b',x:0,y:0,w:3,h:4}];
  const r=calculateClearAreas(p);assert.ok(r.clearArea>0&&r.clearArea<18);near(r.roomsClearArea,r.rooms.a.clearArea);
});
test('unsupported outer geometry is clearly unavailable, not a guessed usable area',()=>{
  const p=plan();p.house.points=[{x:0,y:0},{x:4,y:0},{x:3,y:4}];
  assert.equal(calculateClearAreas(p).clearArea,null);assert.ok(calculateClearAreas(p).reason);
});
test('explicit SIP and frame choices synchronize every floor, migration leaves saved values',()=>{
  const p=createDefaultProject();p.upperFloors=[structuredClone(p.plan)];p.settings.sip.wallThickness='224';
  synchronizeWallThickness(p,'wallThickness');assert.equal(p.plan.wallThickness,.224);assert.equal(p.upperFloors[0].wallThickness,.224);
  p.settings.sip.partitionType='sip';p.settings.sip.partitionThickness='174';synchronizeWallThickness(p,'partitionType');assert.equal(p.plan.partitionThickness,.174);
  p.settings.sip.partitionType='frame';p.settings.sip.partitionFrameSection='50x150';synchronizeWallThickness(p,'partitionType');assert.equal(p.upperFloors[0].partitionThickness,.15);
  p.plan.wallThickness=.124;assert.equal(migrateProject(JSON.parse(JSON.stringify(p))).plan.wallThickness,.124);
});
