import { useLayoutEffect, useRef } from 'react';
import { boundsOf, houseContourPoints, roomPoints } from '../planner/geometry.js';
import { buildPrintablePlacementSheets, buildWorkerPrintPages, planTileViewBox, pointLegendRows } from '../export/placement-sheets.js';
import { dimensionMetres } from '../state/placement-geometry.js';
import { roomItemPlane, roomOpeningOnEdge, roomUnfoldLayout, roomWallDisplayPoint } from '../state/placement-room.js';
import { circuitLineDash } from '../state/placement-line-styles.js';
import PlacementWallDimensions from './PlacementWallDimensions.jsx';
import PlacementWalls from './PlacementWalls.jsx';
import { PlacementSymbol } from './PlacementClassicSymbol.jsx';
import './placement-worker-sheets.css';

const pathData = points => (points || []).map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ') + ' Z';
const routeData = points => (points || []).map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ');
const metres = value => `${Number(value || 0).toFixed(2).replace('.', ',')} м`;
const networkDashes = { plumbing: undefined, heating: '10 6', sewer: '12 5 2 5', ventilation: '2 5' };
const routeDash = (route, circuits) => route.system === 'electric' ? circuitLineDash(route.circuitId, circuits) : networkDashes[route.system];
const selectedRoutes = (sheet, routeIds) => !routeIds ? sheet.routes : sheet.routes.filter(route => routeIds.includes(route.id));

function ItemMark({ item, mark, x, y, size = 42 }) {
  return <g transform={`translate(${x} ${y}) rotate(${item.rotation || 0})`}>
    <svg x={-size / 2} y={-size / 2} width={size} height={size} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"><PlacementSymbol kind={item.kind} system={item.layer} medium={item.connectionMedium}/></svg>
    <text className="worker-item-mark" x={size / 2 + 4} y={-size / 2 - 3}>{mark}</text>
  </g>;
}

function Dimension({ dimension, offsetX = 0, offsetY = 0 }) {
  if (dimension.points?.length !== 2) return null;
  const [a, b] = dimension.points;
  const x1 = a.x * 100 + offsetX, y1 = a.y * 100 + offsetY;
  const x2 = b.x * 100 + offsetX, y2 = b.y * 100 + offsetY;
  return <g className="worker-manual-dimension"><path d={`M${x1} ${y1}L${x2} ${y2}`}/><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7} textAnchor="middle">{dimension.label || metres(dimensionMetres(dimension.points))}</text></g>;
}

function FloorArtwork({ sheet, routeIds }) {
  const contour = houseContourPoints(sheet.plan);
  const rooms = (sheet.plan.rooms || []).filter(room => room.include !== false);
  const platforms = (sheet.plan.platforms || []).filter(platform => platform.include !== false);
  const box = boundsOf([...contour, ...rooms.flatMap(roomPoints), ...platforms.flatMap(platform => [{ x: platform.x, y: platform.y }, { x: platform.x + platform.w, y: platform.y + platform.h }])]);
  const margin = 115;
  const fullView = [box.x * 100 - margin, box.y * 100 - margin, Math.max(5, box.w) * 100 + margin * 2, Math.max(5, box.h) * 100 + margin * 2];
  const viewBox = planTileViewBox(fullView, sheet.tile).join(' ');
  return <svg className="worker-plan" viewBox={viewBox} role="img" aria-label={sheet.title}>
    {platforms.map(platform => <g key={platform.id} className="worker-platform"><rect x={platform.x * 100} y={platform.y * 100} width={platform.w * 100} height={platform.h * 100}/><text x={(platform.x + platform.w / 2) * 100} y={(platform.y + platform.h / 2) * 100} textAnchor="middle">{platform.kind === 'porch' ? 'Крыльцо' : 'Терраса'}</text></g>)}
    <path d={pathData(contour)} fill="#fff"/>
    {rooms.map(room => { const bounds = boundsOf(roomPoints(room)); return <g key={room.id}><path d={pathData(roomPoints(room))} className="worker-room"/><text className="worker-room-name" x={(bounds.x + bounds.w / 2) * 100} y={(bounds.y + bounds.h / 2) * 100} textAnchor="middle">{room.name}</text></g>; })}
    <PlacementWalls plan={sheet.plan} idPrefix={`print-${sheet.id}`}/>
    {sheet.showAutoDimensions && sheet.items.some(({ item }) => item.layer === 'electric') ? <PlacementWallDimensions plan={sheet.plan} items={sheet.items.filter(({ item }) => item.layer === 'electric').map(({ item }) => item)}/> : null}
    {sheet.dimensions.map(dimension => <Dimension key={dimension.id} dimension={dimension}/>)}
    {selectedRoutes(sheet, routeIds).map(route => <g key={route.id}><path d={routeData(route.points)} className="worker-route" strokeDasharray={routeDash(route, sheet.circuits)}/><title>{route.annotationText || route.system}</title></g>)}
    {sheet.items.map(({ item, mark }) => <g key={item.id}><ItemMark item={item} mark={mark} x={item.x * 100} y={item.y * 100} size={item.layer === 'electric' ? 42 : Math.max(38, Math.min(95, Number(item.width || .4) * 100))}/>{item.showName ? <text className="worker-item-annotation" x={(item.x + (item.labelOffsetX ?? .5)) * 100} y={(item.y + (item.labelOffsetY ?? -.35)) * 100}>{item.annotationText || item.label}</text> : null}{item.showHeight ? <text className="worker-item-annotation" x={(item.x + (item.heightOffsetX ?? .3)) * 100} y={(item.y + (item.heightOffsetY ?? .4)) * 100}>h={metres(item.height)}</text> : null}</g>)}
  </svg>;
}

