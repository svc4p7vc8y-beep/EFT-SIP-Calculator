import { NumberField, SelectField, Toggle } from './ui.jsx';
import { SAUNA_ITEMS, SAUNA_WOODS } from '../data/sauna-catalog.js';
import { saunaLines } from '../calculations/sauna-model.js';
import { SaunaDetailsEditor } from './SaunaDetailsEditor.jsx';
import { CHIMNEY_KEYS, DETAILED_DEFAULT_PRICES, SAUNA_EXTRA_ITEMS } from '../data/sauna-options.js';

export function SaunaEditor({room, values, updateRoom, project}) {
  const s={heaterType:'none',wood:'linden',benchLength:0,benchWidth:0,benchTiers:1,...values.sauna};
  const update=changes=>{if(Object.entries(changes).every(([key,value])=>JSON.stringify(s[key])===JSON.stringify(value)))return;updateRoom({sauna:{...s,...changes}});};
  const quantity=(key,value)=>update({quantities:{...s.quantities,[key]:value}});
  const active=saunaLines({...room,settings:{...values,sauna:s}},Math.max(1,Number(project.settings.internal.reserve)||1.1));
  const prices=[...project.priceMat,...project.priceLab];
  const detailed=s.detailVersion===1;
  const automatic=new Set(['lining','foil','bench','heater','liningPack','liningWork','heaterWork','heaterDelivery','foilRoll','tapeRoll','battenStock','counterStock',...CHIMNEY_KEYS]);
  if(detailed){automatic.add('installation');if(s.chimneyMode==='parts')automatic.add('chimney');if(s.frameMode==='area')for(const key of ['batten','counterBatten','insulation'])automatic.add(key);}
  const manual=SAUNA_ITEMS.filter(item=>!automatic.has(item.key)&&(detailed||!SAUNA_EXTRA_ITEMS.some(extra=>extra.key===item.key))&&!(item.key==='chimney'&&s.heaterType!=='wood')&&!(['stones','control','shield','guard'].includes(item.key)&&s.heaterType==='none'));
  return <section className="sauna-editor">
    <h3>Отделка парной / сауны</h3>
    <Toggle label="Комплектация парной в этом помещении" checked={s.enabled===true} onChange={enabled=>update({enabled})}/>
    {s.enabled?<>
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
      <p>Вводите закупочную цену ДО наценки. Правки относятся только к этой комнате, общий прайс не меняется. Нулевая цена означает неполный итог, а не бесплатный материал.</p>
      <div className="form-grid two">{active.map(line=>{const item=SAUNA_ITEMS.find(i=>i.id===line.catalogId);const price=s.prices?.[item.key]??prices.find(i=>i.id===item.id)?.price??(detailed?DETAILED_DEFAULT_PRICES[item.key]:undefined)??0;return <div key={item.key}><NumberField label={`${line.description} · ${line.qty.toFixed(2)} ${item.unit}`} value={price} suffix={`₽/${item.unit}`} onChange={value=>update({prices:{...s.prices,[item.key]:value}})}/>{price>0?<small>В смете: {(price*(line.priceMultiplier||1)).toLocaleString('ru-RU')} ₽/{item.unit}{line.priceMultiplier>1?' · с наценкой':''}</small>:<small className="assembly-warning">Уточнить цену — итог неполный</small>}</div>;})}</div>
      <label className="field">Проектные примечания<textarea value={s.notes||''} placeholder="Профиль обшивки, крепёж, закладные, вентиляция, трап, светильники, дверь, защита печи и согласование проектировщика…" onChange={e=>update({notes:e.target.value})}/></label>
      <p className="assembly-warning">Отдельно проверьте дверь парной, приток и вытяжку, слив/уклоны и гидроизоляцию мокрых зон, термостойкие светильники и проводку, защиту и подключение печи. Они здесь автоматически не добавляются: сверьте с дверями и инженерией, чтобы не задвоить закупку. Монтаж учитывается только при ненулевой комплектации работ.</p>
      <p><a href="https://support.harvia.com/hc/en-gb/articles/21953077934620-I-am-about-to-start-panelling-my-sauna-what-do-I-need-to-take-into-account" target="_blank" rel="noreferrer">Harvia: обшивка и закладные</a> — справочная рекомендация, не несущий расчёт.</p>
    </>:<p>Включите вручную для нужной комнаты. Название «Баня» или «Сауна» не меняет старую смету автоматически.</p>}
  </section>;
}
