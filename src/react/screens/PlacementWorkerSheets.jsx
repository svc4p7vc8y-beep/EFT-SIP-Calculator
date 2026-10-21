import { boundsOf, houseContourPoints, roomPoints } from '../planner/geometry.js';
import { buildPlacementSheets } from '../export/placement-sheets.js';
import { dimensionMetres } from '../state/placement-geometry.js';
import { electricalSettingOutDimension, nearestPlacementDimension, projectToWallFace } from '../state/placement-walls.js';
import { electricalGroupColor } from '../state/placement-visibility.js';
import PlacementWallDimensions from './PlacementWallDimensions.jsx';
import PlacementWalls from './PlacementWalls.jsx';
import { PlacementSymbol } from './PlacementClassicSymbol.jsx';
import { breakerDescription, electricalRouteLength3d } from '../state/placement-electrical.js';
import { NETWORK_SYSTEMS, networkLength3d, networkPlanLength } from '../state/placement-networks.js';
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

function WallPlan({ sheet }) {
  const wall = sheet.wall;
  const height = Math.max(.5, Number(sheet.plan.wallHeight) || 2.5);
  const width = wall.length * 100;
  return <svg className="worker-plan worker-wall-plan" viewBox={`-80 -45 ${width + 160} ${height * 100 + 135}`} role="img" aria-label={`${sheet.title}, ${wall.label}`}>
    <text x="0" y="-15" className="worker-wall-title">{wall.label} · длина {metres(wall.length)} · высота {metres(height)}</text>
    <rect x="0" y="0" width={width} height={height * 100} fill="#fff" stroke="#333" strokeWidth="2"/>
    {Array.from({ length: Math.floor(wall.length) + 1 }, (_, station) => <g key={station}><line x1={station * 100} x2={station * 100} y1="0" y2={height * 100} className="worker-wall-grid"/><text x={station * 100} y={height * 100 + 28} textAnchor="middle">{station} м</text></g>)}
    {Array.from({ length: Math.floor(height) + 1 }, (_, level) => <g key={level}><line x1="0" x2={width} y1={(height - level) * 100} y2={(height - level) * 100} className="worker-wall-grid"/><text x="-10" y={(height - level) * 100 + 5} textAnchor="end">{level} м</text></g>)}
    {sheet.routes.map(route => <path key={route.id} d={route.points.map((point, index) => { const station = projectToWallFace(wall, point)?.station || 0; return `${index ? 'L' : 'M'} ${station * 100} ${height * 100 - (point.z || 0) * 100}`; }).join(' ')} className="worker-wall-route"><title>{NETWORK_SYSTEMS[sheet.discipline].media.find(entry => entry.id === route.medium)?.label} · {metres(networkLength3d(route.points))}</title></path>)}
    {sheet.items.map(({ item, mark }) => { const station = projectToWallFace(wall, item)?.station || 0; const y = height * 100 - (item.height || 0) * 100; return <g key={item.id}><circle cx={station * 100} cy={y} r="9" fill="#fff" stroke="#222" strokeWidth="2"/><text x={station * 100 + 12} y={y - 8} className="worker-wall-mark">{mark} · {item.label || item.kind} · s={metres(station)} · h={metres(item.height)}</text></g>; })}
  </svg>;
}

