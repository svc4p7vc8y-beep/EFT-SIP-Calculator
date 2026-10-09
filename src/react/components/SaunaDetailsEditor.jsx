import { NumberField, SelectField, Toggle } from './ui.jsx';
import { chimneySchedule, liningOptions, positive } from '../calculations/sauna-details.js';
import { SAUNA_SOURCES } from '../data/sauna-options.js';
import { LINING_OFFERS } from '../data/sauna-options.js';
import { automaticLining } from '../calculations/sauna-auto.js';
import { liningCatalogId } from '../data/shared-price-variants.js';

export function SaunaDetailsEditor({s,update,room,values,project}) {
  const stock=s.liningStock||{}, c=s.chimneyDimensions||{};
  const stockUpdate=patch=>update({liningStock:{...stock,...patch}});
  const chimneyUpdate=patch=>s.chimneyMode==='auto'?update({chimneyOverrides:{...s.chimneyOverrides,...patch}}):update({chimneyDimensions:{...c,...patch}});
  const area=positive(values.wallArea??room.wallArea)+positive(values.ceilingArea??room.ceilingArea);
  const options=liningOptions(area,stock,Math.max(1,Number(project.settings.internal.reserve)||1.1)).map(offer => project.sharedPriceCatalog ? { ...offer, price: Number(project.priceMat.find(row => row.id === liningCatalogId(offer.length,stock.grade))?.price) || 0 } : offer);
  const schedule=chimneySchedule(c);
  return <>
    <Toggle label="Подробная банная комплектация · материалы +25%" checked={s.detailVersion===1} onChange={enabled=>update({detailVersion:enabled?1:0,...(!enabled?{autoEstimate:false}:{})})}/>
    {s.detailVersion===1?<>
      <p className="assembly-info">Источник ставок — согласование с Вадимом: работа по липе 18 000 ₽/м² стен и потолка, установка печи предварительно 15 000 ₽, доставка 7 000 ₽ без наценки. Пол не входит. Прежняя общая строка монтажа заменена этими работами. Наценка применяется один раз ко всем материалам этого блока; общий прайс и другие разделы не меняются.</p>
      <div className="form-grid two">
        <NumberField label="Наценка материалов парной" suffix="%" value={s.materialMarkup??25} onChange={materialMarkup=>update({materialMarkup})}/>
        <Toggle label="Работа по липе — стены и потолок" checked={s.liningWork!==false} onChange={liningWork=>update({liningWork})}/>
        <Toggle label="Учитывать установку печи" checked={s.heaterWork!==false} onChange={heaterWork=>update({heaterWork})}/>
        <Toggle label="Учитывать доставку печи отдельно" checked={s.heaterDelivery!==false} onChange={heaterDelivery=>update({heaterDelivery})}/>
      </div>
      <h4>Вагонка: длины и закупка</h4>
      <SelectField label="Способ расчёта вагонки" value={s.liningMode||'area'} options={[...(s.autoEstimate?[{value:'auto',label:'Автоматически · упаковки по площади'}]:[]),{value:'area',label:'Площадь · ручная цена за м²'},{value:'packs',label:'Липа 15×96 · упаковки по 10 досок'}]} onChange={liningMode=>update({liningMode})}/>
      {s.liningMode==='auto'?<>
        <p>Показаны действующие параметры, а не заглушки. Изменение одного поля не отключает пересчёт остальных по плану. Количество досок в упаковке: 10; запас проекта: {((Math.max(1,Number(project.settings.internal.reserve)||1.1)-1)*100).toFixed(0)}% (меняется в «Общие нормы и округление»).</p>
        <div className="form-grid two">
          <SelectField label="Сорт автоматической вагонки" value={stock.grade||'a'} options={[{value:'a',label:'А'},{value:'extra',label:'Экстра'}]} onChange={grade=>stockUpdate({grade})}/>
          <NumberField label="Рабочая ширина автоматической вагонки" suffix="мм" value={stock.workingWidth??88} onChange={workingWidth=>stockUpdate({workingWidth})}/>
          <SelectField label="Длина автоматической вагонки" value={stock.length||'auto'} options={[{value:'auto',label:`По высоте · сейчас ${automaticLining({...room,settings:values},s).length} м`},...LINING_OFFERS.map(o=>({value:String(o.length),label:`${o.length} м · вручную`}))]} onChange={length=>stockUpdate({length:length==='auto'?null:Number(length)})}/>
        </div>
        <button type="button" onClick={()=>update({liningStock:{...stock,workingWidth:88,length:null,grade:'a'}})}>Вернуть автоматические параметры вагонки</button>
      </>:null}
      {s.liningMode==='packs'?<>
        <p>Введите рабочую ширину без шипа по поставщику: 96 мм — номинальная, не подтверждённая полезная ширина. Расчёт для одинаковых отрезков; для разных длин стен/потолка нужна отдельная карта раскроя. Проёмы учтены в заданной площади, не в карте резов.</p>
        <div className="form-grid two">
          <SelectField label="Сорт липы" value={stock.grade||'a'} options={[{value:'a',label:'А'},{value:'extra',label:'Экстра'}]} onChange={grade=>stockUpdate({grade,length:null})}/>
          <NumberField label="Рабочая ширина вагонки" suffix="мм" value={stock.workingWidth??0} onChange={workingWidth=>stockUpdate({workingWidth})}/>
          <NumberField label="Длина одинакового отрезка" suffix="м" step={.1} value={stock.cutLength??0} onChange={cutLength=>stockUpdate({cutLength})}/>
          <NumberField label="Пропил вагонки" suffix="мм" value={stock.kerf??0} onChange={kerf=>stockUpdate({kerf})}/>
        </div>
        <p><a href={SAUNA_SOURCES.lining} target="_blank" rel="noreferrer">Прайс Липа-Осина</a> · сверка 29.09.2026 · цены ниже закупочные, до наценки. Выбор длины явно заменяет цену упаковки этой комнаты.</p>
        {!options.length?<p className="assembly-warning">Укажите ширину и отрезок до 3 м. Вагонка пока НЕ включена в итог.</p>:<div className="form-grid two">{options.map(o=><button type="button" key={o.length} aria-pressed={Number(stock.length)===o.length} onClick={()=>update({liningStock:{...stock,length:o.length},prices:{...s.prices,liningPack:o.price}})}>{o.length} м · {o.packs} упак × {o.price} ₽ · остаток {o.waste.toFixed(2)} пог. м{Number(stock.length)===o.length?' · выбрано':''}</button>)}</div>}
        {options.length&&!options.some(o=>o.length===Number(stock.length))?<p className="assembly-warning">Выберите подходящую длину — вагонка пока не учтена.</p>:null}
      </>:null}
      <h4>Каркас, утеплитель и фольга</h4>
      <SelectField label="Расчёт каркаса и утеплителя" value={s.frameMode||'manual'} options={[{value:'manual',label:'Ручные количества по спецификации'},{value:'area',label:'По площади и заданным параметрам узла'}]} onChange={frameMode=>update({frameMode})}/>
      {s.frameMode==='area'?<><div className="form-grid two">
        <NumberField label="Толщина утеплителя парной" suffix="мм" value={s.insulationThickness??0} onChange={insulationThickness=>update({insulationThickness})}/>
        <NumberField label="Шаг основного каркаса парной" suffix="м" step={.05} value={s.battenStep??0} onChange={battenStep=>update({battenStep})}/>
        <NumberField label="Шаг контррейки парной" suffix="м" step={.05} value={s.counterStep??0} onChange={counterStep=>update({counterStep})}/>
      </div><p>Объём = площадь × толщина; погонные метры = площадь / шаг, с запасом проекта. Это площадная оценка, без обрамления проёмов и закладных. Нулевой параметр исключает материал. Сечение, тип утеплителя, вентзазор и узел SIP подтвердите проектом; непроверенные монтажные нормы не подставляются.</p></>:null}
      <p>Фольга — по площади стен и потолка с запасом. Лента, скобы, крепёж, погонаж, термопровод, лампа и вентиляция задаются ниже отдельно. Нулевые количества не входят в смету.</p>
      <Toggle label="Закупать фольгу и ленту рулонами, каркас хлыстами 3 м" checked={s.stockMaterials===true} onChange={stockMaterials=>update({stockMaterials})}/>
      {s.stockMaterials?<><p>Вместо дробных м²/метров: фольга 80 мкм по 10 м², лента по 30 м, брусок 50×50 и контррейка 20×40 по 3 м. Количество округляется вверх. Профили и пригодность материалов подтвердите рабочим узлом.</p>
        <button type="button" disabled={Boolean(project.sharedPriceCatalog)} onClick={()=>update({prices:{...s.prices,foilRoll:2100,tapeRoll:300,battenStock:280,counterStock:110}})}>Применить закупочные цены: 2 100 / 300 / 280 / 110 ₽</button>
        <p><a href="https://lipa-osina.ru/category/aksessuary-dlya-bani/folga/" target="_blank" rel="noreferrer">Фольга и лента</a> · <a href="https://lipa-osina.ru/category/brusok-khvoya-strogannyy/" target="_blank" rel="noreferrer">Брусок и рейка</a> · 29.09.2026. Утеплитель — отдельная проектная позиция, не огнезащита дымохода.</p></>:null}
      <button type="button" disabled={Boolean(project.sharedPriceCatalog)} onClick={()=>update({prices:{...s.prices,plinth:100,cornice:100,corner:170,casing:170}})}>Применить цены погонажа липы: 100 / 100 / 170 / 170 ₽ за м</button>
      <p><a href={SAUNA_SOURCES.trim} target="_blank" rel="noreferrer">Источник погонажа</a> · 29.09.2026. Кнопка заменяет только четыре проектные цены, количества остаются ручными.</p>
      <h4>Печь Везувий Скиф Ковка 16 Панорама М</h4>
      <p>Цена производителя 42 010 ₽ → 52 512,50 ₽ при +25%; доставка сверху 7 000 ₽. Выход Ø115 мм, заявленный объём 8–18 м³. Это вариант выбора, а не автоматическое подтверждение мощности и защиты.</p>
      <button type="button" onClick={()=>update({heaterType:'wood',heaterModel:'Везувий Скиф Ковка 16 Панорама М',prices:{...s.prices,heater:42010}})}>Выбрать Скиф 16 и цену 42 010 ₽</button>
      <p><a href={SAUNA_SOURCES.heater} target="_blank" rel="noreferrer">Карточка и паспорт производителя</a> · 29.09.2026. Камни и защита — отдельные количества.</p>
      {s.heaterType==='wood'?<>
        <h4>Дымоход · предварительная комплектация</h4>
        <SelectField label="Расчёт дымохода" value={s.chimneyMode||'kit'} options={[...(s.autoEstimate?[{value:'auto',label:'Автоматически · бюджетная длина по дому'}]:[]),{value:'kit',label:'Готовый комплект · ручное количество'},{value:'parts',label:'Прямой вертикальный Ø115/200 · по деталям'}]} onChange={chimneyMode=>update({chimneyMode,...(chimneyMode==='parts'?{chimneyDimensions:{...c}}:{})})}/>
        {['parts','auto'].includes(s.chimneyMode)?<>
          {s.chimneyMode==='auto'?<p>Ниже показаны автоматически вычисленные отметки. Ручная правка фиксирует только изменённое поле; остальные продолжают следовать плану. {Object.keys(s.chimneyOverrides||{}).length?`Ручных полей: ${Object.keys(s.chimneyOverrides).length}.`:''} <button type="button" onClick={()=>update({chimneyOverrides:{}})}>Вернуть дымоход к автоматическому расчёту</button></p>:null}
          <p>Обычная труба → шибер → старт-сэндвич → сэндвич. Подбор серии Везувий BLACK — кандидат для проверки монтажником. Прежний комплект дымохода исключается, чтобы не было двойного счёта. Для бокового выхода, отводов и тройников используйте согласованный комплект.</p>
          <div className="form-grid two">{[
            ['ceilingHeight','От пола печи до потолка','м'],['roofRise','От потолка до кровли в точке выхода','м'],['aboveRoof','Возвышение трубы над кровлей по проекту','м'],['inletHeight','От пола до патрубка печи','м'],['singleEffective','Монтажная длина трубы L1 м','м'],['sandwichEffective','Монтажная длина сэндвича L0,5 м','м'],['fittingsEffective','Суммарная монтажная длина шибера и старта','м'],['passages','Количество проходов перекрытий','шт'],
          ].map(([key,label,unit])=><NumberField key={key} label={label} suffix={unit} step={unit==='шт'?1:.01} value={c[key]??0} onChange={value=>chimneyUpdate({[key]:value})}/>)}</div>
          <button type="button" onClick={()=>chimneyUpdate({ceilingHeight:(room.floor===1?project.plan:project.upperFloors?.[room.floor-2])?.wallHeight??0})}>Взять высоту потолка из плана</button>
          <p>Все отметки отсчитываются от чистого пола помещения с печью. Проверьте кровлю в точке трубы и монтажные длины после стыковки: габаритная длина модуля не равна монтажной. Высота конька проекта: {positive(project.settings.roof?.ridgeHeight).toFixed(2)} м над опорой, это не автоматически высота кровли в точке выхода.</p>
          {schedule.valid?<p className="assembly-info">От патрубка до устья требуется {schedule.length.toFixed(2)} м; набрано {schedule.purchased.toFixed(2)} м. Сэндвич-модулей: {schedule.quantities.chimneySandwich} шт.</p>:<p className="assembly-warning">Дымоход пока НЕ включён: не хватает корректных размеров.</p>}
          {schedule.warnings.map(w=><p className="assembly-warning" key={w}>{w}</p>)}
          {!positive(c.passages)?<p className="assembly-warning">Проходы перекрытий не учтены. Укажите их количество.</p>:null}
          <button type="button" disabled={Boolean(project.sharedPriceCatalog)} onClick={()=>update({prices:{...s.prices,chimneySingle:2729,chimneyDamper:1522,chimneySandwich:2713}})}>Применить цены Везувий: труба 2 729 ₽, шибер 1 522 ₽, сэндвич 2 713 ₽</button>
          <p><a href={SAUNA_SOURCES.single} target="_blank" rel="noreferrer">Труба и шибер Ø115</a> · <a href={SAUNA_SOURCES.sandwich} target="_blank" rel="noreferrer">Сэндвич Ø115/200</a> · <a href={SAUNA_SOURCES.chimney} target="_blank" rel="noreferrer">Инструкция</a>. Цены на 29.09.2026; остальные цены запросить. Рабочие узлы проходок, противопожарные отступы и опоры обязательны; калькулятор не разрешает монтаж.</p>
        </>:null}
      </>:null}
    </>:<p>Подробный вариант добавляет ставки работ, отдельную доставку и наценку только после включения. Старая комплектация сохранена.</p>}
  </>;
}
