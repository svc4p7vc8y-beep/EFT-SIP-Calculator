import { boundsOf, houseContourPoints } from '../planner/geometry.js';

export default function OpeningMiniPlan({ plans, selectedId, onSelect, title = 'Выберите проём на плане' }) {
  const floors = plans.map((plan, index) => ({ plan, floor: index + 1 }));
  return <div className="opening-mini-plan"><strong>{title}</strong><div className="opening-mini-floors">{floors.map(({ plan, floor }) => {
    const contour = houseContourPoints(plan);
    const box = boundsOf(contour);
    const pad = Math.max(box.w, box.h) * .08 || .5;
    const viewBox = `${(box.x - pad) * 100} ${(box.y - pad) * 100} ${(box.w + pad * 2) * 100} ${(box.h + pad * 2) * 100}`;
    return <div className="opening-mini-floor" key={floor}><span>{floor} этаж</span><svg viewBox={viewBox} role="img" aria-label={`Проёмы на плане, этаж ${floor}`}>
      <path d={contour.map((point, index) => `${index ? 'L' : 'M'} ${point.x * 100} ${point.y * 100}`).join(' ') + ' Z'} fill="#f6faf7" stroke="#607e6d" strokeWidth="5" vectorEffect="non-scaling-stroke"/>
      {(plan.openings || []).filter(item => item.type === 'window' || item.type === 'door').map((opening, index) => <g key={opening.id} role="button" tabIndex={onSelect ? 0 : undefined} className={`opening-mini-marker ${opening.type}${selectedId === opening.id ? ' selected' : ''}`} onClick={() => onSelect?.(opening, floor)} onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && onSelect) { event.preventDefault(); onSelect(opening, floor); } }} aria-label={`${opening.type === 'window' ? 'Окно' : 'Дверь'} ${index + 1}, этаж ${floor}`}>
        <circle cx={opening.x * 100} cy={opening.y * 100} r="15" className="opening-mini-hit"/>
        <circle cx={opening.x * 100} cy={opening.y * 100} r={selectedId === opening.id ? 10 : 7}/>
        <title>{opening.type === 'window' ? 'Окно' : 'Дверь'} · {Math.round(opening.width * 1000)} × {Math.round(opening.height * 1000)} мм</title>
      </g>)}
    </svg></div>;
  })}</div><small>Синий — окна, коричневый — двери. Выбранный проём выделен кольцом.</small></div>;
}
