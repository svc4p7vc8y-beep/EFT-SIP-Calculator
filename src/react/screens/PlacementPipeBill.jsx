import { pipeEquipmentRows, pipeEquipmentKind } from '../state/placement-pipe-bill.js';

const metres = value => Number(value || 0).toFixed(2) + ' м';

export default function PlacementPipeBill({ bill, spec, pipe, placement, system, floor, onEquipmentUpdate, onCustomRows }) {
  const customRows = placement.networkCustomRows?.[system + '-' + floor] || [];
  const updateRow = (id, patch) => onCustomRows(customRows.map(row => row.id === id ? { ...row, ...patch } : row));
  return <div className="placement-network-bill">
    <h4>Ведомость материалов и комплектующих</h4>
    {spec.media.map(entry => <p key={entry.id}>{entry.label} <b>{metres(bill.totals[entry.id])}</b></p>)}
    <p>Всего {metres(bill.totalLength)} · поворотов линии {bill.bends}</p>
    {bill.pipeRows.map(row => <p key={row.key}>{spec.media.find(entry => entry.id === row.medium)?.label} · {row.material} · {row.size} <b>{metres(row.metres)}</b></p>)}
    {bill.components.map(entry => <p key={entry.name + '-' + entry.unit}>{entry.name} <b>{entry.quantity} {entry.unit}</b></p>)}
    {bill.unconnected.length ? <p>Без маршрута {bill.unconnected.length} узлов.</p> : null}
    {bill.issues.length ? <details><summary>Требует уточнения ({bill.issues.length})</summary><ul>{bill.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></details> : null}
    {pipe ? <small>Уголки и тройники считаются по связанным узлам одинаковой трубы. На каждом прямом участке с заданным шагом креплений количество интервалов округляется вверх и добавляется одно крепление.</small> : null}
    {bill.equipment.map(item => <EquipmentKit key={item.id} item={item} placement={placement} bill={bill} onUpdate={patch => onEquipmentUpdate(item.id, patch)}/>)}
    <details className="placement-pipe-equipment"><summary>Дополнительные позиции</summary>
      {customRows.map(row => <div className="placement-network-custom-row" key={row.id}>
        <input aria-label="Наименование дополнительной позиции" value={row.name} onChange={event => updateRow(row.id, { name: event.target.value })}/>
        <input type="number" min="0" aria-label="Количество дополнительной позиции" value={row.quantity} onChange={event => updateRow(row.id, { quantity: Math.max(0, Number(event.target.value) || 0) })}/>
        <input aria-label="Единица дополнительной позиции" value={row.unit} onChange={event => updateRow(row.id, { unit: event.target.value })}/>
        <button aria-label="Удалить дополнительную позицию" onClick={() => onCustomRows(customRows.filter(entry => entry.id !== row.id))}>×</button>
      </div>)}
      <button onClick={() => onCustomRows([...customRows, { id: crypto.randomUUID(), name: '', quantity: 1, unit: 'шт' }])}>+ Добавить позицию</button>
    </details>
  </div>;
}

function EquipmentKit({ item, placement, bill, onUpdate }) {
  const boiler = pipeEquipmentKind(item) === 'boiler';
  const rows = pipeEquipmentRows(item);
  return <details className="placement-pipe-equipment">
    <summary>{boiler ? 'Обвязка котла' : 'Комплект радиатора'} · {item.label}</summary>
    {boiler ? <BoilerConnections item={item} placement={placement} bill={bill} onModel={pipeModel => onUpdate({ pipeModel })}/> : null}
    <button onClick={() => onUpdate({ pipeKit: rows.map(row => row.example) })}>Заполнить шаблон для проверки</button>
    {rows.map((row, index) => <label key={row.name}>{row.name}{row.circuit ? ' · ' + row.circuit : ''}
      <input type="number" min="0" step="1" value={row.quantity || ''} onChange={event => {
        const next = rows.map(entry => entry.quantity);
        next[index] = Math.max(0, Math.floor(Number(event.target.value) || 0));
        onUpdate({ pipeKit: next });
      }}/>
    </label>)}
  </details>;
}

function BoilerConnections({ item, placement, bill, onModel }) {
  const ports = placement.items.filter(port => port.linkedApplianceId === item.id && port.layer === 'heating');
  return <div className="placement-boiler-connections">
    <label>Модель котла<input value={item.pipeModel || ''} maxLength={100} onChange={event => onModel(event.target.value)} placeholder="Модель по паспорту"/></label>
    <p>Сверьте обвязку с паспортом выбранной модели. Для встроенных деталей укажите 0.</p>
    <div className="placement-boiler-diagram"><b>Котёл</b>{[['supply', 'Подача →'], ['return', '← Обратка']].map(([medium, label]) => {
      const ids = new Set([item.id, ...ports.filter(port => port.connectionMedium === medium).map(port => port.id)]);
      const routes = bill.routes.filter(route => route.medium === medium && (ids.has(route.fromId) || ids.has(route.toId)));
      return <span key={medium} className={medium}>{label} {routes.length ? 'подключено (' + routes.length + ')' : 'подключение не задано'}</span>;
    })}</div>
  </div>;
}
