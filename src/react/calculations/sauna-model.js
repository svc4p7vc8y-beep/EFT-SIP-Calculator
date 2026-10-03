import { SAUNA_ITEMS, SAUNA_WOODS } from '../data/sauna-catalog.js';
import { CHIMNEY_KEYS, DETAILED_DEFAULT_PRICES, SAUNA_EXTRA_ITEMS } from '../data/sauna-options.js';
import { chimneySchedule, liningOptions } from './sauna-details.js';
import { resolveSauna, automaticLining, SAUNA_BUDGET_PRICES, SAUNA_OFFER_PRICES } from './sauna-auto.js';
import { resolveRoomDrain } from './room-drain.js';

const positive = value => Number.isFinite(Number(value)) ? Math.max(0,Number(value)) : 0;
export function saunaLines(room, reserve=1.1, catalog=[]) {
  const s=resolveSauna(room);
  if(!s?.enabled || room.settings.enabled===false) return [];
  const wall=positive(room.settings.wallArea??room.wallArea);
  const ceiling=positive(room.settings.ceilingArea??room.ceilingArea);
  const area=wall+ceiling;
  const quantities={...s.quantities, lining:area*reserve, foil:s.foil===false?0:area*reserve,
    bench:positive(s.benchLength)*positive(s.benchWidth)*Math.ceil(positive(s.benchTiers)),
    heater:['electric','wood'].includes(s.heaterType)?1:0};
  let pack;
  const detailed=s.detailVersion===1;
  if(detailed){
    quantities.liningPack=0;
    for(const key of ['foilRoll','tapeRoll','battenStock','counterStock'])quantities[key]=0;
    quantities.liningWork=s.liningWork===false?0:area;
    quantities.installation=0; // Replaced by the explicit wall/ceiling and heater jobs.
    quantities.heaterWork=quantities.heater&&s.heaterWork!==false?1:0;
    quantities.heaterDelivery=quantities.heater&&s.heaterDelivery!==false?1:0;
    if(s.frameMode==='area'){
      quantities.insulation=area*positive(s.insulationThickness)/1000*reserve;
      quantities.batten=positive(s.battenStep)>0?area/positive(s.battenStep)*reserve:0;
      quantities.counterBatten=positive(s.counterStep)>0?area/positive(s.counterStep)*reserve:0;
    }
    if(s.liningMode==='packs'){
      pack=liningOptions(area,s.liningStock,reserve).find(o=>o.length===Number(s.liningStock?.length));
      quantities.lining=0;quantities.liningPack=pack?.packs||0;
    }
    if(s.liningMode==='auto'){
      pack=automaticLining(room,s,reserve);
      quantities.lining=0;quantities.liningPack=pack.packs;
    }
    if(s.stockMaterials){
      for(const [key,stockKey,size] of [['foil','foilRoll',10],['tape','tapeRoll',30],['batten','battenStock',3],['counterBatten','counterStock',3]]){
        quantities[stockKey]=Math.ceil(positive(quantities[key])/size-1e-9);quantities[key]=0;
      }
    }
    if(s.heaterType==='wood'&&['parts','auto'].includes(s.chimneyMode)){
      quantities.chimney=0;
      for(const key of CHIMNEY_KEYS)quantities[key]=0;
      Object.assign(quantities,chimneySchedule(s.chimneyDimensions).quantities);
    }else for(const key of CHIMNEY_KEYS)quantities[key]=0;
  }else for(const item of SAUNA_EXTRA_ITEMS)if(!['glassDoor','lindenWindow'].includes(item.key))quantities[item.key]=0;
  if(s.heaterType!=='wood')for(const key of CHIMNEY_KEYS)quantities[key]=0;
  if(s.heaterType!=='wood') quantities.chimney=0;
  if(!quantities.heater) for(const key of ['stones','control','shield','guard'])quantities[key]=0;
  const drain=resolveRoomDrain(room,catalog);
  quantities.drain=drain.quantity;
  const wood=SAUNA_WOODS.find(item=>item.value===s.wood)?.label||'По спецификации проекта';
  return SAUNA_ITEMS.flatMap(item=>{
    let qty=positive(quantities[item.key]);
    if(['шт','компл','упак','усл','рул'].includes(item.unit))qty=Math.ceil(qty-1e-9);
    if(!qty)return [];
    const name=`${item.name}${item.key==='liningPack'?` · ${s.liningStock?.grade==='extra'?'Экстра':'А'} · ${pack.length} м`:['lining','bench','backrest'].includes(item.key)?` · ${wood}`:item.key==='heater'?` · ${s.heaterType==='wood'?'дровяная':'электрическая'} · ${String(s.heaterModel||'модель не указана').slice(0,160)}`:''}`;
    const catalogPrice=catalog.find(row=>row.id===item.id)?.price;
    const autoPrice=s.autoEstimate?(item.key==='liningPack'?pack?.price:item.key==='heater'&&s.heaterType!=='wood'?0:SAUNA_OFFER_PRICES[item.key]??SAUNA_BUDGET_PRICES[item.key]):undefined;
    const price=item.key==='drain'?drain.price:s.prices?.[item.key]??(s.autoEstimate?((catalogPrice>0?catalogPrice:undefined)??autoPrice??DETAILED_DEFAULT_PRICES[item.key]):(['glassDoor','lindenWindow'].includes(item.key)?(catalogPrice>0?catalogPrice:SAUNA_OFFER_PRICES[item.key]):detailed&&DETAILED_DEFAULT_PRICES[item.key]!=null?(catalogPrice??DETAILED_DEFAULT_PRICES[item.key]):undefined));
    return [{catalogId:item.id,key:`${room.floor}-${room.id}-sauna-${item.key}`,qty,group:`${room.floor} этаж · ${room.name} · Парная`,description:name,name,
      priceMultiplier:item.key==='drain'?1+drain.markup/100:(detailed||['glassDoor','lindenWindow'].includes(item.key))&&item.kind==='material'&&item.key!=='heaterDelivery'?1+positive(s.materialMarkup??25)/100:1,
      ...(price!=null?{projectPrice:positive(price)}:{})}];
  });
}
