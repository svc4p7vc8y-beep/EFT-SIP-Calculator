import test from 'node:test';import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {applyPileAxisEnvelope,resizePileAxisEnvelope} from '../src/react/state/pile-axis-envelope.js';
import {generateAutoPileRows,bindingLinesWithManual} from '../src/react/calculations/foundation-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {surfaceDimensions,pointBounds} from '../src/react/calculations/drawing-dimensions.js';
import {scopedWorkbenchItems,scopedWorkbenchStock} from '../src/react/screens/workbench-model.js';
import {createProjectWorkspace,projectWorkspaceReducer} from '../src/react/state/project-tabs.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
function fixture(){const p=createDefaultProject();Object.assign(p.plan,{house:{w:10,h:4},rooms:[],walls:[],openings:[],platforms:[],piles:[],excludedPiles:[]});p.plan.pileRows=generateAutoPileRows(p.plan,2.5,{mode:'contour'});p.plan.bindingLines=bindingLinesWithManual(p.plan,p.plan.pileRows);return p;}
test('4×10 pile centres stay fixed; outside binding, floor, ceiling and walls become 4.15×10.15',()=>{
  const p=fixture(),rows=structuredClone(p.plan.pileRows),lines=structuredClone(p.plan.bindingLines),prices=structuredClone(p.priceMat);applyPileAxisEnvelope(p);
  assert.deepEqual(p.plan.pileRows,rows);assert.deepEqual(p.plan.bindingLines,lines);assert.deepEqual(p.priceMat,prices);close(p.plan.house.w,10.15);close(p.plan.house.h,4.15);
  const c=calculateProject(p),r=calculateProductionCutting(p,c),box=pointBounds(r.assembly.floors[0].contour);close(box.width,10150);close(box.height,4150);assert.equal(c.metrics.floorArea,42.12);assert.equal(c.metrics.ceilingArea,42.12);assert.ok(r.assembly.bindingFloorAlignment.every(a=>a.matches));
  for(const suffix of ['-ПОЛ','-ПТ']){const s=r.surfaces.find(s=>s.id.endsWith(suffix));assert.ok(s);const b=pointBounds(s.geometry.flat(2));close(b.width,10150);close(b.height,4150);}
  const once=JSON.stringify(p);applyPileAxisEnvelope(p);assert.equal(JSON.stringify(p),once);const restored=migrateProject(JSON.parse(once));applyPileAxisEnvelope(restored);close(restored.plan.house.w,10.15);
});
test('L-shaped contour uses outward offset, keeps recess and does not inflate into a rectangle',()=>{
  const p=fixture();p.plan.house.points=[[0,0],[10,0],[10,4],[6,4],[6,2],[0,2]].map(([x,y])=>({x,y}));p.plan.pileRows=generateAutoPileRows(p.plan,2.5,{mode:'contour'});p.plan.bindingLines=bindingLinesWithManual(p.plan,p.plan.pileRows);applyPileAxisEnvelope(p);assert.equal(p.plan.house.points.length,6);assert.ok(p.plan.house.points.some(p=>Math.abs(p.x-5.925)<.001&&Math.abs(p.y-2.075)<.001));
  const r=calculateProductionCutting(p,calculateProject(p));assert.ok(r.assembly.bindingFloorAlignment.every(a=>a.matches));
});
test('boundary rooms and openings follow wall; interior partitions, opening sizes and piles stay intact',()=>{
  const p=fixture();p.plan.rooms=[{id:'room',points:[{x:.174,y:.174},{x:5,y:.174},{x:5,y:3.826},{x:.174,y:3.826}]}];p.plan.openings=[{id:'w',type:'window',outer:true,x:2,y:0,width:1.2,height:1.4}];p.plan.walls=[{id:'inside',x1:5,y1:1,x2:5,y2:3}];applyPileAxisEnvelope(p);
  close(p.plan.rooms[0].points[0].x,.099);close(p.plan.rooms[0].points[1].x,5);close(p.plan.openings[0].y,-.075);assert.equal(p.plan.openings[0].width,1.2);assert.equal(p.plan.walls[0].x1,5);
});
test('package width changes exterior only; axis resize and undo/redo use one consistent envelope',()=>{
  const p=fixture();applyPileAxisEnvelope(p);let state=createProjectWorkspace(p);state=projectWorkspaceReducer(state,{type:'commit',update:n=>{n.settings.piles.bindingLayers=4;return n;}});let next=state.tabs[0].history.present;close(next.plan.house.w,10.2);assert.deepEqual(next.plan.pileRows,p.plan.pileRows);
  state=projectWorkspaceReducer(state,{type:'commit',update:n=>resizePileAxisEnvelope(n,12,5)});next=state.tabs[0].history.present;close(next.plan.house.w,12.2);close(next.plan.house.h,5.2);const r=calculateProductionCutting(next,calculateProject(next));assert.ok(r.assembly.bindingFloorAlignment.every(a=>a.matches));state=projectWorkspaceReducer(state,{type:'undo'});close(state.tabs[0].history.present.plan.house.w,10.2);state=projectWorkspaceReducer(state,{type:'redo'});close(state.tabs[0].history.present.plan.house.w,12.2);
});
test('side chains contain panel courses, opening sill/head, wall outline and horizontal member levels',()=>{
  const surface={geometry:[[[[0,0],[4000,0],[4000,3000],[2000,4000],[0,3000],[0,0]]]],openings:[{x:1000,width:1200,sill:800,height:1400}]};
  const d=surfaceDimensions(surface,[{x:0,y:0,width:1250,height:2500},{x:0,y:2500,width:1250,height:500}],[{a:[0,2800],b:[4000,2800]}]);for(const y of [0,800,2200,2500,2800,3000,4000])assert.ok(d.y.includes(y));
  const frame=surfaceDimensions({geometry:[[[[0,0],[4000,0],[4000,3200],[0,3200],[0,0]]]]},[],[{a:[0,22.5],b:[4000,22.5],profile:'45×145'},{a:[0,3177.5],b:[4000,3177.5],profile:'45×145'}]);assert.deepEqual(frame.frameY,[0,45,3155,3200]);
});
test('floor, ceiling and all walls scopes are independent of selected category and include all storeys',()=>{
  const p=fixture();applyPileAxisEnvelope(p);const r=calculateProductionCutting(p,calculateProject(p));
  for(const [scope,suffix]of [['floors','-ПОЛ'],['ceilings','-ПТ'],['allWalls','-С']]){const items=scopedWorkbenchItems(r,{scope,category:'roof',floor:1});assert.ok(items.parts.length);assert.ok(items.parts.every(p=>scope==='allWalls'?p.surfaceId.includes(suffix)||p.surfaceId.startsWith('ФР-'):p.surfaceId.endsWith(suffix)));const stock=scopedWorkbenchStock(r,items,{scope,category:'roof'});assert.deepEqual(stock.roofCover,{slopes:[]});assert.ok(stock.panelStock.sheets.length);}
});
test('existing actual pile centres override the old floorEdges flag; user can disable automatic envelope',()=>{
  const p=fixture();p.settings.piles.layoutReference='floorEdges';applyPileAxisEnvelope(p);close(p.plan.house.w,10.15);
  const disabled=fixture();disabled.settings.piles.pileAxisAuto=false;const before=JSON.stringify(disabled);applyPileAxisEnvelope(disabled);assert.equal(JSON.stringify(disabled),before);
});
test('attached terraces follow exterior wall without changing their dimensions',()=>{
  const p=fixture();p.plan.platforms=[{id:'terrace',type:'terrace',x:2,y:4,w:5,h:2,roof:{mode:'none'}}];applyPileAxisEnvelope(p);close(p.plan.platforms[0].y,4.075);assert.equal(p.plan.platforms[0].w,5);assert.equal(p.plan.platforms[0].h,2);
});
test('side panel chain excludes local window cuts that do not reach the wall edge',()=>{
  const surface={geometry:[[[[0,0],[4000,0],[4000,3000],[0,3000],[0,0]]]]};const d=surfaceDimensions(surface,[{x:0,y:0,width:1250,height:2500},{x:0,y:2500,width:1250,height:500},{x:1500,y:823,width:300,height:300}]);assert.deepEqual(d.leftY,[0,2500,3000]);assert.ok(d.y.includes(823));
});
