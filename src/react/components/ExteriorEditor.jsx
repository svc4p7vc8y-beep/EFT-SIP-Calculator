import { EXTERIOR_TYPES, normalizeExterior } from '../calculations/exterior-model.js';
import { NumberField, SelectField, Stat, Toggle } from './ui.jsx';
import { formatNumber } from '../utils/format.js';

const TRIMS = [['outerCornerLength','Наружные углы'],['innerCornerLength','Внутренние углы'],['openingTrimLength','Обрамления окон и дверей'],['sillLength','Оконные отливы'],['startLength','Стартовая планка'],['finishLength','Финишная планка'],['jointLength','Соединительные планки']];
export function ExteriorEditor({ project, calculation, commit }) {
  const s = normalizeExterior(project.settings.external), result = calculation.exterior;
  const set = (key, value) => commit(next => {
    next.settings.external[key] = value;
    if(key === 'facadeArea') next.settings.links.externalFinishFromPlan = false;
    return next;
  });
  const setAuto = (key, enabled) => commit(next => {
    if(!enabled && key === 'trimAuto') Object.assign(next.settings.external, result.trim);
    if(!enabled && key === 'soffitAuto') Object.assign(next.settings.external, {soffitArea:result.soffitArea,soffitTrimLength:result.soffitTrimLength});
    next.settings.external[key] = enabled;
    return next;
  });
  const number = (key,label,suffix,step=.1) => <NumberField key={key} label={label} value={s[key]} suffix={suffix} min={0} step={step} onChange={value=>set(key,value)} />;
  const toggle = (key,label) => <Toggle key={key} label={label} checked={Boolean(s[key])} onChange={value=>set(key,value)} />;
  return <div className="exterior-editor">
    <Toggle label="Включить наружную отделку в смету" checked={project.services.externalFinish} onChange={value=>commit(next=>{next.services.externalFinish=value;return next;})}/>
    {s.assemblyVersion === 0 ? <>
      <p>Сохранён прежний расчёт фасада. Новая комплектация добавит ранее не учтённые материалы и работы и изменит итог.</p>
      <button className="button primary" onClick={()=>set('assemblyVersion',1)}>Перейти на полный расчёт фасада</button>
      <div className="form-grid">{[['facadeArea','Фасад'],['windArea','Ветрозащита'],['insulationArea','Утепление'],['metalArea','Профлист'],['soffitArea','Подшива']].map(([key,label])=><NumberField key={key} label={label} value={calculation.inputs.external[key]} suffix="м²" onChange={value=>commit(next=>{Object.assign(next.settings.external,calculation.inputs.external,{[key]:value});next.settings.links.externalFinishFromPlan=false;return next;})}/>)}</div>
    </> : <>
      <div className="form-grid">
        <SelectField label="Материал фасада" value={s.cladding} options={[...EXTERIOR_TYPES,{value:'combined',label:'Комбинированная отделка'}]} onChange={value=>set('cladding',value)}/>
        <NumberField label="Площадь отделки стен" value={result.area} suffix="м²" onChange={value=>set('facadeArea',value)}/>
        {number('reserve','Запас материалов','%',1)}
      </div>
      <Toggle label="Площадь стен из плана (оба этажа, за вычетом проёмов)" checked={calculation.inputs.links.externalFinishFromPlan} onChange={value=>commit(next=>{if(!value)next.settings.external.facadeArea=result.area;next.settings.links.externalFinishFromPlan=value;return next;})}/>
      <p className="exterior-note">Фронтоны и их покрытие остаются в «Кровле». Цоколь считается отдельно ниже и не добавляется к площади фасада.</p>
      {s.cladding === 'combined' ? <div className="form-grid">{EXTERIOR_TYPES.map(type=><NumberField key={type.value} label={type.label} value={s.shares[type.value]} suffix="%" min={0} max={100} step={1} onChange={value=>set('shares',{...s.shares,[type.value]:value})}/>)}</div> : null}
      <div className="exterior-area-summary">{EXTERIOR_TYPES.filter(type=>result.areas[type.value]>0).map(type=><Stat key={type.value} label={type.label} value={`${formatNumber(result.areas[type.value])} м²`}/>)}</div>
      {project.services.externalFinish && result.warnings.length ? <div className="exterior-warnings" role="status">{result.warnings.map(warning=><p key={warning}>{warning}</p>)}</div> : null}
      <section className="exterior-block"><h3>Утепление и основание</h3>
        <div className="form-grid">{toggle('insulationEnabled','Минеральная вата 50 мм + каркас 50×50')}{toggle('windEnabled','Паропроницаемая ветровлагозащита')}{toggle('counterEnabled','Вентиляционная контробрешётка 50×50')}{toggle('ventilationMesh','Защитная сетка вентиляционного зазора')}</div>
        <SelectField label="Поперечная обрешётка 100×25" value={s.crossBattens} options={[{value:'auto',label:'Автоматически под профлист'},{value:'on',label:'По всей площади'},{value:'off',label:'Не учитывать'}]} onChange={value=>set('crossBattens',value)}/>
        <div className="exterior-layers" aria-label="Слои фасада"><span>Стена SIP</span>{s.insulationEnabled ? <span>Каркас + минвата 50 мм</span> : null}{s.windEnabled ? <span>Ветровлагозащита</span>:null}{s.counterEnabled ? <span>Вентзазор 50 мм</span>:null}{(s.crossBattens==='on'||(s.crossBattens==='auto'&&result.areas.metal>0))?<span>Поперечная обрешётка</span>:null}{result.areas.bitumen>0?<span>ОСП 12 мм под плитку</span>:null}<span>Облицовка</span></div>
        <p className="exterior-note">Пароизоляция — не наружная ветровлагозащита и сюда автоматически не добавляется. Для HAUBERK включены отдельное основание ОСП и его крепёж. Узлы, пожарные требования и пригодность системы для конкретной стены проверяются проектом.</p>
      </section>
      {result.areas.wood>0 ? <section className="exterior-block"><h3>Имитация бруса и покраска</h3>{toggle('painting','Грунт и покраска имитации бруса')}
        <div className="form-grid">{number('woodThickness','Толщина доски','мм',1)}{number('woodWidth','Полная ширина','мм',1)}{number('woodWorkingWidth','Рабочая ширина без шипа','мм',1)}{number('woodLength','Длина доски','м',.1)}{number('paintCoats','Слоёв краски','слоя',1)}</div>
        <p className="exterior-note">Цена за м³ — из позиции «Имитация бруса 16×145×6000». Для другого профиля уточните цену. Рабочая ширина 135 мм предварительная: проверьте по выбранной доске.</p>
      </section>:null}
      <section className="exterior-block"><h3>Углы, окна и доборы</h3>
        {toggle('trimsEnabled','Учитывать углы, планки и отливы')}
        <Toggle label="Длины из плана" checked={s.trimAuto} onChange={value=>setAuto('trimAuto',value)}/>
        <SelectField label="Материал доборов" value={s.trimMaterial} options={[{value:'auto',label:'По материалу облицовки'},{value:'PVC',label:'ПВХ'},{value:'WOOD',label:'Дерево'},{value:'METAL',label:'Окрашенный металл'},{value:'BITUMEN',label:'Металл с гранулятом'}]} onChange={value=>set('trimMaterial',value)}/>
        <div className="form-grid">{TRIMS.map(([key,label])=><NumberField key={key} label={label} suffix="м" value={result.trim[key]} onChange={value=>commit(next=>{Object.assign(next.settings.external,result.trim,{trimAuto:false,[key]:value});return next;})}/>)}</div>
        <p className="exterior-note">Окна: верх и два откоса + отдельный отлив. Двери и ворота: верх и два откоса, без нижней планки. Для комбинации автоматические доборы распределяются по долям площадей — уточните стыки вручную. Закупка планок округляется до 3 м для ПВХ и 2 м для остальных.</p>
      </section>
      <section className="exterior-block"><h3>Подшивка свесов</h3>{toggle('soffitEnabled','Включить подшивку кровли')}
        {s.soffitEnabled?<><SelectField label="Материал подшивки" value={s.soffitType} options={[{value:'soffit',label:'Перфорированный софит'},{value:'wood',label:'Имитация бруса с вентиляцией'},{value:'metal',label:'Профлист с вентиляцией'}]} onChange={value=>set('soffitType',value)}/>
        <Toggle label="Размеры подшивки из основной крыши" checked={s.soffitAuto} onChange={value=>setAuto('soffitAuto',value)}/>
        <div className="form-grid"><NumberField label="Площадь подшивки" value={result.soffitArea} suffix="м²" onChange={value=>commit(next=>{Object.assign(next.settings.external,{soffitAuto:false,soffitArea:value,soffitTrimLength:result.soffitTrimLength});return next;})}/><NumberField label="Примыкания подшивки" value={result.soffitTrimLength} suffix="м" onChange={value=>commit(next=>{Object.assign(next.settings.external,{soffitAuto:false,soffitArea:result.soffitArea,soffitTrimLength:value});return next;})}/></div>
        {s.soffitType==='wood'?toggle('soffitPaint','Грунт и покраска подшивки'):null}
        <p className="exterior-note">Горизонтальная проекция свесов, без коэффициента уклона кровли. Включены каркас, крепёж, профили примыкания и монтаж. Подшивку террасы/крыльца добавьте к ручной площади. Карнизные и торцевые кровельные планки здесь повторно не считаются.</p></>:null}
      </section>
      <section className="exterior-block"><h3>Наружное освещение и розетки</h3>{toggle('outdoorEnabled','Включить наружную электрику')}
        {s.outdoorEnabled?<><div className="form-grid">{number('lights','Уличные светильники IP65','шт',1)}{number('sockets','Наружные розетки IP65','шт',1)}{number('lightingLine','Линия освещения','м',1)}{number('socketLine','Линия розеток','м',1)}{number('boxes','Распределительные коробки IP65','шт',1)}{number('circuits','Отдельные защищённые группы','шт',1)}</div>
        <p className="exterior-note">Отдельные наружные линии: не повторяйте их в «Инженерии». В расчёт входят кабель, УФ-стойкая защитная труба, клипсы, площадки и монтаж. Сечение, защиту, заземление и допустимость прокладки по фасаду подтверждает электропроект; указанные комплектующие — для предварительной сметы.</p></>:null}
      </section>
      <details className="exterior-block"><summary>Нормы расхода, формулы и источники</summary>
        <p>Предварительная комплектация, не монтажный проект. Все коэффициенты ниже — редактируемые бюджетные настройки ЭФТ, не утверждённые нормы из книги.</p>
        <div className="form-grid">{number('insulationSpacing','Шаг каркаса утепления','м',.05)}{number('battenSpacing','Шаг обрешётки/контробрешётки','м',.05)}{number('membraneRollArea','Площадь рулона мембраны','м²',1)}{number('insulationPackageVolume','Объём упаковки утеплителя','м³',.01)}{number('sidingPanelArea','Рабочая площадь панели сайдинга','м²',.01)}{number('brickPanelArea','Рабочая площадь панели под кирпич','м²',.01)}{number('bitumenPackageArea','Плитка в упаковке','м²',.1)}{number('fastenersPerM2','Крепёж каждого основания/облицовки','шт/м²',1)}{number('bitumenNailsPerM2','Гвозди фасадной плитки','шт/м²',1)}{number('tapePerM2','Лента стыков мембраны','м/м²',.1)}{number('paintConsumption','Расход краски на слой','л/м²',.01)}{number('primerConsumption','Расход грунта','л/м²',.01)}</div>
        <ul><li>Материалы: площадь × (1 + запас / 100), затем округление до панели/упаковки. Работы — по чистой площади без запаса.</li><li>Каркас: площадь / шаг; к контробрешётке добавлены рамки проёмов. Пиломатериал основания округляется вверх до досок 6 м.</li><li>Имитация: округление вверх площади / (рабочая ширина × длина) → число досок × полный объём доски.</li><li>Грунт: площадь × расход. Краска: площадь × расход × слои. Клипсы наружной трубы: одна на 0,5 м с запасом.</li><li>Новые цены в прайсе отмечены «ориентировочно». Общий прайс и проектные правки ведомости остаются раздельными.</li></ul>
        <p><a href="https://www.docke.ru/info/pdf/instructions/siding/" target="_blank" rel="noreferrer">Инструкция Döcke: обрешётка и вентиляция</a> · <a href="https://www.tn.ru/journal/archive/dlya-doma-i-kvartiry/instruktsii-i-rukovodstva/montazh-fasadnoy-plitki-tekhnonikol-hauberk-na-domakh-iz-sip-paneley/" target="_blank" rel="noreferrer">HAUBERK на SIP: требования к основанию</a></p>
        {toggle('accessEnabled','Включить предварительную стоимость лесов/вышки')}
      </details>
    </>}
    <section className="exterior-block"><h3>Отделка цоколя</h3>
      {toggle('plinthEnabled','Включить отделку цоколя')}
      {s.plinthEnabled ? <>
        <Toggle label="Периметр цоколя из контура первого этажа" checked={s.plinthAuto} onChange={value=>commit(next=>{if(!value)next.settings.external.plinthPerimeter=result.plinthPerimeter;next.settings.external.plinthAuto=value;return next;})}/>
        <div className="form-grid">
          <NumberField label="Периметр цоколя" value={result.plinthPerimeter} suffix="м" min={0} onChange={value=>commit(next=>{Object.assign(next.settings.external,{plinthAuto:false,plinthPerimeter:value});return next;})}/>
          {number('plinthHeight','Высота облицовки цоколя','м',.05)}
          <SelectField label="Материал цоколя" value={s.plinthMaterial} options={[{value:'metal',label:'Профлист С-21'},{value:'brick',label:'Пластиковые панели под кирпич'}]} onChange={value=>set('plinthMaterial',value)}/>
          {number('plinthRows','Горизонтальных рядов трубы 50×25×2','ряда',1)}
          {number('plinthVerticalLength','Дополнительные вертикальные стойки из трубы','м',.1)}
          {number('plinthExtraPiles','Дополнительные сваи сверх свайного поля','шт',1)}
        </div>
        <div className="exterior-area-summary"><Stat label="Площадь цоколя" value={`${formatNumber(result.plinthArea)} м²`}/><Stat label="Труба к закупке" value={`${formatNumber(result.plinthTubePurchase)} м · ${result.plinthTubePurchase/6} шт × 6 м`}/><Stat label="Сваи существующего поля" value={`${calculation.foundation.totalPiles} шт · без повторной закупки`}/></div>
        {toggle('plinthTrims','Углы, стартовый профиль и верхний отлив цоколя')}
        {toggle('plinthCoating','Антикоррозионная защита трубы и соединений')}
        <p className="exterior-note">Площадь = периметр × высота. Труба = периметр × число рядов + стойки; с общим запасом материалов и округлением до 6 м. Базовые 2 ряда — предварительная настройка, не проектный узел. Для выбранных панелей уточните расположение опор и дополнительные стойки. Сваи из поля повторно не считаются; ручные дополнительные сваи 108×2500 входят только в эту ведомость и не дорисовываются на плане.</p>
        <p className="exterior-note">Цоколь — навесной экран, не подпорная стенка. Предусмотрите вентиляцию подполья и зазор до грунта с учётом пучения. Высота здесь — высота облицовки, без этого зазора. Обработку соединений и способ крепления трубы подтвердите проектом.</p>
        <details><summary>Цены и источник комплектации цоколя</summary><p>Новые ориентиры: труба 115 ₽/м; монтаж 300 ₽/м; антикоррозионные материалы 25 ₽/м и обработка 75 ₽/м. Цены меняются в прайсе или только в ведомости проекта. Для другой толщины трубы замените позицию в ведомости.</p><a href="https://gostmetal.ru/truba-profilnaya/pryamougolnaya/50-25-2/" target="_blank" rel="noreferrer">Труба 50×25×2 · источник цены</a> · <a href="https://www.docke.ru/info/pdf/instructions/face_panel/" target="_blank" rel="noreferrer">Требования производителя панелей к основанию</a></details>
      </> : null}
    </section>
  </div>;
}
