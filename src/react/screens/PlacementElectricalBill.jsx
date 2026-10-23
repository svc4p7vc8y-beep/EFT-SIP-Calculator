import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { createPortal } from 'react-dom';
import { Plus, Printer, Trash2 } from 'lucide-react';

const billKey = (floor, name) => `${floor}:${name}`;

export default function PlacementElectricalBill({ bill, placement, floor, projectName, change }) {
  const [printMode, setPrintMode] = useState('');
  useEffect(() => {
    if (!printMode) return undefined;
    const finish = () => setPrintMode('');
    window.addEventListener('afterprint', finish);
    return () => window.removeEventListener('afterprint', finish);
  }, [printMode]);
  const overrides = placement.billOverrides || {};
  const custom = (placement.billCustomRows || []).filter(row => row.floor === floor);
  const rows = [...bill.components.map(component => ({ ...component, key: billKey(floor, component.name), source: 'С плана' })), ...bill.manualComponents.map(component => ({ ...component, key: billKey(floor, `manual:${component.name}:${component.unit}`), source: 'Группа' }))];
  const displayed = rows.map(row => ({ ...row, ...overrides[row.key] }));
  const setOverride = (key, patch) => change(data => { data.billOverrides = { ...(data.billOverrides || {}), [key]: { ...(data.billOverrides?.[key] || {}), ...patch } }; });
  const updateCustom = (id, patch) => change(data => { data.billCustomRows = (data.billCustomRows || []).map(row => row.id === id ? { ...row, ...patch } : row); });
  const print = mode => {
    flushSync(() => setPrintMode(mode));
    document.body.classList.add('print-engineering-bill');
    const finish = () => { document.body.classList.remove('print-engineering-bill'); window.removeEventListener('afterprint', finish); };
    window.addEventListener('afterprint', finish);
    window.print();
  };
  const filled = printMode === 'filled';
  const printRows = filled ? [...displayed, ...custom] : Array.from({ length: 18 }, (_, index) => ({ key: index, name: '', quantity: '', unit: '', note: '' }));
  return <div className="placement-electrical-bill"><h3>Ведомость инженерии · этаж {floor}</h3><p>Электрика по текущему плану. Трассы: {bill.routeMetres.toFixed(2)} м с заданными высотами, без запаса и обходов.</p>
    <div className="placement-bill-actions"><button type="button" onClick={() => print('filled')}><Printer size={15}/> Печать ведомости</button><button type="button" onClick={() => print('blank')}><Printer size={15}/> Пустой бланк</button></div>
    <div className="placement-bill-table-scroll"><table className="placement-bill-table"><thead><tr><th>Позиция / источник</th><th>Кол.</th><th>Ед.</th><th>Примечание</th><th/></tr></thead><tbody>{displayed.map(row => <tr key={row.key}><td><strong>{row.name}</strong><small>{row.source}{overrides[row.key]?.quantity !== undefined ? ' · ручная правка' : ''}</small></td><td><input aria-label={`Количество: ${row.name}`} type="number" min="0" step="0.01" value={row.quantity ?? ''} placeholder="уточнить" onChange={event => setOverride(row.key, { quantity: event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0) })}/></td><td>{row.unit}</td><td><input aria-label={`Примечание: ${row.name}`} value={row.note || ''} onChange={event => setOverride(row.key, { note: event.target.value })}/></td><td>{overrides[row.key] ? <button type="button" title="Вернуть расчёт" aria-label={`Вернуть расчёт: ${row.name}`} onClick={() => change(data => { const next = { ...(data.billOverrides || {}) }; delete next[row.key]; data.billOverrides = next; })}>↺</button> : null}</td></tr>)}{custom.map(row => <tr key={row.id}><td><input aria-label="Дополнительная позиция" value={row.name} onChange={event => updateCustom(row.id, { name: event.target.value })}/><small>По проекту</small></td><td><input aria-label={`Количество: ${row.name || 'дополнительная позиция'}`} type="number" min="0" step="0.01" value={row.quantity} onChange={event => updateCustom(row.id, { quantity: Math.max(0, Number(event.target.value) || 0) })}/></td><td><input aria-label="Единица дополнительной позиции" value={row.unit} onChange={event => updateCustom(row.id, { unit: event.target.value })}/></td><td><input aria-label="Примечание дополнительной позиции" value={row.note} onChange={event => updateCustom(row.id, { note: event.target.value })}/></td><td><button type="button" title="Удалить строку" onClick={() => change(data => { data.billCustomRows = (data.billCustomRows || []).filter(item => item.id !== row.id); })}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
    <button type="button" className="placement-bill-add" onClick={() => change(data => { data.billCustomRows = [...(data.billCustomRows || []), { id: crypto.randomUUID(), floor, name: '', quantity: 1, unit: 'шт', note: '' }]; })}><Plus size={15}/> Добавить строку</button>
    {bill.byCircuit.length ? <div className="placement-bill-circuits"><strong>Группы и трассы</strong><table><thead><tr><th>Группа</th><th>Кабель</th><th>Трасса</th></tr></thead><tbody>{bill.byCircuit.map(circuit => <tr key={circuit.id}><td>{circuit.name}</td><td>{circuit.cable || 'Уточнить'}</td><td>{circuit.routeMetres.toFixed(2)} м</td></tr>)}</tbody></table></div> : null}
    {bill.unconnected.length ? <p>Без линии к щиту: {bill.unconnected.length} точек.</p> : null}{bill.topologyIssues?.length ? <details><summary>Связи света: {bill.topologyIssues.length} уточнения</summary><ul>{bill.topologyIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></details> : null}<p>Правки ведомости сохраняются в проекте и не меняют смету. Кабель и защита задаются в настройках группы.</p>
    {printMode ? createPortal(<div className="placement-bill-print"><header><h1>{filled ? 'Ведомость инженерии' : 'Бланк ведомости инженерии'}</h1><p>{projectName || 'Проект'} · этаж {floor} · {new Date().toLocaleDateString('ru-RU')}</p></header><table><thead><tr><th>№</th><th>Позиция</th><th>Количество</th><th>Ед.</th><th>Примечание</th></tr></thead><tbody>{printRows.map((row, index) => <tr key={row.key || index}><td>{index + 1}</td><td>{row.name || '\u00a0'}</td><td>{row.quantity ?? ''}</td><td>{row.unit}</td><td>{row.note}</td></tr>)}</tbody></table>{filled && bill.byCircuit.length ? <section><h2>Группы и трассы</h2><table><thead><tr><th>Группа</th><th>Кабель</th><th>Трасса, м</th></tr></thead><tbody>{bill.byCircuit.map(circuit => <tr key={circuit.id}><td>{circuit.name}</td><td>{circuit.cable || 'Уточнить'}</td><td>{circuit.routeMetres.toFixed(2)}</td></tr>)}</tbody></table></section> : null}<footer>Исполнитель: ____________________　Дата: ____________________</footer></div>, document.body) : null}
  </div>;
}