function Plan({ sheet, circuits }) {
  const contour = houseContourPoints(sheet.plan);
  const rooms = (sheet.plan.rooms || []).filter(room => room.include !== false);
  const platforms = (sheet.plan.platforms || []).filter(platform => platform.include !== false);
  const box = boundsOf([...contour, ...rooms.flatMap(roomPoints), ...platforms.flatMap(platform => [{ x: platform.x, y: platform.y }, { x: platform.x + platform.w, y: platform.y + platform.h }])]);
  const margin = sheet.discipline === 'electric' ? Math.max(155, 60 + sheet.items.length * 23) : 155;
  const viewBox = `${box.x * 100 - margin} ${box.y * 100 - margin} ${Math.max(5, box.w) * 100 + margin * 2} ${Math.max(5, box.h) * 100 + margin * 2}`;
  return <svg className="worker-plan" viewBox={viewBox} role="img" aria-label={`${sheet.title}, этаж ${sheet.floor}`}>
    {platforms.map(platform => <g key={platform.id} className="worker-platform"><rect x={platform.x * 100} y={platform.y * 100} width={platform.w * 100} height={platform.h * 100}/><text x={(platform.x + platform.w / 2) * 100} y={(platform.y + platform.h / 2) * 100} textAnchor="middle">{platform.kind === 'porch' ? 'Крыльцо' : 'Терраса'}</text></g>)}
    <path d={pathData(contour)} fill="#fff"/>
    {rooms.map(room => {
      const points = roomPoints(room), bounds = boundsOf(points);
      return <g key={room.id}><path d={pathData(points)} className="worker-room"/><text className="worker-room-name" x={(bounds.x + bounds.w / 2) * 100} y={(bounds.y + bounds.h / 2) * 100} textAnchor="middle">{room.name}</text></g>;
    })}
    <PlacementWalls plan={sheet.plan} idPrefix={`worker-${sheet.id}`}/>
    {sheet.discipline === 'electric' ? <PlacementWallDimensions plan={sheet.plan} items={sheet.items.map(entry => entry.item)}/> : null}
    {sheet.dimensions.map(dimension => <ManualDimension key={dimension.id} dimension={dimension}/>)}
    {sheet.routes.map(route => <g key={route.id}><path d={routeData(route.points)} className="worker-route" style={{ stroke: NETWORK_SYSTEMS[sheet.discipline] ? { plumbing: '#2979aa', heating: '#bf6134', sewer: '#72579a', ventilation: '#3d9481' }[sheet.discipline] : electricalGroupColor(route.circuitId, circuits) }}/>{route.points?.[0] ? <text className="worker-route-name" x={route.points[0].x * 100 + 8} y={route.points[0].y * 100 - 8}>{NETWORK_SYSTEMS[sheet.discipline] ? `${NETWORK_SYSTEMS[sheet.discipline].media.find(entry => entry.id === route.medium)?.label} · ${metres(networkLength3d(route.points))}` : sheet.circuits.find(circuit => circuit.id === route.circuitId)?.name || 'Трасса'}</text> : null}</g>)}
    {sheet.items.map(({ item, mark }) => {
      const width = item.layer === 'electric' ? Math.max(item.width * 100, 48) : item.width * 100;
      const depth = item.layer === 'electric' ? Math.max(item.depth * 100, 48) : item.depth * 100;
      return <g key={item.id} transform={`translate(${item.x * 100} ${item.y * 100}) rotate(${item.rotation || 0})`}>
        {item.surface === 'facade' && Number.isFinite(item.anchorX) && Number.isFinite(item.anchorY) ? <line x1={(item.anchorX - item.x) * 100} y1={(item.anchorY - item.y) * 100} x2="0" y2="0" className="worker-facade-link"/> : null}
        <svg x={-width / 2} y={-depth / 2} width={width} height={depth} viewBox="0 0 100 100" preserveAspectRatio="none"><PlacementSymbol kind={item.kind}/></svg>
        <text className="worker-item-mark" x={width / 2 + 8} y={depth / 2 + 22}>{mark}</text>
        {item.showHeight ? <text className="worker-item-annotation" x={width / 2 + 8} y={depth / 2 + 42}>h={metres(item.height)}</text> : null}
      </g>;
    })}
    {sheet.items.filter(({ item }) => item.showName).map(({ item }) => <g key={`label-${item.id}`} className="worker-name-callout"><line x1={item.x * 100} y1={item.y * 100} x2={(item.x + (item.labelOffsetX ?? .65)) * 100} y2={(item.y + (item.labelOffsetY ?? -.45)) * 100}/><text x={(item.x + (item.labelOffsetX ?? .65)) * 100} y={(item.y + (item.labelOffsetY ?? -.45)) * 100}>{item.label || item.kind}</text></g>)}
  </svg>;
}

