// Physical footprints and front elevations deliberately use different outlines.
// All dimensions are supplied by the same placement item.
export default function EngineeringDeviceSymbol({icon,view,sections=8}){
 const plan=view==='plan';let drawing;
 if(['bathtub','corner-bathtub'].includes(icon))drawing=plan?<><rect x="5" y="7" width="90" height="86" rx="20"/><rect x="12" y="15" width="76" height="70" rx="20"/><circle cx="77" cy="48" r="2"/></>:<><path d="M4 30h92l-8 57H12zM4 24h92v6H4zM18 87v9m64-9v9"/><path d="M15 37h70"/></>;
 else if(['basin','sink','double-basin','vanity'].includes(icon))drawing=plan?<><rect x="5" y="8" width="90" height="84" rx="4"/>{(icon==='double-basin'?[28,72]:[50]).map(x=><ellipse key={x} cx={x} cy="54" rx={icon==='double-basin'?18:33} ry="29"/>)}<path d="M50 9v20m-7-10h14"/></>:<><path d="M4 25h92v8H4zM12 33q4 32 38 32t38-32M43 65v20q0 10 13 10h8"/><path d="M50 25V7h15v7"/></>;
 else if(['toilet','bidet'].includes(icon))drawing=plan?<><rect x="24" y="4" width="52" height="23" rx="3"/><ellipse cx="50" cy="61" rx="30" ry="34"/><ellipse cx="50" cy="58" rx="22" ry="25"/></>:<><rect x="22" y="4" width="56" height="35" rx="5"/><path d="M14 44h72v9H14zM19 53q2 25 22 25v17h26V78q14-8 14-25M32 95h45"/><path d="M33 17h9"/></>;
 else if(['washer','dryer','dishwasher'].includes(icon))drawing=plan?<><rect x="4" y="4" width="92" height="92" rx="3"/><path d="M10 12h80M16 7h22"/></>:<><rect x="4" y="4" width="92" height="92" rx="4"/><path d="M4 21h92M14 12h23"/>{icon==='dishwasher'?<path d="M16 33h68v50H16zM27 28h46"/>:<><circle cx="50" cy="58" r="29"/><circle cx="50" cy="58" r="22"/></>}</>;
 else if(plan&&['boiler','electric-boiler','water-heater'].includes(icon))drawing=<><rect x="5" y="5" width="90" height="90" rx={icon==='water-heater'?30:5}/><circle cx="50" cy="48" r="18"/><path d="M39 88h22"/></>;
 else if(plan&&['hydro-tank','expansion-tank'].includes(icon))drawing=<><circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="30"/><path d="M46 94h8"/></>;
 else if(icon==='radiator')drawing=plan?<><rect x="3" y="15" width="94" height="70" rx="3"/>{Array.from({length:Math.min(40,Math.max(1,sections))},(_,i)=><path key={i} d={`M${5+90*(i+.5)/sections} 20v60`}/>)}</>:<><rect x="3" y="6" width="94" height="88" rx="3"/>{Array.from({length:Math.min(40,Math.max(1,sections))},(_,i)=><rect key={i} x={5+90*i/sections} y="11" width={Math.max(1,90/sections-3)} height="78" rx="2"/>)}</>;
 if(!drawing)return null;
 return <g fill="none" stroke="#344b50" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">{drawing}</g>;
}
