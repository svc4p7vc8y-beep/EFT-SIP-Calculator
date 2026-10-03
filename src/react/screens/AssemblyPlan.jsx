import { useState } from 'react';
import { ASSEMBLY_TYPES, productionMark } from '../calculations/production-assembly.js';
import { DraftText } from './CuttingControls.jsx';

export function AssemblyDiagram({assembly,onPick}) {
  const [floor,setFloor]=useState(assembly.floors.at(-1)?.floor||1);
  const plan=assembly.floors.find(p=>p.floor===floor)||assembly.floors[0];
  if(!plan?.contour.length)return <p>Задайте контур дома на плане.</p>;
  const {x,y,width,height}=assembly.bounds,pad=Math.max(width,height)*.1,font=Math.max(width,height)*.022;
  const points=items=>items.map(p=>p.slice(0,2).join(',')).join(' ');
  const center=points=>{const ring=points.length>1&&points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1]?points.slice(0,-1):points;return [0,1].map(axis=>ring.reduce((sum,p)=>sum+p[axis],0)/ring.length);};
  return <div className="cut-assembly"><div className="cut-tabs">{assembly.floors.map(p=><button key={p.floor} aria-pressed={floor===p.floor} onClick={()=>setFloor(p.floor)}>План {p.floor} этажа</button>)}</div>
    <svg viewBox={`${x-pad} ${y-pad} ${width+2*pad} ${height+2*pad}`} role="img" aria-label="Совмещённый план комнат, кровли и проектных опор" onClick={event=>{if(!onPick)return;const svg=event.currentTarget,matrix=svg.getScreenCTM();if(!matrix)return;const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const local=point.matrixTransform(matrix.inverse());onPick(Math.round(local.x),Math.round(local.y));}}>
      <polygon points={points(assembly.roofOutline)} fill="#e5edf2" stroke="#345d86" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
      <polygon points={points(plan.contour)} fill="#fafbf6" stroke="#222" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {plan.rooms.map((room,i)=><g key={i}><polygon points={points(room.points)} fill="none" stroke={room.bearing?'#354d36':'#a2aa9f'} strokeWidth={room.bearing?3:1} vectorEffect="non-scaling-stroke"/><text x={center(room.points)[0]} y={center(room.points)[1]} textAnchor="middle" fontSize={font}>{room.name}</text></g>)}
      {plan.openings.map((o,i)=>{const vertical=o.orientation==='v'||Math.min(Math.abs(o.x-x),Math.abs(o.x-x-width))<Math.min(Math.abs(o.y-y),Math.abs(o.y-y-height));return <line key={i} x1={o.x-(vertical?0:o.width/2)} y1={o.y-(vertical?o.width/2:0)} x2={o.x+(vertical?0:o.width/2)} y2={o.y+(vertical?o.width/2:0)} stroke={o.type==='window'?'#347196':'#bb7734'} strokeWidth="5" vectorEffect="non-scaling-stroke"><title>{o.name} · {o.width} мм</title></line>;})}
      {assembly.rafters.map(r=><line key={r.id} x1={r.a[0]} y1={r.a[1]} x2={r.b[0]} y2={r.b[1]} stroke="#879baf" strokeWidth="1" vectorEffect="non-scaling-stroke"><title>{r.id} · {r.length} мм · {r.profile}</title></line>)}
      {assembly.ridge.length===2?<line x1={assembly.ridge[0][0]} y1={assembly.ridge[0][1]} x2={assembly.ridge[1][0]} y2={assembly.ridge[1][1]} stroke="#345d86" strokeWidth="3" strokeDasharray="8 4" vectorEffect="non-scaling-stroke"/>:null}
      {assembly.supports.map(s=><g key={s.id}><line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={s.type==='foundation'?'#2e743c':'#a85528'} strokeWidth="5" vectorEffect="non-scaling-stroke"/><circle cx={s.a[0]} cy={s.a[1]} r={font*.22} fill={s.type==='foundation'?'#2e743c':'#a85528'}/><text x={(s.a[0]+s.b[0])/2} y={(s.a[1]+s.b[1])/2-font*.45} textAnchor="middle" fontSize={font}>{s.mark}</text><title>{s.name} · {s.profile} · {s.length} мм</title></g>)}
    </svg><p>Серый — стропила; синий пунктир — ось конька; коричневый — проектные прогоны, балки и стойки; зелёный — опоры фундамента. Стены помещений показаны для привязки; несущий статус и нагрузки подтверждаются рабочим проектом.</p>
    <div className="cut-table-wrap"><table><thead><tr><th>Марка и элемент</th><th>Сечение / длина</th><th>Путь нагрузки</th></tr></thead><tbody>{assembly.supports.map(s=><tr key={s.id}><td>{s.mark} · {s.name}</td><td>{s.profile||'Основание'} · {s.length} мм</td><td>{s.loadPath.text}<small>{s.loadPath.complete?'Все звенья пути заданы':'Требуется заполнение опор'}</small></td></tr>)}</tbody></table></div>
  </div>;
}

