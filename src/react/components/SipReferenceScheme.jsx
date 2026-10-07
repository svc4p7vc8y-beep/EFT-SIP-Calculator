const wood = '#e6cc9e', panel = '#edf3e7';
// Illustrative proportions only. Actual dimensions belong to production drawings.
export default function SipReferenceScheme({ entry }) {
  const badge = (n, x, y) => <g key={n}><circle cx={x} cy={y} r="13" fill="white"/><text x={x} y={y+5} fill="#000" stroke="none" textAnchor="middle" fontSize="15">{n}</text></g>;
  let drawing;
  switch (entry.scheme) {
    case 'foundation': drawing = <>
      <rect x="70" y="150" width="350" height="65" fill="#eee"/><rect x="45" y="72" width="405" height="70" fill={wood}/><path d="M45 147H450" strokeWidth="7"/>
      <path d="M250 65V196M230 73H270M239 65H261" strokeWidth="4"/>
      {badge(1,100,106)}{badge(2,100,165)}{badge(3,360,190)}{badge(4,250,42)}</>; break;
    case 'seam': drawing = <>
      <rect x="45" y="85" width="190" height="100" fill={panel}/><rect x="265" y="85" width="190" height="100" fill={panel}/><rect x="208" y="99" width="84" height="72" fill={wood}/><path d="M45 90H455M45 180H455" strokeWidth="9"/>
      <path d="M240 105V170M260 105V170" stroke="#666" strokeDasharray="4 3"/>
      {badge(1,85,67)}{badge(2,115,137)}{badge(3,250,138)}{badge(4,250,209)}</>; break;
    case 'frame': drawing = <>
      <rect x="45" y="45" width="410" height="20" fill={wood}/><rect x="45" y="215" width="410" height="15" fill={wood}/>
      {[45,125,205,285,365,440].map(x=><rect key={x} x={x} y="65" width="15" height="150" fill={wood}/>)}
      <path d="M60 147H440M65 207L428 70" stroke={wood} strokeWidth="12"/><path d="M65 207L428 70"/>
      {badge(1,250,30)}{badge(2,125,108)}{badge(3,208,148)}{badge(4,330,98)}</>; break;
    case 'clearance': drawing = <>
      <rect x="55" y="50" width="390" height="55" fill={panel}/><rect x="225" y="129" width="55" height="108" fill={wood}/><path d="M285 105H330M285 129H330M320 105V129"/><path d="M212 135V93H235M291 135V93H268" strokeWidth="4"/>
      {badge(1,105,78)}{badge(2,357,117)}{badge(3,252,185)}{badge(4,190,126)}</>; break;
    case 'roof': drawing = <>
      <path d="M40 196L425 50" stroke={wood} strokeWidth="16"/><path d="M40 196L425 50"/>
      <rect x="95" y="182" width="45" height="26" fill={wood}/><rect x="245" y="125" width="45" height="26" fill={wood}/><rect x="395" y="65" width="45" height="26" fill={wood}/><path d="M114 208V238M267 152V238M418 91V238" strokeDasharray="5 4"/>
      {badge(1,185,127)}{badge(2,75,211)}{badge(3,270,175)}{badge(4,455,80)}</>; break;
    default: drawing = <>
      <rect x="45" y="55" width="405" height="160" fill="#f7f7f7"/><rect x="45" y="55" width="245" height="77" fill={panel}/><rect x="45" y="137" width="150" height="78" fill={panel}/><rect x="200" y="137" width="90" height="78" fill={panel}/><path d="M45 134H290M293 55V215" strokeDasharray="5 3"/><text x="140" y="102" fill="#000" textAnchor="middle" fontSize="16" stroke="none">П-1 · L × B</text>
      {badge(1,330,39)}{badge(2,140,177)}{badge(3,308,129)}{badge(4,376,177)}</>;
  }
  return <figure className="sip-reference-figure"><svg viewBox="0 0 500 260" role="img" aria-label={`Схема: ${entry.title}`} fill="none" stroke="#000" strokeWidth="1.5">{drawing}</svg><figcaption>Условная схема · без масштаба, не рабочий узел</figcaption><ol>{entry.labels.map(label=><li key={label}>{label}</li>)}</ol></figure>;
}
