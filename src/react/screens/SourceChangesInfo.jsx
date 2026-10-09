import {useMemo,useState} from 'react';
import {captureSourceBaseline,compareSourceBaseline} from '../calculations/source-changes.js';

export default function SourceChangesInfo({report,settings,update,onSelect,pending}){
  const [replace,setReplace]=useState(false),[showAll,setShowAll]=useState(false);
  const comparison=useMemo(()=>compareSourceBaseline(settings.sourceBaseline,report.surfaces),[settings.sourceBaseline,report.surfaces]);
  const rows=comparison.events.filter(e=>showAll||e.requiresReview);
  const blocked=pending||report.surfaces.some(s=>s.sourceIdentityStatus==='needs-registration');
  const capture=()=>{if(blocked)return;update({sourceBaseline:captureSourceBaseline(report.surfaces)});setReplace(false);};
  return <details className="cut-note no-print" aria-label="Изменения привязок относительно снимка" style={{overflowWrap:'anywhere'}}>
    <summary>Изменения привязок · {comparison.status==='no-baseline'?'снимок не задан':comparison.status==='invalid-baseline'?'снимок повреждён':`${comparison.changed} на проверку`}</summary>
    <p>Сравниваются производственные наружные стены и перегородки обоих этажей с явно сохранённым снимком. Это не журнал всех правок и не подтверждение идентичности физических деталей или инженерной проверки.</p>
    {comparison.status==='invalid-baseline'?<p role="alert">Контрольный снимок повреждён или имеет неподдерживаемый формат. Сравнение не выполнено; можно явно заменить снимок.</p>:null}
    {blocked?<p role="status">Дождитесь пересчёта и регистрации исходных стен перед сохранением снимка.</p>:null}
    {comparison.capturedAt?<p>Снимок: {new Date(comparison.capturedAt).toLocaleString('ru-RU')}</p>:null}
    {settings.sourceBaseline?!replace?<button onClick={()=>setReplace(true)}>Обновить контрольный снимок</button>:<div><p>Заменить прежний снимок текущим состоянием? Предыдущее сравнение исчезнет; действие можно отменить.</p><button disabled={blocked} onClick={capture}>Подтвердить новый снимок</button><button onClick={()=>setReplace(false)}>Отмена обновления снимка</button></div>:<button onClick={capture} disabled={blocked||!report.surfaces.some(s=>s.sourceIdentityStatus&&s.planStart&&s.planEnd)}>Сохранить контрольный снимок</button>}
    {comparison.status==='compared'?<>
      <label><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/>Показать также неизменившиеся участки</label>
      {!comparison.changed?<p role="status">Схема привязок совпадает со снимком в пределах проверяемых параметров.</p>:null}
      <ul>{rows.map((event,i)=><li key={i}><strong>{event.label}</strong> · этаж {event.floor}{event.sourceChanged&&event.kind!=='sourceChanged'?<p>Источник также изменён.</p>:null}<p>Было: {event.before.length?event.before.map(s=>s.name).join(', '):'—'}. Сейчас: {event.after.length?event.after.map(s=>s.name).join(', '):'—'}.</p>{event.after.map(s=><button key={s.key} onClick={()=>onSelect(s.key)}>Открыть {s.name}</button>)}</li>)}</ul>
      <p>Разделение и объединение — только кандидаты по совпадению участков. Смена источника и перенос требуют сверки; ручные настройки не переносятся. Сопоставление охватывает плановое положение, профиль поверхности, высоты, толщину, тип каркаса и несущий статус, но не все детали раскладки, крепёж и нагрузки.</p>
    </>:null}
    <p>Снимок сохраняется в проекте и .eft.json; обновление поддерживает отмену и повтор. Геометрия, количества и цены от снимка не меняются.</p>
  </details>;
}
