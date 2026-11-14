import EngineeringViewport from '../components/EngineeringViewport.jsx';
import {engineeringWallItems} from '../state/engineering-projection.js';
import {portHandleRadius} from '../state/engineering-outlets.js';
import {engineeringMoveIds,translatedEngineeringItems} from '../state/engineering-move-group.js';
import {wallAlignment} from '../state/engineering-alignment.js';
import {engineeringHistoryAction} from '../state/engineering-outlets.js';
import EngineeringPipePicker from './EngineeringPipePicker.jsx';
import EngineeringPipeStem from './EngineeringPipeStem.jsx';
import {drawingPipeProfile} from '../state/engineering-pipe-tools.js';
import {wallConnectionSnap,nearbyWallPorts} from '../state/engineering-snap.js';
import {CONNECTION_PORTS} from '../state/placement-connections.js';
import { createPortal } from 'react-dom';
import { engineeringSymbolSize,engineeringElevationCenter } from '../state/engineering-symbol-size.js';
import { MousePointer2, Route, PencilLine, Check, Trash2, Undo2, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { roomPoints } from '../planner/geometry.js';
import { pointInPolygon } from '../state/placement-geometry.js';
import { projectToWallFace, wallFacePoint, roomWallFaces } from '../state/placement-walls.js';
import { orthogonalPipePath } from '../state/placement-pipe-routing.js';
import { NETWORK_SYSTEMS } from '../state/placement-networks.js';
import { itemMedia, mediumColor } from '../state/engineering-scheme.js';
import { wallRouteParts, wallContinuations } from '../state/engineering-wall.js';
import { pipeFittingMarkers } from '../state/placement-pipe-bill.js';
import { INLINE_FITTING_KINDS } from '../data/pipe-components.js';
import { PlacementSymbol } from './PlacementClassicSymbol.jsx';

const pipeSystems=['plumbing','heating','sewer'];
const short={cold:'Х',hot:'Г',recirculation:'Р',supply:'П',return:'О',waste:'К','vent-stack':'Ф'};
export function EngineeringWallArtwork({wall,walls,items,routes,visible={},height=2.5,selectedId,activePreset,draft=[],onPlace,onItem,onDown,onMove,onUp,onPipe,onContinuation,svgRef,connections=[],guides=[],activePorts=[],snapPorts=[],nearPorts=[],showPorts=false,print=false}){
 const [hoverPort,setHoverPort]=useState(null);
 if(!wall)return null;
 const projected=engineeringWallItems(wall,walls,items,visible);

 const shown=routes.filter(r=>visible[r.system]!==false),parts=shown.flatMap(route=>wallRouteParts(route,wall));
 const continuations=wallContinuations(shown,wall,walls);
 const markers=pipeSystems.flatMap(system=>pipeFittingMarkers(shown.filter(r=>r.system===system),items.filter(i=>i.layer===system),system)).map(f=>({...f,p:projectToWallFace(wall,f)})).filter(f=>f.p.distance<.14);
 const W=wall.length*100,H=height*100,selectedOwner=items.find(i=>i.id===selectedId)?.linkedApplianceId||selectedId;
 const toSvg=p=>({x:projectToWallFace(wall,p).station*100,y:H-(p.z||0)*100});
 return <svg ref={svgRef} className="engineering-wall-svg" viewBox={`-35 -28 ${W+70} ${H+75}`} role="img" aria-label={`Сети на стене · ${wall.label}`} onClick={onPlace} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
  <rect x="0" y="0" width={W} height={H} fill="#fcfdfb" stroke="#8b9c8a" strokeWidth="1.5"/>
  {Array.from({length:Math.floor(wall.length)+1},(_,i)=><g key={i}><path d={`M${i*100} 0V${H}`} stroke="#e3eae0"/><text x={i*100} y={H+22} textAnchor="middle" style={{fontSize:11,fill:'#53694e'}}>{i} м</text></g>)}
  {Array.from({length:Math.floor(height)+1},(_,i)=><g key={i}><path d={`M0 ${H-i*100}H${W}`} stroke="#e3eae0"/><text x="-8" y={H-i*100+4} textAnchor="end" style={{fontSize:11,fill:'#53694e'}}>{i}</text></g>)}
  {parts.map(({route,index,a,b})=>{const A=toSvg(a),B=toSvg(b);const d=`M${A.x} ${A.y}L${B.x} ${B.y}`;return <g key={route.id+':'+index} role={print?undefined:'button'} tabIndex={print?undefined:0} aria-label={`Труба: ${items.find(i=>i.id===route.fromId)?.label||'Узел'} → ${items.find(i=>i.id===route.toId)?.label||'Узел'} · участок ${index+1}`} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();onPipe?.(e,route,a,b);}}} onClick={e=>{e.stopPropagation();onPipe?.(e,route,a,b);}} className="engineering-wall-pipe"><rect x={Math.min(A.x,B.x)-7} y={Math.min(A.y,B.y)-7} width={Math.abs(A.x-B.x)+14} height={Math.abs(A.y-B.y)+14} fill="transparent" stroke="none"/><path d={d} stroke={mediumColor(route.medium)} strokeWidth="3.5" strokeDasharray={route.system==='heating'?'8 3':route.system==='sewer'?'10 3 2 3':undefined} fill="none"/><title>{NETWORK_SYSTEMS[route.system]?.label} · {route.material||'Материал не указан'} · {route.diameterMm?`Ø${route.diameterMm}`:'Размер не указан'}</title></g>;})}
  {markers.map(f=>{const P=toSvg(f);return <g key={f.id} onClick={e=>{e.stopPropagation();const r=shown.find(r=>r.id===f.routeId);if(r)onPipe?.(e,r,f,f);}}><svg x={P.x-9} y={P.y-9} width="18" height="18" viewBox="0 0 100 100"><PlacementSymbol icon={f.kind}/></svg><title>Автоматически · {f.label}</title></g>;})}
  {guides.map(g=><path key={g.axis} className="engineering-alignment-guide" d={g.axis==='station'?`M${g.value*100} 0V${H}`:`M0 ${H-g.value*100}H${W}`}/>)}
  {draft.length>1&&wallRouteParts({points:draft},wall).map((p,i)=>{const a=toSvg(p.a),b=toSvg(p.b);return <path key={i} d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke="#c28b28" strokeWidth="4" strokeDasharray="6 3" fill="none"/>;})}
  {continuations.map(c=>{const P=toSvg(c.point);return <g key={c.id} className="engineering-continuation" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onContinuation?.(c);}} role={print?undefined:'button'} tabIndex={print?undefined:0} aria-label={`${c.code} · продолжить на ${c.nextWall.label}`} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onContinuation?.(c);}}}><rect x={P.x-10} y={P.y-23} width="65" height="37" fill="transparent" stroke="none"/><path d={`M${P.x-6} ${P.y}h12`} fill="none" stroke={mediumColor(c.route.medium)} strokeWidth="3.5"/><text x={P.x+10} y={P.y-8} style={{fontSize:11,fill:mediumColor(c.route.medium)}}>{c.code}</text><title>{c.code} · та же труба на {c.nextWall.label}</title></g>;})}
  {projected.map(({item,p})=>{const x=p.station*100,system=item.layer,size=engineeringSymbolSize(item),y=H-engineeringElevationCenter(item)*100;return <g key={item.id} role="button" tabIndex={print?undefined:0} aria-label={item.label} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();onItem?.(item);}}} onPointerEnter={()=>{if(item.kind==='connection-port')setHoverPort(item.id);}} onPointerLeave={()=>setHoverPort(null)} className={`engineering-wall-item${item.id===selectedId?' is-selected':''}`} onPointerDown={e=>{const parent=item.kind==='connection-port'&&items.find(owner=>owner.id===item.linkedApplianceId);onDown?.(e,parent&&(INLINE_FITTING_KINDS.has(parent.kind)||selectedId!==item.id&&selectedId!==parent.id)?parent:item);}} onClick={e=>{e.stopPropagation();if(activePreset)onPlace?.(e);else onItem?.(item);}}>
   <rect x={x-(item.kind==='connection-port'?2:Math.max(6,size.width/2))} y={y-(item.kind==='connection-port'?2:Math.max(6,size.height/2))} width={item.kind==='connection-port'?4:Math.max(12,size.width)} height={item.kind==='connection-port'?4:Math.max(12,size.height)} fill="transparent"/>
   {['pipe-junction','connection-port'].includes(item.kind)?<EngineeringPipeStem item={item} owner={items.find(i=>i.id===item.linkedApplianceId)} x={x} y={y} wall/>:<g transform={`rotate(${item.rotation||0} ${x} ${y})`}><svg x={x-size.width/2} y={y-size.height/2} width={size.width} height={size.height} viewBox="0 0 100 100" preserveAspectRatio="none"><PlacementSymbol kind={item.kind} system={system} medium={item.connectionMedium} view="wall" sections={item.radiatorSections} outline/></svg></g>}
   {!print&&item.kind==='connection-port'&&(showPorts||hoverPort===item.id||activePorts.includes(item.id)||snapPorts.includes(item.id)||nearPorts.includes(item.id)||item.id===selectedId||item.linkedApplianceId===selectedOwner)&&<circle className={snapPorts.includes(item.id)?'engineering-port-handle is-snapped':'engineering-port-handle'} cx={x} cy={y} r={portHandleRadius(item)*(hoverPort===item.id?1.3:1)} fill={snapPorts.includes(item.id)?'#45b46a':'#fff'} stroke={mediumColor(item.connectionMedium)} strokeWidth="1" vectorEffect="non-scaling-stroke"/>}
   <title>{item.label} · {p.station.toFixed(2)} м от начала стены · h={(item.height||0).toFixed(2)} м</title>

  </g>;})}
  {!print&&activePreset&&INLINE_FITTING_KINDS.has(activePreset.id)&&parts.map(({route,index,a,b})=>{const A=toSvg(a),B=toSvg(b);return <g key={'insert-'+route.id+':'+index} role="button" tabIndex="0" aria-label={`Вставить ${activePreset.label}: ${items.find(i=>i.id===route.fromId)?.label||'Узел'} → ${items.find(i=>i.id===route.toId)?.label||'Узел'} · участок ${index+1}`} onClick={e=>{e.stopPropagation();onPipe?.(e,route,a,b);}} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();onPipe?.(e,route,a,b);}}}><rect x={Math.min(A.x,B.x)-7} y={Math.min(A.y,B.y)-7} width={Math.abs(A.x-B.x)+14} height={Math.abs(A.y-B.y)+14} fill="transparent" stroke="none"/></g>;})}
  <text x="0" y="-12" style={{fontSize:12,fill:'#31524c'}}>{wall.label} · {wall.length.toFixed(2)} × {height.toFixed(2)} м</text>
 </svg>;
}

