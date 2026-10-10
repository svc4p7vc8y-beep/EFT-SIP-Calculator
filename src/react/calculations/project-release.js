import { calculateProject } from './estimate-engine.js';
import { calculateProductionCutting, groupPanels, groupMembers } from './production-cutting.js';
import { productionMark } from './production-assembly.js';
import { ENGINEERING_CHECKS, DOCUMENT_AUDIT } from '../data/project-documentation.js';
import { normalizeDocumentation } from '../state/project-documentation.js';
import { gzipSync, gunzipSync, strToU8, strFromU8, zipSync } from 'fflate';

export const canonical = value => JSON.stringify(sort(value));
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])) : value;
const plain = value => JSON.parse(JSON.stringify(value));
export const freezeRelease = value => { if(value && typeof value === 'object' && !Object.isFrozen(value)){Object.values(value).forEach(freezeRelease);Object.freeze(value);} return value; };
export async function releaseDigest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function verifyRelease(release) {
  if(release?.format !== 'eft-document-release' || release.schemaVersion !== 1)return false;
  const {digest,...payload}=release;
  return digest === await releaseDigest(payload);
}
export function archiveRelease(release) {
  const compressed=gzipSync(strToU8(JSON.stringify(release)));
  const data=Array.from(compressed,b=>String.fromCharCode(b)).join('');
  return {format:'eft-document-archive',schemaVersion:1,digest:release.digest,number:release.number,date:release.date,revision:release.report.revision,projectNumber:release.projectNumber,data:btoa(data)};
}
export async function openReleaseArchive(archive) {
  if(!archive || archive.format!=='eft-document-archive' || archive.data.length>20000000)throw new Error('Неверный формат архива выпуска');
  const bytes=Uint8Array.from(atob(archive.data),c=>c.charCodeAt(0));
  if(bytes.length<18 || new DataView(bytes.buffer).getUint32(bytes.length-4,true)>50000000)throw new Error('Архив превышает допустимый размер 50 МБ');
  const release=JSON.parse(strFromU8(gunzipSync(bytes)));
  if(!await verifyRelease(release) || release.digest!==archive.digest)throw new Error('Целостность выпуска нарушена. Печать и экспорт запрещены.');
  if(release.status==='released' && !releaseValidation(release.project,release.calculation,release.report).canRelease)throw new Error('Импортированный статус выпуска не подтверждён проверками комплектности. Выпуск заблокирован.');
  return freezeRelease(release);
}
const cleanUnit = unit => String(unit||'').trim().replace(/\.$/,'').replaceAll('³','3').replaceAll('²','2');
const validRecord = (r,key,revision) => r.key===key && r.revision===revision && r.evidence.trim() && r.reviewer.trim();

export function catalogAudit(project,calculation) {
  const catalogs={material:new Map((project.priceMat||[]).map(c=>[c.id,c])),labor:new Map((project.priceLab||[]).map(c=>[c.id,c]))};
  const weights=new Map();
  for(const row of calculation.sip?.consumables?.rows||[])for(const item of [{size:row.structuralSize,kgEach:row.structuralKgEach},...(row.structuralBreakdown||[])]){
    if(!(item.kgEach>0))continue;const key=String(item.size).replaceAll('x','×');
    weights.set(key,weights.has(key)&&weights.get(key)!==item.kgEach?null:item.kgEach);
  }
  return (calculation.lines||[]).filter(l=>Number(l.qty)>0).map(line=>{
    const entry=catalogs[line.kind]?.get(line.catalogId),issues=[];
    const size=String(entry?.name||'').match(/\d+(?:\.\d+)?[×хx]\d+/)?.[0]?.replace(/[хx]/g,'×');
    const factor=weights.get(size);
    const conversion=entry?.unit==='кг'&&cleanUnit(line.unit)==='шт'&&factor>0?{factor,unit:'кг/шт',source:'Действующая модель: sip.consumables.rows / structuralBreakdown'}:null;
    if(!entry)issues.push('catalogId отсутствует в соответствующем прайсе');
    if(entry && cleanUnit(entry.unit)!==cleanUnit(line.unit) && !conversion)issues.push('Разные единицы; подтверждённый пересчёт не найден');
    if(!Number.isFinite(Number(line.price)) || Number(line.price)<=0)issues.push('Цена отсутствует или нулевая');
    if(line.kind==='material' && ['шт','уп','компл','лист','рулон','баллон'].includes(cleanUnit(line.unit)) && !Number.isInteger(Number(line.qty)))issues.push('Закупаемое количество не округлено вверх');
    return {id:line.id,catalogId:line.catalogId||'',name:line.name,kind:line.kind,unit:line.unit,qty:line.qty,price:line.price,conversion,issues};
  });
}

