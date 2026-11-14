import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {PLAN_LAYER_FIELDS,planLayerVisibility,setAllPlanLayers,toggleLayerGroup} from '../src/react/planner/plan-layer-visibility.js';
import {createProjectWorkspace,projectWorkspaceReducer} from '../src/react/state/project-tabs.js';

test('all plan layers switch together without touching geometry, prices or quantity overrides',()=>{
 const project=createDefaultProject(),before=structuredClone(project),fields=Object.values(PLAN_LAYER_FIELDS);
 project.estimateOverrides={'test':{qty:17}};before.estimateOverrides=structuredClone(project.estimateOverrides);
 setAllPlanLayers(project,1,true);assert.ok(Object.values(planLayerVisibility(project.plan)).every(Boolean));
 setAllPlanLayers(project,1,false);assert.ok(Object.values(planLayerVisibility(project.plan)).every(v=>!v));
 for(const field of fields){if(Object.hasOwn(before.plan,field))project.plan[field]=before.plan[field];else delete project.plan[field];}
 assert.deepEqual(project,before);
});
test('bulk visibility is scoped to the active floor and survives reopening',()=>{
 const project=createDefaultProject();project.upperFloors=[structuredClone(project.plan)];project.meta.floors=2;
 const first=structuredClone(project.plan);setAllPlanLayers(project,2,false);assert.deepEqual(project.plan,first);
 const restored=migrateProject(JSON.parse(JSON.stringify(project)));assert.ok(Object.values(planLayerVisibility(restored.upperFloors[0])).every(v=>!v));
});
test('bulk 3D controls preserve unknown preferences and never duplicate hidden layers',()=>{
 const keys=['walls','roof','rafters'];assert.deepEqual(toggleLayerGroup(['future','roof'],keys,true),['future']);
 assert.deepEqual(toggleLayerGroup(['future','roof'],keys,false),['future','roof','walls','rafters']);
 assert.deepEqual(toggleLayerGroup(toggleLayerGroup([],keys,false),keys,false),keys);
});
test('the whole visibility change is one undoable action',()=>{
 const project=createDefaultProject(),before=planLayerVisibility(project.plan);let state=createProjectWorkspace(project),tabId=state.activeId;
 state=projectWorkspaceReducer(state,{type:'commit',tabId,update:p=>setAllPlanLayers(p,1,false)});
 assert.ok(Object.values(planLayerVisibility(state.tabs[0].history.present.plan)).every(v=>!v));
 state=projectWorkspaceReducer(state,{type:'undo',tabId});assert.deepEqual(planLayerVisibility(state.tabs[0].history.present.plan),before);
 state=projectWorkspaceReducer(state,{type:'redo',tabId});assert.ok(Object.values(planLayerVisibility(state.tabs[0].history.present.plan)).every(v=>!v));
});
