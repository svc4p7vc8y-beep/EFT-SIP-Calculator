import { useId } from 'react';

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const validPoints = (items) => Array.isArray(items) ? items.filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y))).map((point) => ({ x: Number(point.x), y: Number(point.y) })) : [];
const polygon = (points) => points.map(({ x, y }) => `${x},${y}`).join(' ');

export function projectSchemeGeometry(plan) {
  const house = plan?.house || {};
  const contour = validPoints(house.points);
  if (contour.length < 3 && finite(house.w) > 0 && finite(house.h) > 0) {
    contour.push({ x: 0, y: 0 }, { x: finite(house.w), y: 0 }, { x: finite(house.w), y: finite(house.h) }, { x: 0, y: finite(house.h) });
  }
  if (house.contourDefined === false || contour.length < 3) return null;
  const minX = Math.min(...contour.map((point) => point.x));
  const maxX = Math.max(...contour.map((point) => point.x));
  const minY = Math.min(...contour.map((point) => point.y));
  const maxY = Math.max(...contour.map((point) => point.y));
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = span * 0.12;
  const rooms = (plan.rooms || []).map((room) => {
    const points = validPoints(room.points);
    if (points.length >= 3) return points;
    const x = finite(room.x), y = finite(room.y), w = finite(room.w), h = finite(room.h);
    return w > 0 && h > 0 ? [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] : [];
  }).filter((points) => points.length >= 3);
  return { contour, rooms, minX, minY, maxX, maxY, span, pad };
}

export default function ProjectSchemePreview({ plan, compact = false, label = 'Схема плана' }) {
  const patternId = useId().replaceAll(':', '');
  const geometry = projectSchemeGeometry(plan);
  if (!geometry) return <div className={`project-scheme-empty${compact ? ' compact' : ''}`} role="img" aria-label={`${label}: контур ещё не задан`}><span>◇</span>{compact ? null : <small>Контур не задан</small>}</div>;
  const { contour, rooms, minX, minY, maxX, maxY, span, pad } = geometry;
  const stroke = Math.max(span * 0.008, 0.035);
  const view = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  return <svg className={`project-scheme-preview${compact ? ' compact' : ''}`} viewBox={view} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
    <defs><pattern id={patternId} width={span / 12} height={span / 12} patternUnits="userSpaceOnUse"><path d={`M ${span / 12} 0 L 0 0 0 ${span / 12}`} fill="none" stroke="#dbe5d8" strokeWidth={stroke * .35} /></pattern></defs>
    <rect x={minX - pad} y={minY - pad} width={maxX - minX + pad * 2} height={maxY - minY + pad * 2} fill={`url(#${patternId})`} />
    <polygon points={polygon(contour)} fill="#f7f4e7" stroke="#526a54" strokeWidth={stroke * 2.4} strokeLinejoin="round" />
    {rooms.map((points, index) => <polygon key={index} points={polygon(points)} fill={index % 2 ? '#eaf1e8' : '#f4ecd8'} fillOpacity=".82" stroke="#91a18a" strokeWidth={stroke * .7} />)}
    {(plan.walls || []).filter((wall) => [wall.x1, wall.y1, wall.x2, wall.y2].every((value) => Number.isFinite(Number(value)))).map((wall, index) => <line key={wall.id || index} x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} stroke="#4a5d4b" strokeWidth={stroke * 1.7} />)}
    {(plan.openings || []).filter((opening) => Number.isFinite(Number(opening.x)) && Number.isFinite(Number(opening.y))).map((opening, index) => <circle key={opening.id || index} cx={opening.x} cy={opening.y} r={stroke * 2.2} fill={opening.type === 'window' ? '#18a5c2' : '#d68a3d'} />)}
    <polygon points={polygon(contour)} fill="none" stroke="#526a54" strokeWidth={stroke * 2.4} strokeLinejoin="round" />
  </svg>;
}
