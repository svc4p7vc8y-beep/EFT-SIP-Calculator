import {purchaseRows} from './drawing-workbench.js';
import {normalizeBuildingDocumentation} from '../state/building-documentation.js';
import {timberReconciliationKey} from './cutting-reconciliation.js';
const unit=u=>String(u||'').replaceAll('.','').replaceAll('³','3').replaceAll('²','2').replaceAll(' ','');
export function productionCatalogMapping(project,calculation,report){
 const mappings=normalizeBuildingDocumentation(project.documentation?.building).catalogMappings,rows=purchaseRows(report),catalog=new Map(project.priceMat.map(c=>[c.id,c])),seen=new Map();
 return rows.map(row=>{
  const candidates=mappings.filter(m=>m.key===row.id),mapping=candidates[0],entry=catalog.get(mapping?.catalogId),issues=[];
  if(candidates.length!==1||!entry)issues.push('Назначьте одно соответствие catalogId действующего материала');
  if(mapping&&(!mapping.evidence.trim()||!mapping.reviewer.trim()))issues.push('Нужны документ-основание и проверяющий соответствия');
  const factor=mapping?.factor!==''&&mapping?.factor!=null?mapping.factor:unit(entry?.unit)===unit(row.unit)?1:mapping?.factor;
  if(!(factor!==''&&Number.isFinite(factor)&&factor>0))issues.push(`Укажите подтверждённый пересчёт ${row.unit} → ${entry?.unit||'единица каталога'}`);
  const rawRequired=issues.length?null:row.qty*factor;
  const required=rawRequired==null?null:['шт','лист','компл','комплект','уп','упак','рул'].includes(unit(entry?.unit))?Math.ceil(rawRequired-1e-9):rawRequired;
  if(entry){const keys=seen.get(entry.id)||[];keys.push(row.id);seen.set(entry.id,keys);}
  const purchased=entry?calculation.lines.filter(l=>l.kind==='material'&&l.catalogId===entry.id&&unit(l.unit)===unit(entry.unit)).reduce((n,l)=>n+Number(l.qty||0),0):null;
  const panel=report.panelStock.sheets.find(s=>`${s.family}:${s.thickness}:${s.width}:${s.height}`===row.id);
  const reconciliationKey=panel?`panel:${panel.family}:${panel.thickness}`:row.id.startsWith('cover:')?null:timberReconciliationKey(row.name,row.profile);
  return {...row,reconciliationKey,catalogId:entry?.id||'',catalogName:entry?.name||'',targetUnit:entry?.unit||'',factor,required,purchased,issues};
 }).map(row=>({...row,sharedKeys:seen.get(row.catalogId)||[],difference:row.required==null?null:row.required-row.purchased}));
}
// Sum demands sharing a catalogId before comparison: no purchase can satisfy
// each manufacturing family independently using the same stock twice.
export function catalogMappingChecks(rows){
 const issues=[],grouped=new Map();
 for(const row of rows){for(const message of row.issues)issues.push({code:'CATALOG_MAPPING',message:`${row.name} ${row.profile}: ${message}`,path:'Документация: производственные материалы → каталог'});
  if(row.required!=null){const g=grouped.get(row.catalogId)||{required:0,purchased:row.purchased,names:[]};g.required+=row.required;g.names.push(row.name);grouped.set(row.catalogId,g);}
 }
 for(const [id,g]of grouped)if(g.required-g.purchased>1e-6)issues.push({code:'CATALOG_SHORTAGE',message:`${id}: требуется ${g.required}, закуплено ${g.purchased}; ${g.names.join(', ')}`,path:'Смета / Раскрой: закупка'});
 return issues;
}
// Only an incomparable legacy family can be resolved by an explicit, complete
// catalog correspondence. Blocked layouts and unallocated stock remain blockers.
export function catalogResolvesManualMatch(row,mapping){
 if(row.status!=='manual-match'||row.incomplete||row.pendingCount)return false;
 const related=mapping.filter(m=>m.reconciliationKey===row.key);
 if(!related.length||related.some(m=>m.issues.length||m.required==null))return false;
 return related.every(r=>{const shared=mapping.filter(m=>m.catalogId===r.catalogId);return shared.every(m=>!m.issues.length&&m.required!=null)&&shared.reduce((sum,m)=>sum+m.required,0)<=r.purchased+1e-6;});
}
