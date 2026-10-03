import { useState } from 'react';
import { ASSEMBLY_TYPES, productionMark } from '../calculations/production-assembly.js';
import { DraftText } from './CuttingControls.jsx';
import AssemblyCanvas from './AssemblyCanvas.jsx';
import { RoofSlopePreview } from './MountingAlbum.jsx';

export { default as AssemblyDiagram } from './AssemblyCanvas.jsx';

export default function AssemblyPlan({report,settings,update,NumberInput}) {
  const [pointTarget,setPointTarget]=useState(null);
  const [drawing,setDrawing]=useState(null),[cursor,setCursor]=useState(null);
  const drawPick=(x,y)=>{if(!drawing.a){setDrawing({...drawing,a:[x,y]});setCursor([x,y]);return;}if(Math.hypot(x-drawing.a[0],y-drawing.a[1])<10)return;
    update({roofSupports:[...settings.roofSupports,{id:crypto.randomUUID(),type:drawing.type,name:'',profile:'100×150',nodeRef:'',x1:drawing.a[0],y1:drawing.a[1],z1:2500,x2:x,y2:y,z2:2500,startSupport:'',endSupport:'',foundationRef:''}]});setDrawing(null);setCursor(null);};
  const change=(index,patch)=>update({roofSupports:settings.roofSupports.map((s,i)=>i===index?{...s,...patch}:s)});
  const selectPoint=(index,end)=>{setDrawing(null);setCursor(null);setPointTarget({id:settings.roofSupports[index].id,end});document.querySelector('.cut-assembly')?.scrollIntoView({behavior:'smooth',block:'start'});};
  const pick=(x,y)=>{const index=settings.roofSupports.findIndex(s=>s.id===pointTarget?.id);if(index<0)return;const s=settings.roofSupports[index];change(index,s.type==='post'?{x1:x,y1:y,x2:x,y2:y}:{[`x${pointTarget.end}`]:x,[`y${pointTarget.end}`]:y});setPointTarget(null);};
  const add=type=>{const b=report.assembly.bounds;update({roofSupports:[...settings.roofSupports,{id:crypto.randomUUID(),type,name:'',profile:'',nodeRef:'',x1:b.x,y1:b.y,z1:0,x2:type==='post'?b.x:b.x+b.width,y2:b.y,z2:type==='post'?2500:0,startSupport:'',endSupport:'',foundationRef:''}]});};
  return <div className="cut-card"><h2>Крыша, каркас и опоры</h2><p>Размещайте элементы по координатам плана в мм. У стойки начало — низ, конец — верх. Для прогона и балки укажите опоры обоих концов, для стойки — нижнюю опору; последний элемент цепочки — фундамент. Размеры, сечения, отметки и узлы вводятся по проекту.</p>{pointTarget?<p role="status">Нажмите нужное место на плане: {pointTarget.end===1?'начало':'конец'} выбранной опоры. <button onClick={()=>setPointTarget(null)}>Отменить выбор точки</button></p>:null}<div className="cut-tabs"><button disabled={settings.roofSupports.length>=200} onClick={()=>{setPointTarget(null);setDrawing({type:'purlin'});}}>Нарисовать линию прогона</button><button disabled={settings.roofSupports.length>=200} onClick={()=>{setPointTarget(null);setDrawing({type:'beam'});}}>Нарисовать линию балки</button>{drawing?<button onClick={()=>{setDrawing(null);setCursor(null);}}>Отменить построение</button>:null}</div>{drawing?<p role="status">{drawing.a?'Укажите конец':'Укажите начало'} линии. Шаг координат 10 мм. После построения уточните сечение, отметки и опоры в карточке; 100×150 и 2500 мм — редактируемые заготовки ввода.</p>:null}<AssemblyCanvas assembly={report.assembly} onPick={drawing?drawPick:pointTarget?pick:null} onMove={drawing?.a?(x,y)=>setCursor([x,y]):null} draft={drawing?.a&&cursor?{a:drawing.a,b:cursor}:null}/>
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
    <RoofSlopePreview assembly={report.assembly}/>
    <h3>Путь нагрузки</h3>{report.assembly.supports.map(s=><p key={s.id}><b>{s.mark}:</b> {s.loadPath.text} · {s.loadPath.complete?'Цепочка заполнена, несущую способность проверить':'Опирание не подтверждено'}</p>)}
  </div>;
}
