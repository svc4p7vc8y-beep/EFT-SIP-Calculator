import { formatMoney } from '../utils/format.js';

export function EstimateLayerControls({ stages, options, total, onChange, onEnable }) {
  const excluded = new Set(options.excludedEstimateLayers || []);
  const toggle = (ids, enabled) => onChange([...new Set(enabled ? [...excluded].filter(id => !ids.includes(id)) : [...excluded, ...ids])],ids,enabled);
  const included = layer => !excluded.has(layer.id) && (layer.id.endsWith('|labor') ? options.includeLabor !== false : layer.id.endsWith('|accessory') ? options.includeAccessories !== false : true);
  const names={foundation:'Фундамент',sip:'СИП-конструкции',roof:'Кровля и фронтоны',terrace:'Терраса',openings:'Окна и двери',engineering:'Инженерия',external:'Внешняя отделка',internal:'Внутренняя отделка',delivery:'Доставка'};
  const groups=new Map();
  stages.forEach(stage=>{const key=stage.sectionKey||(stage.service==='sipCeiling'?'sip':'roof');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(stage);});
  return <section className="estimate-layer-controls no-print" aria-label="Слои состава сметы">
    <header><div><strong>Состав сметы · слои конструктива</strong><p>Выберите, что отправить клиенту. Расчёт проекта и исходная ведомость сохраняются; выбор применяется к смете, Excel, печати и PDF.</p></div><div className="estimate-layer-total"><span>Итого выбранного состава</span><strong>{formatMoney(total)}</strong><button type="button" className="button secondary" onClick={() => onChange([])}>Включить всё</button></div></header>
    <div className="estimate-layer-list">{[...groups].map(([key,items])=>{
      const ids=items.flatMap(stage=>stage.layers.map(layer=>layer.id)),active=items.flatMap(stage=>stage.layers).filter(included),sum=active.reduce((n,layer)=>n+layer.amount,0);
      return <details className="estimate-scope-section" key={key} open><summary><strong>{names[key]||items[0].title}</strong><b>{formatMoney(sum)}</b><input type="checkbox" role="switch" aria-label={`Включить раздел ${names[key]||items[0].title}`} checked={active.length>0} disabled={!ids.length} onClick={e=>e.stopPropagation()} onChange={e=>toggle(ids,e.target.checked)}/></summary><div>{items.map(stage => {
      if(!stage.layers.length)return <article className="estimate-layer-stage estimate-layer-missing" key={stage.key}><strong>{stage.title}</strong><p>Нет рассчитанных позиций. {stage.service?'Включите конструкцию для добавления в расчёт.':'Задайте тип фронтонов в разделе «Кровля»; для плоской кровли без перепада стен фронтоны не требуются.'}</p>{stage.service?<button type="button" className="button secondary" onClick={()=>onEnable(stage.service)}>Включить расчёт: {stage.title}</button>:null}</article>;
      const enabled = stage.layers.filter(included);
      const all = enabled.length === stage.layers.length;
      const amount = enabled.reduce((sum,layer)=>sum+layer.amount,0);
      return <details key={stage.key} className="estimate-layer-stage">
        <summary><input type="checkbox" aria-label={`Включить слой ${stage.title}`} checked={all} onClick={event=>event.stopPropagation()} onChange={event=>toggle(stage.layers.map(layer=>layer.id),event.target.checked)} /><span><strong>{stage.title}</strong><small>{enabled.length} из {stage.layers.length} групп · {stage.layers.reduce((sum,layer)=>sum+layer.count,0)} позиций</small></span><b>{formatMoney(amount)}</b></summary>
        <div className="estimate-layer-roles">{stage.layers.map(layer=><label key={layer.id}><input type="checkbox" checked={included(layer)} onChange={event=>toggle([layer.id],event.target.checked)} /><span>{layer.title}<small>{layer.count} поз.</small></span><strong>{formatMoney(layer.amount)}</strong></label>)}</div>
      </details>;
    })}</div></details>;})}</div>
  </section>;
}
