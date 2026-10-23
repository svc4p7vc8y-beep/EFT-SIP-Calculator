import { Printer, X } from 'lucide-react';
import { NETWORK_SYSTEMS } from '../state/placement-networks.js';
import { PlacementSheetArtwork, PlacementSheetInfo } from './PlacementWorkerSheets.jsx';

export default function PlacementPrintDialog({ sheets, selection, onSelection, routeSelection, onRouteSelection, showInfo, onShowInfo, onClose, onPrint, routeDescription }) {
  const chosen = new Set(selection || []);
  const chosenPlanRoutes = [...new Map(sheets.filter(sheet => chosen.has(sheet.id) && sheet.kind === 'plan').flatMap(sheet => sheet.routes.map(route => [route.id, { route, sheet }]))).values()];
  const allRouteIds = () => [...new Set(sheets.flatMap(sheet => sheet.routes.map(route => route.id)))];
  return <section className="placement-print-dialog" role="dialog" aria-modal="true" aria-label="Выбор листов для печати" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <header><div><strong>Печатные листы</strong><p>Нажмите на миниатюры нужных планов и развёрток. Каждый рисунок печатается на отдельном листе.</p></div><button type="button" aria-label="Закрыть выбор листов" onClick={onClose}><X size={18}/></button></header>
    <div className="placement-print-presets">
      <button type="button" onClick={() => onSelection(sheets.filter(sheet => sheet.kind === 'plan').map(sheet => sheet.id))}>Все планы</button>
      <button type="button" onClick={() => onSelection(sheets.filter(sheet => sheet.kind === 'room').map(sheet => sheet.id))}>Все развёртки</button>
      <button type="button" onClick={() => onSelection(sheets.map(sheet => sheet.id))}>Все листы</button>
      <button type="button" onClick={() => onSelection([])}>Снять выбор</button>
      <label><input type="checkbox" checked={showInfo} onChange={event => onShowInfo(event.target.checked)}/> Колонка описания</label>
    </div>
    <div className="placement-print-sheet-grid" aria-label="Предпросмотр листов">{sheets.map(sheet => {
      const selected = chosen.has(sheet.id);
      return <button type="button" key={sheet.id} className={`placement-print-sheet-card${selected ? ' selected' : ''}`} aria-pressed={selected} aria-label={`${selected ? 'Убрать' : 'Добавить'} лист ${sheet.title}`} onClick={() => onSelection(current => selected ? (current || []).filter(id => id !== sheet.id) : [...(current || []), sheet.id])}>
        <div className={`placement-print-sheet-preview${showInfo ? '' : ' no-info'}`}><div><PlacementSheetArtwork sheet={sheet} routeIds={routeSelection}/></div>{showInfo ? <PlacementSheetInfo sheet={sheet} routeIds={routeSelection}/> : null}</div>
        <span className="placement-print-sheet-caption"><b>{sheet.title}</b><small>Этаж {sheet.floor} · {sheet.kind === 'room' ? 'Развёртка комнаты' : 'План этажа'} · {sheet.items.length} точек</small><i aria-hidden="true">{selected ? '✓' : '+'}</i></span>
      </button>;
    })}</div>
    <details className="placement-print-lines"><summary>Линии на выбранных планах · {routeSelection.length} выбрано</summary>
      <div className="placement-print-route-head"><strong>Какие линии показать</strong><div><button type="button" onClick={() => onRouteSelection(allRouteIds())}>Все</button><button type="button" onClick={() => onRouteSelection([])}>Ни одной</button></div></div>
      <div className="placement-print-list placement-print-routes">{chosenPlanRoutes.map(({ route, sheet }) => <label key={route.id}><input type="checkbox" checked={routeSelection.includes(route.id)} onChange={event => onRouteSelection(current => event.target.checked ? [...current, route.id] : current.filter(id => id !== route.id))}/><span>{route.system === 'electric' ? sheet.circuits.find(circuit => circuit.id === route.circuitId)?.name || 'Линия электрики' : NETWORK_SYSTEMS[route.system]?.label || 'Линия'} · {routeDescription(route)}</span><small>Этаж {sheet.floor}</small></label>)}{!chosenPlanRoutes.length ? <p>На выбранных планах линий нет.</p> : null}</div>
    </details>
    <footer><span>Выбрано листов: {selection?.length || 0}</span><button type="button" disabled={!selection?.length} onClick={onPrint}><Printer size={17}/> Печать / сохранить PDF</button></footer>
  </section>;
}
