import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSnapAxes, houseInnerCorners, partitionRuns, planIssues, rectanglePoints, resizePlatformCorner, snapPointDetails } from '../src/react/planner/geometry.js';

const contourPlan = points => ({ house: { w: 11.3, h: 6.2, points }, wallThickness: .174, rooms: [], walls: [], platforms: [], openings: [], wallGaps: [] });
const tee = [{x:0,y:0},{x:11.3,y:0},{x:11.3,y:3.7},{x:8.3,y:3.7},{x:8.3,y:6.2},{x:2.7,y:6.2},{x:2.7,y:3.7},{x:0,y:3.7}];
const ell = [{x:0,y:0},{x:4,y:0},{x:4,y:3},{x:8,y:3},{x:8,y:6},{x:0,y:6}];

test('L/T contours snap to real inner corners in either winding and every wall thickness', () => {
  for (const contour of [tee, ell]) for (const points of [contour, [...contour].reverse()]) for (const wall of [.124,.174,.224]) {
    const plan = {...contourPlan(points), wallThickness:wall};
    const corners = houseInnerCorners(plan);
    assert.equal(corners.length, points.length);
    for (const corner of corners) {
      const actual = snapPointDetails({x:corner.x+.015,y:corner.y-.012},collectSnapAxes(plan),{tolerance:.04,pointTolerance:.05});
      assert.deepEqual(actual.point,corner);
      assert.equal(actual.snap.kind,'node');
    }
    assert.ok(!collectSnapAxes(plan).points.some(p=>p.x===11.3-wall && p.y===6.2-wall) || contour === tee, 'No fictional bounding-box corner');
  }
});

test('T inner corner does not create a duplicate exterior-wall partition', () => {
  const plan=contourPlan(tee);
  plan.rooms=[{id:'r',name:'Комната',points:rectanglePoints({x:.174,y:.174},{x:2.874,y:3.526})}];
  const runs=partitionRuns(plan);
  assert.equal(runs.length,1);
  assert.ok(Math.abs(Math.hypot(runs[0][1].x-runs[0][0].x,runs[0][1].y-runs[0][0].y)-3.352)<.001);
  assert.ok(!planIssues(plan).some(i=>i.type==='junction-gap'));
});

test('all pairs of overlapping windows, doors and wall gaps are diagnosed and identified', () => {
  const plan=contourPlan(tee);
  plan.openings=[{id:'a',type:'window',x:2,y:0,width:1.2,orientation:'h'},{id:'b',type:'window',x:2.3,y:0,width:1.2,orientation:'h'},{id:'c',type:'door',x:2.5,y:0,width:.9,orientation:'h'}];
  plan.wallGaps=[{id:'g',x:2,y:0,width:1,orientation:'h',outer:true}];
  const conflicts=planIssues(plan).filter(i=>i.type==='opening-overlap');
  assert.equal(conflicts.length,6);
  assert.ok(conflicts.some(i=>i.selections.some(s=>s.type==='gap'&&s.id==='g')));
  assert.match(conflicts[0].message,/Окно и окно/);
  plan.openings[1].x=5; plan.openings[2].include=false; plan.wallGaps[0].include=false;
  assert.equal(planIssues(plan).filter(i=>i.type==='opening-overlap').length,0);
});

test('touching edges, parallel separate walls and perpendicular walls are not overlaps', () => {
  const plan=contourPlan(tee);
  plan.openings=[{id:'a',type:'window',x:2,y:0,width:1,orientation:'h'},{id:'b',type:'window',x:3,y:0,width:1,orientation:'h'},{id:'c',type:'window',x:2,y:.174,width:1,orientation:'h'},{id:'d',type:'window',x:2,y:0,width:1,orientation:'v'}];
  assert.equal(planIssues(plan).filter(i=>i.type==='opening-overlap').length,0);
  plan.openings=[{id:'a',type:'window',x:0,y:2,width:1,orientation:'v'},{id:'b',type:'window',x:0,y:2.2,width:1,orientation:'v'}];
  assert.equal(planIssues(plan).filter(i=>i.type==='opening-overlap').length,1);
});

test('terrace/porch resize keeps opposite corner, settings and minimum size, snapping to house', () => {
  for(const kind of ['terrace','porch']) for(let index=0;index<4;index++) {
    const platform={id:'p',kind,x:-2,y:1,w:2,h:3,steps:3,roof:{mode:'cold'}};
    const plan=contourPlan(tee); plan.platforms=[platform];
    const axes=collectSnapAxes(plan,null,'p');
    assert.ok(!axes.points.some(p=>p.x===-2&&p.y===1));
    const left=index===0||index===3,top=index<2;
    const next=resizePlatformCorner(platform,index,{x:left?-3:1,y:top?0:5},axes);
    assert.equal(left?next.x+next.w:next.x,left?platform.x+platform.w:platform.x);
    assert.equal(top?next.y+next.h:next.y,top?platform.y+platform.h:platform.y);
    assert.deepEqual(next.roof,platform.roof); assert.equal(next.steps,3);
    const minimum=resizePlatformCorner(platform,index,{x:left?100:-100,y:top?100:-100},axes);
    assert.equal(minimum.w,.5); assert.equal(minimum.h,.5);
    assert.equal(platform.w,2,'original platform is preserved for undo');
  }
});
