import test from 'node:test';
import assert from 'node:assert/strict';
import {strFromU8,unzipSync} from 'fflate';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {createRenderPackage,renderCategory,renderPackageFilename,sha256Hex,validateRenderManifest} from '../src/react/export/render-package.js';
import {freezeRenderModel} from '../src/react/export/render-package-three.js';
import * as THREE from 'three';

const packageInput=()=>{
 const project=createDefaultProject();Object.assign(project.meta,{projectName:'Гараж 8×12',projectNum:'0042',customer:'Иван',phone:'+70000000000',address:'Скрытый адрес'});project.legacyUnknown={keep:true};
 return {project,modelBytes:new Uint8Array([1,2,3,4]),previewBytes:new Uint8Array([137,80,78,71]),elements:[{id:'wall:1',nodeName:'EFT_wall:1',category:'wall',sourceRef:'Э1-С1'}],materials:[{id:'technical:walls:c3d8b6',sourceRef:null,type:'technical',color:'#c3d8b6',profile:null,texture:null,uv:null,confirmation:'technical-preview'}],surfaces:[{id:'surface:wall:1',elementId:'wall:1',sourceRef:'Э1-С1',localBasis:{origin:[0,0,0],u:[1,0,0],v:[0,1,0],normal:[0,0,1]},outer:true,holes:[],assignments:[{materialId:'technical:walls:c3d8b6',region:null,confirmation:'technical-preview'}]}],camera:{id:'current-view',projection:'perspective',position:[1,2,3],target:[0,0,0],up:[0,1,0],fovDeg:42,aspect:1.5,near:.01,far:100,orthographicBounds:null},bboxMeters:{min:[0,0,0],max:[8,4,12],size:[8,4,12]},missingGeometry:['apron'],unresolved:[{code:'FACADE_MAPPING_MISSING',sourceRef:'settings.external',message:'Нет пространственной разметки.'}],diagnostics:{geometryRoundTripChecked:true},exportedAt:'2026-11-03T12:00:00.000Z'};
};

test('render package contains importable project, GLB, preview and privacy-safe hashed manifest',async()=>{
 const input=packageInput(),before=structuredClone(input.project),{file}=await createRenderPackage(input),files=unzipSync(new Uint8Array(await file.arrayBuffer()));
 assert.deepEqual(Object.keys(files).sort(),['model.glb','preview.png','project.eft.json','render.json']);
 const project=JSON.parse(strFromU8(files['project.eft.json'])),manifest=JSON.parse(strFromU8(files['render.json']));
 assert.equal(project.meta.phone,'+70000000000');assert.equal(project.legacyUnknown.keep,true);assert.deepEqual(input.project,before);
 assert.equal(manifest.source.projectNumber,'0042');assert.equal(JSON.stringify(manifest).includes('Скрытый адрес'),false);assert.equal(JSON.stringify(manifest).includes('+70000000000'),false);
 assert.equal(manifest.files.find(row=>row.path==='model.glb').sha256,await sha256Hex(files['model.glb']));assert.equal(manifest.diagnostics.geometryRoundTripChecked,true);
 assert.match(file.name,/^EFT_Гараж_8×12_render_20261103T120000Z\.zip$/);
});

test('render contract keeps stable categories and rejects unsafe paths or broken references',()=>{
 assert.equal(renderCategory('parapet'),'parapet');assert.equal(renderCategory('windows'),'glazing');assert.equal(renderCategory('unknown'),'other');assert.match(renderPackageFilename({projectName:'A/B'},new Date('2026-11-03T12:00:00Z')),/^EFT_A_B_render_/);
 const base={files:[{path:'../model.glb'}],materials:[],geometry:{elements:[]},surfaces:[]};assert.throws(()=>validateRenderManifest(base),/Недопустимый путь/);
 assert.throws(()=>validateRenderManifest({files:[],materials:[],geometry:{elements:[]},surfaces:[{id:'s',elementId:'missing',assignments:[]}]}),/не связана/);
  assert.throws(()=>validateRenderManifest({files:[],materials:[],geometry:{elements:[],bbox:{min:[0,NaN,0]}},surfaces:[]}),/NaN или Infinity/);
});

test('empty or auxiliary-only 3D scenes cannot be presented as a complete package',()=>{
 const camera=new THREE.PerspectiveCamera(42,1,.01,100),marker=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshBasicMaterial());marker.userData.render={exportable:false};
 assert.throws(()=>freezeRenderModel([marker],camera,new THREE.Vector3()),/нет экспортируемой геометрии/);marker.geometry.dispose();marker.material.dispose();
});
