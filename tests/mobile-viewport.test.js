import test from 'node:test';import assert from 'node:assert/strict';
import {adaptivePlanView,svgPan,svgClientPoint,beginPlanPinch,movePlanPinch,edgeMenuSwipe} from '../src/react/planner/mobile-viewport.js';
test('portrait SVG matches actual available aspect; desktop keeps existing coordinate space',()=>{
 const view=adaptivePlanView(320,720,true);assert.equal(view.width/view.height,320/720);
 assert.deepEqual(adaptivePlanView(1200,800,false),{width:1100,height:760});assert.deepEqual(adaptivePlanView(0,0,true),{width:1100,height:760});
});
test('finger pan converts screen pixels into SVG coordinates, including rotated and translated CTM',()=>{
 const matrix={a:.25,b:0,c:0,d:.25,e:50,f:100};assert.deepEqual(svgPan({x:10,y:20},25,50,matrix),{x:110,y:220});
 assert.deepEqual(svgClientPoint({x:75,y:125},matrix),{x:100,y:100});
 assert.deepEqual(svgPan({x:0,y:0},10,20,{a:0,b:2,c:-2,d:0,e:100,f:20}),{x:10,y:-5});
});
test('pinch keeps the same plan point under the two-finger midpoint while zooming and translating',()=>{
 const matrix={a:.25,b:0,c:0,d:.25,e:0,f:0},view={width:1100,height:2200},initial=[{x:100,y:250},{x:200,y:250}];
 const start=beginPlanPinch(initial,100,{x:40,y:-20},matrix,view);
 const result=movePlanPinch(start,[{x:60,y:270},{x:260,y:270}]);assert.equal(result.zoom,200);
 const oldCenter={x:550,y:1100},anchor=start.center;
 for(const axis of ['x','y']){
  const projected=oldCenter[axis]+2*(anchor[axis]-oldCenter[axis]-start.pan[axis])+result.pan[axis];
  assert.equal(projected,axis==='x'?640:1080);
 }
 assert.equal(movePlanPinch({...start,zoom:1900},[{x:0,y:0},{x:500,y:0}]).zoom,2000);
 assert.deepEqual(start.pan,{x:40,y:-20});
});
test('edge swipe opens menu only for a predominantly horizontal gesture starting at left edge',()=>{
 assert.ok(edgeMenuSwipe({x:8,y:400},{x:90,y:410}));assert.ok(!edgeMenuSwipe({x:100,y:400},{x:190,y:410}));assert.ok(!edgeMenuSwipe({x:8,y:400},{x:20,y:600}));assert.ok(!edgeMenuSwipe({x:8,y:400},{x:-80,y:400}));
});
