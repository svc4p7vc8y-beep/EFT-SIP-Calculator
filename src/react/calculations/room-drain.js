import { SAUNA_BUDGET_PRICES } from './sauna-auto.js';

export function resolveRoomDrain(room,catalog=[]) {
  const settings=room.settings||{}, sauna=settings.sauna||{}, saved=settings.drain;
  const legacy=sauna.enabled&&(sauna.detailVersion===1||sauna.autoEstimate);
  const finite=(v,fallback)=>v!=null&&Number.isFinite(Number(v))?Math.max(0,Number(v)):fallback;
  const catalogPrice=catalog.find(item=>item.id==='MAT-SAUNA-DRAIN')?.price;
  return {
    quantity:Math.ceil(finite(saved?.quantity,legacy?finite(sauna.quantities?.drain,sauna.autoEstimate?1:0):0)),
    price:finite(saved?.price,finite(legacy?sauna.prices?.drain:null,catalogPrice>0?catalogPrice:(!legacy||sauna.autoEstimate||saved?SAUNA_BUDGET_PRICES.drain:0))),
    markup:finite(saved?.markup,finite(legacy?sauna.materialMarkup:null,25)),
  };
}

export function roomDrainLines(room,catalog=[]) {
  if(room.settings?.enabled===false||room.settings?.sauna?.enabled)return [];
  const drain=resolveRoomDrain(room,catalog);
  if(!drain.quantity)return [];
  const name='Трап помещения · без работ по полу и канализации';
  return [{catalogId:'MAT-SAUNA-DRAIN',key:`${room.floor}-${room.id}-room-drain`,qty:drain.quantity,
    group:`${room.floor} этаж · ${room.name} · Трап`,name,description:name,
    projectPrice:drain.price,priceMultiplier:1+drain.markup/100}];
}
