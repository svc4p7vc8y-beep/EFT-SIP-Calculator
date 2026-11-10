import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSnapAxes, planSnapTolerances, rectanglePoints, snapPointDetails } from '../src/react/planner/geometry.js';

const base = () => ({ house: { w: 10, h: 8 }, wallThickness: .174, partitionThickness: .1, rooms: [], walls: [] });

test('visible outer partition corners snap to the shared wall axis without shifting saved rooms', () => {
  for (const thickness of [.1, .124, .174, .224]) {
    const plan = base(); plan.partitionThickness = thickness;
    plan.rooms = [{ id: 'existing', points: rectanglePoints({x:3,y:2}, {x:7,y:6}) }];
    const before = JSON.stringify(plan);
    const axes = collectSnapAxes(plan, null, null, { partitionFaces: true });
    const half = thickness / 2;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const face = {x:3+sx*half,y:2+sy*half};
      const snapped = snapPointDetails(face, axes, {tolerance:.015,pointTolerance:.02});
      assert.deepEqual(snapped.point, {x:3,y:2});
      assert.equal(snapped.snap.wallCorner, true);
      assert.ok(Math.hypot(snapped.snap.displayPoint.x-face.x,snapped.snap.displayPoint.y-face.y)<.001);
    }
    assert.equal(JSON.stringify(plan),before);
    assert.equal(collectSnapAxes(plan).cornerTargets,undefined,'other tools keep their original coordinates');
    assert.equal(collectSnapAxes(plan,'existing',null,{partitionFaces:true}).cornerTargets.length,0,'moving room does not snap to itself');
  }
});

test('wall-mode corners include T-junctions and local frame/SIP wall depths', () => {
  for (const settings of [{partitionThickness:.1,frameProfile:'45×195',half:.0975},{partitionThickness:.174,sipThickness:224,half:.112}]) {
    const plan = {...base(),layoutMode:'walls',partitionThickness:settings.partitionThickness,walls:[
      {id:'a',x1:2,y1:3,x2:8,y2:3,...settings},
      {id:'b',x1:5,y1:3,x2:5,y2:7,...settings},
    ]};
    const axes=collectSnapAxes(plan,null,null,{partitionFaces:true});
    const snapped=snapPointDetails({x:5+settings.half,y:3-settings.half},axes,{tolerance:.01,pointTolerance:.02});
    assert.deepEqual(snapped.point,{x:5,y:3});
    assert.equal(snapped.snap.wallCorner,true);
  }
});

test('node radius remains 16 CSS pixels in split panes and at all zoom levels', () => {
  for (const scale of [10,50,150]) for (const screenScale of [.25,.5,1,1.5]) {
    const options=planSnapTolerances(scale,screenScale);
    assert.ok(Math.abs(options.pointTolerance*scale*screenScale-16)<.000001);
    assert.ok(Math.abs(options.tolerance*scale*screenScale-10)<.000001);
    assert.ok(Math.abs(planSnapTolerances(scale,screenScale,true).pointTolerance*scale*screenScale-24)<.000001);
    const axes={points:[{x:4,y:2}],xs:[],ys:[]};
    assert.equal(snapPointDetails({x:4+15/(scale*screenScale),y:2},axes,options).snap?.kind,'node');
    assert.notEqual(snapPointDetails({x:4+17/(scale*screenScale),y:2},axes,options).snap?.kind,'node');
  }
});
