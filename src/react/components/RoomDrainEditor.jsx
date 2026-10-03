import { NumberField, Toggle } from './ui.jsx';
import { resolveRoomDrain } from '../calculations/room-drain.js';

export function RoomDrainEditor({room,values,updateRoom,project}) {
  const drain=resolveRoomDrain({...room,settings:values},project.priceMat);
  const update=patch=>{if(Object.entries(patch).every(([key,value])=>drain[key]===value))return;updateRoom({drain:{...drain,...patch}});};
  return <section className="room-drain-editor" aria-label="Трап мокрой зоны">
    <h4>Трап мокрой зоны</h4>
    <Toggle label="Учитывать трап" checked={drain.quantity>0} onChange={enabled=>update({quantity:enabled?1:0})}/>
    {drain.quantity>0?<NumberField label="Количество трапов" suffix="шт" step={1} min={0} value={drain.quantity} onChange={quantity=>update({quantity})}/>:null}
    <p>{drain.quantity?`${drain.quantity} шт · ${(drain.quantity*drain.price*(1+drain.markup/100)).toLocaleString('ru-RU')} ₽`:'Не включён в смету'}. Один трап учитывается один раз в отделке комнаты.</p>
    <details><summary>Цена и наценка трапа</summary>
    <p>Для санузла, бойлерной, моечной или парной. Один трап учитывается один раз в отделке этой комнаты. Если он уже внесён отдельно в инженерию или заявку, выключите его здесь.</p>
    <div className="form-grid two">
      <NumberField label="Закупочная цена трапа" suffix="₽/шт" value={drain.price} onChange={price=>update({price})}/>
      <NumberField label="Наценка трапа" suffix="%" value={drain.markup} onChange={markup=>update({markup})}/>
    </div>
    <p>Бюджетный ориентир v163: 6 000 ₽ до наценки; при +25% — 7 500 ₽/шт. Ручная цена относится только к этой комнате. Уклоны, гидроизоляция, канализация и монтаж не добавляются.</p>
    </details>
  </section>;
}
