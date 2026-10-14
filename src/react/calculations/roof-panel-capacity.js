// A passport-table comparison, not a substitute for project load combinations,
// local point loads, connection design or a structural review.
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
export const roofFaceCapacitySignature=face=>JSON.stringify(face.vertices.map(point=>point.map(value=>Math.round(value*10)/10)));
export function roofLoadCasePressure(load,baseLoads={}){
 if(load.mode!=='components')return positive(load.pressureKPa)?load.pressureKPa:null;
 const terms=[['deadFactor','deadLoad'],['snowFactor','snow'],['windFactor','wind']];
 let signed=0,hasTerm=false;
 for(const [factorKey,loadKey] of terms){
  const factor=load[factorKey]===''||load[factorKey]==null?0:load[factorKey];
  if(typeof factor!=='number'||!Number.isFinite(factor))return null;
  if(factor===0)continue;
  const base=baseLoads[loadKey];
  if(typeof base!=='number'||!Number.isFinite(base)||base<0)return null;
  signed+=factor*base;hasTerm=true;
 }
 if(!hasTerm)return null;
 const pressure=load.kind==='uplift'?-signed:signed;
 return positive(pressure)?pressure:null;
}

export function roofPanelCapacityChecks(model,engineering={},baseLoads={}){
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
   const pressureKPa=roofLoadCasePressure(load,baseLoads);
   const matching=rows.filter(row=>row.thicknessMm===face.thickness&&positive(row.maxSpanMm)&&row.maxSpanMm>=spanMm&&positive(row[capacityKey])&&row.source?.trim()).sort((a,b)=>a.maxSpanMm-b.maxSpanMm);
   const passport=matching[0],ready=positive(pressureKPa)&&!!load.source?.trim()&&!!passport&&overrideReady;
   const utilization=ready?pressureKPa/passport[capacityKey]:null;
   const status=!ready?'open':utilization<=1?'pass':'fail';
   result.push({code:`PANEL_CAPACITY:${face.id}:${load.id}`,faceId:face.id,loadId:load.id,status,spanMm,geometricSpanMm,spanSource,pressureKPa,capacityKPa:passport?.[capacityKey]??null,passportId:passport?.id||'',utilization,
    message:!ready?`${face.id}: для ${load.name||load.id} нужны подтверждённая нагрузка и строка паспорта SIP ${face.thickness} мм при пролёте не меньше ${Math.ceil(spanMm)} мм.`:
     `${face.id}: ${load.name||load.id} · ${Number(pressureKPa.toFixed(3))} / ${passport[capacityKey]} кПа = ${(utilization*100).toFixed(1)}% (${status==='pass'?'в пределах паспортной строки':'выше паспортной строки'}).`});
  }
 }
 return result;
}
