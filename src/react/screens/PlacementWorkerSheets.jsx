import { boundsOf, houseContourPoints, roomPoints } from '../planner/geometry.js';
import { buildPlacementSheets } from '../export/placement-sheets.js';
import { dimensionMetres } from '../state/placement-geometry.js';
import PlacementPerimeterDimensions from './PlacementPerimeterDimensions.jsx';
import { PlacementSymbol } from './PlacementClassicSymbol.jsx';
import './placement-worker-sheets.css';

const pathData = points => points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ') + ' Z';
const routeData = points => points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ');
const metres = value => `${Number(value || 0).toFixed(2).replace('.', ',')} м`;

function ManualDimension({ dimension }) {
  if (dimension.points?.length !== 2) return null;
  const [a, b] = dimension.points;
  const x1 = a.x * 100, y1 = a.y * 100, x2 = b.x * 100, y2 = b.y * 100;
  return <g className="worker-manual-dimension">
    <path d={`M${x1} ${y1}L${x2} ${y2}`}/>
    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle">{dimension.label || metres(dimensionMetres(dimension.points))}</text>
  </g>;
}

function Plan({ sheet }) {
  const contour = houseContourPoints(sheet.plan);
  const rooms = (sheet.plan.rooms || []).filter(room => room.include !== false);
  const box = boundsOf([...contour, ...rooms.flatMap(roomPoints)]);
  const margin = 155;
  const viewBox = `${box.x * 100 - margin} ${box.y * 100 - margin} ${Math.max(5, box.w) * 100 + margin * 2} ${Math.max(5, box.h) * 100 + margin * 2}`;
  return <svg className="worker-plan" viewBox={viewBox} role="img" aria-label={`${sheet.title}, этаж ${sheet.floor}`}>
    <path d={pathData(contour)} className="worker-outer-wall"/>
    {rooms.map(room => {
      const points = roomPoints(room), bounds = boundsOf(points);
      return <g key={room.id}><path d={pathData(points)} className="worker-room"/><text className="worker-room-name" x={(bounds.x + bounds.w / 2) * 100} y={(bounds.y + bounds.h / 2) * 100} textAnchor="middle">{room.name}</text></g>;
    })}
    {(sheet.plan.walls || []).filter(wall => wall.include !== false).map(wall => <line key={wall.id} x1={wall.x1 * 100} y1={wall.y1 * 100} x2={wall.x2 * 100} y2={wall.y2 * 100} className="worker-inner-wall"/>)}
    {(sheet.plan.openings || []).filter(opening => opening.include !== false).map(opening => <line key={opening.id} x1={(opening.x - (opening.orientation === 'h' ? opening.width / 2 : 0)) * 100} y1={(opening.y - (opening.orientation === 'v' ? opening.width / 2 : 0)) * 100} x2={(opening.x + (opening.orientation === 'h' ? opening.width / 2 : 0)) * 100} y2={(opening.y + (opening.orientation === 'v' ? opening.width / 2 : 0)) * 100} className={opening.type === 'window' ? 'worker-window' : 'worker-door'}/>)}
    <PlacementPerimeterDimensions contour={contour} items={sheet.items.map(entry => entry.item)}/>
    {sheet.dimensions.map(dimension => <ManualDimension key={dimension.id} dimension={dimension}/>)}
    {sheet.routes.map(route => <g key={route.id}><path d={routeData(route.points)} className="worker-route"/>{route.points?.[0] ? <text className="worker-route-name" x={route.points[0].x * 100 + 8} y={route.points[0].y * 100 - 8}>{sheet.circuits.find(circuit => circuit.id === route.circuitId)?.name || 'Трасса'}</text> : null}</g>)}
    {sheet.items.map(({ item, mark }) => {
      const width = item.layer === 'electric' ? Math.max(item.width * 100, 48) : item.width * 100;
      const depth = item.layer === 'electric' ? Math.max(item.depth * 100, 48) : item.depth * 100;
      return <g key={item.id} transform={`translate(${item.x * 100} ${item.y * 100}) rotate(${item.rotation || 0})`}>
        {item.surface === 'facade' && Number.isFinite(item.anchorX) && Number.isFinite(item.anchorY) ? <line x1={(item.anchorX - item.x) * 100} y1={(item.anchorY - item.y) * 100} x2="0" y2="0" className="worker-facade-link"/> : null}
        <svg x={-width / 2} y={-depth / 2} width={width} height={depth} viewBox="0 0 100 100" preserveAspectRatio="none"><PlacementSymbol kind={item.kind}/></svg>
        <text className="worker-item-mark" x={width / 2 + 8} y={-depth / 2 - 3}>{mark}</text>
      </g>;
    })}
  </svg>;
}

