import { NumberField, SelectField } from './ui.jsx';
import { SAUNA_ITEMS } from '../data/sauna-catalog.js';
import { SAUNA_BUDGET_PRICES } from '../calculations/sauna-auto.js';
import { chimneySchedule } from '../calculations/sauna-details.js';

export function SaunaQuickEditor({s,raw,update,room,active,prices}) {
  const schedule=chimneySchedule(s.chimneyDimensions);
  const priced=active.map(line=>{const item=SAUNA_ITEMS.find(i=>i.id===line.catalogId);return {...line,item,price:line.projectPrice??prices.find(i=>i.id===line.catalogId)?.price??0};});
  const total=priced.reduce((sum,l)=>sum+l.qty*l.price*(l.priceMultiplier||1),0);
  const lining=priced.find(l=>l.item.key==='liningPack'||l.item.key==='lining');
  return <section className="sauna-quick">
    <h4>Автоматическая предварительная смета</h4>
    <p>Площади и высота связаны с планом. Вагонка, каркас, фольга и прямой дымоход пересчитываются при изменении комнаты. Пол и подключение трапа сюда не входят.</p>
    <div className="form-grid two">
      <SelectField label="Печь в автоматической смете" value={s.heaterType} options={[{value:'wood',label:'Дровяная · Скиф 16 / своя модель'},{value:'electric',label:'Электрическая · без дымохода'},{value:'none',label:'Без печи и дымохода'}]} onChange={heaterType=>update({heaterType,...(heaterType==='electric'?{heaterModel:'Электропечь — выбрать модель',prices:{...raw.prices,heater:0}}:heaterType==='wood'?{heaterModel:'Везувий Скиф Ковка 16 Панорама М',prices:{...raw.prices,heater:42010}}:{})})}/>
      <NumberField label="Трап парной" suffix="шт" step={1} value={s.quantities.drain} onChange={drain=>update({quantities:{...raw.quantities,drain}})}/>
    </div>
    <p role="status">Выбрано: {s.heaterType==='none'?'без печи':s.heaterModel}. Трап: {s.quantities.drain} шт. {s.heaterType==='wood'&&schedule.valid?`Дымоход: ${schedule.length.toFixed(2)} м расчётно / ${schedule.purchased.toFixed(2)} м в закупке.`:''}</p>
    <p>Вагонка: {lining?`${lining.qty.toLocaleString('ru-RU')} ${lining.item.unit} · ${(lining.qty*lining.price*(lining.priceMultiplier||1)).toLocaleString('ru-RU')} ₽ с наценкой`:'не учтена — проверьте площадь и ручные настройки'}.</p>
    {s.heaterType==='wood'&&['auto','parts'].includes(s.chimneyMode)&&!schedule.valid?<p className="assembly-warning">Дымоход не учтён: {schedule.warnings.join(' ')}</p>:null}
    <p className="assembly-warning">Бюджетная оценка, не монтажный проект. Печь, проходки, отступы и допустимость утепления SIP нужно согласовать. Трап не добавляет работы по полу или канализацию; если он уже учтён в инженерии, укажите здесь 0.</p>
    <p><strong>Парная: {total.toLocaleString('ru-RU',{maximumFractionDigits:0})} ₽</strong> · с работами согласно переключателям ниже, материалами +{s.materialMarkup}% и отдельной доставкой печи. {priced.some(l=>!l.price)?'Есть позиции без цены — итог неполный.':''}</p>
    <details><summary>Что вошло в расчёт · {active.length} позиций</summary>
      <ul>{priced.map(l=><li key={l.key}>{l.description}: {l.qty.toLocaleString('ru-RU',{maximumFractionDigits:2})} {l.item.unit} · {(l.qty*l.price*(l.priceMultiplier||1)).toLocaleString('ru-RU',{maximumFractionDigits:0})} ₽{SAUNA_BUDGET_PRICES[l.item.key]!=null&&raw.prices?.[l.item.key]==null?' · бюджетный ориентир':''}</li>)}</ul>
    </details>
    <details><summary>Допущения и источники автоматического режима</summary>
      <p>По просьбе пользователя от 30.09.2026: предварительные сметные допущения, не монтажные нормы. Вагонка липа А, рабочая ширина 88 мм; длина ближайшая не меньше высоты, максимум 3 м. Упаковки по покрываемой площади с запасом проекта, без оптимизации отдельных резов потолка и проёмов. Утепление 50 мм; шаг каркаса 600 мм, контррейки 400 мм. Фольга по площади; лента 1,5 м/м². Плинтус и галтель по периметру, 4 угла по высоте, наличник 5 м. Полки 2×0,6 м, два яруса. Можно изменить ниже.</p>
      <p>Дымоход: высота этажа + верхние этажи (перекрытие условно 224 мм) + высота конька + 0,5 м − условная отметка патрубка 0,65 м, минимум 5 м от патрубка для бюджета. Монтажные длины условно 0,95/0,45 м, шибер со стартом 0,3 м. Это НЕ правило безопасной высоты: выход, отступы, стыки, опоры, тягу и проходки определяет монтажник. {room.ceilingMode==='open-rafter'?'Второй свет требует отдельной проверки маршрута.':''}</p>
      <p>Цены вагонки, печи, фольги, бруска, погонажа и трёх деталей дымохода — сохранённые предложения от 29.09.2026. Остальные — бюджетные суммы, не проверенные рыночные средние. Сохранённые проектные цены и количества имеют приоритет.</p>
      <ul>{Object.entries(SAUNA_BUDGET_PRICES).map(([key,price])=>{const item=SAUNA_ITEMS.find(i=>i.key===key);return <li key={key}>{item.name}: {price.toLocaleString('ru-RU')} ₽/{item.unit} до наценки</li>;})}</ul>
    </details>
  </section>;
}
