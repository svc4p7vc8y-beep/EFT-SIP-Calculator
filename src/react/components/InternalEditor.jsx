import { useEffect, useMemo, useState } from 'react';
import { Brush, Building2, CheckCircle2, Droplets, Layers3 } from 'lucide-react';
import { DEFAULT_INTERNAL, inferInternalPreset, internalRoomKey, interiorOpeningSlopeLengths } from '../calculations/internal-model.js';
import { NumberField, SelectField, Stat, Toggle } from './ui.jsx';
import { formatNumber } from '../utils/format.js';
import { SaunaEditor } from './SaunaEditor.jsx';
import { RoomDrainEditor } from './RoomDrainEditor.jsx';

const FLOOR=[{value:'none',label:'Без чистового пола'},{value:'laminate',label:'Ламинат'},{value:'tile',label:'Плитка / керамогранит'}];
const SUBSTRATE=[{value:'none',label:'Без дополнительного основания'},{value:'osb12',label:'OSB-3 12 мм'},{value:'gvl12',label:'ГВЛВ 12,5 мм · 1 слой (проектное решение)'},{value:'gvl20',label:'Элемент пола ГВЛВ 20 мм'},{value:'gvl-double',label:'ГВЛВ 12,5 мм · 2 слоя'}];
const WALL=[{value:'none',label:'Без чистовой отделки'},{value:'timber',label:'Имитация бруса'},{value:'drywall',label:'Гипсокартон / ГВЛ'}];
const FRAME=[{value:'direct',label:'Непосредственно на SIP'},{value:'wood25',label:'Брусок 25×50 мм'},{value:'wood50',label:'Брусок 50×50 мм'},{value:'metal',label:'Металлический каркас ПП 60×27'}];
const BOARD=[{value:'standard',label:'ГКЛ 12,5 мм'},{value:'moisture',label:'ГКЛВ 12,5 мм'},{value:'fire',label:'ГКЛО 12,5 мм'},{value:'gvl',label:'ГВЛВ 12,5 мм'}];
const FINAL=[{value:'none',label:'Только заделка швов Q2'},{value:'paint',label:'Подготовка Q3/Q4 + покраска'},{value:'wallpaper',label:'Подготовка + обои'},{value:'tile',label:'Плитка по стенам'}];
const CEILING=[{value:'none',label:'Без потолка / второй свет'},{value:'timber',label:'Имитация бруса'},{value:'stretch',label:'Натяжной потолок'}];
const CEILING_FRAME=FRAME.filter(item=>item.value!=='metal');
const STRETCH=[{value:'pvc',label:'ПВХ-полотно'},{value:'fabric',label:'Тканевое полотно'}];