export function releaseValidation(project,calculation,report) {
  const doc=normalizeDocumentation(project.documentation),blocks=[];
  const add=(code,message,path)=>blocks.push({code,message,path});
  for(const issue of report.issues||[])add(issue.code,issue.message,'Раскрой: замечания / исходные данные');
  for(const s of report.surfaces.filter(s=>s.blocked))add('INCOMPLETE',`${s.name}: раскладка заблокирована`,'Раскрой: '+s.name);
  for(const id of [...report.panelStock.unplaced,...report.timberStock.unplaced])add('UNPLACED',`${id}: не размещён в заготовке`,'Раскрой: карты заготовок / проект стыков');
  for(const row of report.reconciliation||[])if(row.status!=='compared' || Math.abs(row.difference||0)>1e-6){
    if(row.status!=='compared' || row.difference>0 || !doc.resolutions.some(r=>validRecord(r,row.key,report.revision)))add('RECONCILIATION',`${row.name}: ${row.status==='compared'?`расхождение ${row.difference} ${row.unit}`:row.status}`,'Комплект проекта: сверка / Раскрой: закупка');
  }
  for(const row of catalogAudit(project,calculation))for(const issue of row.issues)add('CATALOG',`${row.catalogId||row.id}: ${issue}`,'Прайс-лист / Смета');
  const checks=ENGINEERING_CHECKS.filter(([key])=>!key.startsWith('Н') || key==='Н1'&&report.assembly.binding.length || key==='Н2'&&report.parts.some(p=>p.surfaceId?.includes('-С')) || ['Н3','Н5'].includes(key)&&report.surfaces.some(s=>s.partitionFrame&&(key!=='Н5'||s.bearing)) || key==='Н4'&&(report.assembly.rafters.length||report.roofCover?.slopes?.length));
  for(const [key,name]of checks)if(!doc.confirmations.some(r=>validRecord(r,key,report.revision)))add('ENGINEERING',`${name}: нет подтверждения текущей ревизии с документом-основанием и проверяющим`,'Комплект проекта: проверки конструктора');
  for(const m of report.members.filter(m=>!m.excluded && m.nodeRef))if(!doc.confirmations.some(r=>validRecord(r,m.nodeRef,report.revision)))add('NODE',`${productionMark(m)}: узел ${m.nodeRef} не подтверждён`,'Комплект проекта: проверки конструктора');
  if(report.geometryDiagnostics?.comparison?.status!=='matched')add('GEOMETRY','Модель стен и чертежей не подтверждена как совпадающая','Раскрой: диагностика геометрии');
  for(const check of report.ceilingSupportChecks||[])if(check.status!=='geometry-checked')add('CEILING_SUPPORT',`${check.memberId}: опирание потолочного соединителя — ${check.status}`,'Раскрой: потолок / несущие перегородки');
  // Honest capability gates. A generic reviewer checkbox cannot make absent
  // architectural geometry or a catalog mapping into a working drawing.
  add('AR_AXES','Проектные оси и общая высотная система здания не заданы в текущей модели','Следующий этап: модель АР');
  add('AR_VIEWS','Полные фасады и разрезы здания не сформированы; развёртки стен и профиль крыши не заменяют их','Следующий этап: модель АР');
  add('CATALOG_MAPPING','Сверка производственных семейств с закупкой пока не имеет утверждённых соответствий по catalogId','Следующий этап: привязки производственных материалов к каталогу');
  const seen=new Set(),duplicateIds=new Set();
  for(const item of [...report.parts,...report.members.filter(m=>!m.excluded)]){if(seen.has(item.id))duplicateIds.add(item.id);seen.add(item.id);if(!item.displayMark)add('MARK',`${item.id}: отображаемая марка не назначена`,'Раскрой: реестр марок');}
  for(const id of duplicateIds)add('ID',`${id}: повторный идентификатор детали`,'Раскрой: реестр марок');
  return {canRelease:blocks.length===0,blocks,checks,audit:DOCUMENT_AUDIT};
}

