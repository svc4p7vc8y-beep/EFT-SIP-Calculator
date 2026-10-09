import { NumberField, SelectField, Toggle } from './ui.jsx';
import { useState } from 'react';
import { resolveSauna, enableAutoSauna } from '../calculations/sauna-auto.js';
import { SaunaQuickEditor } from './SaunaQuickEditor.jsx';
import { resolveRoomDrain } from '../calculations/room-drain.js';
import { SAUNA_ITEMS, SAUNA_WOODS } from '../data/sauna-catalog.js';
import { saunaLines } from '../calculations/sauna-model.js';
import { SaunaDetailsEditor } from './SaunaDetailsEditor.jsx';
import { CHIMNEY_KEYS, SAUNA_EXTRA_ITEMS } from '../data/sauna-options.js';

export function SaunaEditor({room, values, updateRoom, project}) {
  const raw=values.sauna||{};
  const s={heaterType:'none',wood:'linden',benchLength:0,benchWidth:0,benchTiers:1,...resolveSauna({...room,settings:values})};
  const [feedback,setFeedback]=useState('');
  const update=changes=>{setFeedback('Настройки применены. Комплектация и сумма пересчитаны.');if(Object.entries(changes).every(([key,value])=>JSON.stringify(raw[key])===JSON.stringify(value)))return;updateRoom({sauna:{...raw,...changes}});};
  const quantity=(key,value)=>update({quantities:{...raw.quantities,[key]:value}});
  const active=saunaLines({...room,settings:values},Math.max(1,Number(project.settings.internal.reserve)||1.1),[...project.priceMat,...project.priceLab],project.sharedPriceCatalog?.source==='server');
  const prices=[...project.priceMat,...project.priceLab];
  const detailed=s.detailVersion===1;
  const automatic=new Set(['drain','glassDoor','lindenWindow','lining','foil','bench','heater','liningPack','liningWork','heaterWork','heaterDelivery','foilRoll','tapeRoll','battenStock','counterStock',...CHIMNEY_KEYS]);
  if(detailed){automatic.add('installation');if(['parts','auto'].includes(s.chimneyMode))automatic.add('chimney');if(s.frameMode==='area')for(const key of ['batten','counterBatten','insulation'])automatic.add(key);}
  const manual=SAUNA_ITEMS.filter(item=>!automatic.has(item.key)&&(detailed||!SAUNA_EXTRA_ITEMS.some(extra=>extra.key===item.key))&&!(item.key==='chimney'&&s.heaterType!=='wood')&&!(['stones','control','shield','guard'].includes(item.key)&&s.heaterType==='none'));
  return <section className="sauna-editor">
    <h3>Отделка парной / сауны</h3>
    {project.sharedPriceCatalog ? <p>Цены всех позиций парной берутся из общего прайса. Вагонка имеет отдельные цены по сорту и длине; их изменение доступно в разделе «Прайс-лист».</p> : null}
    <Toggle label="Комплектация парной в этом помещении" checked={s.enabled===true} onChange={enabled=>update(enabled&&Object.keys(raw).every(key=>key==='enabled')?enableAutoSauna():{enabled})}/>
    {s.enabled?<>
      {feedback?<p className="assembly-info" role="status">{feedback}</p>:null}
      {!project.services.internalFinish||values.enabled===false?<p className="assembly-warning">Парная не включена в итоговую смету: включите внутреннюю отделку и отделку помещения.</p>:null}
      {!s.autoEstimate?<button className="button primary" type="button" onClick={()=>update(enableAutoSauna(raw))}>Настроить автоматически · предварительная смета</button>:<SaunaQuickEditor sharedPrices={Boolean(project.sharedPriceCatalog)} s={s} raw={raw} update={update} room={room} active={active} prices={prices} drainQuantity={resolveRoomDrain({...room,settings:values},project.priceMat).quantity}/>}
      <div className="sauna-openings"><h4>Дверь и форточка парной</h4>
        <Toggle label="Прозрачная стеклянная дверь 700×1900 мм" checked={(s.quantities?.glassDoor||0)>0} onChange={enabled=>quantity('glassDoor',enabled?1:0)}/>
        <Toggle label="Липовая форточка 400×500 мм" checked={(s.quantities?.lindenWindow||0)>0} onChange={enabled=>quantity('lindenWindow',enabled?1:0)}/>
        <p>Цена двери: {project.sharedPriceCatalog ? (prices.find(row=>row.id==='MAT-SAUNA-GLASSDOOR')?.price||0).toLocaleString('ru-RU') : '11 400'} ₽, форточки: {project.sharedPriceCatalog ? (prices.find(row=>row.id==='MAT-SAUNA-LINDENWINDOW')?.price||0).toLocaleString('ru-RU') : '3 500'} ₽ до наценки материалов; <a href="https://stroyudacha.ru/products/219307-blok-dvernoy-steklyannyy-bannyy-700h1900-mm-steklo-8-mm--bronza.html" target="_blank" rel="noreferrer">дверь</a> и <a href="https://stroyudacha.ru/products/206603-blok-okonnyy-lipa-400h500-mm.html" target="_blank" rel="noreferrer">форточка</a> СтройУдача. Цвет и комплектность коробки уточните у поставщика; цены зависят от региона и наличия.</p>
        <p>Позиции добавляются в смету отдельно по выбору. Если дверь или окно уже посчитаны по плану, не включайте их повторно. Проёмы плана и площадь обшивки здесь не меняются; монтаж уточняется отдельно.</p>
      </div>
      <details className="sauna-advanced"><summary>Ручные настройки, комплектация и цены</summary>
      <p className="assembly-info">Заменяет обычную отделку стен и потолка только этой комнаты. Пол настраивается выше отдельно. Площади стен распределены расчётом приблизительно: уточните их по развёрткам. Проектирование вентиляции, электрики и пожарной защиты в этот расчёт не входит.</p>
      {!project.services.internalFinish?<p className="assembly-warning">Включите услугу «Внутренняя отделка», иначе комплектация не попадёт в смету.</p>:null}
      {values.floorFinish==='laminate'?<p className="assembly-warning">Сейчас для пола выбран обычный ламинат. Подтвердите допустимость покрытия для температуры и влажности парной либо измените пол выше; автоматически он не заменён.</p>:null}
      {values.enabled===false?<p className="assembly-warning">Отделка комнаты выключена — парная не учитывается в смете.</p>:null}
      <div className="form-grid two">
        <SelectField label="Древесина обшивки и полков" value={s.wood} options={SAUNA_WOODS} onChange={wood=>update({wood})}/>
        <NumberField label="Стены парной без проёмов" suffix="м²" value={values.wallArea??room.wallArea} onChange={wallArea=>updateRoom({wallArea})}/>
        <NumberField label="Потолок парной" suffix="м²" value={values.ceilingArea??room.ceilingArea} onChange={ceilingArea=>updateRoom({ceilingArea})}/>
        <Toggle label="Высокотемпературная пароизоляция стен и потолка" checked={s.foil!==false} onChange={foil=>update({foil})}/>
      </div>
      <p>Обшивка и пароизоляция: площадь стен + потолка с общим запасом проекта. Профиль, температурную пригодность и состав пирога SIP подтвердите рабочим узлом. Обычная плёнка и ГКЛВ не назначаются автоматически в горячую зону.</p>
      <h4>Полки</h4>
      <div className="form-grid three">
        <NumberField label="Длина одного яруса полков" suffix="м" step={.1} value={s.benchLength} onChange={benchLength=>update({benchLength})}/>
        <NumberField label="Ширина одного яруса полков" suffix="м" step={.05} value={s.benchWidth} onChange={benchWidth=>update({benchWidth})}/>
        <NumberField label="Число одинаковых ярусов" suffix="шт" step={1} value={s.benchTiers} onChange={benchTiers=>update({benchTiers})}/>
      </div>
      <p>Площадь полков = длина × ширина × число ярусов, без запаса; цена за готовый полок с опорным каркасом. Для разных ярусов укажите суммарную длину при общей ширине и один ярус либо внесите отдельные позиции в «Заявку».</p>
      <h4>Печь</h4>
      <div className="form-grid two">
        <SelectField label="Тип печи" value={s.heaterType} options={[{value:'none',label:'Не включать / уже учтена'},{value:'electric',label:'Электрическая'},{value:'wood',label:'Дровяная'}]} onChange={heaterType=>update({heaterType})}/>
        <label className="field">Модель и паспорт печи<input value={s.heaterModel||''} placeholder="Производитель, модель, ссылка на паспорт" onChange={e=>update({heaterModel:e.target.value})}/></label>
        <NumberField label="Мощность по паспорту" suffix="кВт" step={.1} value={s.power??0} onChange={power=>update({power})}/>
      </div>
      <p className="assembly-warning">Мощность — справочное поле, не автоматический подбор. Проверьте расчётный объём с учётом стекла, питание, массу камней, отступы, защиту SIP, закладные и дымоход по паспорту. Для электрической печи отдельный блок управления нужен не всегда.</p>
      <SaunaDetailsEditor s={s} update={update} room={room} values={values} project={project}/>
      <h4>Комплектующие и работы по спецификации</h4>
      <p>Нулевое количество означает «не учтено». Количества ниже задаются уже с необходимым запасом. Готовность комплекта проверяет проектировщик.</p>
      <div className="form-grid two">{manual.map(item=><NumberField key={item.key} label={item.name} value={s.quantities?.[item.key]??0} suffix={item.unit} step={['шт','компл','упак'].includes(item.unit)?1:.1} onChange={value=>quantity(item.key,value)}/>)}</div>
      <h4>Цены выбранной комплектации</h4>
      <p>{project.sharedPriceCatalog ? 'Закупочные цены до наценки задаются в общем разделе «Прайс-лист» и действуют для всех сотрудников. Нулевая цена означает неполный итог.' : 'Вводите закупочную цену ДО наценки. Правки относятся только к этой комнате, общий прайс не меняется. Нулевая цена означает неполный итог, а не бесплатный материал.'}</p>
      <div className="form-grid two">{active.filter(line=>line.catalogId!=='MAT-SAUNA-DRAIN').map(line=>{const item=SAUNA_ITEMS.find(i=>i.key===line.saunaItemKey||i.id===line.catalogId);const price=line.projectPrice??prices.find(i=>i.id===line.catalogId)?.price??0;return <div key={item.key}><NumberField label={`${line.description} · ${line.qty.toFixed(2)} ${item.unit}`} value={price} disabled={Boolean(project.sharedPriceCatalog)} suffix={`₽/${item.unit}`} onChange={value=>update({prices:{...s.prices,[item.key]:value}})}/>{price>0?<small>В смете: {(price*(line.priceMultiplier||1)).toLocaleString('ru-RU')} ₽/{item.unit}{line.priceMultiplier>1?' · с наценкой':''}</small>:<small className="assembly-warning">Уточнить цену — итог неполный</small>}</div>;})}</div>
      <label className="field">Проектные примечания<textarea value={s.notes||''} placeholder="Профиль обшивки, крепёж, закладные, вентиляция, трап, светильники, дверь, защита печи и согласование проектировщика…" onChange={e=>update({notes:e.target.value})}/></label>
      <p className="assembly-warning">Отдельно проверьте приток и вытяжку, слив/уклоны и гидроизоляцию мокрых зон, термостойкие светильники и проводку, защиту и подключение печи. В автоматическом режиме часть материалов включена бюджетно: сверьте ведомость с проёмами плана и инженерией, чтобы не задвоить закупку. Монтаж учитывается только при ненулевой комплектации работ.</p>
      <p><a href="https://support.harvia.com/hc/en-gb/articles/21953077934620-I-am-about-to-start-panelling-my-sauna-what-do-I-need-to-take-into-account" target="_blank" rel="noreferrer">Harvia: обшивка и закладные</a> — справочная рекомендация, не несущий расчёт.</p>
      </details>
    </>:<p>Включите вручную для нужной комнаты. Название «Баня» или «Сауна» не меняет старую смету автоматически.</p>}
  </section>;
}