function DoorFinishingPanel({project,calculation,commit,detailed,onNavigate}) {
  const settings=project.settings.internal;
  const linked=calculation.inputs.links.internalFinishFromPlan;
  const doors=calculation.inputs.internal.doors;
  const slopes=interiorOpeningSlopeLengths(project);
  const update=(key,value)=>commit(next=>{next.settings.internal={...DEFAULT_INTERNAL,...next.settings.internal,[key]:value};return next;});
  const setLinked=value=>commit(next=>{if(!value)next.settings.internal.doors=doors;next.settings.links.internalFinishFromPlan=value;return next;});
  return <section className="internal-door-panel" aria-label="Межкомнатные двери и откосы">
    <h3>Межкомнатные двери и откосы</h3>
    <div className="internal-door-summary"><Stat label="Межкомнатные двери" value={`${doors} шт`}/>{detailed?<><Stat label="Откосы входных дверей" value={`${formatNumber(slopes.entranceDoors)} м`}/><Stat label="Откосы окон" value={`${formatNumber(slopes.windows)} м`}/></>:null}</div>
    <Toggle label="Количество межкомнатных дверей из плана" checked={linked} onChange={setLinked}/>
    {!linked?<NumberField label="Межкомнатные двери вручную" value={settings.doors} suffix="шт" min={0} step={1} onChange={value=>update('doors',value)}/>:null}
    {doors===0&&linked?<p>На плане нет межкомнатных дверей, включённых в смету. Добавьте их инструментом «Дверь / ворота» на внутренней стене.</p>:null}
    {onNavigate?<button className="button secondary" type="button" onClick={()=>onNavigate('plan')}>Открыть план дома</button>:null}
    <p>Комплект межкомнатной двери уже содержит добор и замок; установка, крепёж и пена считаются во внутренней отделке, если раздел включён.</p>
    {detailed?<>
      <div className="internal-door-options">
        <Toggle label="Пороги межкомнатных дверей" checked={settings.includeThresholds!==false} onChange={value=>update('includeThresholds',value)}/>
        <Toggle label="Откосы окон и входных дверей" checked={settings.includeSlopes!==false} onChange={value=>update('includeSlopes',value)}/>
        <Toggle label="Дополнительная отделка откосов межкомнатных дверей" checked={settings.includeInteriorDoorSlopes===true} onChange={value=>update('includeInteriorDoorSlopes',value)}/>
      </div>
      <NumberField label="Глубина отделываемых откосов" value={settings.slopeDepth} suffix="м" min={.05} step={.01} onChange={value=>update('slopeDepth',value)}/>
      <p>Входная дверь: верх и две боковые стороны, {formatNumber(slopes.entranceDoors)} пог. м по плану. Межкомнатные проёмы с доборами не включаются в эту строку. Их отдельная отделка добавляется только по переключателю, если добор не закрывает проём.</p>
    </>:null}
  </section>;
}

