// A passport-table comparison, not a substitute for project load combinations,
// local point loads, connection design or a structural review.
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
export const roofFaceCapacitySignature=face=>JSON.stringify(face.vertices.map(point=>point.map(value=>Math.round(value*10)/10)));

export function roofPanelCapacityChecks(model,engineering={}){
 const cases=engineering.loadCases||[],rows=engineering.panelCapacities||[],overrides=engineering.spanOverrides||{},result=[];
 for(const face of model?.faces?.filter(face=>face.warm)||[]){
  const values=face.polygon.map(point=>point[1]);
  const geometricSpanMm=Math.max(...values)-Math.min(...values);
  const override=overrides[face.id],spanMm=positive(override?.spanMm)?override.spanMm:geometricSpanMm;
  const spanSource=positive(override?.spanMm)?'project':'geometry';
  const overrideReady=spanSource!=='project'||!!override.reason?.trim()&&override.geometry===roofFaceCapacitySignature(face);
  if(!overrideReady){
   result.push({code:`PANEL_SPAN_SOURCE:${face.id}`,faceId:face.id,status:'open',spanMm,geometricSpanMm,message:`${face.id}: укажите опоры и подтвердите проектный пролёт для текущей геометрии ската.`});
  }
  if(!cases.length)result.push({code:`PANEL_LOAD:${face.id}`,faceId:face.id,status:'open',spanMm,geometricSpanMm,message:`${face.id}: задайте расчётные сочетания нагрузок из проекта.`});
  for(const load of cases){
   const kind=load.kind==='uplift'?'uplift':'downward',capacityKey=kind==='uplift'?'upliftKPa':'downwardKPa';
   const matching=rows.filter(row=>row.thicknessMm===face.thickness&&positive(row.maxSpanMm)&&row.maxSpanMm>=spanMm&&positive(row[capacityKey])&&row.source?.trim()).sort((a,b)=>a.maxSpanMm-b.maxSpanMm);
   const passport=matching[0],ready=positive(load.pressureKPa)&&!!load.source?.trim()&&!!passport&&overrideReady;
   const utilization=ready?load.pressureKPa/passport[capacityKey]:null;
   const status=!ready?'open':utilization<=1?'pass':'fail';
   result.push({code:`PANEL_CAPACITY:${face.id}:${load.id}`,faceId:face.id,loadId:load.id,status,spanMm,geometricSpanMm,spanSource,pressureKPa:load.pressureKPa,capacityKPa:passport?.[capacityKey]??null,passportId:passport?.id||'',utilization,
    message:!ready?`${face.id}: для ${load.name||load.id} нужны подтверждённая нагрузка и строка паспорта SIP ${face.thickness} мм при пролёте не меньше ${Math.ceil(spanMm)} мм.`:
     `${face.id}: ${load.name||load.id} · ${load.pressureKPa} / ${passport[capacityKey]} кПа = ${(utilization*100).toFixed(1)}% (${status==='pass'?'в пределах паспортной строки':'выше паспортной строки'}).`});
  }
 }
 return result;
}
