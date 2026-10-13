import test from 'node:test';
import assert from 'node:assert/strict';
import {attachedHouseContour,shiftPlanContents} from '../src/react/planner/attached-contour.js';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateFoundation,pileOffsetAlongRow,pileRowPoints} from '../src/react/calculations/foundation-model.js';
import {polygonArea} from '../src/calculations/plan-metrics.js';

const plan=()=>({house:{w:6,h:4},rooms:[],walls:[],openings:[],platforms:[],piles:[],pileRows:[],bindingLines:[],excludedPiles:[]});

test('open addition on the right uses the existing house wall as its shared closing edge',()=>{
 const p=plan(),result=attachedHouseContour(p,[{x:6,y:1},{x:8,y:1},{x:8,y:3},{x:6,y:3}]);
 assert.equal(result.error,undefined);assert.equal(result.addedArea,4);assert.deepEqual(result.shift,{x:0,y:0});
 assert.equal(Math.abs(polygonArea(result.points)),28);assert.equal(result.points.some(v=>v.x===8&&v.y===3),true);
 assert.deepEqual(p.house,{w:6,h:4});
});

test('addition on the left shifts existing rooms, openings and piles together without resizing them',()=>{
 const p=plan();p.rooms=[{id:'r',x:1,y:1,w:2,h:2}];p.openings=[{id:'o',x:0,y:2,width:1,height:1}];p.pileRows=[{id:'row',x1:0,y1:0,x2:6,y2:0,count:4,pileOffsets:{1:.3}}];
 const result=attachedHouseContour(p,[{x:0,y:1},{x:-2,y:1},{x:-2,y:3},{x:0,y:3}]);assert.equal(result.error,undefined);
 assert.deepEqual(result.shift,{x:2,y:0});shiftPlanContents(p,result.shift);p.house.points=result.points;
 assert.equal(p.rooms[0].x,3);assert.equal(p.rooms[0].w,2);assert.equal(p.openings[0].x,2);
 assert.equal(p.pileRows[0].x1,2);assert.equal(p.pileRows[0].pileOffsets[1],.3);
 assert.equal(Math.abs(polygonArea(p.house.points)),28);
});

test('open contour requires both endpoints on one wall and a real exterior area',()=>{
 const p=plan();assert.match(attachedHouseContour(p,[{x:6,y:1},{x:8,y:1},{x:8,y:3},{x:4,y:0}]).error,/одну/);
 assert.match(attachedHouseContour(p,[{x:6,y:1},{x:5.5,y:1},{x:5.5,y:3},{x:6,y:3}]).error,/Наружная цепочка/);
});

test('interior pile slides only along its row and survives JSON reopen without changing count',()=>{
 const row={id:'row',x1:0,y1:0,x2:6,y2:0,count:4,pileOffsets:{}};
 row.pileOffsets[1]=pileOffsetAlongRow(row,1,{x:2.6,y:3});assert.equal(row.pileOffsets[1],.6);
 assert.deepEqual(pileRowPoints(row).map(p=>[p.x,p.y]),[[0,0],[2.6,0],[4,0],[6,0]]);
 const p=createDefaultProject();p.plan.pileRows=[row];p.plan.piles=[];p.plan.excludedPiles=[];
 const saved=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(saved.plan.pileRows[0].pileOffsets[1],.6);
 assert.equal(calculateFoundation(saved.plan,saved.settings.piles).housePiles,4);
 assert.equal(pileOffsetAlongRow(row,1,{x:5.9,y:0}),1.9);
});
