import { useEffect, useMemo, useRef, useState } from 'react';
import { roomPoints } from '../planner/geometry.js';
import { pointInPolygon } from '../state/placement-geometry.js';
import { projectToWallFace, wallFacePoint } from '../state/placement-walls.js';
import { orthogonalPipePath } from '../state/placement-pipe-routing.js';
import { NETWORK_SYSTEMS } from '../state/placement-networks.js';
import { itemMedia, mediumColor } from '../state/engineering-scheme.js';
import { wallRouteParts, wallContinuations } from '../state/engineering-wall.js';
import { pipeFittingMarkers } from '../state/placement-pipe-bill.js';
import { INLINE_FITTING_KINDS } from '../data/pipe-components.js';
import { PlacementSymbol } from './PlacementClassicSymbol.jsx';

const pipeSystems=['plumbing','heating','sewer'];
function roomWalls(room,walls){
 if(!room)return walls;const points=roomPoints(room);
 return walls.filter(w=>{const middle={x:(w.a.x+w.b.x)/2,y:(w.a.y+w.b.y)/2};return points.some((a,i)=>{const b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((middle.x-a.x)*dx+(middle.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(middle.x-a.x-dx*t,middle.y-a.y-dy*t)<.25;})&&pointInPolygon({x:middle.x+w.normal.x*.08,y:middle.y+w.normal.y*.08},points);});
}
const short={cold:'Х',hot:'Г',recirculation:'Р',supply:'П',return:'О',waste:'К','vent-stack':'Ф'};
export function EngineeringWallArtwork({wall,walls,items,routes,visible={},height=2.5,selectedId,activePreset,draft=[],onPlace,onItem,onDown,onMove,onUp,onPipe,onContinuation,svgRef,print=false}){
 if(!wall)return null;
 const projected=items.filter(i=>visible[i.layer]!==false).map(item=>({item,p:projectToWallFace(wall,item)})).filter(({item,p})=>p&&(item.wallRef===wall.ref||p.distance<.13));
 const shown=routes.filter(r=>visible[r.system]!==false),parts=shown.flatMap(route=>wallRouteParts(route,wall));
 const continuations=wallContinuations(shown,wall,walls);
 const markers=pipeSystems.flatMap(system=>pipeFittingMarkers(shown.filter(r=>r.system===system),items.filter(i=>i.layer===system),system)).map(f=>({...f,p:projectToWallFace(wall,f)})).filter(f=>f.p.distance<.14);
 const W=wall.length*100,H=height*100;
 const toSvg=p=>({x:projectToWallFace(wall,p).station*100,y:H-(p.z||0)*100});
 return <svg ref={svgRef} className="engineering-wall-svg" viewBox={`-35 -28 ${W+70} ${H+75}`} role="img" aria-label={`Сети на стене · ${wall.label}`} onClick={onPlace} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
  <rect x="0" y="0" width={W} height={H} fill="#fcfdfb" stroke="#8b9c8a" strokeWidth="1.5"/>
  {Array.from({length:Math.floor(wall.length)+1},(_,i)=><g key={i}><path d={`M${i*100} 0V${H}`} stroke="#e3eae0"/><text x={i*100} y={H+22} textAnchor="middle" style={{fontSize:11,fill:'#53694e'}}>{i} м</text></g>)}
  {Array.from({length:Math.floor(height)+1},(_,i)=><g key={i}><path d={`M0 ${H-i*100}H${W}`} stroke="#e3eae0"/><text x="-8" y={H-i*100+4} textAnchor="end" style={{fontSize:11,fill:'#53694e'}}>{i}</text></g>)}
  {parts.map(({route,index,a,b})=>{const A=toSvg(a),B=toSvg(b);const d=`M${A.x} ${A.y}L${B.x} ${B.y}`;return <g key={route.id+':'+index} role={print?undefined:'button'} tabIndex={print?undefined:0} aria-label={`Труба: ${items.find(i=>i.id===route.fromId)?.label||'Узел'} → ${items.find(i=>i.id===route.toId)?.label||'Узел'} · участок ${index+1}`} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();onPipe?.(e,route,a,b);}}} onClick={e=>{e.stopPropagation();onPipe?.(e,route,a,b);}} className="engineering-wall-pipe"><rect x={Math.min(A.x,B.x)-7} y={Math.min(A.y,B.y)-7} width={Math.abs(A.x-B.x)+14} height={Math.abs(A.y-B.y)+14} fill="transparent" stroke="none"/><path d={d} stroke={mediumColor(route.medium)} strokeWidth="3.5" strokeDasharray={route.system==='heating'?'8 3':route.system==='sewer'?'10 3 2 3':undefined} fill="none"/><title>{NETWORK_SYSTEMS[route.system]?.label} · {route.material||'Материал не указан'} · {route.diameterMm?`Ø${route.diameterMm}`:'Размер не указан'}</title></g>;})}
  {markers.map(f=>{const P=toSvg(f);return <g key={f.id} onClick={e=>{e.stopPropagation();const r=shown.find(r=>r.id===f.routeId);if(r)onPipe?.(e,r,f,f);}}><svg x={P.x-9} y={P.y-9} width="18" height="18" viewBox="0 0 100 100"><PlacementSymbol icon={f.kind}/></svg><title>Автоматически · {f.label}</title></g>;})}
  {draft.length>1&&wallRouteParts({points:draft},wall).map((p,i)=>{const a=toSvg(p.a),b=toSvg(p.b);return <path key={i} d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke="#c28b28" strokeWidth="4" strokeDasharray="6 3" fill="none"/>;})}
  {continuations.map(c=>{const P=toSvg(c.point);return <g key={c.id} className="engineering-continuation" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onContinuation?.(c);}} role={print?undefined:'button'} tabIndex={print?undefined:0} aria-label={`${c.code} · продолжить на ${c.nextWall.label}`} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onContinuation?.(c);}}}><rect x={P.x-10} y={P.y-23} width="65" height="37" fill="transparent" stroke="none"/><circle cx={P.x} cy={P.y} r="7" fill="white" stroke={mediumColor(c.route.medium)} strokeWidth="2"/><text x={P.x+10} y={P.y-8} style={{fontSize:11,fill:mediumColor(c.route.medium)}}>{c.code}</text><title>{c.code} · та же труба на {c.nextWall.label}</title></g>;})}
  {projected.map(({item,p})=>{const x=p.station*100,y=H-(item.height||0)*100,system=item.layer,media=itemMedia(item,system);return <g key={item.id} className="engineering-wall-item" onPointerDown={e=>onDown?.(e,item)} onClick={e=>{e.stopPropagation();onItem?.(item);}}>
   {item.id===selectedId&&<rect x={x-23} y={y-23} width="46" height="46" rx="5" fill="#e9f3dc" stroke="#5b8d2d"/>}
   <svg x={x-20} y={y-20} width="40" height="40" viewBox="0 0 100 100"><PlacementSymbol kind={item.kind} system={system} medium={item.connectionMedium}/></svg>
   {item.id===selectedId&&<text x={x+25} y={y-14} style={{fontSize:12,fill:'#263b3e',paintOrder:'stroke',stroke:'white',strokeWidth:3}}>{item.label} · h={(item.height||0).toFixed(2)} м</text>}
   <title>{item.label} · {p.station.toFixed(2)} м от начала стены · h={(item.height||0).toFixed(2)} м</title>
   {!print&&pipeSystems.includes(system)&&media.map((medium,i)=><g key={medium} role="button" tabIndex="0" aria-label={`${item.label} · ${NETWORK_SYSTEMS[system].media.find(m=>m.id===medium)?.label}`} transform={`translate(${x+(i-(media.length-1)/2)*17} ${y+25})`} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onItem?.(item,medium);}} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onItem?.(item,medium);}}}><circle r="7" fill="white" stroke={mediumColor(medium)} strokeWidth="1.5"/><text textAnchor="middle" y="3" style={{fontSize:8,fill:mediumColor(medium)}}>{short[medium]}</text></g>)}
  </g>;})}
  {!print&&activePreset&&INLINE_FITTING_KINDS.has(activePreset.id)&&parts.map(({route,index,a,b})=>{const A=toSvg(a),B=toSvg(b);return <g key={'insert-'+route.id+':'+index} role="button" tabIndex="0" aria-label={`Вставить ${activePreset.label}: ${items.find(i=>i.id===route.fromId)?.label||'Узел'} → ${items.find(i=>i.id===route.toId)?.label||'Узел'} · участок ${index+1}`} onClick={e=>{e.stopPropagation();onPipe?.(e,route,a,b);}} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();onPipe?.(e,route,a,b);}}}><rect x={Math.min(A.x,B.x)-7} y={Math.min(A.y,B.y)-7} width={Math.abs(A.x-B.x)+14} height={Math.abs(A.y-B.y)+14} fill="transparent" stroke="none"/></g>;})}
  <text x="0" y="-12" style={{fontSize:12,fill:'#31524c'}}>{wall.label} · {wall.length.toFixed(2)} × {height.toFixed(2)} м</text>
 </svg>;
}

