import { drawingCategory, purchaseRows } from '../calculations/drawing-workbench.js';

// Presentation only. Never change quantities or cut geometry when filtering.
export const CONSTRUCTION_CATEGORIES = [['overview','Дом'],['piles','Основание'],['binding','Обвязка'],['floor','Пол'],['walls','Стены'],['partitions','Перегородки'],['ceiling','Перекрытие'],['gables','Фронтоны'],['roof','Кровля']];
export const WORKBENCH_MODES = [['construction','Конструкции'],['production','Производство'],['checks','Проверки'],['documentation','Документация']];
export function locateWorkbenchItem(report,id) {
  const assemblyId=report.fabricationMembers?.find(m=>m.id===id)?.assemblyMemberId;
  const member=report.members.find(m=>m.id===id||m.key===id||assemblyId&&m.id===assemblyId);
  const panel=report.parts.find(p=>p.id===id);
  const surface=report.surfaces.find(s=>s.id===(panel||member)?.surfaceId||s.id===id||s.layoutKey===id||s.openings?.some(o=>o.key===id));
  return {member,panel,surface,category:surface?drawingCategory(surface):member?.surface==='Обвязка'?'binding':member?.source==='Проектная опора'?'supports':member?.surface==='Кровля'?'roof':null};
}
export function scopedWorkbenchItems(report,{scope='surface',surface,drawing,category,floor=1}) {
  if(scope==='project')return {parts:report.parts,members:report.members.filter(m=>!m.excluded)};
  if(scope==='floor'){
    const ids=new Set(report.surfaces.filter(s=>s.floor===floor).map(s=>s.id));
    return {parts:report.parts.filter(p=>ids.has(p.surfaceId)),members:report.members.filter(m=>!m.excluded&&ids.has(m.surfaceId))};
  }
  if(drawing)return {parts:drawing.parts,members:drawing.members.filter(m=>!m.excluded)};
  const role=category==='binding'?'Обвязка':category==='roof'?'Кровля':null;
  return {parts:[],members:report.members.filter(m=>!m.excluded&&(role?m.surface===role:category==='supports'?m.source==='Проектная опора':false))};
}
export function scopedWorkbenchStock(report,items,{scope,category}) {
  if(scope==='project')return report;
  const ids=new Set([...items.parts,...items.members].map(p=>p.id));
  // Spliced assembly members have several physical fabrication pieces.
  for(const piece of report.fabricationMembers||[])if(ids.has(piece.assemblyMemberId))ids.add(piece.id);
  const sheets=report.panelStock.sheets.filter(s=>s.parts.some(p=>ids.has(p.id))),sheetIds=new Set(sheets.map(s=>s.id));
  return {...report,panelStock:{...report.panelStock,sheets,remnants:report.panelStock.remnants.filter(r=>sheetIds.has(r.sheet))},timberStock:{...report.timberStock,bars:report.timberStock.bars.filter(s=>s.parts.some(p=>ids.has(p.id)))},roofCover:category==='roof'&&scope!=='floor'?report.roofCover:{slopes:[]}};
}
export function scopedPurchases(report,items,context){return purchaseRows(scopedWorkbenchStock(report,items,context));}
