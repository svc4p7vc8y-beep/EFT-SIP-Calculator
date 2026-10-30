import { formatMoney } from '../utils/format.js';

export function EstimateLayerControls({ stages, options, total, onChange }) {
  const excluded = new Set(options.excludedEstimateLayers || []);
  const toggle = (ids, enabled) => onChange([...new Set(enabled ? [...excluded].filter(id => !ids.includes(id)) : [...excluded, ...ids])],ids,enabled);
  const included = layer => !excluded.has(layer.id) && (layer.id.endsWith('|labor') ? options.includeLabor !== false : layer.id.endsWith('|accessory') ? options.includeAccessories !== false : true);
  return <section className="estimate-layer-controls no-print" aria-label="Слои состава сметы">
    <header><div><strong>Состав сметы · слои конструктива</strong><p>Выберите, что отправить клиенту. Расчёт проекта и исходная ведомость сохраняются; выбор применяется к смете, Excel, печати и PDF.</p></div><div className="estimate-layer-total"><span>Итого выбранного состава</span><strong>{formatMoney(total)}</strong><button type="button" className="button secondary" onClick={() => onChange([])}>Включить всё</button></div></header>
    <div className="estimate-layer-list">{stages.map(stage => {
      const enabled = stage.layers.filter(included);
      const all = enabled.length === stage.layers.length;
      const amount = enabled.reduce((sum,layer)=>sum+layer.amount,0);
      return <details key={stage.key} className="estimate-layer-stage">
        <summary><input type="checkbox" aria-label={`Включить слой ${stage.title}`} checked={all} onClick={event=>event.stopPropagation()} onChange={event=>toggle(stage.layers.map(layer=>layer.id),event.target.checked)} /><span><strong>{stage.title}</strong><small>{enabled.length} из {stage.layers.length} групп · {stage.layers.reduce((sum,layer)=>sum+layer.count,0)} позиций</small></span><b>{formatMoney(amount)}</b></summary>
        <div className="estimate-layer-roles">{stage.layers.map(layer=><label key={layer.id}><input type="checkbox" checked={included(layer)} onChange={event=>toggle([layer.id],event.target.checked)} /><span>{layer.title}<small>{layer.count} поз.</small></span><strong>{formatMoney(layer.amount)}</strong></label>)}</div>
      </details>;
    })}</div>
  </section>;
}
