import test from 'node:test';
import assert from 'node:assert/strict';
import {structuralDimensions,checkDiagonals} from '../src/react/calculations/drawing-dimensions.js';

const assembly=()=>({axis:'x',floors:[{contour:[[-75,-75],[10075,-75],[10075,4075],[-75,4075]]}],
  housePileAxes:[[0,0],[5000,0],[10000,0],[0,4000],[5000,4000],[10000,4000]],
  piles:[[0,0],[5000,0],[10000,0],[0,4000],[5000,4000],[10000,4000],[12000,2000]],
  binding:[],rafters:[]});

test('binding print chains use actual pile centres, overall excludes terrace and outside board faces',()=>{
  const a=assembly(),saved=JSON.stringify(a),d=structuralDimensions(a,true);
  assert.deepEqual(d.reference,{x:0,y:0,width:10000,height:4000});
  assert.deepEqual(d.house,{x:-75,y:-75,width:10150,height:4150});
  assert.deepEqual(d.x,[0,5000,10000,12000]);assert.deepEqual(d.y,[0,2000,4000]);
  assert.equal(JSON.stringify(a),saved);
});
test('both control diagonals connect actual house pile centres, not outside panel corners or terrace',()=>{
  const a=assembly(),ds=checkDiagonals(a,true);assert.equal(ds.length,2);
  for(const d of ds){assert.ok(a.housePileAxes.includes(d.a));assert.ok(a.housePileAxes.includes(d.b));assert.equal(d.length,Math.hypot(10000,4000));}
  assert.notDeepEqual(ds[0].a,ds[1].a);
});
test('older assemblies without house pile provenance retain pile-centre dimensions and safe empty fallback',()=>{
  const a=assembly();delete a.housePileAxes;a.piles=a.piles.slice(0,6);
  assert.equal(structuralDimensions(a,true).reference.width,10000);assert.equal(checkDiagonals(a,true).length,2);
  a.piles=[];assert.deepEqual(structuralDimensions(a,true).reference,structuralDimensions(a,true).house);
  assert.deepEqual(structuralDimensions(a,true).x,[-75,10075]);assert.deepEqual(checkDiagonals(a,true),[]);
});