export function InternalEditor({project,calculation,commit,onNavigate}) {
  const detailed=project.settings.internal?.assemblyVersion===1&&project.settings.internal?.mode!=='legacy';
  const rooms=calculation.internal?.rooms||[];
  const [selectedKey,setSelectedKey]=useState('');
  useEffect(()=>{if(!rooms.length)return;if(!rooms.some(room=>internalRoomKey(room.floor,room.id)===selectedKey))setSelectedKey(internalRoomKey(rooms[0].floor,rooms[0].id));},[rooms,selectedKey]);
  const room=useMemo(()=>rooms.find(item=>internalRoomKey(item.floor,item.id)===selectedKey)||rooms[0],[rooms,selectedKey]);
  const stored=room?project.settings.internal.roomFinishes?.[internalRoomKey(room.floor,room.id)]:null;
  const values=room?{...inferInternalPreset(room.name),...(stored||{})}:null;
  const updateGlobal=(key,value)=>commit(next=>{next.settings.internal={...DEFAULT_INTERNAL,...next.settings.internal,[key]:value};return next;});
  const updateRoom=(changes)=>{if(!room)return;commit(next=>{const settings={...DEFAULT_INTERNAL,...next.settings.internal};const key=internalRoomKey(room.floor,room.id);settings.roomFinishes={...(settings.roomFinishes||{}),[key]:{...inferInternalPreset(room.name),...(settings.roomFinishes?.[key]||{}),...changes}};next.settings.internal=settings;return next;});};
  const resetRoom=()=>{if(!room)return;commit(next=>{const key=internalRoomKey(room.floor,room.id);const finishes={...(next.settings.internal.roomFinishes||{})};delete finishes[key];next.settings.internal.roomFinishes=finishes;return next;});};
  if(!detailed)return <><DoorFinishingPanel project={project} calculation={calculation} commit={commit} detailed={false} onNavigate={onNavigate}/><div className="internal-upgrade"><Layers3/><div><strong>Сохранён прежний расчёт внутренней отделки</strong><p>Он оставлен без изменений, чтобы старая смета не подорожала автоматически. Перейдите на расчёт по помещениям — будут учтены основания пола, каркасы, гидроизоляция, плинтусы и потолочные узлы.</p></div><button className="button primary" onClick={()=>commit(next=>{next.settings.internal={...DEFAULT_INTERNAL,...next.settings.internal,assemblyVersion:1,mode:'rooms',roomFinishes:{}};return next;})}>Перейти на подробный расчёт</button></div></>;
  return <div className="internal-editor">
    <section className="internal-overview">
      <Stat label="Полы" value={`${formatNumber(calculation.internal?.totals.floorArea||0)} м²`}/><Stat label="Стены" value={`${formatNumber(calculation.internal?.totals.wallArea||0)} м²`}/><Stat label="Потолки" value={`${formatNumber(calculation.internal?.totals.ceilingArea||0)} м²`}/><Stat label="Помещения" value={`${rooms.length} шт`}/>
    </section>
    <DoorFinishingPanel project={project} calculation={calculation} commit={commit} detailed onNavigate={onNavigate}/>
    <details className="internal-global"><summary>Общие нормы и округление</summary><div className="form-grid four"><NumberField label="Запас материалов" value={(project.settings.internal.reserve||1.1)*100-100} suffix="%" step={1} onChange={value=>updateGlobal('reserve',1+value/100)}/><NumberField label="Шаг обрешётки" value={project.settings.internal.battenStep} suffix="м" step={.05} min={.2} onChange={value=>updateGlobal('battenStep',value)}/><NumberField label="Расход краски на слой" value={project.settings.internal.paintConsumption} suffix="л/м²" step={.01} onChange={value=>updateGlobal('paintConsumption',value)}/><NumberField label="Плиточный клей" value={project.settings.internal.tileGlueConsumption} suffix="кг/м²" step={.1} onChange={value=>updateGlobal('tileGlueConsumption',value)}/><NumberField label="Минимум натяжного потолка" value={project.settings.internal.stretchMinimumArea} suffix="м²/комната" step={1} onChange={value=>updateGlobal('stretchMinimumArea',value)}/></div><div className="internal-toggle-grid"><Toggle label="Подготовка основания пола" checked={project.settings.internal.includePreparation!==false} onChange={value=>updateGlobal('includePreparation',value)}/></div><p>Листовые материалы округляются вверх. Брусок округляется до закупки шестиметровыми хлыстами. Нормы остаются редактируемыми для конкретного проекта.</p></details>
    <div className="internal-workspace">
      <nav className="internal-room-list" aria-label="Помещения внутренней отделки">{rooms.map(item=>{const key=internalRoomKey(item.floor,item.id);const itemSettings=item.settings;return <button key={key} className={key===selectedKey?'active':''} onClick={()=>setSelectedKey(key)}><span><Building2/> {item.floor} этаж</span><strong>{item.name}</strong><small>{formatNumber(item.area)} м² · {itemSettings.floorFinish==='tile'?'плитка':itemSettings.floorFinish==='laminate'?'ламинат':'без пола'}</small></button>;})}</nav>
      {room&&values?<section className="internal-room-card">
        <header><div><span>{room.floor} этаж</span><h3>{room.name}</h3><p>Пол {formatNumber(room.area)} м² · стены {formatNumber(room.wallArea)} м² · потолок {formatNumber(room.ceilingArea)} м²</p></div><button className="button secondary" onClick={resetRoom}>Вернуть шаблон помещения</button></header>
        <Toggle label="Учитывать отделку этого помещения" checked={values.enabled!==false} onChange={value=>updateRoom({enabled:value})}/>
        <div className={`internal-assembly-grid ${values.sauna?.enabled?'sauna-active':''}`}>
          <fieldset><legend><Layers3/> Пол</legend><SelectField label="Чистовое покрытие" value={values.floorFinish} options={FLOOR} onChange={value=>updateRoom({floorFinish:value,floorSubstrate:value==='tile'&&values.floorSubstrate==='osb12'?'gvl20':values.floorSubstrate})}/><SelectField label="Основание" value={values.floorSubstrate} options={SUBSTRATE} onChange={value=>updateRoom({floorSubstrate:value})}/><Toggle label="Плинтус" checked={values.skirting} onChange={value=>updateRoom({skirting:value})}/><Toggle label="Влажная зона" checked={values.wetZone} onChange={value=>updateRoom({wetZone:value,waterproofFloor:value||values.waterproofFloor})}/>{values.floorFinish==='tile'?<Toggle label="Гидроизоляция пола" checked={values.waterproofFloor} onChange={value=>updateRoom({waterproofFloor:value})}/>:null}<Toggle label="Тёплый пол (передать в инженерию)" checked={values.heatedFloor} onChange={value=>updateRoom({heatedFloor:value})}/><NumberField label="Площадь вручную" value={values.floorArea??room.area} suffix="м²" onChange={value=>updateRoom({floorArea:value})}/>{values.heatedFloor?<p className="assembly-info">Комплектация тёплого пола не задваивается здесь и добавляется в инженерные системы.</p>:null}{values.floorSubstrate==='gvl12'?<p className="assembly-warning">Один слой ГВЛВ 12,5 мм — проектное решение. Для жёсткости основания плитки проверьте допустимость по конструктиву пола.</p>:null}</fieldset>
          <fieldset><legend><Brush/> Стены</legend><SelectField label="Отделка" value={values.wallsFinish} options={WALL} onChange={value=>updateRoom({wallsFinish:value})}/>{values.wallsFinish!=='none'?<SelectField label="Основание / каркас" value={values.wallFrame} options={values.wallsFinish==='timber'?FRAME.filter(item=>item.value!=='metal'):FRAME} onChange={value=>updateRoom({wallFrame:value})}/>:null}{values.wallsFinish==='drywall'?<><SelectField label="Лист" value={values.drywallType} options={BOARD} onChange={value=>updateRoom({drywallType:value})}/><NumberField label="Количество слоёв" value={values.drywallLayers} suffix="слой" step={1} min={1} max={2} onChange={value=>updateRoom({drywallLayers:value})}/><SelectField label="Финиш" value={values.wallFinal} options={FINAL} onChange={value=>updateRoom({wallFinal:value})}/>{values.wallFinal==='paint'?<NumberField label="Слоёв краски" value={values.wallPaintCoats||2} suffix="слой" step={1} min={1} onChange={value=>updateRoom({wallPaintCoats:value})}/>:null}{values.wallFinal==='tile'?<NumberField label="Доля стен под плитку" value={(values.waterproofWallShare||1)*100} suffix="%" step={5} min={5} max={100} onChange={value=>updateRoom({waterproofWallShare:value/100})}/>:null}</>:null}{values.wallsFinish==='timber'?<NumberField label="Слоёв краски" value={values.timberPaintCoats} suffix="слой" step={1} min={0} max={3} onChange={value=>updateRoom({timberPaintCoats:value})}/>:null}<Toggle label="Утепление / звукоизоляция" checked={values.wallInsulation} onChange={value=>updateRoom({wallInsulation:value})}/>{values.wallsFinish==='timber'?<Toggle label="Пароизоляция по проекту" checked={values.wallVaporBarrier} onChange={value=>updateRoom({wallVaporBarrier:value})}/>:null}<NumberField label="Площадь вручную" value={values.wallArea??room.wallArea} suffix="м²" onChange={value=>updateRoom({wallArea:value})}/>{values.wetZone&&values.wallsFinish==='drywall'?<p className="assembly-info"><Droplets/> Во влажной зоне применяйте ГКЛВ/ГВЛВ и гидроизоляцию мест прямого попадания воды.</p>:null}</fieldset>
          <fieldset><legend><CheckCircle2/> Потолок</legend><SelectField label="Вид потолка" value={values.ceilingFinish} options={CEILING} onChange={value=>updateRoom({ceilingFinish:value})}/>{values.ceilingFinish==='timber'?<><SelectField label="Обрешётка" value={values.ceilingFrame} options={CEILING_FRAME} onChange={value=>updateRoom({ceilingFrame:value})}/><Toggle label="Пароизоляция по проекту" checked={values.ceilingVaporBarrier} onChange={value=>updateRoom({ceilingVaporBarrier:value})}/><NumberField label="Слоёв краски" value={values.ceilingPaintCoats} suffix="слой" step={1} min={0} max={3} onChange={value=>updateRoom({ceilingPaintCoats:value})}/></>:null}{values.ceilingFinish==='stretch'?<><SelectField label="Материал полотна" value={values.stretchType} options={STRETCH} onChange={value=>updateRoom({stretchType:value})}/><NumberField label="Светильники" value={values.stretchLights} suffix="шт" step={1} onChange={value=>updateRoom({stretchLights:value})}/><NumberField label="Обходы труб" value={values.stretchPipes} suffix="шт" step={1} onChange={value=>updateRoom({stretchPipes:value})}/><NumberField label="Ниша карниза" value={values.curtainNicheLength} suffix="м" onChange={value=>updateRoom({curtainNicheLength:value})}/></>:null}<NumberField label="Площадь вручную" value={values.ceilingArea??room.ceilingArea} suffix="м²" onChange={value=>updateRoom({ceilingArea:value})}/></fieldset>
        </div>
        {!values.sauna?.enabled?<section className="sauna-editor">
          <h3>Плитка по ГКЛВ 12,5 мм</h3>
          <p>Готовый выбор для стен ванной / моечной: ГКЛВ, металлический каркас и плитка. Не для горячей зоны парной. Гидроизоляция и вентиляция обязательны по проекту; допустимую массу плитки, крепёж и число слоёв сверить с выбранной системой.</p>
          <button className="button secondary" onClick={()=>updateRoom({wallsFinish:'drywall',wallFrame:'metal',drywallType:'moisture',wallFinal:'tile',wetZone:true,waterproofWallShare:1,tileCompletion:true})}>Выбрать плитку по ГКЛВ 12,5 мм</button>
          {values.wallsFinish==='drywall'&&values.wallFinal==='tile'?<>
            <Toggle label="Дополнить плитку грунтовкой и затиркой" checked={values.tileCompletion===true} onChange={tileCompletion=>updateRoom({tileCompletion})}/>
            {values.tileCompletion?<div className="form-grid two"><NumberField label="Лента примыканий стен без запаса" suffix="м" value={values.tileTapeLength??0} onChange={tileTapeLength=>updateRoom({tileTapeLength})}/><NumberField label="Герметизируемые примыкания стен" suffix="м" value={values.tileSealLength??0} onChange={tileSealLength=>updateRoom({tileSealLength})}/></div>:null}
          </>:null}
          <p><a href="https://www.knauf.ru/catalog/listovye-i-plitnye-materialy/gipsokarton-gkl/gipsokartonnyy-knauf-list-vlagostoykiy/" target="_blank" rel="noreferrer">КНАУФ: условия применения ГКЛВ</a>. Дополнение использует действующие нормы плиточного пола: грунтовка 0,15 л/м² (10 л), затирка 0,3 кг/м² (2 кг), герметик 1 шт/10 м; округление вверх. Ленты и примыкания задайте вручную, не повторяя уже учтённые на полу. Манжеты вводов и специальные узлы — по спецификации. Старые сметы не дополняются автоматически.</p>
        </section>:null}
        {!values.sauna?.enabled?<RoomDrainEditor room={room} values={values} updateRoom={updateRoom} project={project}/>:null}
        <SaunaEditor room={room} values={values} updateRoom={updateRoom} project={project}/>
      </section>:<div className="empty-state">На плане нет площади для внутренней отделки</div>}
    </div>
    <p className="internal-source-note">Ориентировочные цены помечены в прайс-листе. ГВЛВ и мокрые зоны рассчитаны по составу систем КНАУФ, но окончательный несущий узел пола и допустимость одного слоя 12,5 мм подтверждаются проектом.</p>
  </div>;
}
