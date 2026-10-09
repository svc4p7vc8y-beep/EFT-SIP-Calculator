import {useState} from 'react';
import {houseContourPoints,roomPoints,boundsOf} from '../planner/geometry.js';

export default function ConstructionSourcePicker({surface,plan,settings,update}) {
  const [index,setIndex]=useState(0);
  if(!surface?.sourceBindingKey||!plan)return null;
  const refs=surface.sourceContributors||[],selected=refs[index];
  const unique=ref=>{
    const rows=ref.kind==='plan-wall'?(plan.walls||[]).filter(r=>r.include!==false):(plan.rooms||[]).filter(r=>r.include!==false&&!r.extension);
    return typeof ref.id==='string'&&ref.id.trim()&&rows.filter(r=>r.id===ref.id).length===1;
  };
  const allowed=selected?.complete&&unique(selected)&&(selected.kind==='plan-wall'||selected.role);
  const contour=houseContourPoints(plan),bounds=boundsOf(contour),pad=Math.max(bounds.w,bounds.h)*.12||1;
  const [,ends]=JSON.parse(surface.sourceBindingKey),[a,b]=ends;
  const length=Math.hypot(b[0]-a[0],b[1]-a[1])||1,nx=-(b[1]-a[1])/length*.15,ny=(b[0]-a[0])/length*.15;
  const hit=[[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]].map(p=>p.join(',')).join(' ');
  const points=rows=>rows.map(p=>`${p.x},${p.y}`).join(' ');
  const select=()=>{
    if(!allowed)return;
    const {kind,id,role}=selected;
    update({constructionSources:{...settings.constructionSources,selections:{...settings.constructionSources.selections,[surface.sourceBindingKey]:{kind,id,...(role?{role}:{})}}}});
  };
  const reset=()=>{const selections={...settings.constructionSources.selections};delete selections[surface.sourceBindingKey];update({constructionSources:{...settings.constructionSources,selections}});};
  return <details className="cut-note no-print" aria-label="Выбор источника на плане">
    <summary>Выбрать исходную конструкцию на плане</summary>
    <p>Красный участок — выбранная перегородка. Нажмите его для перебора совпадающих источников или выберите источник ниже. Затем подтвердите выбор.</p>
    <svg role="img" aria-label="План выбора источника перегородки" viewBox={`${bounds.x-pad} ${bounds.y-pad} ${bounds.w+2*pad} ${bounds.h+2*pad}`} style={{width:'100%',height:220,background:'#fff',touchAction:'manipulation'}}>
      <polygon points={points(contour)} fill="none" stroke="#111" strokeWidth=".025"/>
      {(plan.rooms||[]).filter(r=>r.include!==false&&!r.extension).map((r,i)=><polygon key={i} points={points(roomPoints(r))} fill={selected?.kind==='room-side'&&selected.id===r.id?'#e6f2db':'none'} stroke="#777" strokeWidth=".015"/>)}
      {(plan.walls||[]).filter(r=>r.include!==false).map((r,i)=><line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke="#777" strokeWidth=".015"/>)}
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#b42318" strokeWidth=".06"/>
      <polygon role="button" tabIndex="0" aria-label="Следующий совпадающий источник" points={hit} fill="transparent" style={{cursor:'pointer'}} onClick={()=>setIndex((index+1)%Math.max(1,refs.length))} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setIndex((index+1)%Math.max(1,refs.length));}}}/>
    </svg>
    <label>Совпадающий источник<select aria-label="Совпадающий источник" value={index} onChange={e=>setIndex(Number(e.target.value))}>{refs.map((r,i)=><option key={i} value={i}>{r.name} · {r.roleLabel||'линия'} · {r.complete?'целиком':'частично'}</option>)}</select></label>
    {!allowed?<p role="status">Нельзя назначить: нужен целый участок и уникальный ID исходной линии или прямоугольной комнаты. Разделённые и объединённые источники остаются на проверку.</p>:null}
    {surface.sourceSelectionLabel?<p>{surface.sourceSelectionLabel}</p>:null}
    <button disabled={!allowed} onClick={select}>Назначить источник</button>{surface.sourceBinding?<button onClick={reset}>Вернуть автоматическую привязку</button>:null}
    <p>Это проектная привязка, не расчёт несущей способности. Геометрия и состав материалов не меняются. Сохранение, отмена и повтор работают как для других правок проекта.</p>
  </details>;
}
