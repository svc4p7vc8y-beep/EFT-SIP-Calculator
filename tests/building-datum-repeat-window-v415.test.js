import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {fitFoundationToFloor,foundationFootprint} from '../src/react/state/foundation-fit.js';
import {createProjectWorkspace,projectWorkspaceReducer} from '../src/react/state/project-tabs.js';
import {generateAutoPileRows,bindingLinesWithManual} from '../src/react/calculations/foundation-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {addPlanOpening} from '../src/react/state/add-plan-opening.js';
import {lastPlacedWindow,repeatedWindowOpening,addRepeatedWindow} from '../src/react/state/repeat-window.js';
function fixture(){const p=createDefaultProject();Object.assign(p.plan,{house:{w:10,h:4},rooms:[],walls:[],openings:[],platforms:[],piles:[],excludedPiles:[]});p.plan.pileRows=generateAutoPileRows(p.plan,2.5,{mode:'contour'});p.plan.bindingLines=bindingLinesWithManual(p.plan,p.plan.pileRows);return p;}
test('building dimensions govern pile axes and all production envelopes without moving rooms or openings',()=>{
 const p=fixture();p.settings.piles.pileAxisDatum=true;p.settings.piles.pileAxisAuto=true;p.plan.house.pileAxisContour=[{x:0,y:0},{x:10,y:0},{x:10,y:4},{x:0,y:4}];p.plan.openings=[{id:'w',type:'window',outer:true,x:2,y:0,width:1.2,height:1.2}];
 const plan=structuredClone(p.plan),prices=structuredClone(p.priceMat);fitFoundationToFloor(p);const sizes=foundationFootprint(p);
 assert.equal(sizes.outside.width,10);assert.equal(sizes.outside.height,4);assert.ok(Math.abs(sizes.axes.width-9.85)<1e-8);assert.ok(Math.abs(sizes.axes.height-3.85)<1e-8);
 assert.deepEqual(p.plan.openings,plan.openings);assert.deepEqual(p.plan.rooms,plan.rooms);assert.deepEqual(p.priceMat,prices);assert.equal(p.settings.piles.pileAxisDatum,false);assert.equal(p.settings.piles.buildingEnvelopeDatum,true);
 const report=calculateProductionCutting(p,calculateProject(p));assert.ok(report.assembly.bindingFloorAlignment.every(v=>v.matches));
 const saved=migrateProject(JSON.parse(JSON.stringify(p)));assert.equal(saved.plan.house.w,10);let state=createProjectWorkspace(saved);state=projectWorkspaceReducer(state,{type:'commit',update:n=>{n.settings.piles.bindingLayers=4;return n;}});const next=state.tabs[0].history.present;
 assert.equal(next.plan.house.w,10);assert.ok(Math.abs(foundationFootprint(next).axes.width-9.8)<1e-8);
 state=projectWorkspaceReducer(state,{type:'undo'});assert.deepEqual(state.tabs[0].history.present,saved);
});
test('11.25 by 8.5 house retains outer dimensions with inset pile field',()=>{
 const p=fixture();p.plan.house={w:11.25,h:8.5};fitFoundationToFloor(p);const f=foundationFootprint(p);assert.equal(f.outside.width,11.25);assert.equal(f.outside.height,8.5);assert.ok(Math.abs(f.axes.width-11.1)<1e-8);assert.ok(Math.abs(f.axes.height-8.35)<1e-8);
});
test('repeat copies last window settings and current product without sharing IDs, quantities or geometry',()=>{
 const p=fixture(),o={id:'original',type:'window',outer:true,x:2,y:0,width:1.5,height:1.3,sillHeight:.9};addPlanOpening(p,p.plan,o);const product=p.windowProducts.find(v=>v.openingId===o.id);product.sections[0].openingMode='tilt_turn_left';product.quantity=3;
 const source=structuredClone(product);let state=createProjectWorkspace(p);state=projectWorkspaceReducer(state,{type:'commit',update:n=>{const opening=repeatedWindowOpening(n,n.plan,{id:'copy',x:5,y:0,outer:true,orientation:'h'});addRepeatedWindow(n,n.plan,opening);return n;}});
 const next=state.tabs[0].history.present,copy=next.windowProducts.find(v=>v.openingId==='copy');assert.notEqual(copy.id,source.id);assert.equal(copy.quantity,1);assert.deepEqual(copy.sections,source.sections);assert.equal(next.plan.openings[1].width,o.width);assert.equal(next.plan.openings[1].sillHeight,.9);assert.equal(next.plan.openings[1].x,5);copy.sections[0].ratio=7;assert.notEqual(next.windowProducts.find(v=>v.openingId===o.id).sections[0].ratio,7);
 assert.equal(lastPlacedWindow(migrateProject(JSON.parse(JSON.stringify(next)))).opening.id,'copy');state=projectWorkspaceReducer(state,{type:'undo'});assert.equal(state.tabs[0].history.present.plan.openings.length,1);
});
