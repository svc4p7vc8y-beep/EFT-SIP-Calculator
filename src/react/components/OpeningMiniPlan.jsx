import {createPortal} from 'react-dom';
import {useState} from 'react';
import { boundsOf, houseContourPoints, roomPoints } from '../planner/geometry.js';
import {openingMiniMarkers} from '../planner/opening-mini-markers.js';
export default function OpeningMiniPlan({plans,selectedId,onSelect,title='Выберите проём на плане'}){
 const [expanded,setExpanded]=useState(false);
 const content=<div onClick={e=>{if(expanded)e.stopPropagation();}} onKeyDown={e=>{if(e.key==='Escape')setExpanded(false);}} className={`opening-mini-plan${expanded?' expanded':''}`}><header><strong>{title}</strong><button type="button" aria-label={expanded?'Свернуть план проёмов':'Развернуть план проёмов'} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Свернуть':'Увеличить'}</button></header><div className="opening-mini-floors">{plans.map((plan,index)=>{
  const offset=plans.slice(0,index).reduce((sum,p)=>sum+(p.openings||[]).filter(o=>o.type==='window'||o.type==='door').length,0);
  const floor=index+1,contour=houseContourPoints(plan),box=boundsOf(contour),markers=openingMiniMarkers(plan,box),pad=Math.max(box.w,box.h,.5)*100*.12;
  const xs=[box.x*100,(box.x+box.w)*100,...markers.map(m=>m.mx)],ys=[box.y*100,(box.y+box.h)*100,...markers.map(m=>m.my)];
  const minX=Math.min(...xs)-pad,minY=Math.min(...ys)-pad,width=Math.max(...xs)-minX+pad,height=Math.max(...ys)-minY+pad;
  return <div className="opening-mini-floor" key={floor}><span>{floor} этаж</span><svg viewBox={`${minX} ${minY} ${width} ${height}`} role="img" aria-label={`Проёмы на плане, этаж ${floor}`}>
   <path d={contour.map((q,i)=>`${i?'L':'M'} ${q.x*100} ${q.y*100}`).join(' ')+' Z'} fill="#f6faf7" stroke="#607e6d" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
   {(plan.rooms||[]).map(room=><polygon key={room.id} points={roomPoints(room).map(p=>`${p.x*100},${p.y*100}`).join(' ')} fill="none" stroke="#a2b4a8" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>)}
   {(plan.walls||[]).map(w=><line key={w.id} x1={w.x1*100} y1={w.y1*100} x2={w.x2*100} y2={w.y2*100} stroke="#a2b4a8" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>)}
   {markers.map(({opening,index,x,y,mx,my,radius,displaced})=><g key={opening.id} role="button" tabIndex={onSelect?0:undefined} aria-pressed={selectedId===opening.id} className={`opening-mini-marker ${opening.type}${selectedId===opening.id?' selected':''}`} onClick={()=>{onSelect?.(opening,floor);if(onSelect)setExpanded(false);}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&onSelect){e.preventDefault();onSelect(opening,floor);setExpanded(false);}}} aria-label={`${opening.type==='window'?'Окно':'Дверь'} ${index+offset+1}, этаж ${floor}`}>
    {displaced?<line x1={x} y1={y} x2={mx} y2={my} stroke="#65786c" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>:null}
    <circle cx={mx} cy={my} r={radius*1.6} className="opening-mini-hit"/>
    {selectedId===opening.id?<circle cx={mx} cy={my} r={radius*1.35} className="opening-mini-selection"/>:null}
    <circle cx={mx} cy={my} r={radius} className="opening-mini-dot"/>
    <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fontSize={radius*1.2} className="opening-mini-number">{index+offset+1}</text>
    <title>{opening.type==='window'?'Окно':'Дверь'} {index+offset+1} · {Math.round(opening.width*1000)} × {Math.round(opening.height*1000)} мм</title>
   </g>)}
  </svg>{markers.some(m=>m.displaced)?<small>Метки совпадающих проёмов разнесены и соединены линиями с местом на стене.</small>:null}</div>;
 })}</div><small>Синий — окна, коричневый — двери. Номер соответствует карточке ниже.</small></div>;
 return expanded?createPortal(<div className="opening-mini-backdrop" onClick={()=>setExpanded(false)}>{content}</div>,document.body):content;
}