export default function EngineeringWallEditor({plan,walls,rooms,roomId,onRoom,items,routes,visible,system,medium,onMedium,profile,onProfile,wallRef,onWall,mode,onMode,activePreset,onClearTool,selectedId,onSelect,onPlace,onMoveItem,onConnect,onInsert,onRemove,onMaterialize,onSaveDraft,locked,linesLocked,onBasic,defaults,controlsHost,layers,onCreateJunction,onUndo,hasSelection,onRotate,canRotate,connections=[]}){
 const svgRef=useRef(null),drag=useRef(null),skip=useRef(false);
 const [guides,setGuides]=useState([]),[snapPorts,setSnapPorts]=useState([]),[nearPorts,setNearPorts]=useState([]);
 const [baseOptions,setBaseOptions]=useState(defaults||{});
 const [pending,setPending]=useState(null),[notice,setNotice]=useState(''),[preview,setPreview]=useState(null),[cursor,setCursor]=useState(null);
 const room=rooms.find(r=>r.id===roomId),choices=roomWallFaces(room,walls),wall=choices.find(w=>w.ref===wallRef)||choices[0]||walls[0];
 const height=Number(plan.wallHeight)||2.5;
 useEffect(()=>{setBaseOptions(defaults||{});setPending(null);},[system]);
 useEffect(()=>{if(mode==='select'||activePreset)setPending(null);if(activePreset)setNotice('');},[mode,activePreset?.id]);
 const pos=event=>{const m=svgRef.current?.getScreenCTM();if(!m||!wall)return null;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(m.inverse());const station=Math.max(0,Math.min(wall.length,p.x/100)),z=Math.max(0,Math.min(height,height-p.y/100));return {...wallFacePoint(wall,station),z,station,wallRef:wall.ref};};
 const aligned=(p,id)=>{const scale=svgRef.current?.getScreenCTM()?.a||1;return wallAlignment(p,wall,items.filter(i=>visible[i.layer]!==false),routes.filter(r=>visible[r.system]!==false),Math.min(.12,8/(Math.abs(scale)*100)),id);};
 const routePoint=p=>({...p,x:p.x+(wall?.normal.x||0)*(profile.clearanceMm??30)/1000,y:p.y+(wall?.normal.y||0)*(profile.clearanceMm??30)/1000});
 const selectMode=next=>{if(mode===next&&!activePreset)return;onClearTool();if(next!=='select'&&(!profile.material||!profile.diameterMm))onProfile(drawingPipeProfile(profile));onMode(next);setPending(null);setCursor(null);setNotice('');};
 const pick=(item,chosenMedium)=>{
  if(skip.current){skip.current=false;return;}
  if(mode==='select'&&item.kind==='connection-port'){const owner=items.find(i=>i.id===item.linkedApplianceId);if(owner&&INLINE_FITTING_KINDS.has(owner.kind)){onSelect(owner);return;}}
  if(activePreset||mode==='select'||CONNECTION_PORTS[item.kind]||INLINE_FITTING_KINDS.has(item.kind)){onSelect(item);return;}
  if(!pipeSystems.includes(item.layer)||item.layer!==system){setNotice('Выберите вывод прибора нужной системы.');return;}
  const m=chosenMedium||item.connectionMedium||((item.layer===system&&itemMedia(item,item.layer).includes(medium))?medium:itemMedia(item,item.layer)[0]);
  if(!pending){onMedium(m);setPending({id:item.id,system:item.layer,medium:m,points:[]});setNotice('Продолжайте трубу по стене. Можно выбрать другую стену, нажать конечный вывод или завершить пробелом.');return;}
  if(item.id===pending.id)return;
  if(item.layer!==pending.system||!itemMedia(item,item.layer).includes(pending.medium)||(chosenMedium&&chosenMedium!==pending.medium)){setNotice('Подключите ту же систему и среду: Х к Х, Г к Г, подачу к подаче, обратку к обратке.');return;}
  if(onConnect(pending,item.id,mode==='auto',profile,item)===false){setNotice('Участок вне контура. Укажите поворот внутри дома.');return;}setPending({id:item.id,system:item.layer,medium:pending.medium,points:[]});setNotice('Участок сохранён. Продолжайте или нажмите пробел.');
 };
 const end=()=>{setGuides([]);setCursor(null);if(pending?.points.length)onSaveDraft(pending,profile);setPending(null);onMode('select');setNotice('Построение завершено.');};
 useEffect(()=>{const key=e=>{if(e.defaultPrevented||e.target?.closest?.('input,textarea,select,dialog,[role=dialog]'))return;if(engineeringHistoryAction(e)==='undo'&&pending?.points.length){e.preventDefault();e.stopPropagation();setPending({...pending,points:pending.points.slice(0,-1)});setCursor(null);return;}if(e.key==='Escape'){setGuides([]);setPending(null);onClearTool();onMode('select');}else if((e.code==='Space'||e.key==='Enter')&&mode!=='select'){e.preventDefault();end();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});
 useEffect(()=>{if(pending&&!items.some(i=>i.id===pending.id)){setPending(null);setCursor(null);}},[items,pending?.id]);
 const source=items.find(i=>i.id===pending?.id);
 const draft=useMemo(()=>source&&(pending?.points.length||cursor)?(orthogonalPipePath([{x:source.x,y:source.y,z:source.height||0},...pending.points,...(cursor?[cursor]:[])],{plan,alongWall:true,clearanceMm:profile.clearanceMm??30,keepWaypoints:true})||[]):[],[source,pending,plan,profile.clearanceMm,cursor]);
 const moving=preview&&items.find(i=>i.id===preview.id);
 const moveIds=moving?engineeringMoveIds(items,connections,moving.id):new Set();
 const shown=moving?translatedEngineeringItems(items,moveIds,{x:preview.x-moving.x,y:preview.y-moving.y,z:preview.z-(moving.height||0)}):items;
 const settings=<><div className="engineering-wall-controls"><div className="engineering-pipe-profile"><label>Линия<select value={medium} onChange={e=>onMedium(e.target.value)}>{NETWORK_SYSTEMS[system].media.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
   <label>Отступ от стены, мм<input type="number" min="0" max="300" value={profile.clearanceMm??30} onChange={e=>onProfile({...profile,clearanceMm:Math.max(0,Math.min(300,Number(e.target.value)||0))})}/></label>
  </div></div>
  <details className="engineering-wall-basic"><summary>Базовая автоматическая схема</summary><p>Добавить основные узлы на выбранной стене. Существующая сеть сохраняется.</p>{system!=='sewer'&&<label>Разводка<select value={baseOptions.distribution||'tee'} onChange={e=>setBaseOptions({...baseOptions,distribution:e.target.value})}><option value="tee">Тройниковая</option><option value="collector">Коллекторная</option></select></label>}{system==='heating'&&<fieldset><legend>Не добавлять встроенное оборудование</legend>{[['builtInPump','Насос'],['builtInExpansion','Расширительный бак'],['builtInSafety','Группа безопасности']].map(([key,label])=><label key={key}><input type="checkbox" checked={baseOptions[key]===true} onChange={e=>setBaseOptions({...baseOptions,[key]:e.target.checked})}/>{label}</label>)}</fieldset>}<button type="button" disabled={locked||linesLocked||!wall} onClick={()=>{onBasic({...profile,distribution:baseOptions.distribution||'tee',builtInPump:baseOptions.builtInPump===true,builtInExpansion:baseOptions.builtInExpansion===true,builtInSafety:baseOptions.builtInSafety===true,wallRef:wall.ref});setNotice('Базовые узлы добавлены. Уточните высоты и параметры труб.');}}>Дополнить базовую схему</button></details>
  <p className="engineering-wall-status" role="status">{notice|| (activePreset?`Разместите: ${activePreset.label}. Нажмите трубу для вставки в линию; «Выбор» завершает инструмент.`:'Совместите цветные выходы для соединения. Для трубы выбирайте выходы по очереди; пробел завершает ввод.')}</p></>;
 return <section className="engineering-wall-editor">
 {controlsHost?createPortal(settings,controlsHost):settings}
 <div className="engineering-wall-layerbar">{layers}</div>
 <div className="engineering-wall-body"><div className="engineering-wall-tools" role="toolbar" aria-label="Инструменты стен комнаты">
 <button type="button" aria-label="Выбор" title="Выбор · Esc" aria-pressed={mode==='select'&&!activePreset} className={mode==='select'&&!activePreset?'active':''} onClick={()=>selectMode('select')}><MousePointer2/><span>Выбор</span></button>
 <button type="button" aria-label="Труба автоматически" title="Соединить приборы по стенам" disabled={linesLocked} aria-pressed={mode==='auto'} className={mode==='auto'?'active':''} onClick={()=>selectMode('auto')}><Route/><span>Авто</span></button>
 <button type="button" aria-label="Труба" title="Начало → повороты → конец · пробел завершает" disabled={linesLocked} aria-pressed={mode==='manual'} className={mode==='manual'?'active':''} onClick={()=>selectMode('manual')}><PencilLine/><span>Труба</span></button>
 <button type="button" aria-label="Завершить трубу" title="Завершить · пробел" disabled={!pending} onClick={end}><Check/><span>Готово</span></button>
 <button type="button" aria-label="Отменить точку" title="Убрать последний поворот" onClick={()=>{if(pending?.points.length)setPending({...pending,points:pending.points.slice(0,-1)});else onUndo?.();}}><Undo2/><span>Назад</span></button>
 <button type="button" aria-label="Повернуть на 90°" title="Повернуть выбранный элемент или инструмент" disabled={!canRotate} onClick={onRotate}><RotateCw/><span>Поворот</span></button>
 <button type="button" aria-label="Удалить выбранное" disabled={!hasSelection} onClick={onRemove}><Trash2/><span>Удалить</span></button>
 </div>
  <EngineeringViewport onGestureStart={()=>{drag.current=null;setPreview(null);setNearPorts([]);setSnapPorts([]);}}>{mode!=='select'&&!activePreset&&<EngineeringPipePicker profile={profile} onProfile={onProfile}/>}<div><EngineeringWallArtwork wall={wall} walls={walls} items={shown} routes={routes} visible={visible} height={height} selectedId={selectedId} activePreset={activePreset} draft={draft} guides={guides} activePorts={[...moveIds]} snapPorts={snapPorts} nearPorts={nearPorts} showPorts={mode!=='select'} svgRef={svgRef} connections={connections}
   onPlace={e=>{if(skip.current){skip.current=false;return;}const raw=pos(e),p=raw&&aligned(raw).point;if(!p)return;if(activePreset&&!locked){onPlace(activePreset,p,wall.ref);setGuides([]);}else if(pending&&mode==='manual'){setPending({...pending,points:[...pending.points,routePoint(p)]});setCursor(null);}else if(pending&&mode==='auto'&&!linesLocked){const node=onCreateJunction?.(p,wall.ref,medium);if(node)pick(node,medium);}else if(!pending&&mode!=='select'&&!linesLocked){const node=onCreateJunction?.(p,wall.ref,medium);if(node){setPending({id:node.id,system,medium,points:[]});setNotice('Укажите повороты или конечный прибор. Пробел — завершить.');}}else if(mode==='select')onSelect(null);}}
   onItem={pick} onDown={(e,item)=>{if(locked||activePreset||mode!=='select'||e.button!==0)return;e.preventDefault();e.stopPropagation();if(selectedId!==item.id){onSelect(item);return;}e.currentTarget.setPointerCapture(e.pointerId);const start=pos(e);drag.current={id:item.id,pointerId:e.pointerId,x:e.clientX,y:e.clientY,start};}}
   onMove={e=>{const d=drag.current;if(!d||d.pointerId!==e.pointerId){if(pending||activePreset){const p=pos(e);if(p){const next=aligned(p);setGuides(next.guides);if(pending)setCursor(routePoint(next.point));}}else setGuides([]);return;}const raw=pos(e),next=raw&&aligned(raw,d.id),p=raw;if(next)setGuides(next.guides);if(p){const item=items.find(i=>i.id===d.id);if(!item)return;const patch={x:item.x+p.x-d.start.x,y:item.y+p.y-d.start.y,height:(item.height||0)+p.z-d.start.z};const snap=item&&wallConnectionSnap(items,d.id,patch,wall,.10,connections,engineeringMoveIds(items,connections,d.id));const near=nearbyWallPorts(items,d.id,patch,wall,.16,connections);setNearPorts(near);setSnapPorts(snap?[snap.fromId,snap.toId]:[]);const offset=(item.wallClearanceMm??projectToWallFace(wall,item).distance*1000)/1000;const target=snap?.patch||patch;const at={...p,x:target.x-wall.normal.x*offset,y:target.y-wall.normal.y*offset,z:target.height};d.last=at;d.snapped=Boolean(snap);setPreview({id:d.id,x:target.x,y:target.y,z:target.height});setNotice(snap?'Совместимые выходы совпали. Отпустите для соединения.':near.length?'Близкие выводы несовместимы или заняты. Проверьте среду, размер и резьбу.':'');}}}
   onUp={e=>{const d=drag.current;if(!d||d.pointerId!==e.pointerId)return;if(d.last&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>4){onMoveItem(d.id,d.last,wall.ref);setNotice(d.snapped?'Выходы соединены.':'Положение сохранено.');skip.current=true;}drag.current=null;setPreview(null);setGuides([]);setSnapPorts([]);setNearPorts([]);}}
   onPipe={(e,route,a,b)=>{if(linesLocked)return;const p=e.type==='keydown'?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:((a.z||0)+(b.z||0))/2}:pos(e);if(!p)return;if(activePreset){if(!INLINE_FITTING_KINDS.has(activePreset.id)){setNotice('Этот прибор ставится рядом с трубой. Для вставки выберите фитинг или кран.');return;}onInsert(route,activePreset,p,wall.ref);}else if(mode==='select')onSelect(null,route);else {const joint=onMaterialize(route,p,wall.ref);if(joint)pick(joint,route.medium);}}}
   onContinuation={c=>{if(linesLocked)return;if(mode==='select'){if(!choices.some(w=>w.ref===c.nextWall.ref))onRoom('');onWall(c.nextWall.ref);setNotice(`${c.code}: продолжение на ${c.nextWall.label}.`);}else{const joint=onMaterialize(c.route,c.point,wall.ref);if(joint)pick(joint,c.route.medium);}}}/></div></EngineeringViewport>
 </div></section>;
}
