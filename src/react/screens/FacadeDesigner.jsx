import React,{useMemo,useRef,useState} from 'react';
import {useProject} from '../state/ProjectContext.jsx';
import {calculateProject} from '../calculations/estimate-engine.js';
import {calculateProductionCutting} from '../calculations/production-cutting.js';
import {applyFacade,createFacade,facadeEnvelope,facadeLayout,facadeMemberShapes,removeFacade} from '../calculations/facade-design.js';
import {houseContourPoints,roomPoints} from '../planner/geometry.js';
import {shapeArea} from '../../calculations/opening-shape.js';
import './facade-designer.css';

const path=shape=>shape.map(poly=>poly.map(ring=>'M'+ring.map(p=>p.join(',')).join('L')+'Z').join('')).join('');
const rub=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n);
const field=(label,value,onChange,step=1)=><label>{label}<input type="number" step={step} value={value??''} onChange={e=>onChange(e.target.value===''?'':Number(e.target.value))}/></label>;

export default function FacadeDesigner({onClose}){
  const {project,commit,undo,redo}=useProject();
  const [floor,setFloor]=useState(Math.max(1,Number(project.meta.floors)||1)),[wallId,setWallId]=useState(''),[draft,setDraft]=useState(null),[selected,setSelected]=useState(''),[message,setMessage]=useState(''),[roomId,setRoomId]=useState(''),[tab,setTab]=useState('geometry');
  const drag=useRef(null),svg=useRef(null);
  const calculation=useMemo(()=>calculateProject(project),[project]);
  const report=useMemo(()=>calculateProductionCutting(project,calculation),[project,calculation]);
  const plan=floor===1?project.plan:project.upperFloors[floor-2];
  const walls=report.surfaces.filter(s=>s.exterior&&s.floor===floor&&s.planStart);
  const active=wallId||walls[0]?.id,envelope=useMemo(()=>facadeEnvelope(report,active),[report,active]);
  const saved=(plan?.facades||[]).find(f=>f.wallId===active),config=draft?.wallId===active?draft:saved;
  const layout=useMemo(()=>config&&envelope?facadeLayout(config,envelope):null,[config,envelope]);
  const members=useMemo(()=>layout?facadeMemberShapes(config,layout):[],[layout,config]);
  const patch=change=>setDraft({...config,...change});
  const switchWall=id=>{setWallId(id);setDraft(null);setSelected('');setMessage('');};
  const start=()=>{setDraft(createFacade(envelope,floor));setMessage('Эскиз. Проект не изменён. Настройте размеры и нажмите «Применить фасад».');};
  const apply=()=>{
    try{
      const next=applyFacade(project,config,envelope),after=calculateProject(next),before=calculation;
      commit(()=>next);setDraft(null);
      setMessage(`Применено. SIP стен: ${before.metrics.exteriorWallNetArea.toFixed(2)} → ${after.metrics.exteriorWallNetArea.toFixed(2)} м². Смета: ${rub(before.totals?.total??0)} → ${rub(after.totals?.total??0)} ₽. Проверьте позиции без цены и рабочие узлы. Отмена — Ctrl+Z.`);
    }catch(error){setMessage(error.message);}
  };
  const contour=houseContourPoints(plan),xs=contour.map(p=>p.x),ys=contour.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys),pw=Math.max(...xs)-minX||1,ph=Math.max(...ys)-minY||1;
  const width=envelope?.wall.width||8000,height=envelope?Math.max(...envelope.shape.flatMap(p=>p.flatMap(r=>r.map(p=>p[1])))):5000,pad=Math.max(width,height)*.07;
  const volume=layout?.members.reduce((s,m)=>s+Math.hypot(m.b[0]-m.a[0],m.b[1]-m.a[1])*Number(config.boardWidthMm)*Number(config.boardDepthMm)*Number(config.plies)/1e9,0)||0;
  const onPointerMove=e=>{
    if(!drag.current||!config)return;
    const matrix=svg.current.getScreenCTM();if(!matrix)return;
    const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),x=Math.round(point.x/5)*5;
    const posts=[...config.posts];posts[drag.current.index]=Math.max(0,Math.min(width,x));patch({posts});
  };
  const supportCandidates=project.settings.productionCutting.roofSupports.filter(s=>s.facadeId!==config?.id&&!s.referenceOnly&&s.type!=='foundation');
  const selectedMember=layout?.members.find(m=>m.key===selected),override=config?.memberOverrides?.[selected]||{};
  const setOverride=change=>patch({memberOverrides:{...config.memberOverrides,[selected]:{...override,...change}}});
  const selectedWindow=layout?.windows.find(w=>w.key===selected),windowOverride=config?.windowOverrides?.[selected]||{};
  const editWindow=change=>patch({windowOverrides:{...config.windowOverrides,[selected]:{...windowOverride,...change}}});
  return <section className="facade-designer" aria-label="Конструктор витражного фасада">
    <header className="facade-header"><div><small>ОКНА · НЕСУЩИЙ КАРКАС · ВТОРОЙ СВЕТ</small><h2>Конструктор фасада</h2></div><div className="facade-actions"><button onClick={undo} title="Отменить">↶</button><button onClick={redo} title="Повторить">↷</button><button onClick={()=>window.print()}>Фасад / PDF</button><button onClick={onClose}>К отдельным окнам</button></div></header>
    <div className="facade-workspace"><aside className="facade-sidebar">
      <label>Этаж<select value={floor} onChange={e=>{setFloor(Number(e.target.value));switchWall('');setRoomId('');}}>{Array.from({length:Math.max(1,Number(project.meta.floors)||1)},(_,i)=><option key={i} value={i+1}>{i+1} этаж</option>)}</select></label>
      <label>Комната<select value={roomId} onChange={e=>setRoomId(e.target.value)}><option value="">Весь этаж</option>{plan.rooms.filter(r=>r.include!==false).map(r=><option key={r.id} value={r.id}>{r.name||'Комната'}{r.ceilingMode==='open-rafter'?' · второй свет':''}</option>)}</select></label>
      <svg className="facade-mini-plan" viewBox={`${minX-.6} ${minY-.6} ${pw+1.2} ${ph+1.2}`} aria-label="Выберите стену фасада">
        <polygon points={contour.map(p=>`${p.x},${p.y}`).join(' ')} fill="#f8f6ee" stroke="#9ca89a" strokeWidth=".09"/>
        {plan.rooms.filter(r=>r.id===roomId).map(r=><polygon key={r.id} points={roomPoints(r).map(p=>`${p.x},${p.y}`).join(' ')} fill="#dcecc8"/>)}
        {walls.map(w=><line key={w.id} x1={w.planStart[0]/1000} y1={w.planStart[1]/1000} x2={w.planEnd[0]/1000} y2={w.planEnd[1]/1000} stroke={active===w.id?'#54842b':'#68776b'} strokeWidth={active===w.id?'.18':'.09'} onClick={()=>switchWall(w.id)} style={{cursor:'pointer'}}><title>{w.name}</title></line>)}
      </svg>
      <label>Стена<select value={active||''} onChange={e=>switchWall(e.target.value)}>{walls.map(w=><option key={w.id} value={w.id}>{w.name} · {Math.round(w.width)} мм</option>)}</select></label>
      {!config?<button className="primary" disabled={!envelope} onClick={start}>Создать витражный фасад</button>:<>
        <div className="facade-tabs"><button aria-pressed={tab==='geometry'} onClick={()=>setTab('geometry')}>Геометрия</button><button aria-pressed={tab==='frame'} onClick={()=>setTab('frame')}>Каркас</button><button aria-pressed={tab==='supports'} onClick={()=>setTab('supports')}>Опоры</button></div>
        {tab==='geometry'?<>
          <label>Название<input value={config.name} onChange={e=>patch({name:e.target.value})}/></label>
          <div className="facade-fields">{field('Низ окон, мм',config.sillMm,v=>patch({sillMm:v}))}{field('Ось перемычки, мм',config.transomMm,v=>patch({transomMm:v}))}{field('Отступ от кровли, мм',config.headInsetMm,v=>patch({headInsetMm:v}))}{field('Монтажный зазор, мм',config.clearanceMm,v=>patch({clearanceMm:v}))}</div>
          <label className="facade-check"><input type="checkbox" checked={config.lower} onChange={e=>patch({lower:e.target.checked})}/>Нижний ряд</label><label className="facade-check"><input type="checkbox" checked={config.upper} onChange={e=>patch({upper:e.target.checked})}/>Верхний ряд по скатам</label>
          <h3>Оси стоек от начала стены</h3><div className="facade-posts">{config.posts.map((x,i)=><div key={i}><label>С{i+1}<input aria-label={`Ось стойки ${i+1}`} type="number" value={Math.round(x)} onChange={e=>patch({posts:config.posts.map((v,j)=>i===j?Number(e.target.value):v)})}/></label><button title={`Удалить стойку ${i+1}`} disabled={config.posts.length<=2} onClick={()=>patch({posts:config.posts.filter((_,j)=>i!==j),postRefs:config.posts.map((_,j)=>config.postRefs?.[j]||`post-${j}`).filter((_,j)=>i!==j)})}>×</button></div>)}</div><button disabled={config.posts.length>=12} onClick={()=>patch({posts:[...config.posts,(Math.min(...config.posts)+Math.max(...config.posts))/2+300],postRefs:[...config.posts.map((_,j)=>config.postRefs?.[j]||`post-${j}`),`post-${crypto.randomUUID()}`]})}>＋ Стойка</button>
          <button onClick={()=>patch({sourceKey:envelope.key,anchor:[envelope.wall.planStart,envelope.wall.planEnd],widthMm:width})}>Обновить контур стены и кровли</button>
        </>:null}
        {tab==='frame'?<>
          <h3>Пакет досок по проекту</h3><div className="facade-fields">{field('Толщина доски, мм',config.boardWidthMm,v=>patch({boardWidthMm:v}))}{field('Ширина доски, мм',config.boardDepthMm,v=>patch({boardDepthMm:v}))}{field('Досок в пакете, шт',config.plies,v=>patch({plies:v}))}</div>
          <label>Цена прайса относится к<select value={config.packagePricing||'board'} onChange={e=>patch({packagePricing:e.target.value})}><option value="board">Отдельной доске пакета</option><option value="package">Готовому пакету / клеёному брусу</option></select></label>
          <label>Материал пакета<select value={config.catalogId} onChange={e=>patch({catalogId:e.target.value})}><option value="">По сечению / требуется цена</option>{project.priceMat.filter(r=>['м³','м3','м.п.','м'].includes(r.unit)).map(r=><option key={r.id} value={r.id}>{r.name} · {r.price} ₽/{r.unit}</option>)}</select></label>
          <label>Рабочий узел, соединения<textarea value={config.nodeRef} onChange={e=>patch({nodeRef:e.target.value})} placeholder="Ссылка на чертёж, соединение пакета, крепёж"/></label><label>Основание / путь до фундамента<input value={config.foundationRef} onChange={e=>patch({foundationRef:e.target.value})} placeholder="Балка, ростверк и узел по проекту"/></label>
          <h3>Крепёж и монтаж по проекту</h3>
          {(config.extras||[]).map((extra,i)=>{const edit=change=>patch({extras:config.extras.map((v,j)=>i===j?{...v,...change}:v)});return <div className="facade-link" key={extra.id}>
            <select aria-label={`Вид позиции фасада ${i+1}`} value={extra.kind} onChange={e=>edit({kind:e.target.value,catalogId:''})}><option value="material">Материал / крепёж</option><option value="labor">Работа</option></select>
            <select aria-label={`Позиция фасада ${i+1}`} value={extra.catalogId} onChange={e=>edit({catalogId:e.target.value})}><option value="">Выберите из прайса</option>{(extra.kind==='labor'?project.priceLab:project.priceMat).map(r=><option key={r.id} value={r.id}>{r.name} · {r.price} ₽/{r.unit}</option>)}</select>
            {field(`Количество позиции ${i+1}`,extra.qty,v=>edit({qty:v}),.01)}<button onClick={()=>patch({extras:config.extras.filter((_,j)=>i!==j)})}>Убрать позицию</button>
          </div>;})}<button onClick={()=>patch({extras:[...(config.extras||[]),{id:crypto.randomUUID(),kind:'material',catalogId:'',qty:''}]})}>＋ Крепёж / работа</button>
          <p className="facade-note">Число досок задаётся проектировщиком. Сборный пакет не приравнивается к заводскому клеёному брусу. Крепёж добавляется в смету по рабочему узлу через проектные позиции.</p>
        </>:null}
        {tab==='supports'?<>
          <h3>Связать опору крыши с фасадом</h3><p className="facade-note">Привязка проверяет геометрию и путь нагрузки. Для перемещения конца включите «Совместить».</p>
          {(config.links||[]).map((link,i)=><div className="facade-link" key={i}><select aria-label={`Опора крыши ${i+1}`} value={link.supportId} onChange={e=>patch({links:config.links.map((v,j)=>i===j?{...v,supportId:e.target.value}:v)})}><option value="">Выберите прогон / балку</option>{supportCandidates.map(s=><option key={s.id} value={s.id}>{s.name||s.id}</option>)}</select><select aria-label={`Конец опоры ${i+1}`} value={link.end} onChange={e=>patch({links:config.links.map((v,j)=>i===j?{...v,end:e.target.value}:v)})}><option value="start">Начало</option><option value="end">Конец</option></select><select aria-label={`Опорный элемент фасада ${i+1}`} value={link.memberKey} onChange={e=>patch({links:config.links.map((v,j)=>i===j?{...v,memberKey:e.target.value}:v)})}>{layout.members.map(m=><option key={m.key} value={m.key}>{m.name}</option>)}</select><label className="facade-check"><input type="checkbox" checked={!!link.snap} onChange={e=>patch({links:config.links.map((v,j)=>i===j?{...v,snap:e.target.checked}:v)})}/>Совместить конец с верхом элемента</label><button onClick={()=>patch({links:config.links.filter((_,j)=>i!==j)})}>Удалить связь</button></div>)}<button onClick={()=>patch({links:[...(config.links||[]),{supportId:'',end:'end',memberKey:'post-1',snap:false}]})}>＋ Связь с опорой крыши</button>
        </>:null}
      </>}
    </aside>
    <main className="facade-canvas-panel"><div className="facade-caption"><b>{config?.name||'Развёртка стены и фронтона'}</b><span>{Math.round(width)} мм · вид со стороны начала стены</span></div>
      <svg ref={svg} className="facade-canvas" viewBox={`${-pad} ${-height-pad} ${width+2*pad} ${height+2*pad}`} onPointerMove={onPointerMove} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} aria-label="Развёртка фасада: перетаскивайте стойки">
        <g transform="scale(1,-1)">{envelope?<path d={path(envelope.shape)} fill="#f5f1e5" stroke="#96a08e" strokeWidth={width/800}/>:null}
        {layout?.windows.map(win=><g key={win.key} onClick={()=>setSelected(win.key)}><polygon points={win.outline.map(([x,y])=>`${x+win.x},${y+win.y}`).join(' ')} fill={selected===win.key?'#b5dedf':'#dcecef'} stroke="#628b96" strokeWidth={width/500}/><text x={win.x+win.width/2} y={-(win.y+Math.min(win.leftHeight,win.rightHeight)/2)} transform="scale(1,-1)" textAnchor="middle" fontSize={width/65} fill="#40616a">{Math.round(win.width)} × {Math.round(win.height)}</text></g>)}
        {members.map(member=><path key={member.key} d={path([member.shape])} fill={selected===member.key?'#94b96b':'#c8aa72'} stroke="#8a754c" strokeWidth={width/900} onClick={()=>setSelected(member.key)}/>)}
        {config?.posts.map((x,i)=><circle key={i} cx={x} cy={-pad/3} r={width/100} fill="#5b872e" stroke="white" strokeWidth={width/1200} style={{cursor:'ew-resize'}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={index:i};setSelected(config.postRefs?.[i]||`post-${i}`);}}><title>Переместить ось стойки {i+1}</title></circle>)}
        {envelope?<line x1="0" y1={envelope.wall.baseHeight||envelope.wall.requestedHeight} x2={width} y2={envelope.wall.baseHeight||envelope.wall.requestedHeight} stroke="#99a893" strokeWidth={width/1000} strokeDasharray={`${width/100} ${width/140}`}/>:null}
        </g>
      </svg>
      <div className="facade-summary"><span><b>{layout?.windows.length||0}</b> изделий</span><span><b>{(layout?.windows.reduce((s,w)=>s+shapeArea([[w.outline]])/1e6,0)||0).toFixed(2)}</b> м² окон</span><span><b>{volume.toFixed(4)}</b> м³ каркаса</span><span>Заготовки: {(layout?.members.length||0)*(config?.packagePricing==='package'?1:Number(config?.plies||0))} шт</span></div>
      {message?<p className="facade-message" role="status">{message}</p>:null}
      {layout?.errors.length?<div className="facade-errors" role="alert">{layout.errors.map(text=><p key={text}>{text}</p>)}</div>:null}
      {layout?.warnings.map(text=><p className="facade-note" key={text}>⚠ {text}</p>)}
      <p className="facade-note">Оконные рамы не считаются опорами крыши. Несущие стойки и балки показаны отдельным слоем каркаса в 3D и в раскрое. Цены и нормы монтажа не меняются.</p>
      {config?<div className="facade-actions"><button className="primary" disabled={!!layout?.errors.length} onClick={apply}>Применить фасад</button><button onClick={()=>{setDraft(null);setMessage('Правки эскиза отменены.');}}>Отменить правки</button>{saved?<button onClick={()=>{commit(p=>removeFacade(p,config.id,floor));setDraft(null);setSelected('');setMessage('Фасад удалён. Связи опор крыши следует перепроверить.');}}>Удалить фасад</button>:null}</div>:null}
    </main><aside className="facade-inspector"><h3>{selectedMember?.name||'Элементы фасада'}</h3>
      {selectedMember?<><p>{selectedMember.profile} мм · пакет {config.plies} досок</p><p>Длина оси: {Math.round(Math.hypot(selectedMember.b[0]-selectedMember.a[0],selectedMember.b[1]-selectedMember.a[1]))} мм</p><label>Индивидуальный узел<input value={override.nodeRef??config.nodeRef} onChange={e=>setOverride({nodeRef:e.target.value})}/></label><label>Материал элемента<select value={override.estimateCatalogId??config.catalogId} onChange={e=>setOverride({estimateCatalogId:e.target.value})}><option value="">По сечению / без цены</option>{project.priceMat.filter(r=>['м³','м3','м.п.','м'].includes(r.unit)).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label></>:<p>Выберите стойку, балку или окно на развёртке. Профиль, створки, стеклопакет и цена поставщика доступны после применения в общем конфигураторе окон.</p>}
      {selectedWindow||/^(upper|lower)-\d+$/.test(selected)?<><h3>Окно {selected}</h3><label>Форма изделия<select value={windowOverride.shape||'auto'} onChange={e=>editWindow({shape:e.target.value})}><option value="auto">По скату</option><option value="rectangle">Прямоугольник</option><option value="triangle">Треугольник</option></select></label>{windowOverride.shape==='triangle'?field('Положение вершины, 0–1',windowOverride.apexPosition??selectedWindow?.apexPosition??.5,v=>editWindow({apexPosition:v}),.05):null}<label className="facade-check"><input type="checkbox" checked={windowOverride.enabled!==false} onChange={e=>editWindow({enabled:e.target.checked})}/>Окно в этом пролёте</label></>:null}
      <h3>Проверки после применения</h3>{report.assembly.issues.filter(text=>/путь нагрузки|опирание|рабочий узел|фасад/i.test(text)).slice(0,15).map((text,i)=><p className="facade-note" key={i}>{text}</p>)}
      <h3>Боковые стены второго света</h3><label className="facade-check"><input type="checkbox" checked={plan.secondLightWallFit!==false} onChange={e=>commit(p=>{const target=floor===1?p.plan:p.upperFloors[floor-2];target.secondLightWallFit=e.target.checked;return p;})}/>Достроить до низа мауэрлата</label><p>Добавляется пропущенная толщина потолка вдоль открытых комнат. Сетка раскроя перераспределяет короткий верхний ряд, сохраняя минимальный размер панели.</p>
      {roomId?field('Высота боковой стены комнаты, мм (пусто — авто)',plan.rooms.find(r=>r.id===roomId)?.secondLightEaveHeightMm??'',v=>commit(p=>{const target=floor===1?p.plan:p.upperFloors[floor-2],room=target.rooms.find(r=>r.id===roomId);if(v==='')delete room.secondLightEaveHeightMm;else room.secondLightEaveHeightMm=v;return p;})):null}
    </aside></div>
  </section>;
}
