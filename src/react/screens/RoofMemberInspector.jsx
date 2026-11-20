import {useEffect,useState} from 'react';
import {useProject} from '../state/ProjectContext.jsx';
import {normalizeRoofEditor,roofMemberLength,roofMemberAngle,transformRoofMembers,copyRoofMembers,deleteRoofMembers,syncRoofEditorPosts,roofSelectionIds} from '../planner/roof-support-editor.js';
function EditorNumber({label,value,onChange,step=10,min=-100000,max=100000}){
 const [draft,setDraft]=useState(String(value));
 useEffect(()=>setDraft(String(value)),[value]);
 const change=n=>{if(Number.isFinite(n)&&n>=min&&n<=max)onChange(n);else setDraft(String(value));};
 return <label className="field"><span>{label}</span><span className="roof-editor-number"><button type="button" aria-label={`Уменьшить: ${label}`} onClick={()=>change(Number(value)-step)}>−</button><input aria-label={label} inputMode="decimal" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{const n=Number(draft.replace(',','.'));if(n!==Number(value))change(n);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/><button type="button" aria-label={`Увеличить: ${label}`} onClick={()=>change(Number(value)+step)}>+</button></span></label>;
}
function EditorText({label,value,onChange}){
 const [draft,setDraft]=useState(value||'');useEffect(()=>setDraft(value||''),[value]);
 return <label>{label}<input aria-label={label} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==(value||''))onChange(draft);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/></label>;
}