export default function PlacementWorkerSheets({ project }) {
  const sheets = buildPlacementSheets(project);
  const date = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return <div className="placement-worker-print">
    {sheets.map((sheet, index) => <article className="placement-worker-sheet" key={sheet.id}>
      <header className="worker-sheet-head"><div><span>ЭФТ · {project.meta?.projectNum || 'Проект'} · этаж {sheet.floor}</span><h1>{sheet.title}</h1><p>{project.meta?.address || project.meta?.buildingType || 'Жилой дом'}</p></div><div className="worker-sheet-index">Лист {index + 1} / {sheets.length}<small>Выдано {date}</small></div></header>
      <div className="worker-sheet-plan">{sheet.wall ? <WallPlan sheet={sheet}/> : <Plan sheet={sheet} circuits={project.placement?.circuits || []}/>}</div>
      <div className="worker-sheet-note">{sheet.wall ? 'Развёртка выбранной грани стены: горизонтальная координата вдоль стены, вертикальная — высота от уровня пола. Состав стен и проходки согласовать с проектом.' : sheet.networkBill ? 'Длина сети рассчитана по координатам и заданным высотам точек. Пунктир — предложенный маршрут; проходки, фитинги и запас уточнить по рабочему проекту.' : 'Автоматические размеры показаны только на листе электрики за контуром дома. Габариты и высоты — в ведомости. Линии трасс по плану; вертикальные спуски и запас уточнить по проекту.'} Размеры с листа не снимать.</div>
      <section className="worker-schedule"><h2>Ведомость позиций</h2><table><thead><tr><th>№</th><th>Элемент</th><th>Привязка</th><th>X от габарита</th><th>Y от габарита</th><th>Габарит Ш × Г</th><th>Высота установки</th>{sheet.discipline === 'electric' ? <th>Группа</th> : null}<th>Примечание</th></tr></thead><tbody>
        {sheet.items.length ? sheet.items.map(({ item, mark }) => { const dimension = sheet.wall ? { reference: 'начала стены', distance: projectToWallFace(sheet.wall, item)?.station || 0 } : sheet.discipline === 'electric' ? electricalSettingOutDimension(sheet.plan, item) : nearestPlacementDimension(sheet.plan, item); return <tr key={item.id}><td>{mark}</td><td>{item.label || item.kind}{item.surface === 'facade' ? ' · фасад' : ''}</td><td>{dimension ? `${dimension.reference ? `От ${dimension.reference} · ` : ''}${metres(dimension.distance)}` : '—'}</td><td>{metres((item.surface === 'facade' && Number.isFinite(item.anchorX) ? item.anchorX : item.x) - boundsOf(houseContourPoints(sheet.plan)).x)}</td><td>{metres((item.surface === 'facade' && Number.isFinite(item.anchorY) ? item.anchorY : item.y) - boundsOf(houseContourPoints(sheet.plan)).y)}</td><td>{metres(item.width)} × {metres(item.depth)}</td><td>{item.heightKnown === false ? 'Не задана' : item.height || item.heightKnown ? metres(item.height) : 'Не задана'}</td>{sheet.discipline === 'electric' ? <td>{sheet.circuits.find(circuit => circuit.id === item.circuitId)?.name || 'Не назначена'}</td> : null}<td>{item.note || '—'}</td></tr>; }) : <tr><td colSpan={sheet.discipline === 'electric' ? 9 : 8}>Элементы на этаже ещё не размещены.</td></tr>}
      </tbody></table></section>
      {sheet.wall ? <section className="worker-circuit-schedule"><h2>Трассы по стене</h2><table><thead><tr><th>Линия</th><th>От → до</th><th>Длина по координатам и высоте</th><th>Материал / размер</th></tr></thead><tbody>{sheet.routes.map(route => <tr key={route.id}><td>{NETWORK_SYSTEMS[sheet.discipline].media.find(entry => entry.id === route.medium)?.label}</td><td>{sheet.items.find(entry => entry.item.id === route.fromId)?.mark || '—'} → {sheet.items.find(entry => entry.item.id === route.toId)?.mark || '—'}</td><td>{metres(networkLength3d(route.points))}</td><td>{route.material || 'Не указан'} · {route.widthMm && route.heightMm ? `${route.widthMm}×${route.heightMm} мм` : route.diameterMm ? `Ø${route.diameterMm} мм` : 'размер не указан'}</td></tr>)}</tbody></table></section> : null}
      {sheet.discipline === 'electric' ? <section className="worker-circuit-schedule"><h2>Группы щита и трассы</h2><table><thead><tr><th>Группа</th><th>Кабель по проекту</th><th>Защита по проекту</th><th>Трасса 3D</th><th>Примечание</th></tr></thead><tbody>{sheet.circuits.length ? sheet.circuits.map(circuit => <tr key={circuit.id}><td>{circuit.name}</td><td>{circuit.cable || 'Не указано'}</td><td>{breakerDescription(circuit)}</td><td>{metres(sheet.routes.filter(route => route.circuitId === circuit.id).reduce((sum, route) => sum + electricalRouteLength3d(route.points), 0))}</td><td>{circuit.note || '—'}</td></tr>) : <tr><td colSpan="5">Группы ещё не назначены.</td></tr>}</tbody></table></section> : null}
      {sheet.electricalBill ? <section className="worker-circuit-schedule"><h2>Комплектующие по плану</h2><table><thead><tr><th>Позиция</th><th>Количество</th><th>Примечание</th></tr></thead><tbody>{sheet.electricalBill.components.map(component => <tr key={component.name}><td>{component.name}</td><td>{component.quantity == null ? 'Уточнить' : `${component.quantity} ${component.unit}`}</td><td>{component.note || '—'}</td></tr>)}{sheet.electricalBill.manualComponents.map(component => <tr key={`manual-${component.name}-${component.unit}`}><td>{component.name} · по проекту</td><td>{component.quantity} {component.unit}</td><td>Задано вручную для группы</td></tr>)}</tbody></table><p>Высоты учитываются, если заданы. Без запаса, обходов и цен; действующую смету эта ведомость не меняет. {sheet.electricalBill.topologyIssues?.join('; ')}</p></section> : null}
      {sheet.networkBill ? <section className="worker-circuit-schedule"><h2>Линии и материалы по проекту</h2><table><thead><tr><th>Линия</th><th>От → до</th><th>Длина 3D</th><th>Материал / размер</th><th>Проектные данные</th></tr></thead><tbody>{sheet.routes.map(route => <tr key={route.id}><td>{NETWORK_SYSTEMS[sheet.discipline].media.find(entry => entry.id === route.medium)?.label}</td><td>{sheet.items.find(entry => entry.item.id === route.fromId)?.mark || '—'} → {sheet.items.find(entry => entry.item.id === route.toId)?.mark || '—'}</td><td>{metres(networkLength3d(route.points))}</td><td>{route.material || 'Не указан'} · {route.widthMm && route.heightMm ? `${route.widthMm}×${route.heightMm} мм` : route.diameterMm ? `Ø${route.diameterMm} мм` : 'размер не указан'}</td><td>{sheet.discipline === 'sewer' ? `По плану ${metres(networkPlanLength(route.points))}; уклон ${route.slopePermille ? `${route.slopePermille} ‰` : 'не задан'}` : sheet.discipline === 'ventilation' ? `Расход ${route.flowM3h ? `${route.flowM3h} м³/ч` : 'не задан'}` : route.plane || '—'}{route.note ? ` · ${route.note}` : ''}</td></tr>)}</tbody></table><p>Всего {metres(sheet.networkBill.totalLength)}. Поворотов трассы: {sheet.networkBill.bends}. {sheet.networkBill.issues.length ? `Требует уточнения: ${sheet.networkBill.issues.join('; ')}.` : ''} Без цен и автоматического изменения сметы.</p><p>Комплектующие: {sheet.networkBill.components.map(entry => `${entry.name} — ${entry.quantity} ${entry.unit}`).join('; ') || 'не указаны'}.</p></section> : null}
      {sheet.discipline === 'electric' ? <section className="worker-panel-schematic"><h2>Схема автоматов щита · проектные данные</h2><div><strong>Электрощит</strong>{sheet.circuits.map((circuit, index) => <span key={circuit.id}><b>{index + 1}. {breakerDescription(circuit)}</b>{circuit.name}<small>{circuit.cable || 'Кабель не указан'}</small></span>)}</div><p>Номиналы, кабели и схема соединений требуют проверки по проекту.</p></section> : null}
      <footer className="worker-sheet-footer"><span>Схема размещения по данным проекта EFT. Монтажные решения и подключения сверить с утверждённым проектом.</span><span>ЭФТ · {date}</span></footer>
    </article>)}
  </div>;
}
