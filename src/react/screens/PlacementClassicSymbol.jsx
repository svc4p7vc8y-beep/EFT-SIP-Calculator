import { findPlacementPreset } from '../state/placement-model.js';

const line = { fill: 'none' };
const dot = { fill: '#26373d', stroke: 'none' };

function Cabinet({ icon }) {
  if (icon === 'corner-cabinet') return <><path d="M8 8h84v31H39v53H8z"/><path d="M15 15h70v17H32v53H15z" {...line}/><path d="M39 39h45M39 47v36" {...line}/></>;
  return <><rect x="8" y="10" width="84" height="80" rx="2"/><rect x="14" y="16" width="72" height="68" {...line}/>
    {icon === 'dresser' ? <><path d="M14 38h72M14 61h72" {...line}/>{[27,49,72].map(y => <path key={y} d={`M44 ${y}h12`} {...line}/>)}</>
      : icon === 'shelves' ? [32,50,68].map(y => <path key={y} d={`M14 ${y}h72`} {...line}/>)
      : icon === 'sliding-wardrobe' ? <><path d="M14 50h72M44 16v34m12 0v34M38 32v12m24 12v12" {...line}/></>
      : <><path d="M50 16v68M43 43v13m14-13v13" {...line}/>{icon === 'wall-cabinet' ? <path d="M18 22h64" {...line}/> : null}</>}
  </>;
}

function Electrical({ icon }) {
  const facade = icon.startsWith('facade');
  const sockets = ['socket', 'double-socket', 'power', 'facade-socket'].includes(icon);
  const switches = ['switch', 'double-switch', 'two-way-switch', 'dimmer'].includes(icon);
  const lighting = ['light', 'spotlight', 'pendant-light', 'wall-light', 'facade-light', 'facade-spotlight'].includes(icon);
  return <>
    {sockets ? (icon === 'double-socket' ? [32,68] : [50]).map(cx => <g key={cx}><circle cx={cx} cy="50" r={icon === 'double-socket' ? 18 : 25}/><circle cx={cx - 7} cy="48" r="2.5" {...dot}/><circle cx={cx + 7} cy="48" r="2.5" {...dot}/><path d={`M${cx - 5} 61h10`} {...line}/></g>) : null}
    {icon === 'power' ? <path d="M53 25L42 49h10l-5 22 13-27H50z" {...line}/> : null}
    {switches ? <><rect x="27" y="27" width="46" height="46" rx="3"/>{icon === 'dimmer' ? <><circle cx="50" cy="50" r="13"/><path d="M50 37v10" {...line}/></> : icon === 'two-way-switch' ? <><path d="M36 50h13l13-13M49 50l13 13" {...line}/><circle cx="36" cy="50" r="3"/><circle cx="62" cy="37" r="3"/><circle cx="62" cy="63" r="3"/></> : (icon === 'double-switch' ? [41,59] : [50]).map(cx => <rect key={cx} x={cx - 6} y="35" width="12" height="30" rx="1"/>)}</> : null}
    {lighting ? <><circle cx="50" cy="50" r={icon.includes('spotlight') ? 20 : 26}/><circle cx="50" cy="50" r={icon.includes('spotlight') ? 5 : 10} {...line}/>{icon === 'spotlight' || icon === 'facade-spotlight' ? <path d="M34 66l-10 10m42-10 10 10" {...line}/> : <path d="M50 16v8m0 52v8M16 50h8m52 0h8" {...line}/>}</> : null}
    {icon === 'led-strip' ? <><path d="M10 50h80" strokeWidth="5" {...line}/>{[25,40,55,70].map(cx => <circle key={cx} cx={cx} cy="50" r="2.5" {...dot}/>)}</> : null}
    {icon === 'panel' ? <><rect x="24" y="17" width="52" height="66" rx="2"/><rect x="31" y="25" width="38" height="50" {...line}/>{[35,47,59].map(y => <path key={y} d={`M35 ${y}h30`} {...line}/>)}</> : null}
    {icon === 'junction-box' ? <><circle cx="50" cy="50" r="31"/><path d="M32 50h36M50 32v36M26 50H10m80 0H74M50 26V10m0 80V74" {...line}/></> : null}
    {facade ? <path d="M10 91h80" strokeDasharray="5 3" {...line}/> : null}
  </>;
}

