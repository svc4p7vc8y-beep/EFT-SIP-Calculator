import {strToU8,zipSync} from 'fflate';
import {APP_VERSION} from '../data/app-version.js';
import {REACT_PROJECT_VERSION} from '../state/project-model.js';

const encoder=new TextEncoder();
const mime={
  'model.glb':'model/gltf-binary',
  'project.eft.json':'application/json',
  'preview.png':'image/png',
};

export const renderCategory=layer=>({
  walls:'wall',partitions:'wall',gables:'wall',roof:'roof',roofSurface:'roof',sheetCover:'roof',flatOsb:'roof',flatCsp:'roof',waterproofing:'roof',flashing:'trim',parapet:'parapet',drains:'gutter',rafters:'frame',roofTimbers:'frame',laths:'frame',counterLaths:'frame',supports:'frame',trussTemplates:'frame',foundation:'foundation',binding:'frame',windows:'glazing',floor:'floor',interfloor:'floor',ceiling:'ceiling',platforms:'platform',platformRoof:'roof',existingBuilding:'reference',
}[layer]||'other');

export const safeRenderName=value=>String(value||'Проект').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'Проект';
export const renderPackageFilename=(meta={},date=new Date())=>{
  const stamp=date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  return `EFT_${safeRenderName(meta.projectName||meta.customer||meta.projectNum).replace(/\s/g,'_')}_render_${stamp}.zip`;
};
export const technicalMaterialId=(layer,color)=>`technical:${String(layer||'other').replace(/[^a-zA-Z0-9_-]/g,'_')}:${String(color||'unknown').replace('#','')}`;

export async function sha256Hex(data){
  const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function dataUrlBytes(value,expected='image/png'){
  const match=/^data:([^;,]+);base64,(.*)$/s.exec(String(value||''));
  if(!match||match[1]!==expected)throw new Error(`Предпросмотр должен иметь формат ${expected}.`);
  const binary=atob(match[2]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
}

export function validateRenderManifest(manifest){
  const inspect=(value,path='render')=>{if(typeof value==='number'&&!Number.isFinite(value))throw new Error(`${path} содержит NaN или Infinity.`);if(Array.isArray(value))value.forEach((item,index)=>inspect(item,`${path}[${index}]`));else if(value&&typeof value==='object')Object.entries(value).forEach(([key,item])=>inspect(item,`${path}.${key}`));};inspect(manifest);
  const materialIds=new Set(manifest.materials.map(item=>item.id)),elementIds=new Set(manifest.geometry.elements.map(item=>item.id));
  for(const file of manifest.files)if(!file.path||file.path.startsWith('/')||file.path.includes('..')||file.path.includes('\\'))throw new Error(`Недопустимый путь файла: ${file.path}`);
  for(const surface of manifest.surfaces){if(!elementIds.has(surface.elementId))throw new Error(`Поверхность ${surface.id} не связана с элементом.`);for(const assignment of surface.assignments||[])if(!materialIds.has(assignment.materialId))throw new Error(`Материал ${assignment.materialId} не найден.`);}
  return manifest;
}

const pngSize=bytes=>bytes.length>=24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?{width:(bytes[16]<<24|bytes[17]<<16|bytes[18]<<8|bytes[19])>>>0,height:(bytes[20]<<24|bytes[21]<<16|bytes[22]<<8|bytes[23])>>>0}:null;

export async function createRenderPackage({project,modelBytes,previewBytes,elements,materials,surfaces,camera,bboxMeters,missingGeometry=[],unresolved=[],diagnostics={},exportedAt=new Date().toISOString()}){
  const projectPayload={...structuredClone(project),savedAt:exportedAt,appVersion:REACT_PROJECT_VERSION,schemaVersion:4};
  const projectBytes=encoder.encode(JSON.stringify(projectPayload,null,2)),binaryModel=modelBytes instanceof Uint8Array?modelBytes:new Uint8Array(modelBytes),imageBytes=previewBytes instanceof Uint8Array?previewBytes:new Uint8Array(previewBytes);
  const files=await Promise.all([['model.glb',binaryModel],['project.eft.json',projectBytes],['preview.png',imageBytes]].map(async([path,bytes])=>({path,mediaType:mime[path],sha256:await sha256Hex(bytes),bytes:bytes.length,...(path==='preview.png'&&pngSize(bytes)?pngSize(bytes):{})})));
  const manifest=validateRenderManifest({format:'eft-render-package',schemaVersion:1,source:{appVersion:APP_VERSION,projectSchemaVersion:4,exportedAt,projectNumber:String(project.meta?.projectNum||'')},coordinateSystem:{unit:'m',upAxis:'Y',handedness:'right',planToModel:{formula:'[planX, planY, elevation] mm → [X, Y, Z] m = [planX, elevation, planY] / 1000',matrix:[[.001,0,0,0],[0,0,.001,0],[0,.001,0,0],[0,0,0,1]]}},files,geometry:{bboxMeters,elements,missingGeometry:[...new Set(missingGeometry.filter(Boolean).map(String))]},materials,surfaces,cameras:[camera],unresolved,diagnostics:{counts:{elements:elements.length,surfaces:surfaces.length,materials:materials.length},boundsChecked:true,...diagnostics}});
  const renderBytes=encoder.encode(JSON.stringify(manifest,null,2));
  const zipped=zipSync({'model.glb':binaryModel,'project.eft.json':projectBytes,'render.json':renderBytes,'preview.png':imageBytes},{level:6});
  return {file:new File([zipped],renderPackageFilename(project.meta,new Date(exportedAt)),{type:'application/zip'}),manifest};
}

export async function deliverRenderPackage(file){
  const touch=Number(navigator.maxTouchPoints)>0;
  if(touch&&navigator.share&&navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file],title:file.name});return 'shared';}
    catch(error){if(error?.name==='AbortError')return 'cancelled';throw error;}
  }
  const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return 'downloaded';
}
