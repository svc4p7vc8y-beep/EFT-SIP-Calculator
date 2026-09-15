import { useState } from 'react';
import { asset } from './data.js';

export default function ReferencePlan({ house, active }) {
  const [zoomed, setZoomed] = useState(false);
  return <figure className="reference-plan">
    <div className="reference-plan-heading"><div><span>Планировочное решение</span><strong>{house.areaLabel || house.name}</strong></div><small>{house.rooms.length} зон в планировке</small></div>
    <div className="reference-plan-tools"><button type="button" tabIndex={active ? 0 : -1} aria-pressed={zoomed} onClick={() => setZoomed(value => !value)}>{zoomed ? 'Показать целиком' : 'Увеличить план'}</button><a tabIndex={active ? 0 : -1} href={asset(house.planImage)} target="_blank" rel="noreferrer">Открыть оригинал ↗</a></div>
    <div className={`reference-plan-scroll${zoomed ? ' is-zoomed' : ''}`} tabIndex={active ? 0 : -1} aria-label="Планировка: при увеличении можно прокручивать изображение"><img src={asset(house.planImage)} alt={`Объёмная планировка дома ${house.name}: ${house.rooms.join(', ')}`} /></div>
    <ul className="reference-room-list" aria-label="Состав помещений">{house.rooms.map((room, index) => <li key={`${room}-${index}`}>{room}</li>)}</ul>
    <figcaption>{house.planNote}</figcaption>
  </figure>;
}