export default function EngineeringWallEditor({plan,walls,rooms,items,routes,visible,system,medium,onMedium,profile,onProfile,wallRef,onWall,mode,onMode,activePreset,onClearTool,selectedId,onSelect,onPlace,onMoveItem,onConnect,onInsert,onRemove,onMaterialize,onSaveDraft,locked,linesLocked,onBasic,defaults}){
 const svgRef=useRef(null),drag=useRef(null),skip=useRef(false);
 const [baseOptions,setBaseOptions]=useState(defaults||{});
 const [roomId,setRoomId]=useState(''),[pending,setPending]=useState(null),[notice,setNotice]=useState(''),[preview,setPreview]=useState(null),[zoom,setZoom]=useState(100);
 const room=rooms.find(r=>r.id===roomId),choices=roomWalls(room,walls),wall=choices.find(w=>w.ref===wallRef)||choices[0]||walls.find(w=>w.ref===wallRef)||walls[0];
 const height=Number(plan.wallHeight)||2.5;
 useEffect(()=>{setBaseOptions(defaults||{});setPending(null);},[system]);
 useEffect(()=>{if(mode==='select'||activePreset)setPending(null);if(activePreset)setNotice('');},[mode,activePreset?.id]);
 const pos=event=>{const m=svgRef.current?.getScreenCTM();if(!m||!wall)return null;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(m.inverse());const station=Math.max(0,Math.min(wall.length,p.x/100)),z=Math.max(0,Math.min(height,height-p.y/100));return {...wallFacePoint(wall,station),z,station};};
 const selectMode=next=>{if(mode===next&&!activePreset)return;onClearTool();onMode(next);setPending(null);setNotice('');};
 const pick=(item,chosenMedium)=>{
  if(skip.current){skip.current=false;return;}
  if(activePreset||mode==='select'){onSelect(item);return;}
  if(!pipeSystems.includes(item.layer)||item.layer!==system){setNotice('Выберите вывод прибора нужной системы.');return;}
  const m=chosenMedium||item.connectionMedium||((item.layer===system&&itemMedia(item,item.layer).includes(medium))?medium:itemMedia(item,item.layer)[0]);
  if(!pending){setPending({id:item.id,system:item.layer,medium:m,points:[]});setNotice('Продолжайте трубу по стене. Можно выбрать другую стену, нажать конечный вывод или завершить пробелом.');return;}
  if(item.id===pending.id)return;
  if(item.layer!==pending.system||!itemMedia(item,item.layer).includes(pending.medium)||(chosenMedium&&chosenMedium!==pending.medium)){setNotice('Подключите ту же систему и среду: Х к Х, Г к Г, подачу к подаче, обратку к обратке.');return;}
  if(onConnect(pending,item.id,mode==='auto',profile)===false){setNotice('Участок вне контура. Укажите поворот внутри дома.');return;}setPending({id:item.id,system:item.layer,medium:pending.medium,points:[]});setNotice('Участок сохранён. Продолжайте или нажмите пробел.');
 };
 const end=()=>{if(pending?.points.length)onSaveDraft(pending,profile);setPending(null);onMode('select');setNotice('Построение завершено.');};
 useEffect(()=>{const key=e=>{if(e.defaultPrevented||e.target?.closest?.('input,textarea,select,dialog,[role=dialog]'))return;if(e.key==='Escape'){setPending(null);onClearTool();onMode('select');}else if((e.code==='Space'||e.key==='Enter')&&mode!=='select'){e.preventDefault();end();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
 const source=items.find(i=>i.id===pending?.id);
 const draft=useMemo(()=>source&&pending?.points.length?(orthogonalPipePath([{x:source.x,y:source.y,z:source.height||0},...pending.points],{plan,alongWall:true,clearanceMm:profile.clearanceMm||30,keepWaypoints:true})||[]):[],[source,pending,plan,profile.clearanceMm]);
 const shown=preview?items.map(i=>i.id===preview.id?{...i,x:preview.x,y:preview.y,height:preview.z}:i):items;
 return <section className="engineering-wall-editor" onKeyDown={e=>{if(e.key==='Escape')setPending(null);}}>
  <div className="engineering-wall-controls"><div className="engineering-toolset" role="toolbar" aria-label="Инструменты стен комнаты">
   <button type="button" className={mode==='select'&&!activePreset?'active':''} aria-pressed={mode==='select'&&!activePreset} onClick={()=>selectMode('select')}>↖ Выбор</button>
   <button type="button" disabled={linesLocked} className={mode==='auto'?'active':''} aria-pressed={mode==='auto'} onClick={()=>selectMode('auto')}>Труба автоматически</button>
   <button type="button" disabled={linesLocked} className={mode==='manual'?'active':''} aria-pressed={mode==='manual'} onClick={()=>selectMode('manual')}>Труба вручную</button>
   <button type="button" disabled={!pending} onClick={end}>Завершить · пробел</button>
  </div>
  <div className="engineering-wall-selectors"><label>Комната<select value={roomId} onChange={e=>{const room=rooms.find(r=>r.id===e.target.value);setRoomId(e.target.value);const list=roomWalls(room,walls);onWall(list[0]?.ref||'');}}><option value="">Все стены</option>{rooms.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</select></label>
   <label>Стена<select value={wall?.ref||''} onChange={e=>onWall(e.target.value)}>{(choices.length?choices:walls).map(w=><option key={w.ref} value={w.ref}>{w.label}</option>)}</select></label>
   <button type="button" aria-label="Предыдущая стена" onClick={()=>{const i=choices.findIndex(w=>w.ref===wall?.ref);onWall(choices[(i-1+choices.length)%choices.length]?.ref||'');}}>←</button><button type="button" aria-label="Следующая стена" onClick={()=>{const i=choices.findIndex(w=>w.ref===wall?.ref);onWall(choices[(i+1)%choices.length]?.ref||'');}}>→</button>
   <button type="button" aria-label="Уменьшить вид стены" onClick={()=>setZoom(z=>Math.max(60,z-20))}>−</button><button type="button" onClick={()=>setZoom(100)}>{zoom}%</button><button type="button" aria-label="Увеличить вид стены" onClick={()=>setZoom(z=>Math.min(240,z+20))}>+</button>
  </div>
  <div className="engineering-pipe-profile"><label>Линия<select value={medium} onChange={e=>onMedium(e.target.value)}>{NETWORK_SYSTEMS[system].media.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
   <label>Материал трубы<input list="engineering-wall-materials" value={profile.material||''} placeholder="Выберите или введите" onChange={e=>onProfile({...profile,material:e.target.value})}/><datalist id="engineering-wall-materials">{['Полипропилен ПП-R','Сталь','Медь','Металлопластик','PEX','ПВХ канализация','ПП канализация'].map(v=><option key={v} value={v}/>)}</datalist></label>
   <label>Диаметр, мм<input type="number" min="1" value={profile.diameterMm||''} onChange={e=>onProfile({...profile,diameterMm:e.target.value?Math.max(1,Number(e.target.value)):null})}/></label>
   <label>Отступ от стены, мм<input type="number" min="0" max="300" value={profile.clearanceMm??30} onChange={e=>onProfile({...profile,clearanceMm:Math.max(0,Math.min(300,Number(e.target.value)||0))})}/></label>
  </div></div>
  <details className="engineering-wall-basic"><summary>Базовая автоматическая схема</summary><p>Добавить основные узлы на выбранной стене. Существующая сеть сохраняется.</p>{system!=='sewer'&&<label>Разводка<select value={baseOptions.distribution||'tee'} onChange={e=>setBaseOptions({...baseOptions,distribution:e.target.value})}><option value="tee">Тройниковая</option><option value="collector">Коллекторная</option></select></label>}{system==='heating'&&<fieldset><legend>Не добавлять встроенное оборудование</legend>{[['builtInPump','Насос'],['builtInExpansion','Расширительный бак'],['builtInSafety','Группа безопасности']].map(([key,label])=><label key={key}><input type="checkbox" checked={baseOptions[key]===true} onChange={e=>setBaseOptions({...baseOptions,[key]:e.target.checked})}/>{label}</label>)}</fieldset>}<button type="button" disabled={locked||linesLocked||!wall} onClick={()=>{onBasic({...profile,distribution:baseOptions.distribution||'tee',builtInPump:baseOptions.builtInPump===true,builtInExpansion:baseOptions.builtInExpansion===true,builtInSafety:baseOptions.builtInSafety===true,wallRef:wall.ref});setNotice('Базовые узлы добавлены. Уточните высоты и параметры труб.');}}>Дополнить базовую схему</button></details>
  <p className="engineering-wall-status" role="status">{notice|| (activePreset?`Разместите: ${activePreset.label}. Нажмите трубу для вставки в линию; «Выбор» завершает инструмент.`:'Выбирайте приборы или рисуйте трубы. Точки П на соседних стенах обозначают одну продолжающуюся линию.')}</p>
  <div className="engineering-wall-scroll"><div style={{width:`${zoom}%`,minWidth:500}}><EngineeringWallArtwork wall={wall} walls={walls} items={shown} routes={routes} visible={visible} height={height} selectedId={selectedId} activePreset={activePreset} draft={draft} svgRef={svgRef}
   onPlace={e=>{if(skip.current){skip.current=false;return;}const p=pos(e);if(!p)return;if(activePreset&&!locked)onPlace(activePreset,p,wall.ref);else if(pending&&mode==='manual')setPending({...pending,points:[...pending.points,p]});else if(mode==='select')onSelect(null);}}
   onItem={pick} onDown={(e,item)=>{if(locked||activePreset||mode!=='select'||e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:item.id,pointerId:e.pointerId,x:e.clientX,y:e.clientY};}}
   onMove={e=>{const d=drag.current;if(!d||d.pointerId!==e.pointerId)return;const p=pos(e);if(p){d.last=p;setPreview({id:d.id,...p});}}}
   onUp={e=>{const d=drag.current;if(!d||d.pointerId!==e.pointerId)return;if(d.last&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>4){onMoveItem(d.id,d.last,wall.ref);skip.current=true;}drag.current=null;setPreview(null);}}
   onPipe={(e,route,a,b)=>{if(linesLocked)return;const p=e.type==='keydown'?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:((a.z||0)+(b.z||0))/2}:pos(e);if(!p)return;if(activePreset){if(!INLINE_FITTING_KINDS.has(activePreset.id)){setNotice('Этот прибор ставится рядом с трубой. Для вставки выберите фитинг или кран.');return;}onInsert(route,activePreset,p,wall.ref);}else if(mode==='select')onSelect(null,route);else if(!pending){const joint=onMaterialize(route,p,wall.ref);if(joint)pick(joint,route.medium);}}}
   onContinuation={c=>{if(linesLocked)return;if(mode==='select'){if(!choices.some(w=>w.ref===c.nextWall.ref))setRoomId('');onWall(c.nextWall.ref);setNotice(`${c.code}: продолжение на ${c.nextWall.label}.`);}else{const joint=onMaterialize(c.route,c.point,wall.ref);if(joint)pick(joint,c.route.medium);}}}/></div></div>
 </section>;
}