export default function PlacementWorkerSheets({ project }) {
  const sheets = buildPlacementSheets(project);
  const date = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return <div className="placement-worker-print">
    {sheets.map((sheet, index) => <article className="placement-worker-sheet" key={sheet.id}>
      <header className="worker-sheet-head"><div><span>ЭФТ · {project.meta?.projectNum || 'Проект'} · этаж {sheet.floor}</span><h1>{sheet.title}</h1><p>{project.meta?.address || project.meta?.buildingType || 'Жилой дом'}</p></div><div className="worker-sheet-index">Лист {index + 1} / {sheets.length}<small>Выдано {date}</small></div></header>
      <div className="worker-sheet-plan"><Plan sheet={sheet}/></div>
      <div className="worker-sheet-note">Привязки в метрах от левого и верхнего крайних наружных габаритов до центров обозначенных объектов. Габариты и высоты — в ведомости. Размеры с листа не снимать.</div>
      <section className="worker-schedule"><h2>Ведомость позиций</h2><table><thead><tr><th>№</th><th>Элемент</th><th>X от края</th><th>Y от края</th><th>Габарит Ш × Г</th><th>Высота установки</th>{sheet.discipline === 'electric' ? <th>Группа</th> : null}<th>Примечание</th></tr></thead><tbody>
        {sheet.items.length ? sheet.items.map(({ item, mark }) => <tr key={item.id}><td>{mark}</td><td>{item.label || item.kind}{item.surface === 'facade' ? ' · фасад' : ''}</td><td>{metres((item.surface === 'facade' && Number.isFinite(item.anchorX) ? item.anchorX : item.x) - boundsOf(houseContourPoints(sheet.plan)).x)}</td><td>{metres((item.surface === 'facade' && Number.isFinite(item.anchorY) ? item.anchorY : item.y) - boundsOf(houseContourPoints(sheet.plan)).y)}</td><td>{metres(item.width)} × {metres(item.depth)}</td><td>{item.height ? metres(item.height) : 'Не задана'}</td>{sheet.discipline === 'electric' ? <td>{sheet.circuits.find(circuit => circuit.id === item.circuitId)?.name || 'Не назначена'}</td> : null}<td>{item.note || '—'}</td></tr>) : <tr><td colSpan={sheet.discipline === 'electric' ? 8 : 7}>Элементы на этаже ещё не размещены.</td></tr>}
      </tbody></table></section>
      {sheet.discipline === 'electric' ? <section className="worker-circuit-schedule"><h2>Группы щита и трассы</h2><table><thead><tr><th>Группа</th><th>Кабель по проекту</th><th>Защита по проекту</th><th>Примечание</th></tr></thead><tbody>{sheet.circuits.length ? sheet.circuits.map(circuit => <tr key={circuit.id}><td>{circuit.name}</td><td>{circuit.cable || 'Не указано'}</td><td>{circuit.breaker || 'Не указана'}</td><td>{circuit.note || '—'}</td></tr>) : <tr><td colSpan="4">Группы ещё не назначены.</td></tr>}</tbody></table></section> : null}
      <footer className="worker-sheet-footer"><span>Схема размещения по данным проекта EFT. Монтажные решения и подключения сверить с утверждённым проектом.</span><span>ЭФТ · {date}</span></footer>
    </article>)}
  </div>;
}
