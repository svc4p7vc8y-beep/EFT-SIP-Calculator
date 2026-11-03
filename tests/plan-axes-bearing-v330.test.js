import test from 'node:test';import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {roofPlanLines,saveRoofLines,snapRoofLineOffset} from '../src/react/planner/roof-lines.js';
import {selectableBearingEdges,collinearBearingKeys,assignBearingEdges} from '../src/react/planner/bearing-selection.js';
import {partitionProfileShares} from '../src/react/calculations/bearing-walls.js';
import {constructionDescription} from '../src/react/calculations/proposal-description.js';
import {synchronizeWallThickness} from '../src/react/state/wall-thickness.js';
import {createProjectWorkspace,projectWorkspaceReducer} from '../src/react/state/project-tabs.js';
const base=()=>{const p=createDefaultProject();Object.assign(p.plan,{house:{w:10,h:8},rooms:[],walls:[],openings:[],wallGaps:[],platforms:[],wallHeight:2.5});Object.assign(p.settings.roof,{structureMode:'manual',rafterSystem:'layered',ridgeAxis:'x'});return p;};
const run=p=>calculateProductionCutting(p,calculateProject(p));
test('auto roof lines edit the existing geometric and purchasing frames, persist and reset without duplicates',()=>{
 const p=base(),prices=structuredClone(p.priceMat),original=calculateProject(p),axes=roofPlanLines(p,original);assert.equal(axes.length,2);
 saveRoofLines(p,original,axes.map((line,i)=>i?line:{...line,offset:2.5}));
 const saved=migrateProject(JSON.parse(JSON.stringify(p))),calculation=calculateProject(saved),report=calculateProductionCutting(saved,calculation);
 assert.equal(calculation.roof.layeredFrame.fractions[0],2.5/8);
 const first=report.assembly.supports.filter(item=>item.frameGroup===axes[0].id);assert.ok(first.length>0);assert.ok(first.every(item=>item.a[1]===2500&&item.b[1]===2500));
 assert.equal(report.assembly.supports.filter(item=>item.autoLayout==='layered-frame').length,calculation.roof.layeredFrame.items);
 assert.deepEqual(p.priceMat,prices);
 saved.settings.productionCutting.roofPlanLines={enabled:false,lines:[]};assert.deepEqual(calculateProject(saved).roof.layeredFrame.fractions,original.roof.layeredFrame.fractions);
});
test('drawn partial lines constrain posts and chords, deletion removes the same frame from 3D and purchasing',()=>{
 const p=base(),c=calculateProject(p);saveRoofLines(p,c,[{id:'drawn',offset:3,start:1,end:9}]);
 const report=run(p),items=report.assembly.supports.filter(item=>item.autoLayout==='layered-frame');assert.ok(items.length>0);assert.ok(items.every(item=>item.a[0]>=1000&&item.b[0]<=9000));
 p.settings.productionCutting.roofPlanLines.lines=[];const empty=calculateProject(p);assert.equal(empty.roof.layeredFrame.items,0);assert.ok(!empty.lines.some(line=>line.id.startsWith('roof:layered-frame-')));
});
test('symmetry snaps to house centre and mirror position without forcing distant axes',()=>{
 assert.deepEqual(snapRoofLineOffset(4.07,8,[2]),{offset:4,hint:'Ось симметрии дома'});assert.equal(snapRoofLineOffset(6.06,8,[2]).offset,6);assert.equal(snapRoofLineOffset(5.4,8,[2]).offset,5.4);
});
test('collinear room-side selection applies all matching sides once and assigns dressed board to physical partition frame',()=>{
 const p=base();p.plan.rooms=[{id:'a',name:'А',x:0,y:0,w:5,h:4},{id:'b',name:'Б',x:0,y:4,w:5,h:4}];
 const edges=selectableBearingEdges(p.plan),edge=edges.find(e=>e.a.x===5&&e.b.x===5),keys=collinearBearingKeys(edges,edge.key);assert.equal(keys.length,2);
 assignBearingEdges(p.plan,keys,true,'45x145');assert.equal(selectableBearingEdges(p.plan).filter(e=>e.bearing).length,2);
 assert.ok(partitionProfileShares(p.plan,'50x100').some(row=>row.profile==='45x145'));
 const c=calculateProject(p);assert.ok(c.lines.some(line=>line.catalogId==='MAT-006'&&line.qty>0&&line.id.includes('partition')));
 assert.ok(run(p).members.some(member=>member.profile==='45×145'&&member.surfaceId?.includes('ПГ')));
 assignBearingEdges(p.plan,keys,false,'45x145');assert.ok(selectableBearingEdges(p.plan).filter(e=>keys.includes(e.key)).every(e=>!e.bearing));
});
test('all three dressed-board sizes use existing catalogue and correct project thickness and estimate description',()=>{
 for(const [profile,id,depth] of [['45x95','MAT-008',95],['45x145','MAT-006',145],['45x195','MAT-007',195]]){
  const p=base();p.plan.walls=[{id:'partition',x1:2,y1:0,x2:2,y2:8,include:true}];p.settings.sip.partitionFrameSection=profile;synchronizeWallThickness(p,'partitionFrameSection');assert.equal(p.plan.partitionThickness,depth/1000);
  const c=calculateProject(p);assert.ok(c.lines.some(line=>line.id.includes('partition-board')&&line.catalogId===id&&line.qty>0));assert.ok(constructionDescription(p,c.lines).some(block=>block.text.includes(profile.replace('x','×'))));
 }
});
test('edited roof axes and matching window header share undo and redo',()=>{
 const p=base();p.plan.openings=[{id:'w',type:'window',outer:true,x:0,y:3,width:1.5,height:1.2,sillHeight:.8,orientation:'v'}];let state=createProjectWorkspace(p);
 state=projectWorkspaceReducer(state,{type:'commit',update:next=>saveRoofLines(next,calculateProject(next),[{id:'line',offset:3,start:0,end:10}])});let next=state.tabs[0].history.present;assert.equal(next.settings.productionCutting.roofSupports.filter(item=>item.autoWindowHeader).length,3);
 state=projectWorkspaceReducer(state,{type:'undo'});assert.equal(state.tabs[0].history.present.settings.productionCutting.roofPlanLines.enabled,false);
 state=projectWorkspaceReducer(state,{type:'redo'});assert.equal(state.tabs[0].history.present.settings.productionCutting.roofPlanLines.lines[0].offset,3);
});
