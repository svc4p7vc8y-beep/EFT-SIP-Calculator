import * as THREE from 'three';
import {createRenderPackage,dataUrlBytes,renderCategory,technicalMaterialId} from './render-package.js';

const finite=value=>Number.isFinite(Number(value))?Number(value):0;
const round=value=>Math.round(finite(value)*1e6)/1e6;
const array=vector=>vector.toArray().map(round);
const modelPoint=point=>[finite(point?.[0])/1000,finite(point?.[2])/1000,finite(point?.[1])/1000].map(round);
const modelDirection=point=>[finite(point?.[0]),finite(point?.[2]),finite(point?.[1])].map(round);
const nodeName=id=>`EFT_${String(id||'element').replace(/[^\p{L}\p{N}_.:-]+/gu,'_').slice(0,110)}`;
const boxRecord=box=>({min:array(box.min),max:array(box.max),size:array(box.getSize(new THREE.Vector3()))});

export function freezeRenderModel(meshes,camera,target){
  const group=new THREE.Group();group.name='EFT_Render_Model';
  const elements=[],surfaces=[],materials=new Map();
  for(const source of meshes.filter(mesh=>mesh.userData.render?.exportable)){
    const meta=source.userData.render,id=String(meta.id||source.userData.id),layer=String(meta.layer||source.userData.layer||'other'),color=String(meta.color||source.userData.color||'#b9c9b3'),materialId=technicalMaterialId(layer,color);
    const material=source.material.clone();material.color.set(color);material.transparent=!!meta.windowGlass;material.opacity=meta.windowGlass?.62:1;material.depthWrite=!meta.windowGlass;material.depthTest=true;material.side=THREE.DoubleSide;material.name=materialId;
    const mesh=new THREE.Mesh(source.geometry.clone(),material);mesh.name=nodeName(id);mesh.matrix.copy(source.matrix);mesh.matrixAutoUpdate=false;mesh.visible=true;mesh.userData={eftId:id,sourceRef:String(meta.sourceRef||id),category:renderCategory(layer),layer,materialId};group.add(mesh);
    elements.push({id,nodeName:mesh.name,category:renderCategory(layer),sourceRef:String(meta.sourceRef||id)});
    if(!materials.has(materialId))materials.set(materialId,{id:materialId,sourceRef:null,type:'technical',color,profile:meta.profile||null,texture:null,uv:null,confirmation:'technical-preview'});
    if(meta.surface){const shape=meta.surface.shape||[];surfaces.push({id:`surface:${id}`,elementId:id,sourceRef:String(meta.sourceRef||id),localBasis:{origin:modelPoint(meta.surface.placement?.origin),u:modelDirection(meta.surface.placement?.u),v:modelDirection(meta.surface.placement?.v),normal:modelDirection(meta.surface.placement?.normal)},outer:!!meta.surface.outer,holes:shape.slice(1).map(ring=>ring.map(([x,y])=>[round(x/1000),round(y/1000)])),assignments:[{materialId,region:null,confirmation:'technical-preview'}]});}
  }
  group.updateMatrixWorld(true);const bbox=new THREE.Box3().setFromObject(group);
  if(!elements.length||bbox.isEmpty()){group.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});throw new Error('В 3D-модели нет экспортируемой геометрии.');}
  return {group,elements,surfaces,materials:[...materials.values()],bbox,camera:{id:'current-view',projection:'perspective',position:array(camera.position),target:array(target),up:array(camera.up),fovDeg:round(camera.fov),aspect:round(camera.aspect),near:round(camera.near),far:round(camera.far),orthographicBounds:null}};
}

const dispose=group=>group.traverse(node=>{node.geometry?.dispose();if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(material=>material.dispose());});
const maxBoxDelta=(a,b)=>Math.max(...a.min.toArray().map((value,index)=>Math.abs(value-b.min.toArray()[index])),...a.max.toArray().map((value,index)=>Math.abs(value-b.max.toArray()[index])));

export async function exportThreeRenderPackage({project,meshes,camera,target,previewDataUrl,missingGeometry=[]}){
  const frozen=freezeRenderModel(meshes,camera,target);
  try{
    const [{GLTFExporter},{GLTFLoader}]=await Promise.all([import('three/addons/exporters/GLTFExporter.js'),import('three/addons/loaders/GLTFLoader.js')]);
    const exported=await new GLTFExporter().parseAsync(frozen.group,{binary:true,onlyVisible:false,trs:false});
    const modelBytes=new Uint8Array(exported),loaded=await new GLTFLoader().parseAsync(exported,'');loaded.scene.updateMatrixWorld(true);
    const loadedBox=new THREE.Box3().setFromObject(loaded.scene),loadedIds=[];loaded.scene.traverse(node=>{if(node.userData?.eftId)loadedIds.push(node.userData.eftId);});
    const expectedIds=frozen.elements.map(item=>item.id).sort(),actualIds=loadedIds.sort(),boundsDelta=maxBoxDelta(frozen.bbox,loadedBox);
    if(boundsDelta>.001)throw new Error(`Проверка GLB не пройдена: отклонение габарита ${Math.round(boundsDelta*1000)} мм.`);
    if(expectedIds.length!==actualIds.length||expectedIds.some((id,index)=>id!==actualIds[index]))throw new Error('Проверка GLB не пройдена: потеряны идентификаторы элементов.');
    loaded.scene.traverse(node=>{node.geometry?.dispose();if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(material=>material.dispose());});
    const unresolved=[{code:'TECHNICAL_MATERIALS_ONLY',sourceRef:'production-scene',message:'В GLB применены нейтральные технические материалы 3D-вида; они не подтверждают отделку.'}];
    if(frozen.elements.some(item=>item.category==='wall'))unresolved.push({code:'FACADE_MAPPING_MISSING',sourceRef:'settings.external',message:'Смета отделки не задаёт пространственное расположение материалов на фасадах.'});
    return await createRenderPackage({project,modelBytes,previewBytes:dataUrlBytes(previewDataUrl),elements:frozen.elements,materials:frozen.materials,surfaces:frozen.surfaces,camera:frozen.camera,bboxMeters:boxRecord(frozen.bbox),missingGeometry,unresolved,diagnostics:{geometryRoundTripChecked:true,boundsToleranceMeters:.001,semanticIdsChecked:true,orientationMappingChecked:true}});
  }finally{dispose(frozen.group);}
}
