import test from 'node:test';import assert from 'node:assert/strict';
import {beginPlanPinch,movePlanPinch} from '../src/react/planner/mobile-viewport.js';
const rotate=(p,angle)=>{const r=angle*Math.PI/180;return{x:p.x*Math.cos(r)-p.y*Math.sin(r),y:p.x*Math.sin(r)+p.y*Math.cos(r)};};
test('two-finger rotation keeps the same world anchor under the moving midpoint at any initial angle',()=>{
 for(const angle of [0,45,170,-160]){
  const points=[{x:100,y:240},{x:200,y:240}],start=beginPlanPinch(points,100,{x:30,y:-40},{a:1,b:0,c:0,d:1,e:0,f:0},{width:400,height:800},angle),before=structuredClone(start);
  const next=movePlanPinch(start,[{x:170,y:200},{x:170,y:400}]);assert.equal(next.zoom,200);assert.ok(Math.abs(next.rotation-angle-90)<1e-8);
  const v=start.viewCenter,anchor=rotate({x:start.center.x-v.x,y:start.center.y-v.y},-angle),projected=rotate({x:2*(anchor.x-start.pan.x)+next.pan.x,y:2*(anchor.y-start.pan.y)+next.pan.y},next.rotation);
  assert.ok(Math.abs(projected.x+v.x-170)<1e-8);assert.ok(Math.abs(projected.y+v.y-300)<1e-8);assert.deepEqual(start,before);
 }
});
test('rotating through the angle wrap remains a finite camera operation',()=>{
 const start=beginPlanPinch([{x:200,y:99},{x:100,y:100}],100,{x:0,y:0},null,{width:400,height:800},170);
 const next=movePlanPinch(start,[{x:200,y:101},{x:100,y:100}]);assert.ok(next.rotation>170&&next.rotation<172);assert.ok(Object.values(next.pan).every(Number.isFinite));
});