export default function AssemblyPlan({report,settings,update,NumberInput}) {
  const [pointTarget,setPointTarget]=useState(null);
  const change=(index,patch)=>update({roofSupports:settings.roofSupports.map((s,i)=>i===index?{...s,...patch}:s)});
  const selectPoint=(index,end)=>{setPointTarget({id:settings.roofSupports[index].id,end});document.querySelector('.cut-assembly')?.scrollIntoView({behavior:'smooth',block:'start'});};
  const pick=(x,y)=>{const index=settings.roofSupports.findIndex(s=>s.id===pointTarget?.id);if(index<0)return;const s=settings.roofSupports[index];change(index,s.type==='post'?{x1:x,y1:y,x2:x,y2:y}:{[`x${pointTarget.end}`]:x,[`y${pointTarget.end}`]:y});setPointTarget(null);};
  const add=type=>{const b=report.assembly.bounds;update({roofSupports:[...settings.roofSupports,{id:crypto.randomUUID(),type,name:'',profile:'',nodeRef:'',x1:b.x,y1:b.y,z1:0,x2:type==='post'?b.x:b.x+b.width,y2:b.y,z2:type==='post'?2500:0,startSupport:'',endSupport:'',foundationRef:''}]});};
  return <div className="cut-card"><h2>Крыша, каркас и опоры</h2><p>Размещайте элементы по координатам плана в мм. У стойки начало — низ, конец — верх. Для прогона и балки укажите опоры обоих концов, для стойки — нижнюю опору; последний элемент цепочки — фундамент. Размеры, сечения, отметки и узлы вводятся по проекту.</p>{pointTarget?<p role="status">Нажмите нужное место на плане: {pointTarget.end===1?'начало':'конец'} выбранной опоры. <button onClick={()=>setPointTarget(null)}>Отменить выбор точки</button></p>:null}<AssemblyDiagram assembly={report.assembly} onPick={pointTarget?pick:null}/>
    <h3>Проектные элементы</h3><div className="cut-tabs">{Object.entries(ASSEMBLY_TYPES).map(([type,label])=><button key={type} disabled={settings.roofSupports.length>=200} onClick={()=>add(type)}>Добавить: {label.toLowerCase()}</button>)}</div>
    {settings.roofSupports.map((s,index)=><details key={s.id} className="cut-layout-settings"><summary>ОП-{index+1} · {s.name||ASSEMBLY_TYPES[s.type]}</summary><div className="cut-fields">
      <DraftText label="Название" value={s.name} onChange={name=>change(index,{name})}/>
      <DraftText label="Сечение, мм" value={s.profile} onChange={profile=>change(index,{profile})} placeholder="100×150 — по проекту"/>
      <DraftText label="Рабочий узел" value={s.nodeRef} onChange={nodeRef=>change(index,{nodeRef})}/>
      {['x1','y1','z1','x2','y2','z2'].map((key,i)=><NumberInput key={key} label={`${i<3?'Начало':'Конец'} · ${key[0]==='z'?'отметка высоты':key[0].toUpperCase()}`} value={s[key]??''} min={-100000} onChange={value=>change(index,{[key]:value})}/>)}
      {(s.type==='foundation'?[]:s.type==='post'?['startSupport']:['startSupport','endSupport']).map((key,i)=><label key={key}>{s.type==='post'?'Нижняя опора':i===0?'Опора начала':'Опора конца'}<select value={s[key]||''} onChange={e=>change(index,{[key]:e.target.value})}><option value="">Выберите опору</option>{settings.roofSupports.map((target,j)=>target.id!==s.id?<option key={target.id} value={target.id}>ОП-{j+1} · {target.name||ASSEMBLY_TYPES[target.type]}</option>:null)}</select></label>)}
      {s.type==='foundation'?<DraftText label="Опора фундамента / узел" value={s.foundationRef} onChange={foundationRef=>change(index,{foundationRef})} placeholder="Свая СВ-3 / бетонное основание, узел Ф-1"/>:null}
    </div><div className="cut-tabs"><button onClick={()=>selectPoint(index,1)}>Указать начало на плане</button><button onClick={()=>selectPoint(index,2)}>Указать конец на плане</button><button onClick={()=>update({roofSupports:settings.roofSupports.filter((_,i)=>i!==index)})}>Удалить ОП-{index+1}</button></div></details>)}
    <h3>Деталировка стропил</h3><p>Количество и сечения стропил взяты из текущей модели кровли. Длины — по геометрии скатов со свесами; углы, врубки, затяжки и стыковка длинных элементов уточняются в альбоме узлов.</p><div className="cut-table-wrap"><table><thead><tr><th>Марка</th><th>Скат</th><th>Сечение</th><th>Длина, мм</th></tr></thead><tbody>{report.assembly.rafters.map(r=><tr key={r.id}><td>{productionMark(r.id)}</td><td>{r.name}</td><td>{r.profile}</td><td>{r.length}</td></tr>)}</tbody></table></div>
    {!report.assembly.rafters.length?<p>Стропильных деталей нет: выбрана SIP-кровля либо требуется индивидуальная схема.</p>:null}
  </div>;
}
