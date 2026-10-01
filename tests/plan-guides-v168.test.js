import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPlan } from '../src/react/state/project-model.js';
import { collectSnapAxes, snapPointDetails } from '../src/react/planner/geometry.js';
import { guideFromOuterWall, moveTemporaryGuide } from '../src/react/planner/temporary-guides.js';

test('temporary guides start at each outside wall and measure inward', () => {
  const plan=createDefaultPlan();
  plan.house={w:8,h:6};
  const samples=[
    [{x:0.04,y:3},'x',0,2.4],
    [{x:7.96,y:3},'x',8,5.6],
    [{x:4,y:0.04},'y',0,2.4],
    [{x:4,y:5.96},'y',6,3.6],
  ];
  for(const [point,axis,origin,target] of samples){
    const guide=guideFromOuterWall(plan,point);
    assert.equal(guide.axis,axis);
    assert.equal(guide.origin,origin);
    assert.equal(moveTemporaryGuide(guide,{x:target,y:target}).target,target);
    assert.equal(moveTemporaryGuide(guide,{x:axis==='x'?(origin===0?-1:9):0,y:axis==='y'?(origin===0?-1:7):0}).target,origin);
  }
  assert.equal(guideFromOuterWall(plan,{x:4,y:3}),null);
});

test('guide coordinate snaps room points without entering project data', () => {
  const plan=createDefaultPlan();plan.house={w:8,h:6};
  const before=JSON.stringify(plan);
  const guide=moveTemporaryGuide(guideFromOuterWall(plan,{x:0,y:3}),{x:2.35,y:3});
  const axes=collectSnapAxes(plan);axes.xs.push(guide.target);
  assert.equal(snapPointDetails({x:2.41,y:3},axes,{tolerance:0.15}).point.x,2.4);
  assert.equal(JSON.stringify(plan),before);
});