function Network({ icon }) {
  if (['water-source', 'water-outlet', 'hot-outlet'].includes(icon)) return <><circle cx="50" cy="50" r="28"/><path d="M50 20v14M50 66v14M22 50h56" {...line}/><path d="M42 46c0-6 8-14 8-14s8 8 8 14a8 8 0 0 1-16 0z" {...line}/></>;
  if (icon === 'valve' || icon === 'damper') return <><path d="M9 50h25m32 0h25M34 31l32 38V31L34 69z"/><circle cx="50" cy="50" r="5" {...line}/></>;
  if (icon === 'tee') return <><path d="M12 50h76M50 15v70" strokeWidth="7" {...line}/><circle cx="50" cy="50" r="8"/></>;
  if (icon === 'radiator') return <><rect x="9" y="20" width="82" height="60" rx="4"/>{[25,37,49,61,73].map(x => <path key={x} d={`M${x} 23v54`} {...line}/>)}</>;
  if (icon === 'floor-loop') return <><rect x="8" y="10" width="84" height="80" rx="3"/><path d="M12 70h20V28h18v42h18V28h20" {...line}/></>;
  if (icon === 'stack') return <><circle cx="50" cy="50" r="29"/><circle cx="50" cy="50" r="13" {...line}/><path d="M50 8v17m0 50v17M8 50h17m50 0h17" {...line}/></>;
  if (['drain', 'floor-drain', 'cleanout'].includes(icon)) return <><rect x="17" y="17" width="66" height="66" rx="4"/><circle cx="50" cy="50" r="23" {...line}/><path d="M29 50h42M50 29v42" {...line}/></>;
  if (['supply-diffuser', 'extract-grille', 'air-intake', 'air-exhaust'].includes(icon)) return <><circle cx="50" cy="50" r="33"/><path d="M30 50h40M50 30v40M33 33l34 34M67 33L33 67" {...line}/><circle cx="50" cy="50" r="6" {...line}/></>;
  return <><circle cx="50" cy="50" r="28"/><path d="M30 50h40M50 30v40" {...line}/></>;
}

function Equipment({ icon }) {
  if (icon === 'hydro-tank' || icon === 'expansion-tank') return <><circle cx="50" cy="50" r={icon === 'hydro-tank' ? 37 : 31}/><circle cx="50" cy="50" r={icon === 'hydro-tank' ? 28 : 22} {...line}/><path d="M50 12v17M50 71v17M13 50h16m42 0h16" {...line}/><path d="M37 52c0-8 13-19 13-19s13 11 13 19a13 13 0 0 1-26 0z" {...line}/>{icon === 'hydro-tank' ? <path d="M25 78v11m50-11v11" {...line}/> : null}</>;
  if (icon === 'heat-pump') return <><rect x="9" y="13" width="82" height="74" rx="4"/><circle cx="50" cy="49" r="26" {...line}/><circle cx="50" cy="49" r="5" {...line}/><path d="M50 44c-4-16 9-23 14-15M55 49c17-2 21 11 10 20M48 54c-10 13-23 8-22-5" {...line}/></>;
  if (icon === 'water-filter') return <><rect x="12" y="15" width="76" height="70" rx="3"/><path d="M18 28h64M50 15v13M25 28v45m25-45v45m25-45v45M18 73h64" {...line}/><circle cx="50" cy="50" r="5" {...line}/></>;
  if (icon === 'water-heater') return <><circle cx="50" cy="50" r="39"/><circle cx="50" cy="50" r="30" {...line}/><circle cx="50" cy="50" r="4" {...dot}/><path d="M30 12V5m40 7V5M30 88v7m40-7v7" {...line}/></>;
  if (icon === 'pump') return <><circle cx="50" cy="50" r="28"/><circle cx="50" cy="50" r="17" {...line}/><path d="M43 39l18 11-18 11zM8 36h14m56 0h14M8 64h14m56 0h14" {...line}/></>;
  if (icon === 'manifold') return <><rect x="13" y="23" width="74" height="54" rx="2"/><path d="M20 38h60M20 62h60" {...line}/>{[29,43,57,71].map(cx => <path key={cx} d={`M${cx} 12v26m0 24v26`} {...line}/>)}</>;
  if (icon === 'vent-unit') return <><rect x="5" y="17" width="90" height="66" rx="3"/><path d="M50 17v66" {...line}/>{[28,72].map(cx => <g key={cx}><circle cx={cx} cy="50" r="18" {...line}/><circle cx={cx} cy="50" r="3" {...dot}/><path d={`M${cx} 47c-4-13 5-16 9-9m-11 15c-10 9-17 1-12-6m18 8c12 3 10 15 2 14`} {...line}/></g>)}</>;
  if (icon === 'air-conditioner') return <><rect x="5" y="24" width="90" height="52" rx="4"/><path d="M13 37h74M13 65h74M26 70h48" {...line}/></>;
  return <><rect x="16" y="10" width="68" height="80" rx="3"/><path d="M24 20h52M24 73h52" {...line}/><rect x="32" y="30" width="36" height="23" {...line}/>{[39,50,61].map(cx => <circle key={cx} cx={cx} cy="62" r="2" {...dot}/>)}<path d="M30 90v7m40-7v7" {...line}/></>;
}

