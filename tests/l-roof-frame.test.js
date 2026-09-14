import test from 'node:test';
import assert from 'node:assert/strict';
import { lRoofFrame } from '../src/react/planner/l-roof-frame.js';
const shape=[{x:0,y:0},{x:10,y:0},{x:10,y:4},{x:4,y:4},{x:4,y:8},{x:0,y:8}];
const area=poly=>Math.abs(poly.reduce((s,a,i)=>{const b=poly[(i+1)%poly.length];return s+a.x*b.y-a.y*b.x;},0))/2;
for(const kind of ['gable','hip'])for(const sx of [-1,1])for(const sy of [-1,1]){
  test(`${kind} L frame mirror ${sx}/${sy} tiles footprint and has valleys`,()=>{
    const points=shape.map(p=>({x:p.x*sx+20,y:p.y*sy+30}));
    const frame=lRoofFrame(points,kind);
    assert.ok(frame);
    assert.ok(Math.abs(frame.surfaces.reduce((s,p)=>s+area(p),0)-56)<1e-6);
    assert.ok(frame.creases.some(edge=>edge.kind==='valley'));
    assert.ok(frame.creases.some(edge=>edge.kind==='ridge'));
    assert.ok(frame.rafters.length>10);
    assert.deepEqual(lRoofFrame([...points].reverse(),kind),frame);
    for(const pair of frame.rafters)for(const p of pair){
      const x=(p.x-20)*sx,y=(p.y-30)*sy;
      assert.ok(x>=-1e-6&&y>=-1e-6&&x<=10+1e-6&&y<=8+1e-6&&(x<=4+1e-6||y<=4+1e-6));
    }
  });
}
test('unequal wings cover exact area; flat/rectangle use existing renderer',()=>{
  const unequal=shape.map(p=>({...p,y:p.y===4?3:p.y}));
  const frame=lRoofFrame(unequal);
  assert.ok(Math.abs(frame.surfaces.reduce((s,p)=>s+area(p),0)-area(unequal))<1e-6);
  assert.equal(lRoofFrame(shape,'flat'),null);
  assert.equal(lRoofFrame([{x:0,y:0},{x:10,y:0},{x:10,y:8},{x:0,y:8}]),null);
});
