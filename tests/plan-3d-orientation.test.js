import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {planPointToThree,planDirectionToThree} from '../src/react/calculations/plan-3d-orientation.js';

test('overhead 3D keeps plan right on screen right and plan bottom on screen bottom',()=>{
  const camera=new THREE.PerspectiveCamera(45,1,.1,100);
  camera.position.set(0,10,0);
  camera.up.set(0,0,-1);
  camera.lookAt(0,0,0);
  camera.updateMatrixWorld();
  const projected=point=>new THREE.Vector3(...planPointToThree(point)).project(camera);
  const origin=projected([0,0,0]);
  assert.ok(projected([1000,0,0]).x>origin.x);
  assert.ok(projected([0,1000,0]).y<origin.y);
  assert.deepEqual(planDirectionToThree([0,1,0]),[0,0,1]);
  assert.deepEqual(planPointToThree([2000,3000,2500]),[2,2.5,3]);
});
