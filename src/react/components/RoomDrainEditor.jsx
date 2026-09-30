import { NumberField, Toggle } from './ui.jsx';
import { resolveRoomDrain } from '../calculations/room-drain.js';

export function RoomDrainEditor({room,values,updateRoom,project}) {
  const drain=resolveRoomDrain({...room,settings:values},project.priceMat);
  const update=patch=>{if(Object.entries(patch).every(([key,value])=>drain[key]===value))return;updateRoom({drain:{...drain,...patch}});};
  return <details className="room-drain-editor">
    <summary>Трап помещения · {drain.quantity?`${drain.quantity} шт · ${(drain.quantity*drain.price*(1+drain.markup/100)).toLocaleString('ru-RU')} ₽`:'не включён'}</summary>
    <p>Для санузла, бойлерной, моечной или парной. Один трап учитывается один раз в отделке этой комнаты. Если он уже внесён отдельно в инженерию или заявку, выключите его здесь.</p>
    <Toggle label="Учитывать трап помещения" checked={drain.quantity>0} onChange={enabled=>update({quantity:enabled?1:0})}/>
    <div className="form-grid three">
      <NumberField label="Количество трапов" suffix="шт" step={1} value={drain.quantity} onChange={quantity=>update({quantity})}/>
      <NumberField label="Закупочная цена трапа" suffix="₽/шт" value={drain.price} onChange={price=>update({price})}/>
      <NumberField label="Наценка трапа" suffix="%" value={drain.markup} onChange={markup=>update({markup})}/>
    </div>
    <p>Бюджетный ориентир v163: 6 000 ₽ до наценки; при +25% — 7 500 ₽/шт. Ручная цена относится только к этой комнате. Уклоны, гидроизоляция, канализация и монтаж не добавляются.</p>
  </details>;
}