function RoomArtwork({ sheet }) {
  const { room, plan } = sheet;
  const height = Math.max(.5, Number(plan.wallHeight) || 2.5);
  const layout = roomUnfoldLayout(room, height);
  const vertices = roomPoints(room);
  const floorPath = vertices.map((point, index) => `${index ? 'L' : 'M'} ${(point.x - layout.box.x) * 100} ${(point.y - layout.box.y) * 100}`).join(' ') + ' Z';
  const itemPlanes = new Map(sheet.items.map(({ item }) => [item.id, roomItemPlane(room, item)]));
  return <svg className="worker-plan worker-room-unfold" viewBox={`-22 -22 ${layout.width * 100 + 44} ${layout.height * 100 + 44}`} role="img" aria-label={sheet.title}>
    <g transform={`translate(${layout.floor.x * 100} ${layout.floor.y * 100})`}>
      <path d={floorPath} className="worker-room-floor"/>
      {sheet.items.filter(({ item }) => itemPlanes.get(item.id)?.plane === 'floor').map(({ item, mark }) => <ItemMark key={item.id} item={item} mark={mark} x={(item.x - layout.box.x) * 100} y={(item.y - layout.box.y) * 100} size={42}/>)}
      {sheet.dimensions.filter(entry => entry.edgeIndex === -1).map(entry => <Dimension key={entry.id} dimension={entry}/>)}
    </g>
    {layout.edges.map(edge => { const horizontal = edge.side === 'top' || edge.side === 'bottom'; const w = (horizontal ? edge.length : height) * 100, h = (horizontal ? height : edge.length) * 100; return <g key={edge.index} transform={`translate(${edge.x * 100} ${edge.y * 100})`}>
      <rect width={w} height={h} className="worker-room-wall"/>
      <text className="worker-wall-label" x="8" y="18">Стена {edge.index + 1} · {metres(edge.length)}</text>
      {(plan.openings || []).map(opening => ({ opening, display: roomOpeningOnEdge(room, edge.index, opening, height) })).filter(entry => entry.display).map(({ opening, display }) => <rect key={opening.id} x={display.x * 100} y={display.y * 100} width={display.width * 100} height={display.height * 100} className="worker-room-opening"/>)}
      {sheet.items.filter(({ item }) => itemPlanes.get(item.id)?.plane === 'wall' && itemPlanes.get(item.id)?.edgeIndex === edge.index).map(({ item, mark }) => { const at = roomWallDisplayPoint(room, edge.index, item, item.height || 0, height); return at ? <ItemMark key={item.id} item={item} mark={mark} x={at.x * 100} y={at.y * 100} size={35}/> : null; })}
      {sheet.dimensions.filter(entry => entry.edgeIndex === edge.index).map(entry => <Dimension key={entry.id} dimension={entry}/>)}
    </g>; })}
  </svg>;
}

export function PlacementSheetArtwork({ sheet, routeIds }) {
  return sheet.kind === 'room' ? <RoomArtwork sheet={sheet}/> : <FloorArtwork sheet={sheet} routeIds={routeIds}/>;
}