export function PlacementSymbol({ kind, icon: explicitIcon }) {
  const icon = explicitIcon || findPlacementPreset(kind)?.icon || kind;
  const electrical = ['socket','double-socket','power','switch','double-switch','two-way-switch','dimmer','light','spotlight','pendant-light','wall-light','led-strip','panel','junction-box','facade-socket','facade-light','facade-spotlight'].includes(icon);
  const palette = icon === 'power' ? ['#fff0e9', '#ad4f33'] : icon.includes('switch') || icon === 'dimmer' ? ['#fff1d8', '#9d650f'] : icon === 'panel' ? ['#e5e8ff', '#414e9a'] : icon === 'junction-box' ? ['#f3e7ff', '#784e9e'] : ['light','spotlight','pendant-light','wall-light','led-strip','facade-light','facade-spotlight'].includes(icon) ? ['#fff8d9', '#9c7510'] : electrical ? ['#e1f6ed', '#237456'] : ['#fff', '#26373d'];
  return <g className="placement-classic-symbol" fill={palette[0]} stroke={palette[1]} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {electrical ? <Electrical icon={icon}/> : null}
    {['water-source','water-outlet','hot-outlet','valve','damper','tee','radiator','floor-loop','stack','drain','floor-drain','cleanout','supply-diffuser','extract-grille','air-intake','air-exhaust'].includes(icon) ? <Network icon={icon}/> : null}
    {icon === 'bed' ? <><rect x="13" y="7" width="74" height="86" rx="2"/><rect x="19" y="15" width="62" height="72" {...line}/><path d="M19 54h62M19 64c20 3 42 3 62 0" {...line}/><rect x="21" y="18" width="27" height="21" rx="4"/><rect x="52" y="18" width="27" height="21" rx="4"/></> : null}
    {icon.startsWith('bed-nightstand') ? <><rect x="23" y="8" width="54" height="84" rx="2"/><rect x="28" y="14" width="44" height="72" {...line}/><path d="M28 51h44M28 62h44" {...line}/><rect x="29" y="17" width="19" height="20" rx="3"/><rect x="52" y="17" width="19" height="20" rx="3"/>{icon !== 'bed-nightstand-right' ? <><rect x="2" y="13" width="17" height="24" rx="2"/><path d="M5 22h11" {...line}/></> : null}{icon !== 'bed-nightstand-left' ? <><rect x="81" y="13" width="17" height="24" rx="2"/><path d="M84 22h11" {...line}/></> : null}</> : null}
    {['sofa','corner-sofa','armchair'].includes(icon) ? <><rect x="8" y="15" width="84" height="70" rx="6"/><rect x="18" y="25" width="64" height="50" rx="2" {...line}/><path d="M50 26v48M18 46h64" {...line}/><rect x="9" y="26" width="11" height="48" rx="2"/><rect x="80" y="26" width="11" height="48" rx="2"/><rect x="20" y="16" width="60" height="11" rx="2"/>{icon === 'corner-sofa' ? <rect x="53" y="48" width="29" height="28" {...line}/> : null}</> : null}
    {['table','desk','chair'].includes(icon) ? <><rect x="16" y="18" width="68" height="64" rx={icon === 'table' ? 12 : 2}/><rect x="22" y="24" width="56" height="52" rx={icon === 'table' ? 8 : 0} {...line}/>{icon === 'chair' ? <path d="M22 37h56" {...line}/> : null}</> : null}
    {['cabinet','corner-cabinet','wall-cabinet','wardrobe','sliding-wardrobe','dresser','shelves'].includes(icon) ? <Cabinet icon={icon}/> : null}
    {['counter','island'].includes(icon) ? <><rect x="7" y="17" width="86" height="66" rx="2"/><rect x="13" y="23" width="74" height="54" {...line}/>{icon === 'island' ? <path d="M50 23v54M25 31h18m14 0h18" {...line}/> : <path d="M19 72h62" {...line}/>}</> : null}
    {['sink','basin','double-basin','vanity'].includes(icon) ? <><rect x="7" y="15" width="86" height="70" rx="2"/>{(icon === 'double-basin' ? [30,70] : [50]).map(cx => <g key={cx}><ellipse cx={cx} cy="52" rx={icon === 'double-basin' ? 18 : 28} ry="24" {...line}/><circle cx={cx} cy="63" r="2.3" {...dot}/><path d={`M${cx} 16v17m-8-8h16`} {...line}/></g>)}</> : null}
    {['bathtub','corner-bathtub'].includes(icon) ? <><rect x="7" y="18" width="86" height="64" rx={icon === 'corner-bathtub' ? 27 : 13}/><rect x="15" y="26" width="70" height="48" rx="18" {...line}/><circle cx="72" cy="53" r="2.3" {...dot}/><path d="M22 34h12" {...line}/></> : null}
    {icon === 'shower' ? <><rect x="10" y="10" width="80" height="80" rx="2"/><path d="M18 18h64v64H18zM18 18l64 64M51 18a31 31 0 0 1 31 31" {...line}/><circle cx="72" cy="72" r="3" {...dot}/></> : null}
    {['toilet','bidet'].includes(icon) ? <><rect x="31" y="7" width="38" height="19" rx="2"/><ellipse cx="50" cy="59" rx="25" ry="33"/><ellipse cx="50" cy="56" rx="18" ry="24" {...line}/></> : null}
    {['washer','dryer','dishwasher'].includes(icon) ? <><rect x="10" y="10" width="80" height="80" rx="3"/><rect x="17" y="16" width="66" height="12" {...line}/><circle cx="25" cy="22" r="2" {...dot}/><circle cx="50" cy="59" r="25" {...line}/>{icon === 'dishwasher' ? <path d="M34 56h32m-23-8v16m14-16v16" {...line}/> : <><circle cx="50" cy="59" r="18" {...line}/><path d="M35 60c10-9 20 9 30 0" {...line}/></>}</> : null}
    {['fridge','freezer'].includes(icon) ? <><rect x="13" y="9" width="74" height="82" rx="3"/><rect x="19" y="15" width="62" height="70" {...line}/><path d="M50 15v70M43 28v20m14 5v20" {...line}/></> : null}
    {['hob','gas-stove','electric-stove'].includes(icon) ? <><rect x="11" y="11" width="78" height="78" rx="2"/>{[[35,35,13],[65,35,11],[35,65,11],[65,65,13]].map(([cx,cy,r]) => <g key={`${cx}-${cy}`}><circle cx={cx} cy={cy} r={r} {...line}/><circle cx={cx} cy={cy} r={r-6} {...line}/></g>)}{icon === 'gas-stove' ? <path d="M40 49l10-7 10 7-10 8z" {...line}/> : icon === 'electric-stove' ? <path d="M42 45h16m-16 7h16" {...line}/> : null}</> : null}
    {['oven','microwave'].includes(icon) ? <><rect x="10" y="10" width="80" height="80" rx="3"/><rect x="17" y="30" width="66" height="51" {...line}/><path d="M22 21h40" {...line}/><circle cx="76" cy="21" r="2" {...dot}/></> : null}
    {icon === 'hood' ? <><path d="M33 11h34l20 65H13zM13 76h74v12H13z"/><path d="M38 64h24" {...line}/></> : null}
    {icon === 'vacuum' ? <><circle cx="50" cy="50" r="39"/><circle cx="50" cy="50" r="27" {...line}/><path d="M34 40h32M50 25v8" {...line}/></> : null}
    {['boiler','water-heater','manifold','pump','vent-unit','air-conditioner','hydro-tank','expansion-tank','heat-pump','water-filter','appliance','equipment-generic'].includes(icon) ? <Equipment icon={icon}/> : null}
  </g>;
}

export function CatalogSymbol({ preset }) {
  return <svg viewBox="0 0 100 100" className={`placement-catalog-symbol ${preset.layer}`} aria-hidden="true"><PlacementSymbol icon={preset.icon}/></svg>;
}
