export const purchaseUnit = value => String(value||'').toLowerCase().replace(/[.\s]/g,'').replace('³','3');
export function purchaseStock(text){
  const source=String(text||''),match=source.match(/(\d+)\s*(?:досок|доски|заготовок|хлыстов)\s*[×xх*]\s*(\d+(?:[.,]\d+)?)\s*м(?:\s|$|[·,])/i)||source.match(/(\d+)\s*шт\.?\s*[×xх*]\s*(\d+(?:[.,]\d+)?)\s*м(?:\s|$|[·,])/i);
  return match?{pieces:Number(match[1]),lengthM:Number(match[2].replace(',','.'))}:null;
}
export function materialProfile(text) {
  const match=String(text||'').match(/(\d+(?:[.,]\d+)?)\s*[×xх*]\s*(\d+(?:[.,]\d+)?)(?:\s*[×xх*]\s*(\d+(?:[.,]\d+)?))?/i);
  return match?match.slice(1).filter(Boolean).map(n=>Number(n.replace(',','.'))):null;
}
// Only convert dimensions explicitly present in the product. A metre of cable,
// a roll and a square metre of membrane have no invented volume/piece count.
export function purchaseQuantities(line) {
  const qty=Number(line.qty)||0,u=purchaseUnit(line.unit),text=String(line.name||''),wood=/доск|досок|брус|балк|стропил|обреш[её]т|мауэрлат|ригель|лага/i.test(text);
  const dimensions=materialProfile(text),packed=/пакет|комплект/i.test(text),section=dimensions?.slice(0,2),area=section?.reduce((a,b)=>a*b,1)/1e6;
  let pieces=['шт','штука'].includes(u)?qty:null,lengthM=['м','мп','погм','погонныйметр'].includes(u)?qty:null,volumeM3=u==='м3'?qty:null;
  if(line.materialVolumeM3>0)volumeM3=line.materialVolumeM3*(line.materialVolumeBasisQty>0?qty/line.materialVolumeBasisQty:1);
  if(wood&&area>0&&!packed){
    if(lengthM!=null&&volumeM3==null)volumeM3=lengthM*area;
    if(volumeM3!=null&&lengthM==null)lengthM=volumeM3/area;
    const stock=purchaseStock(text),stockM=stock?.lengthM||(dimensions?.[2]>500?dimensions[2]/1000:null);
    if(stock&&u==='м3'&&!line.projectOverride&&!line.custom){pieces=stock.pieces;lengthM=pieces*stockM;volumeM3=lengthM*area;}
    if(stockM>0){if(pieces!=null&&lengthM==null)lengthM=pieces*stockM;if(pieces==null&&lengthM!=null)pieces=Math.ceil(lengthM/stockM-1e-7);if(volumeM3==null&&lengthM!=null)volumeM3=lengthM*area;}
  }
  if(pieces!=null&&volumeM3==null&&/СИП-панел|SIP-панел/i.test(text)&&dimensions?.length===3)volumeM3=pieces*dimensions.reduce((a,b)=>a*b,1)/1e9;
  return {pieces,lengthM,volumeM3};
}
