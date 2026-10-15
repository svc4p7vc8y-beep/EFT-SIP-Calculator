import {productionScene} from './production-scene.js';
import {productionLevels} from './production-levels.js';
import {normalizeBuildingDocumentation} from '../state/building-documentation.js';
import {panelMesh,beamMesh} from './building-mesh.js';
export const BUILDING_RULES_VERSION=1;
export const BUILDING_AUDIT=[
 ['Контуры этажей','plan / upperFloors → assembly.floors','floor','Планы, фасады, разрезы','Геометрические размеры; не новая сметная формула','building-documentation.test.js'],
 ['Стены / фронтоны','report.surfaces → scene.placements','surface','АР / КД / 3D','parts → panelStock → registers.panels','scene-consistency-v220.test.js'],
 ['Перегородки / укосины','report.members / boardFootprint','timber','Планы, развёртки, разрезы','timberStock → registers.timber','partition-drawing.test.js'],
 ['Пол / потолок / проёмы','report.surfaces.geometry / parts.shape','panel','Планы, сечения, раскрой','parts → panelStock','building-documentation.test.js'],
 ['Кровля / площадки','assembly.roofModel / scene.platforms','facet','План, фасады, разрезы, скаты','roofCover / fabricationMembers','roof-project-v218.test.js'],
 ['Опоры / обвязка','assembly.piles / binding / supports','support','План, 3D, разрез при заданных размерах','foundation → calculation.lines','building-documentation.test.js'],
 ['Оси / отметки / разрезы','documentation.building','annotation','Все АР-листы','Не создаёт закупаемый материал','building-documentation.test.js'],
 ['Материалы / каталог','purchaseRows → building.catalogMappings','mapping','КМ / реестр расхождений','calculation.lines по catalogId','building-documentation.test.js'],
 ['Подтверждения / выпуск','documentation.confirmations / releases','release','ОБ / ВП / снимок','project-release SHA-256 / ZIP','project-release.test.js'],
];
export function buildingModel(project,report){
 const settings=normalizeBuildingDocumentation(project.documentation?.building),scene=productionScene(report,project),levels=productionLevels(project,report.assembly.floors.length);
 const objects=[],issues=[],lookup=new Map([...report.parts,...report.members].map(m=>[m.id,m]));
 const push=(item,faces,preview=false)=>{
  const source=lookup.get(item.sourceId||item.id),surface=report.surfaces.find(s=>s.id===item.surfaceId||s.id===source?.surfaceId);
  const id=`${item.timber?'timber':'panel'}:${item.id}`;
  objects.push({id,sourceId:item.id,hostId:item.surfaceId||source?.surfaceId||'',floor:surface?.floor||null,layer:item.layer,mark:source?.displayMark||item.id,revision:report.revision,status:preview?'blocked':item.referenceOnly?'reference':'draft',faces,origin:item.preview?'diagnostic':source?.source==='Ручная деталь'?'manual':'auto',material:source?.family||source?.material||'',referenceOnly:!!item.referenceOnly});
 };
 for(const item of [...scene.panels,...scene.previews])push(item,panelMesh(item),item.preview);
 for(const item of scene.panels.filter(p=>p.referenceOnly&&p.layer==='platformRoof'))issues.push({code:'BUILDING_REFERENCE',message:`${item.id}: кровля площадки показана справочно; реальные слои/толщины и рабочий узел не назначены`,path:'Терраса / Кровля: проектная конструкция'});
 const foundation=scene.foundation;
 if(project.services.foundation&&!foundation.length)issues.push({code:'FOUNDATION_GEOMETRY',message:'Основание включено, но расположенные опоры отсутствуют: задайте свайное поле/блоки или явно выберите готовое основание',path:'Сваи: расположение опор'});
 if(foundation.some(p=>!p.known))issues.push({code:'FOUNDATION_GEOMETRY',message:'Опоры основания показаны осями: задайте сечение/диаметр и отметки верха и низа для рабочего фасада/разреза',path:'Документация: размеры опор основания'});
 const beamInstances=new Map();
 for(const item of scene.beams){const i=beamInstances.get(item.id)||0;beamInstances.set(item.id,i+1);push({...item,id:`${item.id}:${i}`,sourceId:item.id,timber:true},beamMesh(item));const object=objects.at(-1);object.sourceId=item.id;object.mark=lookup.get(item.id)?.displayMark||item.id;object.hostId=lookup.get(item.id)?.surfaceId||'';}
 for(const object of objects){if(!object.faces.length||object.faces.flat(2).some(p=>p.length!==3||p.some(v=>!Number.isFinite(v))))issues.push({code:'BUILDING_GEOMETRY',message:`${object.sourceId}: неизвестная или неверная XYZ-геометрия`,path:'Раскрой: исходные данные'});}
 for(const id of scene.missing)issues.push({code:'BUILDING_PLACEMENT',message:`${id}: отсутствует пространственная привязка`,path:'Раскрой: конструкция / привязка'});
 const seen=new Set();for(const o of objects){if(seen.has(o.id))issues.push({code:'BUILDING_ID',message:`${o.id}: повторный ID`,path:'Раскрой: реестр марок'});seen.add(o.id);}
 const bounds=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];
 for(const o of objects)for(const face of o.faces)for(const ring of face)for(const p of ring)for(let i=0;i<3;i++){bounds[i][0]=Math.min(bounds[i][0],p[i]);bounds[i][1]=Math.max(bounds[i][1],p[i]);}
 if(!objects.length)bounds.forEach(b=>{b[0]=0;b[1]=1;});
 const floorLevels=levels.bases.map((elevationMm,i)=>({floor:i+1,name:settings.floorLevels.find(r=>r.floor===i+1)?.name||`Пол ${i+1} этажа`,elevationMm,relativeMm:settings.datum.elevationMm===''?null:elevationMm-settings.datum.elevationMm}));
 const openingGeometry=[];
 for(const s of report.surfaces.filter(s=>s.planStart))for(const o of s.openings||[]){const p=scene.placements.get(s.id);if(!p||o.gap||!Number.isFinite(Number(o.sill)))continue;const world=(x,y)=>scene.world(p,x,y);openingGeometry.push({id:o.key,hostId:s.id,floor:s.floor,exterior:!!s.exterior,mark:`${s.floor}${o.type==='window'?'О':'Д'}${o.name.match(/\d+$/)?.[0]||''}`,name:o.name,width:o.width,height:o.height,sill:Number(o.sill),normal:p.normal,points:[[o.x,Number(o.sill)],[o.x+o.width,Number(o.sill)],[o.x+o.width,Number(o.sill)+o.height],[o.x,Number(o.sill)+o.height]].map(q=>world(...q))});}
 return {version:BUILDING_RULES_VERSION,revision:report.revision,settings,objects,issues,bounds,floorLevels,roofBase:scene.roofBase,roofShape:report.assembly.roofShape,foundation,piles:report.assembly.piles,rooms:levels.plans.flatMap((p,i)=>(p.rooms||[]).filter(r=>r.include!==false).map(r=>({...r,floor:i+1}))),openingGeometry,openingRegister:report.openings,audit:BUILDING_AUDIT};
}
export function buildingDataChecks(model){
 const s=model.settings,issues=[...model.issues],add=(code,message)=>issues.push({code,message,path:'Документация: оси, отметки и общие виды'});
 const finite=v=>v!==''&&Number.isFinite(v);
 if(!finite(s.toleranceMm)||s.toleranceMm<=0||s.toleranceMm>10)add('AR_AXES','Задайте геометрическую точность сравнения 0–10 мм; это не строительный допуск');
 if(!finite(s.planCutHeightMm)||s.planCutHeightMm<=0)add('AR_VIEWS','Задайте положительную высоту горизонтального сечения плана от пола этажа');
 const annotations=new Set();for(const a of s.annotations){const key=a.viewId+':'+a.id;if(!a.viewId||!a.id||![a.x,a.y].every(finite)||annotations.has(key))add('AR_LAYOUT',`Подпись ${a.id}: неверное или повторное смещение оформления`);annotations.add(key);}
 if(!s.datum.confirmed||!s.datum.name||!finite(s.datum.elevationMm))add('AR_AXES','Назначьте и подтвердите базовый уровень ±0.000');
 const ids=new Set(),names=new Set();for(const a of s.axes){if(!a.id||!a.name||!['x','y'].includes(a.direction)||!finite(a.coordinateMm)||ids.has(a.id)||names.has(a.name))add('AR_AXES',`Ось ${a.name||a.id}: неверная координата, направление или повторное обозначение`);ids.add(a.id);names.add(a.name);}
 for(const direction of ['x','y'])if(new Set(s.axes.filter(a=>a.direction===direction&&finite(a.coordinateMm)).map(a=>a.coordinateMm)).size<2)add('AR_AXES',`Нужны минимум две различные оси ${direction.toUpperCase()}`);
 for(const level of model.floorLevels){const saved=s.floorLevels.filter(l=>l.floor===level.floor);if(saved.length!==1||!finite(saved[0]?.elevationMm)||Math.abs(saved[0].elevationMm-level.elevationMm)>s.toleranceMm)add('AR_AXES',`Пол ${level.floor} этажа: подтвердите отметку ${level.elevationMm} мм; конфликт не меняет геометрию`);}
 for(const section of s.sections)if(!section.id||!section.name||!section.confirmed||section.a.length!==2||section.b.length!==2||[...section.a,...section.b,section.depthMm].some(v=>!finite(v))||Math.hypot(...section.a.map((v,i)=>v-section.b[i]))<1||section.depthMm<0)add('AR_VIEWS',`Разрез ${section.name||section.id}: задайте линию, направление, глубину и подтвердите положение`);
 const sectionIds=new Set(),sectionNames=new Set();for(const section of s.sections){if(sectionIds.has(section.id)||sectionNames.has(section.name))add('AR_VIEWS',`Разрез ${section.name}: повторное обозначение или ID`);sectionIds.add(section.id);sectionNames.add(section.name);}
 const confirmed=s.sections.filter(r=>r.confirmed&&r.a.length===2&&r.b.length===2),vectors=confirmed.map(r=>r.a.map((v,i)=>r.b[i]-v));
 if(!vectors.some((a,i)=>vectors.slice(i+1).some(b=>Math.abs(a[0]*b[1]-a[1]*b[0])/(Math.hypot(...a)*Math.hypot(...b))>.5)))add('AR_VIEWS','Назначьте продольный и поперечный разрезы (не параллельные линии)');
 return issues;
}