export function productionRegisters(report) {
  const sheets=new Map(),bars=new Map();
  for(const sheet of report.panelStock.sheets)for(const p of sheet.parts)sheets.set(p.id,sheet.id);
  for(const bar of report.timberStock.bars)for(const p of bar.parts)bars.set(p.id,bar.id);
  const panelRows=groupPanels(report.parts).map(g=>({mark:productionMark(g.part),kind:'Панель',material:g.part.family,size:`${g.part.width}×${g.part.height}×${g.part.thickness}`,qty:g.qty,ids:g.instances,stock:g.instances.map(id=>({id,blank:sheets.get(id)||'НЕ РАЗМЕЩЕНА'})),processing:'Контур и вырезы по полигону; выборки/пазы по рабочему узлу'}));
  const timberRows=groupMembers(report.members.filter(m=>!m.excluded)).map(g=>({mark:productionMark(g.member),kind:'Деревянная деталь',material:g.member.material,size:`${g.member.profile} × ${g.member.length}`,qty:g.qty,ids:g.instances.map(m=>m.id),stock:g.instances.flatMap(m=>{const pieces=(report.fabricationMembers||[]).filter(p=>(p.assemblyMemberId||p.id)===m.id);return (pieces.length?pieces:[m]).map(p=>({id:p.id,assemblyId:m.id,blank:bars.get(p.id)||'НЕ РАЗМЕЩЕНА'}));}),processing:g.member.processing||'Обработка по рабочему узлу',nodeRef:g.member.nodeRef||''}));
  const packaging=report.surfaces.map((s,i)=>({id:`УП${i+1}`,name:s.name,surfaceId:s.id,ids:[...report.parts,...report.members.filter(m=>!m.excluded)].filter(p=>p.surfaceId===s.id).map(p=>p.id)})).filter(g=>g.ids.length);
  const placed=new Set(packaging.flatMap(g=>g.ids));const other=[...report.parts,...report.members.filter(m=>!m.excluded)].filter(m=>!placed.has(m.id)).map(m=>m.id);if(other.length)packaging.push({id:`УП${packaging.length+1}`,name:'Обвязка, кровля и проектные элементы',ids:other});
  return {panels:panelRows,timber:timberRows,packaging};
}
export function groupStockMaps(stock,kind) {
  const groups=new Map();
  for(const item of stock){const key=canonical([item.material,item.profile,item.family,item.thickness,item.width,item.height,item.parts.map(p=>kind==='panel'?[p.displayMark,p.x,p.y,p.width,p.height,p.rotated]:[p.displayMark,p.start,p.length])]);
    if(!groups.has(key))groups.set(key,{item,qty:0,ids:[]});const g=groups.get(key);g.qty++;g.ids.push(item.id);}
  return [...groups.values()];
}
export async function sealReleaseManifest(release,manifest) {
  const payload=plain(release);delete payload.digest;
  if(!manifest.length || new Set(manifest.map(p=>p.id)).size!==manifest.length || manifest.some(p=>!p.id||!p.title||!p.scale||!p.units||!p.direction||!p.axes))throw new Error('Неполная или повторная запись листа в перечне');
  payload.manifest=plain(manifest);
  const objects=new Map([...release.report.parts,...release.report.members].map(m=>[m.id,m]));
  for(const row of [...payload.registers.panels,...payload.registers.timber]){
    const names=[...new Set(row.ids.map(id=>release.report.surfaces.find(s=>s.id===objects.get(id)?.surfaceId)?.name).filter(Boolean))];
    const surfaceIds=new Set(row.ids.map(id=>objects.get(id)?.surfaceId).filter(Boolean));
    row.sheetIds=manifest.filter(p=>p.group==='КД'&&(names.some(name=>p.title.includes(name))||p.surfaceIds?.some(id=>surfaceIds.has(id)))).map(p=>p.id);
  }
  payload.digest=await releaseDigest(payload);
  return freezeRelease(payload);
}
export function compareReleases(previous,current) {
  if(!previous)return [{section:'Первый выпуск',before:'—',after:current.report.revision}];
  return ['plan','upperFloors','settings','services','nodes','construction','priceMat','priceLab','meta'].filter(k=>canonical(previous.project[k])!==canonical(current.project[k])).map(section=>({section,before:previous.report.revision,after:current.report.revision}));
}
export async function createProjectRelease(project,{mode='draft',date=new Date().toISOString(),presentation='compact'}={}) {
  const snapshot=plain(project),doc=normalizeDocumentation(snapshot.documentation);
  snapshot.documentation={...doc,releases:[]}; // No recursive archives.
  const calculation=calculateProject(snapshot),report=calculateProductionCutting(snapshot,calculation);
  const validation=releaseValidation(snapshot,calculation,report);
  if(mode==='released' && !validation.canRelease)throw new Error(`Выпуск заблокирован: ${validation.blocks.map(b=>b.message).join('; ')}`);
  const payload=plain({format:'eft-document-release',schemaVersion:1,projectNumber:doc.projectNumber||snapshot.meta.projectNum||'БЕЗ НОМЕРА',date,status:mode==='released'?'released':'draft',project:snapshot,calculation,report,validation,registers:productionRegisters(report),catalog:catalogAudit(snapshot,calculation),number:doc.releases.length+1});
  payload.changes=compareReleases(doc.releases.length?await openReleaseArchive(doc.releases.at(-1)):null,payload);
  payload.presentation={version:2,mode:presentation==='full'?'full':'compact'};
  payload.digest=await releaseDigest(payload);
  return freezeRelease(payload);
}
const csvTable=(head,rows)=>'\uFEFF'+[head,...rows].map(row=>row.map(v=>{let value=String(v??'');if(/^[\s]*[=+@-]/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"';}).join(';')).join('\r\n');
export function registerCsv(release,kind) {
  const rows=[['Проект','Выпуск','SHA256','Ревизия','Марка','Материал','Размеры мм','Количество','Тех. ID','Заготовки','Обработка'],...release.registers[kind].map(r=>[release.projectNumber,release.number,release.digest,release.report.revision,r.mark,r.material,r.size,r.qty,r.ids.join(', '),r.stock.map(s=>`${s.id}:${s.blank}`).join(', '),r.processing])];
  return csvTable(rows[0],rows.slice(1));
}
export function releaseFiles(release) {
  const table=csvTable;
  const common=[release.projectNumber,release.number,release.digest,release.report.revision],headers=['Проект','Выпуск','SHA256','Ревизия'];
  return {
    'release.json':JSON.stringify(release,null,2),
    'source.eft.json':JSON.stringify(release.project,null,2),
    'manifest.json':JSON.stringify({projectNumber:release.projectNumber,number:release.number,digest:release.digest,revision:release.report.revision,sheets:release.manifest||[]},null,2),
    'panels.csv':registerCsv(release,'panels'),'timber.csv':registerCsv(release,'timber'),
    'catalog.csv':table([...headers,'catalogId','Номенклатура','Ед.','Количество','Цена','Проверка'],release.catalog.map(r=>[...common,r.catalogId,r.name,r.unit,r.qty,r.price,r.issues.join('; ')])),
    'reconciliation.csv':table([...headers,'Материал','Ед.','Производство','Смета','Разница','Статус'],release.report.reconciliation.map(r=>[...common,r.name,r.unit,r.required,r.purchased,r.difference,r.status])),
    'packaging.json':JSON.stringify({projectNumber:release.projectNumber,number:release.number,digest:release.digest,revision:release.report.revision,groups:release.registers.packaging},null,2),
  };
}
export const releaseZip = release => zipSync(Object.fromEntries(Object.entries(releaseFiles(release)).map(([name,data])=>[name,strToU8(data)])));
