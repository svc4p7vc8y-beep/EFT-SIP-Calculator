import { drawingCategory, purchaseRows } from '../calculations/drawing-workbench.js';

// Presentation only. Never change quantities or cut geometry when filtering.
export const CONSTRUCTION_CATEGORIES = [['overview','Дом'],['piles','Основание'],['binding','Обвязка'],['floor','Пол'],['walls','Стены'],['partitions','Перегородки'],['ceiling','Перекрытие'],['gables','Фронтоны'],['roof','Кровля'],['platforms','Террасы и крыльца']];
export function workbenchSurfaces(report){return [...report.surfaces,...(report.assembly.platforms||[]).map(p=>({id:`platform:${p.id}`,name:p.name,floor:1,workbenchCategory:'platforms',geometry:[[p.contour]],platformId:p.id}))];}
const inCategory=(m,category)=>category==='platforms'?String(m.surfaceId||'').startsWith('platform:'):category==='supports'?!!m.supportId||m.source==='Проектная опора':false;
export const WORKBENCH_MODES = [['construction','Конструкции'],['production','Карты раскроя'],['purchase','Закупка'],['documentation','Документы']];
export function locateWorkbenchItem(report,id) {
  const assemblyId=report.fabricationMembers?.find(m=>m.id===id)?.assemblyMemberId;
  const member=report.members.find(m=>m.id===id||m.key===id||assemblyId&&m.id===assemblyId);
  const panel=report.parts.find(p=>p.id===id);
  const surface=workbenchSurfaces(report).find(s=>s.id===(panel||member)?.surfaceId||s.id===id||s.layoutKey===id||s.openings?.some(o=>o.key===id));
  return {member,panel,surface,category:surface?drawingCategory(surface):String(member?.surfaceId||'').startsWith('platform:')?'platforms':member?.supportId?'supports':member?.surface==='Обвязка'?'binding':member?.source==='Проектная опора'?'supports':member?.surface==='Кровля'?'roof':null};
}
export function scopedWorkbenchItems(report,{scope='surface',surface,drawing,category,floor=1}) {
  if(scope==='project')return {parts:report.parts,members:report.members.filter(m=>!m.excluded)};
  if(scope==='category'){
    const ids=new Set(workbenchSurfaces(report).filter(s=>drawingCategory(s)===category).map(s=>s.id));
    const role=category==='roof'?'Кровля':category==='binding'?'Обвязка':null;
    return {parts:report.parts.filter(p=>ids.has(p.surfaceId)),members:report.members.filter(m=>!m.excluded&&(ids.has(m.surfaceId)||role&&m.surface===role||inCategory(m,category)))};
  }
  if(scope==='floor'){
    const ids=new Set(workbenchSurfaces(report).filter(s=>s.floor===floor).map(s=>s.id));
    return {parts:report.parts.filter(p=>ids.has(p.surfaceId)),members:report.members.filter(m=>!m.excluded&&ids.has(m.surfaceId))};
  }
  if(drawing)return {parts:drawing.parts,members:drawing.members.filter(m=>!m.excluded)};
  const role=category==='binding'?'Обвязка':category==='roof'?'Кровля':null;
  return {parts:[],members:report.members.filter(m=>!m.excluded&&(role?m.surface===role:inCategory(m,category)))};
}
export function scopedWorkbenchStock(report,items,{scope,category}) {
  if(scope==='project')return report;
  const ids=new Set([...items.parts,...items.members].map(p=>p.id));
  // Spliced assembly members have several physical fabrication pieces.
  for(const piece of report.fabricationMembers||[])if(ids.has(piece.assemblyMemberId))ids.add(piece.id);
  const sheets=report.panelStock.sheets.filter(s=>s.parts.some(p=>ids.has(p.id))),sheetIds=new Set(sheets.map(s=>s.id));
  return {...report,panelStock:{...report.panelStock,sheets,remnants:report.panelStock.remnants.filter(r=>sheetIds.has(r.sheet))},timberStock:{...report.timberStock,bars:report.timberStock.bars.filter(s=>s.parts.some(p=>ids.has(p.id))),unplaced:report.timberStock.unplaced.filter(id=>ids.has(id))},roofCover:category==='roof'&&scope!=='floor'?report.roofCover:{slopes:[]}};
}
export function scopedPurchases(report,items,context){return purchaseRows(scopedWorkbenchStock(report,items,context));}

export function timberMaterialSummary(members){
  const groups=new Map();
  for(const member of members.filter(m=>!m.excluded)){
    const dimensions=String(member.profile||'').split(/[×xх]/).map(Number);
    if(dimensions.length!==2||dimensions.some(n=>!Number.isFinite(n)||n<=0)||!(member.length>0))continue;
    const key=`${member.material}:${member.profile}`,row=groups.get(key)||{id:key,name:member.material,profile:member.profile,qty:0,lengthM:0,volumeM3:0};
    row.qty++;row.lengthM+=member.length/1000;row.volumeM3+=member.length*dimensions[0]*dimensions[1]/1e9;groups.set(key,row);
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru')||a.profile.localeCompare(b.profile));
}
