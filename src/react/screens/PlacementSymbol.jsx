import { findPlacementPreset } from '../state/placement-model.js';

const stroke = { stroke: '#506269', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
const soft = { fill: '#f6f1e8', ...stroke };
const wood = { fill: '#dfc6a6', ...stroke };
const porcelain = { fill: '#f9fcfb', ...stroke };
const steel = { fill: '#dce5e7', ...stroke };

function Cabinet({ drawers = false, shelves = false }) {
  return <><rect x="8" y="8" width="84" height="84" rx="7" {...wood}/>{drawers ? [29, 50, 71].map(y => <g key={y}><line x1="12" y1={y} x2="88" y2={y} {...stroke}/><line x1="44" y1={y + 10} x2="56" y2={y + 10} {...stroke}/></g>) : shelves ? [29, 50, 71].map(y => <line key={y} x1="12" y1={y} x2="88" y2={y} {...stroke}/>) : <><line x1="50" y1="9" x2="50" y2="91" {...stroke}/><line x1="43" y1="45" x2="43" y2="57" {...stroke}/><line x1="57" y1="45" x2="57" y2="57" {...stroke}/></>}</>;
}

function Machine({ kind }) {
  return <><rect x="9" y="8" width="82" height="84" rx="8" {...steel}/><rect x="16" y="15" width="68" height="12" rx="3" fill="#f7fbfb" stroke="#8a9fa2" strokeWidth="1.6"/><circle cx="22" cy="21" r="2.5" fill="#718d91"/><circle cx="50" cy="59" r="25" fill="#f8fbfb" {...stroke}/>{kind === 'dryer' ? <path d="M35 58c7-10 20-10 30 0M35 66c8-7 19-7 30 0" fill="none" stroke="#a4bbc0" strokeWidth="2"/> : kind === 'dishwasher' ? <><path d="M33 61h34M40 50v11M50 49v12M60 50v11" fill="none" {...stroke}/><path d="M39 69h22" fill="none" {...stroke}/></> : <path d="M34 59c9-11 22 11 32-1" fill="none" stroke="#82a7b2" strokeWidth="3"/>}</>;
}

function Sink({ bathroom = false, double = false }) {
  return <><rect x="7" y="8" width="86" height="84" rx="7" {...(bathroom ? porcelain : wood)}/>{(double ? [29, 71] : [50]).map(cx => <g key={cx}><ellipse cx={cx} cy="53" rx={double ? 18 : 29} ry="26" {...porcelain}/><ellipse cx={cx} cy="54" rx={double ? 12 : 21} ry="18" fill="#e7f1f2" stroke="#afc8cb" strokeWidth="1.8"/><circle cx={cx} cy="60" r="2.8" fill="#8ca9ac"/><path d={`M${cx} 18v12m-7-5h14`} fill="none" {...stroke}/></g>)}</>;
}

function Electrical({ icon }) {
  const outdoor = icon.startsWith('facade');
  const plate = outdoor ? '#e8f2ef' : '#fff4dd';
  const edge = outdoor ? '#2e7b78' : '#c88431';
  const sockets = ['socket', 'double-socket', 'power', 'facade-socket'].includes(icon);
  const switches = ['switch', 'double-switch', 'dimmer'].includes(icon);
  const light = ['light', 'spotlight', 'pendant-light', 'wall-light', 'facade-light', 'facade-spotlight'].includes(icon);
  return <><rect x="7" y="7" width="86" height="86" rx="19" fill={plate} stroke={edge} strokeWidth="4"/><rect x="13" y="13" width="74" height="74" rx="14" fill="none" stroke={edge} strokeOpacity=".3" strokeWidth="2"/>
    {sockets ? <>{(icon === 'double-socket' ? [34, 66] : [50]).map(cx => <g key={cx}><circle cx={cx} cy="51" r={icon === 'double-socket' ? 16 : 24} fill="#fff" stroke={edge} strokeWidth="2.5"/><circle cx={cx - (icon === 'double-socket' ? 5 : 8)} cy="49" r="2.8" fill={edge}/><circle cx={cx + (icon === 'double-socket' ? 5 : 8)} cy="49" r="2.8" fill={edge}/><path d={`M${cx - 4} 60h8`} stroke={edge} strokeWidth="2"/></g>)}{icon === 'power' ? <path d="M53 31l-9 20h8l-5 18 13-24h-9z" fill={edge}/> : null}</> : null}
    {switches ? <><rect x="28" y="28" width="44" height="44" rx="9" fill="#fff" stroke={edge} strokeWidth="2.5"/>{icon === 'dimmer' ? <><circle cx="50" cy="50" r="13" fill="#f1d5ab" stroke={edge} strokeWidth="2.5"/><line x1="50" y1="37" x2="50" y2="46" stroke={edge} strokeWidth="3"/></> : (icon === 'double-switch' ? [42, 58] : [50]).map(cx => <path key={cx} d={`M${cx - 6} 36h12v28h-12z`} fill="#f3d9ad" stroke={edge} strokeWidth="2"/>)}</> : null}
    {light ? <><circle cx="50" cy="50" r={icon === 'spotlight' ? 19 : 23} fill="#fff" stroke={edge} strokeWidth="3"/><circle cx="50" cy="50" r="7" fill="#f9cf6c" stroke={edge} strokeWidth="2"/>{[0, 45, 90, 135].map(angle => <line key={angle} x1="50" y1="18" x2="50" y2="25" stroke={edge} strokeWidth="3" transform={`rotate(${angle} 50 50)`}/>)}</> : null}
    {icon === 'led-strip' ? <><path d="M22 50h56" stroke={edge} strokeWidth="8" strokeLinecap="round"/>{[30, 44, 58, 72].map(cx => <circle key={cx} cx={cx} cy="50" r="3" fill="#fff7d7"/>)}</> : null}
    {icon === 'panel' ? <><rect x="26" y="24" width="48" height="54" rx="4" fill="#fff" stroke={edge} strokeWidth="3"/><path d="M44 34h12l-6 11h8L44 66l5-16h-8z" fill={edge}/></> : null}
    {outdoor ? <path d="M21 78h58" stroke={edge} strokeWidth="2" strokeDasharray="4 3"/> : null}
  </>;
}

export function PlacementSymbol({ kind, icon: explicitIcon }) {
  const icon = explicitIcon || findPlacementPreset(kind)?.icon || kind;
  if (['socket', 'double-socket', 'power', 'switch', 'double-switch', 'dimmer', 'light', 'spotlight', 'pendant-light', 'wall-light', 'led-strip', 'panel', 'facade-socket', 'facade-light', 'facade-spotlight'].includes(icon)) return <Electrical icon={icon}/>;
  if (icon === 'bed') return <><rect x="6" y="7" width="88" height="86" rx="8" {...wood}/><rect x="12" y="23" width="76" height="65" rx="5" fill="#d8e6df" stroke="#66878a" strokeWidth="2"/><rect x="14" y="12" width="32" height="25" rx="6" {...porcelain}/><rect x="54" y="12" width="32" height="25" rx="6" {...porcelain}/><path d="M12 71h76" stroke="#9dbeb5" strokeWidth="2"/></>;
  if (['sofa', 'corner-sofa', 'armchair'].includes(icon)) return <><rect x="10" y="9" width="80" height="82" rx="14" {...soft}/><rect x="17" y="23" width="66" height="56" rx="7" fill="#a7c3bd" stroke="#5c807b" strokeWidth="2"/><path d="M50 25v53M13 18h74M13 84h74" fill="none" {...stroke}/>{icon === 'corner-sofa' ? <rect x="55" y="48" width="30" height="34" rx="5" fill="#87aaa3" stroke="#5c807b" strokeWidth="2"/> : null}</>;
  if (['table', 'desk', 'chair'].includes(icon)) return <><rect x="12" y="12" width="76" height="76" rx="11" {...wood}/><rect x="20" y="20" width="60" height="60" rx="6" fill="#ebd6ba" stroke="#9d7954" strokeWidth="2"/>{icon === 'chair' ? <path d="M19 31h62" {...stroke}/> : null}</>;
  if (['cabinet', 'corner-cabinet', 'wall-cabinet', 'wardrobe', 'sliding-wardrobe', 'dresser', 'shelves'].includes(icon)) return <Cabinet drawers={icon === 'dresser'} shelves={icon === 'shelves' || icon === 'sliding-wardrobe'}/>;
  if (['counter', 'island'].includes(icon)) return <><rect x="5" y="13" width="90" height="74" rx="6" {...wood}/><rect x="11" y="18" width="78" height="63" rx="3" fill="#f2e1c9" stroke="#bb966c" strokeWidth="1.5"/><path d="M22 75h56" stroke="#c39f73" strokeWidth="2"/></>;
  if (['sink', 'basin', 'double-basin', 'vanity'].includes(icon)) return <Sink bathroom={icon !== 'sink'} double={icon === 'double-basin'}/>;
  if (['bathtub', 'corner-bathtub'].includes(icon)) return <><rect x="7" y="9" width="86" height="82" rx={icon === 'corner-bathtub' ? 32 : 16} {...porcelain}/><rect x="16" y="18" width="68" height="65" rx="22" fill="#dceff0" stroke="#9dbfc1" strokeWidth="2"/><circle cx="50" cy="73" r="3" fill="#8ba8ad"/><path d="M42 23h16" {...stroke}/></>;
  if (icon === 'shower') return <><rect x="8" y="8" width="84" height="84" rx="10" {...porcelain}/><path d="M16 18L82 82M50 15a35 35 0 0 0 35 35" fill="none" stroke="#91bfc1" strokeWidth="2"/><circle cx="73" cy="72" r="4" fill="#9db8b9"/><circle cx="27" cy="28" r="7" fill="#d0e8ea" stroke="#8caeb2" strokeWidth="2"/></>;
  if (['toilet', 'bidet'].includes(icon)) return <><rect x="23" y="7" width="54" height="22" rx="5" {...porcelain}/><ellipse cx="50" cy="59" rx="28" ry="33" {...porcelain}/><ellipse cx="50" cy="56" rx="19" ry="23" fill="#e3f0f0" stroke="#aac5c6" strokeWidth="2"/><circle cx="67" cy="18" r="3" fill="#9ab7b8"/></>;
  if (['washer', 'dryer', 'dishwasher'].includes(icon)) return <Machine kind={icon}/>;
  if (['fridge', 'freezer'].includes(icon)) return <><rect x="8" y="8" width="84" height="84" rx="9" {...steel}/><path d="M50 10v80M40 27v19M60 56v20" fill="none" {...stroke}/><rect x="14" y="14" width="72" height="72" rx="5" fill="none" stroke="#fff" strokeWidth="2"/></>;
  if (icon === 'hob') return <><rect x="8" y="8" width="84" height="84" rx="7" fill="#3e5258" stroke="#75888a" strokeWidth="3"/>{[[30, 30, 12], [70, 30, 10], [30, 70, 10], [70, 70, 12]].map(([x, y, r]) => <g key={x + y}><circle cx={x} cy={y} r={r} fill="none" stroke="#d8e6e6" strokeWidth="2"/><circle cx={x} cy={y} r="3" fill="#c7d5d5"/></g>)}</>;
  if (['oven', 'microwave'].includes(icon)) return <><rect x="8" y="8" width="84" height="84" rx="7" {...steel}/><rect x="17" y="30" width="66" height="51" rx="4" fill="#465c63" stroke="#8ea8aa" strokeWidth="2"/><line x1="24" y1="21" x2="65" y2="21" {...stroke}/><circle cx="76" cy="21" r="3" fill="#799498"/></>;
  if (icon === 'hood') return <><path d="M35 10h30l20 65H15z" fill="#d9e3e4" {...stroke}/><path d="M17 75h66v12H17z" fill="#b8ccce" {...stroke}/><line x1="40" y1="65" x2="60" y2="65" {...stroke}/></>;
  if (icon === 'vacuum') return <><circle cx="50" cy="50" r="39" fill="#4b6269" {...stroke}/><circle cx="50" cy="50" r="25" fill="#7e9da2"/><path d="M37 34h26" stroke="#d1e4e5" strokeWidth="3"/></>;
  if (['boiler', 'water-heater', 'pump', 'manifold', 'vent-unit', 'air-conditioner', 'appliance'].includes(icon)) return <><rect x="8" y="10" width="84" height="80" rx="9" fill="#e4e1ec" stroke="#75679b" strokeWidth="3"/><circle cx="50" cy="48" r="23" fill="#f8f7fa" stroke="#8e80ad" strokeWidth="2"/><circle cx="50" cy="48" r="9" fill="#c2b9d5"/><path d="M23 78h54" stroke="#8e80ad" strokeWidth="3"/><circle cx="74" cy="25" r="3" fill="#75679b"/></>;
  return <Cabinet/>;
}

export function CatalogSymbol({ preset }) {
  return <svg viewBox="0 0 100 100" className={`placement-catalog-symbol ${preset.layer}`} aria-hidden="true"><PlacementSymbol icon={preset.icon}/></svg>;
}
