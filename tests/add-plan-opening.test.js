import test from 'node:test';import assert from 'node:assert/strict';
import {createDefaultProject,migrateProject} from '../src/react/state/project-model.js';
import {createProjectWorkspace,projectWorkspaceReducer} from '../src/react/state/project-tabs.js';
import {addPlanOpening} from '../src/react/state/add-plan-opening.js';
test('placing a plan window and its suggested product is one undoable action, including JSON reopen',()=>{
 const project=createDefaultProject(),state=createProjectWorkspace(project),before=state.tabs[0].history.present.plan.openings.length;
 const added=projectWorkspaceReducer(state,{type:'commit',update:next=>{addPlanOpening(next,next.plan,{id:'phone-window',type:'window',width:1.2,height:1.2,x:3,y:0,orientation:'h',outer:true});return next;}});
 const placed=added.tabs[0].history.present;assert.equal(placed.plan.openings.length,before+1);assert.ok(placed.windowProducts.some(w=>w.openingId==='phone-window'));
 const reopened=migrateProject(JSON.parse(JSON.stringify(placed)));assert.ok(reopened.windowProducts.some(w=>w.openingId==='phone-window'));
 const undone=projectWorkspaceReducer(added,{type:'undo'});assert.equal(undone.tabs[0].history.present.plan.openings.length,before);assert.ok(!undone.tabs[0].history.present.windowProducts.some(w=>w.openingId==='phone-window'));
 const redone=projectWorkspaceReducer(undone,{type:'redo'});assert.equal(redone.tabs[0].history.present.plan.openings.length,before+1);assert.equal(redone.tabs[0].history.present.windowProducts.filter(w=>w.openingId==='phone-window').length,1);
});
