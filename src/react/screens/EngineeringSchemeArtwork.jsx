import { NETWORK_SYSTEMS } from '../state/placement-networks.js';
import { itemMedia, mediumColor, schemePosition } from '../state/engineering-scheme.js';
import { PlacementSymbol } from './PlacementClassicSymbol.jsx';

const short = { cold: 'Х', hot: 'Г', recirculation: 'Р', supply: 'П', return: 'О', waste: 'К', 'vent-stack': 'Ф' };
export function EngineeringSchemeArtwork({ items, routes, system, selectedId, onSelect, onRoute, onPort, onDrag, onMove, onEnd, onBackground, svgRef, print = false }) {
  const positions = new Map(items.map((item, index) => [item.id, schemePosition(item, index)]));
  const width = Math.max(1000, ...[...positions.values()].map(p => p.x + 130));
  const height = Math.max(450, ...[...positions.values()].map(p => p.y + 105));
  return <svg ref={svgRef} className="engineering-scheme-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Схема обвязки · ${NETWORK_SYSTEMS[system].label}`} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} onClick={onBackground}>
    <rect width={width} height={height} fill="white"/>
    {print && <text x="20" y="20" fontSize="12" fill="#526453">Принципиальная схема. Длины труб — по плану и развёрткам.</text>}
    {routes.map((r, index) => {
      const a = positions.get(r.fromId), b = positions.get(r.toId); if (!a || !b) return null;
      const lane = 65 + (index % 5) * 12;
      const y = Math.max(a.y, b.y) + lane;
      const d = `M ${a.x} ${a.y + 29} V ${y} H ${b.x} V ${b.y + 29}`;
      return <g key={r.id} onClick={event => { event.stopPropagation(); onRoute?.(r.id); }} className="engineering-scheme-route">
        {!print && <path d={d} fill="none" stroke="transparent" strokeWidth="18"/>}
        <path d={d} fill="none" stroke={mediumColor(r.medium)} strokeWidth="3"/>
        <text x={(a.x + b.x) / 2} y={y - 5} textAnchor="middle" fill={mediumColor(r.medium)} fontSize="11">{short[r.medium]}{r.diameterMm ? ` · Ø${r.diameterMm}` : ''}</text>
        <title>{NETWORK_SYSTEMS[system].media.find(m => m.id === r.medium)?.label} · {r.material || 'Материал не указан'}</title>
      </g>;
    })}
    {items.map(item => {
      const p = positions.get(item.id), media = itemMedia(item, system);
      return <g key={item.id} transform={`translate(${p.x} ${p.y})`} className={`engineering-scheme-node${item.id === selectedId ? ' selected' : ''}`} onPointerDown={event => onDrag?.(event, item, p)} onClick={event => { event.stopPropagation(); onSelect?.(item.id); }}>
        <rect x="-66" y="-39" width="132" height="84" rx="9" fill="#fff" stroke={item.id === selectedId ? '#5b8d2d' : '#cbdace'} strokeWidth={item.id === selectedId ? 3 : 1}/>
        <svg x="-24" y="-33" width="48" height="48" viewBox="0 0 100 100"><PlacementSymbol kind={item.kind} system={system} medium={item.connectionMedium}/></svg>
        <text textAnchor="middle" y="28" fontSize="11" fill="#20343c">{item.label.length > 23 ? item.label.slice(0, 22) + '…' : item.label}</text><title>{item.label}</title>
        {!print && media.map((medium, i) => <g key={medium} transform={`translate(${-((media.length - 1) * 22) / 2 + i * 22} 47)`} onPointerDown={e => e.stopPropagation()} onClick={event => { event.stopPropagation(); onPort?.(item.id, medium); }} role="button" tabIndex="0" aria-label={`${item.label} · ${NETWORK_SYSTEMS[system].media.find(m => m.id === medium)?.label}`} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); onPort?.(item.id, medium); } }}>
          <circle r="11" fill="#fff" stroke={mediumColor(medium)} strokeWidth="2"/><text y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill={mediumColor(medium)}>{short[medium]}</text>
        </g>)}
      </g>;
    })}
  </svg>;
}

