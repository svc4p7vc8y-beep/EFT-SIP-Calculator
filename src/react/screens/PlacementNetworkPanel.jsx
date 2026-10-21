import { NETWORK_SYSTEMS, networkBill, networkLength3d, networkPlanLength } from '../state/placement-networks.js';
import { roomPoints } from '../planner/geometry.js';
import { pointInPolygon } from '../state/placement-geometry.js';

const metres = value => `${Number(value || 0).toFixed(2)} м`;
const positive = value => value === '' ? null : Math.max(0, Number(value) || 0);

export default function PlacementNetworkPanel({ system, floor, placement, fromId, toId, medium, onFrom, onTo, onMedium,
  onAuto, onPair, onBeginManual, onFinishManual, onCancelManual, drawing, points, selectedRouteId, onSelectRoute, onUpdateRoute, onDeleteRoute, room, notice }) {
  const spec = NETWORK_SYSTEMS[system];
  const items = (placement.items || []).filter(item => item.floor === floor && item.layer === system);
  const localItems = room ? items.filter(item => pointInPolygon(item, roomPoints(room))) : items;
  const orderedItems = room ? [...localItems, ...items.filter(item => !localItems.includes(item))] : items;
  const bill = networkBill(placement, system, floor);
  const selected = bill.routes.find(route => route.id === selectedRouteId);
  const canConnect = fromId && toId && fromId !== toId;
  const routeName = route => {
    const from = items.find(item => item.id === route.fromId);
    const to = items.find(item => item.id === route.toId);
    return `${from?.label || 'Точка'} → ${to?.label || 'Точка'}`;
  };
  return <section className="placement-network-panel">
    <h3>{spec.label} · этаж {floor}</h3>
    <p>Выберите две точки на плане или развёртке комнаты. Точки выбранной комнаты показаны первыми; тип подключения прибора указан в названии.</p>
    {notice ? <p role="status">{notice}</p> : null}
    <label>Линия<select value={medium} onChange={event => onMedium(event.target.value)}>{spec.media.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
    <label>{system === 'sewer' ? 'От прибора' : 'От узла'}<select value={fromId} onChange={event => onFrom(event.target.value)}><option value="">Выберите точку</option>{orderedItems.map(item => <option key={item.id} value={item.id}>{item.label} · {item.id.slice(0, 6)}</option>)}</select></label>
    <label>{system === 'sewer' ? 'К стояку / выпуску' : 'К узлу'}<select value={toId} onChange={event => onTo(event.target.value)}><option value="">Выберите точку</option>{orderedItems.filter(item => item.id !== fromId).map(item => <option key={item.id} value={item.id}>{item.label} · {item.id.slice(0, 6)}</option>)}</select></label>
    <div className="placement-network-actions"><button disabled={!canConnect || drawing} onClick={onAuto}>Предложить маршрут</button><button disabled={!canConnect} className={drawing ? 'active' : ''} onClick={drawing ? onCancelManual : onBeginManual}>{drawing ? 'Отменить рисование' : 'Нарисовать вручную'}</button></div>
    {system === 'heating' ? <button className="placement-network-pair" disabled={!canConnect || drawing} onClick={onPair}>Предложить подачу и обратку</button> : null}
    {drawing ? <div className="placement-network-drawing"><p>Нажимайте промежуточные точки на плане или развёртке стены. Концы привязаны к выбранным узлам.</p><button onClick={onFinishManual}>Сохранить маршрут · {points.length} промежуточных точек</button></div> : null}
    <div className="placement-network-routes"><h4>Маршруты</h4>{bill.routes.length ? bill.routes.map(route => <button key={route.id} className={selectedRouteId === route.id ? 'active' : ''} onClick={() => onSelectRoute(route.id)}><span>{spec.media.find(entry => entry.id === route.medium)?.label} · {routeName(route)}</span><strong>{metres(networkLength3d(route.points))}</strong></button>) : <p>Маршрутов пока нет.</p>}</div>
    {selected ? <div className="placement-network-route-edit"><h4>{routeName(selected)}</h4>
      <label>Среда<select value={selected.medium} onChange={event => onUpdateRoute(selected.id, { medium: event.target.value })}>{spec.media.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
      <label>Зона прокладки<select value={selected.plane || 'service'} onChange={event => onUpdateRoute(selected.id, { plane: event.target.value })}><option value="service">Сервисная зона</option><option value="wall">По выбранной стене</option><option value="floor">В полу</option><option value="ceiling">Под потолком</option></select></label>
      <label>Материал / тип<input value={selected.material || ''} onChange={event => onUpdateRoute(selected.id, { material: event.target.value })} placeholder={system === 'ventilation' ? 'Тип воздуховода' : 'Тип трубы по проекту'}/></label>
      <label>{system === 'ventilation' ? 'Круглый воздуховод Ø, мм' : 'Диаметр трубы, мм'}<input type="number" min="1" value={selected.diameterMm ?? ''} onChange={event => onUpdateRoute(selected.id, { diameterMm: positive(event.target.value) })}/></label>
      {system === 'ventilation' ? <div className="placement-network-size"><label>Прямоугольный Ш, мм<input type="number" min="1" value={selected.widthMm ?? ''} onChange={event => onUpdateRoute(selected.id, { widthMm: positive(event.target.value) })}/></label><label>В, мм<input type="number" min="1" value={selected.heightMm ?? ''} onChange={event => onUpdateRoute(selected.id, { heightMm: positive(event.target.value) })}/></label></div> : null}
      {selected.auto && system !== 'sewer' ? <label>Высота магистрали, м<input type="number" min="0" step="0.01" value={selected.routeLevel ?? ''} onChange={event => onUpdateRoute(selected.id, { routeLevel: event.target.value === '' ? null : Number(event.target.value) })} placeholder="По высоте исходного узла"/></label> : null}
      {system === 'sewer' ? <><label>Проектный уклон, ‰<input type="number" min="0" step="0.1" value={selected.slopePermille ?? ''} onChange={event => onUpdateRoute(selected.id, { slopePermille: positive(event.target.value) })} placeholder="Задать по проекту"/></label><p>По плану {metres(networkPlanLength(selected.points))}; перепад {metres((selected.points[0]?.z || 0) - (selected.points.at(-1)?.z || 0))}.</p></> : null}
      {system === 'ventilation' ? <label>Расход воздуха, м³/ч<input type="number" min="0" value={selected.flowM3h ?? ''} onChange={event => onUpdateRoute(selected.id, { flowM3h: positive(event.target.value) })} placeholder="Задать по проекту"/></label> : null}
      <label>Примечание<textarea value={selected.note || ''} rows="2" onChange={event => onUpdateRoute(selected.id, { note: event.target.value })} placeholder="Согласованные проходки, изоляция, фитинги"/></label>
      <div className="placement-network-accessories"><strong>Комплектующие по проекту</strong>{(selected.accessories || []).map((entry, index) => <div key={index}><input aria-label={`Комплектующее ${index + 1}`} value={entry.name} placeholder="Наименование" onChange={event => { const accessories = [...selected.accessories]; accessories[index] = { ...entry, name: event.target.value }; onUpdateRoute(selected.id, { accessories }); }}/><input type="number" min="0" aria-label={`Количество ${index + 1}`} value={entry.quantity} onChange={event => { const accessories = [...selected.accessories]; accessories[index] = { ...entry, quantity: Number(event.target.value) || 0 }; onUpdateRoute(selected.id, { accessories }); }}/><input aria-label={`Единица ${index + 1}`} value={entry.unit} onChange={event => { const accessories = [...selected.accessories]; accessories[index] = { ...entry, unit: event.target.value }; onUpdateRoute(selected.id, { accessories }); }}/><button title="Удалить комплектующее" onClick={() => onUpdateRoute(selected.id, { accessories: selected.accessories.filter((_, i) => i !== index) })}>×</button></div>)}<button onClick={() => onUpdateRoute(selected.id, { accessories: [...(selected.accessories || []), { name: '', quantity: 1, unit: 'шт' }] })}>+ Добавить комплектующее</button></div>
      {!selected.auto ? <div className="placement-network-waypoints"><strong>Промежуточные точки маршрута</strong>{selected.points.slice(1, -1).map((point, index) => <div key={index}><span>{index + 1}</span>{['x','y','z'].map(axis => <label key={axis}>{axis.toUpperCase()}<input type="number" step="0.01" value={point[axis] ?? 0} onChange={event => { const next = selected.points.map(entry => ({ ...entry })); next[index + 1][axis] = Number(event.target.value) || 0; onUpdateRoute(selected.id, { points: next }); }}/></label>)}<button aria-label={`Удалить узел ${index + 1}`} onClick={() => onUpdateRoute(selected.id, { points: selected.points.filter((_, i) => i !== index + 1) })}>×</button></div>)}<button onClick={() => { const [from, to] = [selected.points.at(-2), selected.points.at(-1)]; const point = { x: Number(((from.x + to.x) / 2).toFixed(2)), y: Number(((from.y + to.y) / 2).toFixed(2)), z: Number((((from.z || 0) + (to.z || 0)) / 2).toFixed(2)) }; onUpdateRoute(selected.id, { points: [...selected.points.slice(0, -1), point, to] }); }}>+ Добавить узел</button></div> : null}
      <button className="placement-network-delete" onClick={() => onDeleteRoute(selected.id)}>Удалить маршрут</button>
    </div> : null}
    <div className="placement-network-bill"><h4>Ведомость без цен</h4>{spec.media.map(entry => <p key={entry.id}>{entry.label}: <b>{metres(bill.totals[entry.id])}</b></p>)}<p>Всего {metres(bill.totalLength)} · поворотов линии {bill.bends}</p>
      {bill.pipeRows.map(row => <p key={row.key}>{spec.media.find(entry => entry.id === row.medium)?.label} · {row.material} · {row.size}: <b>{metres(row.metres)}</b></p>)}
      {bill.components.map(entry => <p key={`${entry.name}-${entry.unit}`}>{entry.name}: <b>{entry.quantity} {entry.unit}</b></p>)}
      {bill.unconnected.length ? <p>Без маршрута: {bill.unconnected.length} узлов.</p> : null}
      {bill.issues.length ? <details><summary>Требует уточнения: {bill.issues.length}</summary><ul>{bill.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></details> : null}
      <small>Повороты показаны по геометрии. Фитинги и запас выбираются по технологии монтажа; смета не меняется автоматически.</small>
    </div>
  </section>;
}
