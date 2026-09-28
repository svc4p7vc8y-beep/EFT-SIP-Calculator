import { SAUNA_ITEMS, SAUNA_WOODS } from '../data/sauna-catalog.js';

const positive = value => Number.isFinite(Number(value)) ? Math.max(0,Number(value)) : 0;
export function saunaLines(room, reserve=1.1) {
  const s=room.settings.sauna;
  if(!s?.enabled || room.settings.enabled===false) return [];
  const wall=positive(room.settings.wallArea??room.wallArea);
  const ceiling=positive(room.settings.ceilingArea??room.ceilingArea);
  const area=wall+ceiling;
  const quantities={...s.quantities, lining:area*reserve, foil:s.foil===false?0:area*reserve,
    bench:positive(s.benchLength)*positive(s.benchWidth)*Math.ceil(positive(s.benchTiers)),
    heater:['electric','wood'].includes(s.heaterType)?1:0};
  if(s.heaterType!=='wood') quantities.chimney=0;
  if(!quantities.heater) for(const key of ['stones','control','shield','guard'])quantities[key]=0;
  const wood=SAUNA_WOODS.find(item=>item.value===s.wood)?.label||'По спецификации проекта';
  return SAUNA_ITEMS.flatMap(item=>{
    let qty=positive(quantities[item.key]);
    if(['шт','компл'].includes(item.unit))qty=Math.ceil(qty);
    if(!qty)return [];
    const name=`${item.name}${['lining','bench','backrest'].includes(item.key)?` · ${wood}`:item.key==='heater'?` · ${s.heaterType==='wood'?'дровяная':'электрическая'} · ${String(s.heaterModel||'модель не указана').slice(0,160)}`:''}`;
    return [{catalogId:item.id,key:`${room.floor}-${room.id}-sauna-${item.key}`,qty,group:`${room.floor} этаж · ${room.name} · Парная`,description:name,name,
      ...(s.prices?.[item.key]!=null?{projectPrice:positive(s.prices[item.key])}:{})}];
  });
}