export function PlacementSheetInfo({ sheet, routeIds }) {
  const routes = selectedRoutes(sheet, routeIds);
  const height = Number(sheet.plan.wallHeight) || 2.5;
  const bounds = sheet.room ? boundsOf(roomPoints(sheet.room)) : boundsOf(houseContourPoints(sheet.plan));
  return <aside className="worker-sheet-info"><h2>О листе</h2><dl><div><dt>Этаж</dt><dd>{sheet.floor}</dd></div><div><dt>Область</dt><dd>{sheet.room?.name || 'Весь план'}</dd></div><div><dt>Габарит</dt><dd>{metres(bounds.w)} × {metres(bounds.h)}</dd></div><div><dt>Высота стен</dt><dd>{metres(height)}</dd></div><div><dt>Точки</dt><dd>{sheet.items.length}</dd></div><div><dt>Линии</dt><dd>{routes.length}</dd></div></dl>
    {sheet.items.length ? <section><h3>Элементы</h3><ol>{sheet.items.slice(0, 14).map(({ item, mark }) => <li key={item.id}><b>{mark}</b><span>{item.annotationText || item.label || item.kind}{item.heightKnown ? ` · h ${metres(item.height)}` : ''}</span></li>)}</ol>{sheet.items.length > 14 ? <small>Ещё {sheet.items.length - 14} элементов на плане</small> : null}</section> : null}
    {routes.length ? <section><h3>Линии</h3><ol>{routes.slice(0, 8).map(route => <li key={route.id}><svg className="worker-line-sample" viewBox="0 0 38 12" aria-hidden="true"><line x1="1" y1="6" x2="37" y2="6" strokeDasharray={routeDash(route, sheet.circuits)}/></svg><span>{route.annotationText || sheet.circuits.find(circuit => circuit.id === route.circuitId)?.name || route.system}</span></li>)}</ol>{routes.length > 8 ? <small>Ещё {routes.length - 8} линий на плане</small> : null}</section> : null}
  </aside>;
}

function PointListArtwork({ sheet }) {
  const rows = pointLegendRows(sheet);
  const area = useRef(null);
  const list = useRef(null);
  const longRows = rows.filter(row => `${row.name} ${row.details.join(' · ')}`.length > 105).length;
  const targetRows = longRows > rows.length / 3 ? 25 : 34;
  const columns = Math.min(6, Math.max(2, Math.ceil(rows.length / targetRows)));
  const perColumn = Math.ceil(rows.length / columns);
  useLayoutEffect(() => {
    const fit = () => {
      if (!area.current || !list.current || area.current.clientHeight < 100) return;
      const grid = list.current;
      grid.style.zoom = '1';
      let scale = 1;
      while (grid.getBoundingClientRect().height > area.current.getBoundingClientRect().height - 2 && scale > .55) {
        scale = Math.max(.55, scale - .05);
        grid.style.zoom = String(scale);
      }
    };
    fit();
    window.addEventListener('beforeprint', fit);
    return () => window.removeEventListener('beforeprint', fit);
  }, [sheet.id, rows.length]);
  return <div className="worker-points-area" ref={area}>
    <div className="worker-points-grid" ref={list} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: columns }, (_, column) => <ol key={column} start={column * perColumn + 1}>
        {rows.slice(column * perColumn, (column + 1) * perColumn).map(row => <li key={row.id}><b>{row.mark}</b><span><strong>{row.name}</strong><small>{row.details.join(' · ')}</small></span></li>)}
      </ol>)}
    </div>
  </div>;
}

export default function PlacementWorkerSheets({ project, selection }) {
  const selectedSheets = buildPrintablePlacementSheets(project).filter(sheet => !selection?.sheetIds || selection.sheetIds.includes(sheet.id));
  const sheets = buildWorkerPrintPages(selectedSheets, selection?.planTiles);
  const date = new Date().toLocaleDateString('ru-RU');
  return <div className="placement-worker-print">{sheets.map((sheet, index) => <article className={`placement-worker-sheet${selection?.showInfo === false || sheet.tile ? ' no-info' : ''}${sheet.tile ? ' worker-tiled-sheet' : ''}${sheet.kind === 'point-list' ? ' worker-point-list-sheet' : ''}`} key={sheet.id}>
    <header className="worker-sheet-head"><div><span>ЭФТ · {project.meta?.projectNum || 'Проект'} · этаж {sheet.floor}</span><h1>{sheet.title}</h1></div><span>Лист {index + 1} / {sheets.length} · {date}</span></header>
    {sheet.kind === 'point-list' ? <PointListArtwork sheet={sheet}/> : <div className="worker-sheet-body"><div className="worker-sheet-plan"><PlacementSheetArtwork sheet={sheet} routeIds={selection?.routeIds}/></div>{selection?.showInfo === false || sheet.tile ? null : <PlacementSheetInfo sheet={sheet} routeIds={selection?.routeIds}/>}</div>}
    <footer className="worker-sheet-footer">{sheet.kind === 'point-list' ? `${sheet.items.length} точек и элементов. Номера совпадают с обозначениями на предыдущем плане.` : sheet.tile ? `Часть ${sheet.tile.index}/${sheet.tile.count} · совмещайте рисунок по перекрывающимся краям; печатайте все части в одном масштабе.` : 'План и размеры взяты из проекта. Монтажные решения проверить по рабочему проекту.'}</footer>
  </article>)}</div>;
}
