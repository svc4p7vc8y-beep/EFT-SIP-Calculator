// Opt-in project elements only; existing generated roof material is never replaced.
export function productionEstimateLines(project) {
 const supports=project.settings?.productionCutting?.roofSupports||[],seen=new Set(),lines=[];
 for(const item of supports){
  if(!item.estimateEnabled||item.referenceOnly||item.type==='foundation'||seen.has(item.id))continue;
  seen.add(item.id);
  const coords=['x1','y1','z1','x2','y2','z2'].map(k=>item[k]===''?NaN:Number(item[k]));
  const section=String(item.profile).split(/[×xх]/).map(Number);
  if(!coords.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000)||section.length!==2||!section.every(n=>Number.isFinite(n)&&n>0&&n<=10000))continue;
  const length=Math.hypot(coords[3]-coords[0],coords[4]-coords[1],coords[5]-coords[2])/1000;
  if(!(length>0))continue;
  if(item.type==='post'&&(coords[0]!==coords[3]||coords[1]!==coords[4]||coords[5]<=coords[2]))continue;
  const catalog=(project.priceMat||[]).find(row=>row.id===item.estimateCatalogId);
  if(!catalog||!['м³','м3','м.п.','м'].includes(catalog.unit))continue;
  const qty=Math.ceil((['м³','м3'].includes(catalog.unit)?length*section[0]*section[1]/1e6:length)*1e6)/1e6;
  lines.push({id:`production-support-${item.id}`,section:'roof',catalogId:catalog.id,name:`${item.name||'Проектный элемент'} · ${item.profile} · ${Math.round(length*1000)} мм`,kind:'material',unit:catalog.unit,qty,price:Number(catalog.price)||0,pricePending:!(Number(catalog.price)>0),source:'Проектные элементы · чистый объём без запаса'});
 }
 return lines;
}
