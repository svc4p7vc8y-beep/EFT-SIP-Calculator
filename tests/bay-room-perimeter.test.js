import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionRuns, roomWallSegments, houseInnerCorners } from '../src/react/planner/geometry.js';
import { calculatePlanMetrics } from '../src/calculations/plan-metrics.js';
import { partitionSegments } from '../src/react/calculations/partition-construction.js';

const perimeter=[{x:0,y:1.5},{x:6,y:1.5},{x:6,y:0},{x:11,y:0},{x:11,y:1.5},{x:17,y:1.5},{x:17,y:9.5},{x:11,y:9.5},{x:11,y:11},{x:6,y:11},{x:6,y:9.5},{x:0,y:9.5}];
const fixture=()=>({house:{w:17,h:11,points:structuredClone(perimeter)},wallThickness:.174,partitionThickness:.1,rooms:[{id:'bay',name:'Эркер',include:true,points:[{x:6.174,y:.174},{x:10.826,y:.174},{x:10.826,y:3.274},{x:6.174,y:3.274}]}],walls:[]});
const length=runs=>runs.reduce((s,[a,b])=>s+Math.hypot(b.x-a.x,b.y-a.y),0);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.003,`${actual} != ${expected}`);

test('bay room keeps only the interior part of each side, without changing saved points',()=>{
  for(const reverse of [false,true]) {
    const plan=fixture();if(reverse)plan.house.points.reverse();
    const saved=JSON.stringify(plan);
    const segments=roomWallSegments(plan),runs=partitionRuns(plan,true);
    assert.equal(segments.length,3);near(length(runs),7.852);
    for(const segment of segments.filter(s=>s.axis==='v')) {near(segment.start,1.674);near(segment.end,3.274);}
    assert.equal(JSON.stringify(plan),saved);
    near(calculatePlanMetrics(plan).partitionLength,7.852);
    near(length(partitionSegments(plan)),7.852);
    plan.partitionJunctions='butt';
    near(length(partitionRuns(plan)),7.752);
    near(calculatePlanMetrics(plan).partitionLength,7.752);
    near(length(partitionSegments(plan)),7.752);
  }
});

test('same exclusion works for explicit wall layout and at both bays of a cross contour',()=>{
  const plan=fixture();plan.rooms=[];plan.layoutMode='walls';
  plan.walls=[{id:'wall',x1:6.174,y1:.174,x2:6.174,y2:10.826}];
  const runs=partitionRuns(plan,true);assert.equal(runs.length,1);
  near(runs[0][0].y,1.674);near(runs[0][1].y,9.326);near(length(runs),7.652);
});

test('entirely exterior bay room edges do not produce any duplicate partitions',()=>{
  const plan=fixture();
  plan.rooms[0].points=[{x:6.174,y:.174},{x:10.826,y:.174},{x:10.826,y:1.674},{x:6.174,y:1.674}];
  const segments=roomWallSegments(plan);
  assert.equal(segments.length,1);assert.equal(segments[0].axis,'h');near(segments[0].fixed,1.674);
});

test('perpendicular legacy partition endpoints are retained, and diagonal bay faces can be split',()=>{
  const legacy={house:{w:8,h:6},wallThickness:.174,rooms:[{id:'a',points:[{x:0,y:0},{x:4,y:0},{x:4,y:6},{x:0,y:6}]}],walls:[]};
  near(length(partitionRuns(legacy,true)),6);
  const plan=fixture(),angle=Math.PI/6;
  const rotate=p=>({x:Math.round((p.x*Math.cos(angle)-p.y*Math.sin(angle))*1000)/1000,y:Math.round((p.x*Math.sin(angle)+p.y*Math.cos(angle))*1000)/1000});
  plan.house.points=plan.house.points.map(rotate);plan.rooms[0].points=plan.rooms[0].points.map(rotate);
  assert.equal(houseInnerCorners(plan).length,perimeter.length);
  near(length(partitionRuns(plan,true)),7.852);
});
