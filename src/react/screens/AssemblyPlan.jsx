import { useState } from 'react';
import { ASSEMBLY_TYPES, productionMark } from '../calculations/production-assembly.js';
import { DraftText } from './CuttingControls.jsx';
import AssemblyCanvas from './AssemblyCanvas.jsx';
import { RoofSlopePreview } from './MountingAlbum.jsx';
import { RoofDrawingPreview } from './RoofDrawings.jsx';
import { useProject } from '../state/ProjectContext.jsx';
import { productionEstimateLines } from '../calculations/production-estimate.js';
import { projectOnSupport,changeSupportWithPosts } from '../calculations/assembly-placement.js';
import AutoRoofSupports from './AutoRoofSupports.jsx';

export { default as AssemblyDiagram } from './AssemblyCanvas.jsx';

export default function AssemblyPlan({report,settings,update,NumberInput,compact=false}) {
  const {project}=useProject();
  const [pointTarget,setPointTarget]=useState(null);
  const [selected,setSelected]=useState(null),[tool,setTool]=useState('purlin');
  const [drawProfile,setDrawProfile]=useState('100×150'),[drawZ1,setDrawZ1]=useState(2500),[drawZ2,setDrawZ2]=useState(2500);
  const [drawing,setDrawing]=useState(null),[cursor,setCursor]=useState(null);
  const [nodeMode,setNodeMode]=useState(false),[activeFloor,setActiveFloor]=useState(report.assembly.floors.at(-1)?.floor||1),[placementMessage,setPlacementMessage]=useState('');
  const [nodeRef,setNodeRef]=useState('');
  const begin=type=>{setNodeMode(false);setPointTarget(null);setSelected(null);setCursor(null);setTool(type);setPlacementMessage('');if(type==='post'){setDrawZ1(0);setDrawZ2(2500);}setDrawing({type});};
  const beginUnder=()=>{const beam=report.assembly.supports.find(s=>s.id===selected);if(!beam)return;setNodeMode(false);setPointTarget(null);setCursor(null);setDrawZ1(0);setDrawZ2(Math.max(beam.a[2],beam.b[2]));setDrawing({type:'post',upperSupport:beam.id});setPlacementMessage('Нажмите на нужное место вдоль выбранного прогона. Верх стойки берётся с его линии; нижнюю отметку и опору проверьте.');};
  const validDraft=/^\d+[×xх]\d+$/.test(drawProfile)&&drawProfile.split(/[×xх]/).every(v=>Number(v)>0)&&[drawZ1,drawZ2].every(v=>v!==''&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=100000);
  const drawPick=(x,y)=>{const vertical=drawing.type==='post';if(!validDraft||(vertical&&Number(drawZ2)<=Number(drawZ1)))return;if(!drawing.a&&!vertical){setDrawing({...drawing,a:[x,y]});setCursor([x,y]);return;}if(!vertical&&Math.hypot(x-drawing.a[0],y-drawing.a[1])<10)return;
    const beam=report.assembly.supports.find(s=>s.id===drawing.upperSupport),projected=beam?projectOnSupport(beam,x,y):null;
    if(projected){x=projected.x;y=projected.y;if(projected.z<=Number(drawZ1)){setPlacementMessage('Нижняя отметка должна быть ниже выбранного прогона.');return;}}
    const id=crypto.randomUUID(),a=vertical?[x,y]:drawing.a;
    update({roofSupports:[...settings.roofSupports.map(s=>s.id===beam?.id&&projected&&(projected.t===0||projected.t===1)?{...s,[projected.t===0?'startSupport':'endSupport']:id}:s),{id,type:drawing.type,name:'',profile:drawProfile,nodeRef:'',x1:a[0],y1:a[1],z1:drawZ1,x2:x,y2:y,z2:projected?.z??drawZ2,startSupport:'',endSupport:'',foundationRef:'',...(beam?{upperSupport:beam.id}:{})}]});setSelected(id);setDrawing(null);setCursor(null);setPlacementMessage('');};
  const change=(index,patch)=>update({roofSupports:changeSupportWithPosts(settings.roofSupports,settings.roofSupports[index].id,patch)});
  const movePoint=(id,end,x,y)=>{const index=settings.roofSupports.findIndex(s=>s.id===id);if(index<0)return;const item=settings.roofSupports[index],beam=report.assembly.supports.find(s=>s.id===item.upperSupport),p=beam&&item.type==='post'?projectOnSupport(beam,x,y):null;change(index,item.type==='post'?{x1:p?.x??x,y1:p?.y??y,x2:p?.x??x,y2:p?.y??y,...(p?{z2:p.z}:{})}:{[`x${end}`]:x,[`y${end}`]:y});};
  const translate=(id,dx,dy)=>{if(id.startsWith('node:')){update({assemblyNodes:settings.assemblyNodes.map(n=>n.id===id.slice(5)?{...n,x:n.x+dx,y:n.y+dy}:n)});return;}const index=settings.roofSupports.findIndex(s=>s.id===id);if(index<0)return;const item=settings.roofSupports[index];if(item.type==='post'){movePoint(id,1,Number(item.x1)+dx,Number(item.y1)+dy);return;}change(index,{x1:Number(item.x1)+dx,y1:Number(item.y1)+dy,x2:Number(item.x2)+dx,y2:Number(item.y2)+dy});};
  const selectPoint=(index,end)=>{setDrawing(null);setCursor(null);setPointTarget({id:settings.roofSupports[index].id,end});document.querySelector('.cut-assembly')?.scrollIntoView({behavior:'smooth',block:'start'});};
  const pick=(x,y)=>{const index=settings.roofSupports.findIndex(s=>s.id===pointTarget?.id);if(index<0)return;const s=settings.roofSupports[index];change(index,s.type==='post'?{x1:x,y1:y,x2:x,y2:y}:{[`x${pointTarget.end}`]:x,[`y${pointTarget.end}`]:y});setPointTarget(null);};
  const add=type=>{const b=report.assembly.bounds;update({roofSupports:[...settings.roofSupports,{id:crypto.randomUUID(),type,name:'',profile:'',nodeRef:'',x1:b.x,y1:b.y,z1:0,x2:type==='post'?b.x:b.x+b.width,y2:b.y,z2:type==='post'?2500:0,startSupport:'',endSupport:'',foundationRef:''}]});};
  return <div className="cut-card"><h2>Крыша, каркас и опоры</h2>
    <AutoRoofSupports project={project} report={report} settings={settings} update={update} NumberInput={NumberInput} onApplied={id=>{setSelected(id);setDrawing(null);setNodeMode(false);setPointTarget(null);setCursor(null);}}/>
    <p>На плане: {report.assembly.supports.filter(s=>s.type==='purlin').length} прогонов · {report.assembly.supports.filter(s=>s.type==='post').length} стоек. Сначала выберите элемент, затем перетаскивайте его круглую ручку.</p>
    <div className="cut-tabs assembly-controls" role="toolbar" aria-label="Рисование конструкций">
      <button aria-pressed={!drawing&&!nodeMode} onClick={()=>{setDrawing(null);setNodeMode(false);setPointTarget(null);setCursor(null);}}>Выбор / перенос</button>
      {Object.entries(ASSEMBLY_TYPES).map(([type,label])=><button key={type} disabled={settings.roofSupports.length>=200} aria-pressed={drawing?.type===type} onClick={()=>begin(type)}>{label}</button>)}
      <button aria-pressed={nodeMode} disabled={(settings.assemblyNodes||[]).length>=200} onClick={()=>{setNodeMode(true);setDrawing(null);setPointTarget(null);setCursor(null);}}>Метка узла</button>
      <button disabled={!report.assembly.supports.some(s=>s.id===selected&&!s.referenceOnly&&['purlin','beam'].includes(s.type))} onClick={beginUnder}>Стойка под выбранным прогоном</button>
    </div>
    {placementMessage?<p role="status">{placementMessage}</p>:null}
    {nodeMode?<p>Нажмите на плане для марки узла. <DraftText label="Обозначение узла" value={nodeRef} onChange={setNodeRef} placeholder="Например КР-1"/></p>:null}
    <p>Нанесите прогон двумя нажатиями на плане. Первый клик выбирает элемент и открывает карточку; после выбора можно перетащить линию целиком или её круглые ручки. Стойки следуют за связанным прогоном. Сечения, высоты и узлы задаются по проекту, а не подбираются по прочности автоматически.</p>
    <details open={!compact||drawing!==null}><summary>Инструмент, сечение и высоты нового элемента</summary><div className="cut-fields"><label>Размещаемый элемент<select value={tool} onChange={e=>{setTool(e.target.value);setDrawing(null);setCursor(null);}}>{Object.entries(ASSEMBLY_TYPES).filter(([key])=>key!=='foundation').map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
      <DraftText label="Сечение нового элемента, мм" value={drawProfile} onChange={setDrawProfile}/>
      <NumberInput label="Отметка начала Z, мм" value={drawZ1} min={-100000} onChange={setDrawZ1}/><NumberInput label="Отметка конца Z, мм" value={drawZ2} min={-100000} onChange={setDrawZ2}/>
    </div><p>100×150 и 2500 мм — только заготовки ввода. Для стойки задайте верх выше низа; для стропила или подкоса — фактические отметки обоих концов. Дополнительные элементы не заменяют автоматические стропила и не добавляются молча в смету.</p>
    {!validDraft?<p role="status">Укажите положительное сечение (например, 100×150) и обе отметки Z.</p>:tool==='post'&&Number(drawZ2)<=Number(drawZ1)?<p role="status">Для стойки отметка конца должна быть выше отметки начала.</p>:null}</details>
    <div className="cut-tabs"><button disabled={!validDraft||(tool==='post'&&Number(drawZ2)<=Number(drawZ1))||settings.roofSupports.length>=200} onClick={()=>{setPointTarget(null);setSelected(null);setCursor(null);setDrawing({type:tool});}}>Разместить на плане</button><button disabled={!validDraft||settings.roofSupports.length>=200} onClick={()=>{setPointTarget(null);setSelected(null);setCursor(null);setDrawing({type:'purlin'});}}>Нарисовать линию прогона</button>{drawing?<button onClick={()=>{setDrawing(null);setCursor(null);}}>Отменить построение</button>:null}</div>
    {drawing?<p role="status">{drawing.type==='post'?'Укажите положение стойки':drawing.a?'Укажите конец линии':'Укажите начало линии'}. Размер при построении — проекция в плане, длина детали учитывает Z.</p>:null}
    {pointTarget?<p role="status">Нажмите нужное место на плане: {pointTarget.end===1?'начало':'конец'} выбранного элемента. <button onClick={()=>setPointTarget(null)}>Отменить выбор точки</button></p>:null}
    <AssemblyCanvas assembly={report.assembly} selected={selected} onFloorChange={setActiveFloor} onSelect={setSelected} onMovePoint={movePoint} onTranslate={translate} onPick={nodeMode?(x,y)=>{update({assemblyNodes:[...(settings.assemblyNodes||[]),{id:crypto.randomUUID(),x,y,floor:activeFloor,nodeRef}]});setNodeMode(false);}:drawing?drawPick:pointTarget?pick:null} onMove={drawing?.a?(x,y)=>setCursor([x,y]):null} draft={drawing?.a&&cursor?{a:drawing.a,b:cursor}:null}/>
    {(settings.assemblyNodes||[]).length?<details open={selected?.startsWith('node:')}><summary>Метки узлов · {settings.assemblyNodes.length}</summary>{settings.assemblyNodes.map((n,i)=><div key={n.id}><DraftText label={`Узел У-${i+1}`} value={n.nodeRef} onChange={nodeRef=>update({assemblyNodes:settings.assemblyNodes.map(m=>m.id===n.id?{...m,nodeRef}:m)})}/><button onClick={()=>update({assemblyNodes:settings.assemblyNodes.filter(m=>m.id!==n.id)})}>Удалить У-{i+1}</button></div>)}</details>:null}
    <details open={!compact||selected!==null}><summary>Проектные элементы · {settings.roofSupports.length}</summary><div className="cut-tabs">{Object.entries(ASSEMBLY_TYPES).map(([type,label])=><button key={type} disabled={settings.roofSupports.length>=200} onClick={()=>add(type)}>Добавить: {label.toLowerCase()}</button>)}</div>
    <p>Выберите пунктирный элемент на плане, затем перетащите круглые ручки концов. Координаты и длина сохраняются после отпускания. Z задаётся в карточке; перенос в плане высоту не меняет.</p>
    {settings.roofSupports.map((s,index)=><details key={s.id} className="cut-layout-settings" open={selected===s.id}><summary onClick={e=>{e.preventDefault();setSelected(selected===s.id?null:s.id);}}>ОП-{index+1} · {s.name||ASSEMBLY_TYPES[s.type]}</summary><div className="cut-fields">
      {s.autoLayout?<p>{s.autoLocked?'Ручное переопределение автосхемы: сохранится при повторной расстановке.':'Элемент автосхемы. Ручная правка закрепит его при повторной расстановке.'}</p>:null}
      <DraftText label="Название" value={s.name} onChange={name=>change(index,{name})}/>
      <DraftText label="Сечение, мм" value={s.profile} onChange={profile=>change(index,{profile})} placeholder="100×150 — по проекту"/>
      <DraftText label="Рабочий узел" value={s.nodeRef} onChange={nodeRef=>change(index,{nodeRef})}/>
      {s.type==='post'?<label>Прогон над стойкой<select value={s.upperSupport||''} onChange={e=>change(index,{upperSupport:e.target.value})}><option value="">Не связан</option>{settings.roofSupports.filter(t=>['beam','purlin'].includes(t.type)&&!t.referenceOnly).map(t=><option key={t.id} value={t.id}>ОП-{settings.roofSupports.indexOf(t)+1} · {t.name||ASSEMBLY_TYPES[t.type]}</option>)}</select></label>:null}
      <label className="cut-check"><input type="checkbox" checked={s.referenceOnly===true} onChange={e=>change(index,{referenceOnly:e.target.checked})}/>Справочная линия — без материала</label>
      {!s.referenceOnly&&s.type!=='foundation'?<><label>Материал для сметы<select aria-label="Материал для сметы" value={s.estimateCatalogId||''} onChange={e=>change(index,{estimateCatalogId:e.target.value})}><option value="">Выберите соответствующее сечение из прайса</option>{project.priceMat.filter(r=>['м³','м3','м.п.','м'].includes(r.unit)).map(r=><option key={r.id} value={r.id}>{r.name} · {r.price} ₽/{r.unit}</option>)}</select></label><label className="cut-check"><input type="checkbox" disabled={!s.estimateCatalogId} checked={s.estimateEnabled===true} onChange={e=>change(index,{estimateEnabled:e.target.checked})}/>Включать материал в смету по чистому объёму</label><p>{(()=>{const copy={...project,settings:{...project.settings,productionCutting:{...settings,roofSupports:[{...s,estimateEnabled:true}]}}};const row=productionEstimateLines(copy)[0];return row?`${row.qty} ${row.unit} × ${row.price} ₽ = ${(row.qty*row.price).toLocaleString('ru-RU')} ₽. Без запаса, монтажа и крепежа. Сверьте соответствие выбранного материала сечению.`:'Сметный материал не выбран.';})()}</p></>:null}
      {['x1','y1','z1','x2','y2','z2'].map((key,i)=><NumberInput key={key} label={`${i<3?'Начало':'Конец'} · ${key[0]==='z'?'отметка высоты':key[0].toUpperCase()}`} value={s[key]??''} min={-100000} onChange={value=>change(index,{[key]:value})}/>)}
      {(s.type==='foundation'?[]:s.type==='post'?['startSupport']:['startSupport','endSupport']).map((key,i)=><label key={key}>{s.type==='post'?'Нижняя опора':i===0?'Опора начала':'Опора конца'}<select value={s[key]||''} onChange={e=>change(index,{[key]:e.target.value})}><option value="">Выберите опору</option>{settings.roofSupports.map((target,j)=>target.id!==s.id?<option key={target.id} value={target.id}>ОП-{j+1} · {target.name||ASSEMBLY_TYPES[target.type]}</option>:null)}</select></label>)}
      {s.type==='foundation'?<DraftText label="Опора фундамента / узел" value={s.foundationRef} onChange={foundationRef=>change(index,{foundationRef})} placeholder="Свая СВ-3 / бетонное основание, узел Ф-1"/>:null}
    </div><div className="cut-tabs"><button onClick={()=>selectPoint(index,1)}>Указать начало на плане</button><button onClick={()=>selectPoint(index,2)}>Указать конец на плане</button><button onClick={()=>update({roofSupports:settings.roofSupports.filter((_,i)=>i!==index)})}>Удалить ОП-{index+1}</button></div></details>)}
    </details><details open={!compact}><summary>Деталировка стропил и конструктивные виды</summary><p>Количество и сечения стропил взяты из текущей модели кровли. Длины — по геометрии скатов со свесами; углы, врубки, затяжки и стыковка длинных элементов уточняются в альбоме узлов.</p><div className="cut-table-wrap"><table><thead><tr><th>Марка</th><th>Скат</th><th>Сечение</th><th>Длина, мм</th></tr></thead><tbody>{report.assembly.rafters.map(r=><tr key={r.id}><td>{productionMark(r)}</td><td>{r.name}</td><td>{r.profile}</td><td>{r.length}</td></tr>)}</tbody></table></div>
    <label>Геометрия двускатных стропил<select value={settings.rafterGeometry} onChange={e=>update({rafterGeometry:e.target.value})}><option value="wallSlope">Непрерывный уклон стены — конёк — свес</option><option value="estimate">Прежняя сметная геометрия</option></select></label>
    {Math.abs(report.assembly.roofDrawing?.estimateDifference||0)>1?<p>Производственная длина отличается от сметной на {Math.round(report.assembly.roofDrawing.estimateDifference)} мм/стропило. Смета не заменена. Уклон задан подъёмом конька над стеной и половиной пролёта; свес продолжает ту же прямую. Закупку сверьте по картам заготовок.</p>:null}
    {!report.assembly.rafters.length?<p>Стропильных деталей нет: выбрана SIP-кровля либо требуется индивидуальная схема.</p>:null}
    <RoofSlopePreview assembly={report.assembly}/>
    <RoofDrawingPreview assembly={report.assembly}/>
    <h3>Путь нагрузки</h3>{report.assembly.supports.map(s=><p key={s.id}><b>{s.mark}:</b> {s.loadPath.text} · {s.loadPath.complete?'Цепочка заполнена, несущую способность проверить':'Опирание не подтверждено'}</p>)}
    </details>
  </div>;
}
