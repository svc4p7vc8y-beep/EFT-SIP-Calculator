import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {calculateProject} from '../src/react/calculations/estimate-engine.js';
import {calculateProductionCutting} from '../src/react/calculations/production-cutting.js';
import {productionScene} from '../src/react/calculations/production-scene.js';
import {beamFrame} from '../src/react/calculations/beam-frame.js';
import {bakeBeamWorldGeometry} from '../src/react/calculations/beam-world-geometry.js';
import {planPointToThree,planDirectionToThree} from '../src/react/calculations/plan-3d-orientation.js';
test('slightly skewed L contour keeps rafter and Float32 render coordinates inside the roof extent',()=>{
 const p=createDefaultProject();p.plan.house={w:10.024,h:5.676,points:[[0,0],[10.024,0],[10.024,5.676],[6.224,5.676],[6.2,3.8],[0,3.8]].map(([x,y])=>({x,y}))};p.plan.rooms=[];p.plan.openings=[];p.plan.platforms=[];
 Object.assign(p.settings.roof,{shape:'gable',type:'cold',ridgeAxis:'x',rafterSystem:'hanging',rafterStep:.65,ridgeHeight:1.8,eaveOverhang:.5,gableOverhang:.3});
 const before=JSON.stringify(p.plan),c=calculateProject(p),r=calculateProductionCutting(p,c),rafters=productionScene(r,p).beams.filter(b=>b.layer==='rafters');assert.ok(rafters.length>10);
 for(const item of rafters){
  const frame=beamFrame(item.a,item.b,item.normal),[width,depth]=item.profile.split(/[×xх]/).map(Number),geometry=new THREE.BoxGeometry(width/1000,frame.length/1000,depth/1000);
  const dir=p=>new THREE.Vector3(...planDirectionToThree(p)),matrix=new THREE.Matrix4().makeBasis(dir(frame.across),dir(frame.along),dir(frame.depth));matrix.setPosition(new THREE.Vector3(...planPointToThree(item.a.map((v,i)=>(v+item.b[i])/2))));
  const expected=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,0).applyMatrix4(matrix);
  assert.equal(bakeBeamWorldGeometry(geometry,matrix),true);assert.ok(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,0).distanceTo(expected)<.00001);
  assert.ok(frame.length<12000);assert.ok([...geometry.attributes.position.array].every(v=>Number.isFinite(v)&&Math.abs(v)<15));geometry.dispose();
 }
 assert.equal(JSON.stringify(p.plan),before);assert.deepEqual(calculateProject(p).totals,c.totals);
});