export async function applyRoofEditorOperation(project,calculation,ids,operation,config=project.settings.productionCutting.roofEditor){
 const current=project.settings.productionCutting.roofSupports;
 let items=operation.kind==='delete'?deleteRoofMembers(current,ids):transformRoofMembers(current,ids,operation,config),warnings=[];
 if(config?.autoPosts&&operation.kind!=='delete'){
  const [{calculateProductionCutting},{roofEditorBearingContext}]=await Promise.all([import('../calculations/production-cutting.js'),import('../calculations/roof-editor-bearing.js')]);
  const report=calculateProductionCutting(project,calculation);
  ({items,warnings}=syncRoofEditorPosts(project,items,ids,config,roofEditorBearingContext(project,report)));
 }
 return {items,warnings};
}
export default function RoofMemberInspector({selection,project,calculation,onSelect}){
 const {commit}=useProject(),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const c=normalizeRoofEditor(project.settings.productionCutting.roofEditor),items=project.settings.productionCutting.roofSupports;
 const ids=selection.ids||[selection.id],chosen=roofSelectionIds(items,ids),members=items.filter(m=>chosen.has(m.id)),m=members[0];
 const run=async(operation,config=c)=>{setBusy(true);try{const result=await applyRoofEditorOperation(project,calculation,ids,operation,config);commit(next=>{next.settings.productionCutting.roofSupports=result.items;next.settings.productionCutting.roofEditor=config;return next;});setMessage(result.warnings.join(' ')||'Сохранено. Ctrl+Z — отмена.');if(operation.kind==='delete')onSelect?.(null);}catch(e){setMessage(e.message);}finally{setBusy(false);}};
 const setting=patch=>commit(next=>{next.settings.productionCutting.roofEditor={...c,...patch};return next;});
 if(!m)return <p>Выберите прогон, балку или стойку на плане.</p>;
 const single=members.length===1,post=m.type==='post',length=roofMemberLength(m),angle=roofMemberAngle(m),x=(Number(m.x1)+Number(m.x2))/2,y=(Number(m.y1)+Number(m.y2))/2;
 const move=(dx,dy)=>run({kind:'move',dx,dy}),rotate=value=>run({kind:'rotate',angle:value}),patch=values=>run({kind:'patch',patch:values});
 const number=(label,value,onChange,step=10,min=-100000,max=100000)=><EditorNumber label={label} value={Math.round(value*100)/100} min={min} max={max} step={step} onChange={onChange}/>;
 const copy=()=>{try{const result=copyRoofMembers(items,ids,c);commit(next=>{next.settings.productionCutting.roofSupports=result.items;return next;});onSelect?.({type:'roofSupport',id:result.ids[0],ids:result.ids});setMessage('Копия добавлена.');}catch(e){setMessage(e.message);}};
 return <div className="inspector-form roof-member-editor" aria-label="Редактор опор кровли" aria-busy={busy}>
  <label>Элемент кровли<select aria-label="Элемент кровли" value={m.id} onChange={e=>onSelect?.({type:'roofSupport',id:e.target.value})}>{items.filter(item=>!item.autoWindowHeader).map(item=><option key={item.id} value={item.id}>{item.name||item.type} · {item.profile}</option>)}</select></label>
  <h3>{single?m.name||'Опора кровли':`Выбрано элементов: ${members.length}`}</h3>
  <p>{post?'Стойка':m.type==='beam'?'Балка':'Прогон'} · {Math.round(length)} мм · {Math.round(angle*10)/10}°</p>
  <fieldset disabled={busy}>
   {single?<>{number(post?'Высота стойки, мм':'Длина элемента, мм',length,length=>run({kind:'length',length}),c.lengthStep,1)}<div className="roof-editor-buttons"><button type="button" onClick={()=>run({kind:'length',length:length-c.lengthStep})}>− {c.lengthStep}</button><button type="button" onClick={()=>run({kind:'length',length:length+c.lengthStep})}>+ {c.lengthStep}</button></div></>:null}
   <label>Шаг длины<select value={c.lengthStep} onChange={e=>setting({lengthStep:Number(e.target.value)})}>{[10,50,100].map(v=><option key={v} value={v}>{v} мм</option>)}</select></label>
   <label><input type="checkbox" checked={c.symmetric} onChange={e=>setting({symmetric:e.target.checked})}/> Растягивать симметрично</label>
   {single&&m.type==='purlin'?<><label><input type="checkbox" checked={m.bearingTruss===true} onChange={e=>patch({bearingTruss:e.target.checked,trussDepthMm:m.trussDepthMm||330,trussWebStepMm:m.trussWebStepMm||600,estimateEnabled:true,planGroupId:m.planGroupId||m.id})}/>Ферма-прогон</label>{m.bearingTruss?<>{number('Высота фермы по осям поясов, мм',m.trussDepthMm,v=>patch({trussDepthMm:v}),10,(Number(String(m.profile).split(/[×xх]/)[1])||100)+1,3000)}{number('Шаг решётки фермы, мм',m.trussWebStepMm||600,v=>patch({trussWebStepMm:v}),50,100,2000)}{number('Вынос начала фермы, мм',m.trussOverhangStartMm||0,v=>patch({trussOverhangStartMm:v}),50,0,3000)}{number('Вынос конца фермы, мм',m.trussOverhangEndMm||0,v=>patch({trussOverhangEndMm:v}),50,0,3000)}{number('Вынос стропил за ферму, мм',m.trussRafterOverhangMm||0,v=>patch({trussRafterOverhangMm:v}),50,0,3000)}<small>Верх стропила опирается на верхний пояс; нижний пояс подходит к внутренней грани фермы. При изменении Z проверьте совпадение со скатом. Стыки поясов, крепёж и несущая способность требуют рабочего узла.</small></>:null}</>:null}
   <EditorText label="Сечение элемента, мм" value={m.profile} onChange={profile=>patch({profile:profile.replace(/[xх]/g,'×')})}/>
   {single?<>{number('Центр X, мм',x,value=>move(value-x,0),c.moveStep)}{number('Центр Y, мм',y,value=>move(0,value-y),c.moveStep)}{number('Отметка низа / начала Z, мм',Number(m.z1),z1=>patch({z1}))}{number('Отметка верха / конца Z, мм',Number(m.z2),z2=>patch({z2}))}</>:null}
   <label>Шаг перемещения<select value={c.moveStep} onChange={e=>setting({moveStep:Number(e.target.value)})}>{[1,10,50,100].map(v=><option key={v} value={v}>{v} мм</option>)}</select></label>
   <div className="roof-editor-arrows" role="group" aria-label="Перемещение опор"><button type="button" aria-label="Сдвинуть вверх" onClick={()=>move(0,-c.moveStep)}>↑</button><button type="button" aria-label="Сдвинуть влево" onClick={()=>move(-c.moveStep,0)}>←</button><button type="button" aria-label="Сдвинуть вправо" onClick={()=>move(c.moveStep,0)}>→</button><button type="button" aria-label="Сдвинуть вниз" onClick={()=>move(0,c.moveStep)}>↓</button></div>
   {!post||!single?<>{number(single?'Угол элемента, °':'Поворот группы на, °',single?angle:0,value=>rotate(single?value-angle:value),1,-360,360)}<label>Центр поворота<select value={c.pivot} onChange={e=>setting({pivot:e.target.value})}><option value="center">Центр</option><option value="start">Первый конец</option><option value="end">Второй конец</option></select></label><div className="roof-editor-buttons">{[-5,5,90,180].map(v=><button type="button" key={v} onClick={()=>rotate(v)}>{v>0?'+':''}{v}°</button>)}</div></>:null}
   <label><input type="checkbox" checked={c.snap} onChange={e=>setting({snap:e.target.checked})}/> Магнитные привязки · Alt отключает</label>
   <details><summary>Опирание и рабочий узел</summary>{['startSupport','endSupport','foundationRef','nodeRef'].map((key,i)=><EditorText key={key} label={['Первая опора','Вторая опора','Нижнее основание','Рабочий узел'][i]} value={m[key]} onChange={value=>patch({[key]:value})}/>)}</details>
   <label><input type="checkbox" checked={c.autoPosts} onChange={e=>run({kind:'sync'},{...c,autoPosts:e.target.checked})}/> Автоматически создавать опорные стойки</label>
   {c.autoPosts?<>{number('Максимальный шаг стоек, мм',c.maxSpacing,value=>run({kind:'sync'},{...c,maxSpacing:value}),100,100,20000)}<EditorText label="Сечение связанных стоек, мм" value={c.postProfile} onChange={postProfile=>run({kind:'sync'},{...c,postProfile:postProfile.replace(/[xх]/g,'×')})}/><button type="button" onClick={()=>run({kind:'sync'})}>Обновить связанные стойки</button><small>Стойки создаются только над заданными несущими стенами и балками. Геометрическая привязка не подтверждает несущую способность.</small></>:null}
   <details><summary>Копирование</summary>{number('Смещение копии X, мм',c.copyX,copyX=>setting({copyX}))}{number('Смещение копии Y, мм',c.copyY,copyY=>setting({copyY}))}<label><input type="checkbox" checked={c.copyPosts} onChange={e=>setting({copyPosts:e.target.checked})}/> Копировать связанные стойки</label><button type="button" onClick={copy}>Копировать выбранное</button></details>
   <button type="button" onClick={()=>run({kind:'delete'})}>Удалить выбранное</button>
  </fieldset><p role="status">{message}</p>
 </div>;
}
