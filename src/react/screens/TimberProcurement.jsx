import {useMemo,useState,useEffect} from 'react';
import {Printer,Download,Send} from 'lucide-react';
import {useProject} from '../state/ProjectContext.jsx';
import {normalizeTimberProcurement} from '../state/timber-procurement.js';
import {timberProcurement} from '../calculations/timber-procurement.js';
import {timberOrderCsv,timberOrderDocument} from '../export/timber-procurement.js';
import '../styles/timber-procurement.css';
const fmt=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:6}).format(n||0);
function Draft({value,onCommit,label,min=0,integer=false}) {
  const [draft,setDraft]=useState(String(value??''));useEffect(()=>setDraft(String(value??'')),[value]);
  return <label>{label}<input type="number" aria-label={label} min={min} step={integer?1:'any'} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==String(value??''))onCommit(draft===''?0:Number(draft));}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>;
}
function save(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export default function TimberProcurement({project,calculation,report,source='estimate',layers=null,pending=false}) {
  const {commit}=useProject();
  const [selected,setSelected]=useState(null),[notice,setNotice]=useState('');
  const register=useMemo(()=>timberProcurement(project,calculation,report,{source,layers}),[project,calculation,report,source,layers]);
  const settings=register.settings,title=project.meta.projectName||project.meta.projectNum||'Домокомплект';
  const rows=register.rows.filter(r=>selected==null||selected.includes(r.id));
  const chosen={...register,rows,totalLengthM:rows.reduce((n,r)=>n+r.lengthM,0),totalVolumeM3:rows.reduce((n,r)=>n+r.volumeM3,0)};
  const details={title,customer:settings.customer||project.meta.customer||'',recipient:settings.recipient,note:settings.note};
  const update=patch=>commit(next=>{next.settings.productionCutting.timberProcurement=normalizeTimberProcurement({...settings,...patch});return next;});
  const recipe=(key,patch)=>{setSelected(null);update({recipes:{...settings.recipes,[key]:{...register.compositions.find(c=>c.key===key)?.recipe,...patch}}});};
  const filename=`${title}-доска`.replace(/[<>:"/\\|?*]/g,'-');
  const file=()=>new File([timberOrderDocument(chosen,details)],`${filename}.html`,{type:'text/html;charset=utf-8'});
  const print=()=>{setNotice('');const target=window.open('','_blank');if(!target){setNotice('Разрешите окно печати и повторите.');return;}target.document.open();target.document.write(timberOrderDocument(chosen,details));target.document.close();const button=target.document.createElement('button');button.textContent='Печать / Сохранить PDF';button.onclick=()=>{target.focus();target.print();};target.document.body.prepend(button);target.document.fonts?.ready.then(()=>{target.focus();target.print();});};
  const share=async()=>{setNotice('');const f=file();try{if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:`${title} · Закупка доски`});else{save(f);setNotice('Ведомость скачана. Её можно прикрепить к письму или сообщению поставщику.');}}catch(e){if(e.name!=='AbortError')setNotice('Отправка недоступна. Скачайте ведомость и прикрепите её к сообщению.');}};
  return <section className="timber-procurement" aria-label="Ведомость закупки доски">
    <header><div><h2>Доска и брус для закупки</h2><p>{source==='cutting'?'По картам раскроя: полные размещённые хлысты, без дополнительного сметного запаса. Для общего заказа выберите охват «Весь проект»; ведомости отдельных конструкций с общими хлыстами не суммируются.':'По смете: закупочные количества с её запасом и ручными изменениями.'} Пакеты раскрыты на доски; стоимость сметы не меняется.</p></div></header>
    <details className="timber-order-meta"><summary>Кто заказывает и кому отправить</summary><div><label>Кто заказывает<input aria-label="Кто заказывает" defaultValue={details.customer} key={`customer:${details.customer}`} onBlur={e=>{if(e.target.value!==settings.customer)update({customer:e.target.value});}}/></label><label>Поставщик / получатель<input aria-label="Поставщик / получатель" defaultValue={settings.recipient} key={`recipient:${settings.recipient}`} onBlur={e=>{if(e.target.value!==settings.recipient)update({recipient:e.target.value});}}/></label><label>Примечание к заказу<textarea aria-label="Примечание к заказу" defaultValue={settings.note} key={`note:${settings.note}`} onBlur={e=>{if(e.target.value!==settings.note)update({note:e.target.value});}}/></label></div></details>
    <div className="timber-order-actions"><button disabled={pending||!rows.length} onClick={print}><Printer size={16}/>Печать / PDF</button><button disabled={pending||!rows.length} onClick={()=>save(new File([timberOrderCsv(chosen,details)],`${filename}.csv`,{type:'text/csv;charset=utf-8'}))}><Download size={16}/>CSV</button><button disabled={pending||!rows.length} onClick={()=>save(file())}><Download size={16}/>Ведомость</button><button disabled={pending||!rows.length} onClick={share}><Send size={16}/>Отправить</button></div>
    {notice?<p role="status">{notice}</p>:null}
    {register.warnings.map(w=><p role="alert" key={w}>{w}</p>)}
    {register.unplacedMembers?.length?<details className="timber-unresolved" open><summary>Не помещаются в заготовку · {register.unplacedMembers.length}</summary><p>Эти детали есть в конструкции, но не включены в размещённые хлысты и итоги заказа ниже. Задайте длинную заготовку либо проектные стыки в свойствах детали.</p>{register.unplacedMembers.map(m=><p key={m.id}>{m.mark||m.id} · {m.name} · {m.profile} мм · {fmt(m.lengthMm/1000)} пог. м · {fmt(m.volumeM3)} м³</p>)}</details>:null}
    <div className="timber-order-summary"><b>Длина: {fmt(chosen.totalLengthM)} пог. м</b><b>Объём: {fmt(chosen.totalVolumeM3)} м³</b></div>
    <div className="timber-order-table"><table><thead><tr><th><input type="checkbox" aria-label="Включить все доски" checked={register.rows.length>0&&rows.length===register.rows.length} onChange={e=>setSelected(e.target.checked?null:[])}/></th><th>Пиломатериал / сечение</th><th>Длина, пог. м</th><th>Объём, м³</th><th>Из чего сформировано</th></tr></thead><tbody>{register.rows.map(r=><tr key={r.id}><td><input type="checkbox" aria-label={`Включить ${r.name} · ${r.finish}`} checked={selected==null||selected.includes(r.id)} onChange={e=>setSelected(old=>{const ids=old??register.rows.map(r=>r.id);return e.target.checked?[...new Set([...ids,r.id])]:ids.filter(id=>id!==r.id);})}/></td><td><b>{r.name}</b><small>{r.finish}</small></td><td>{fmt(r.lengthM)}</td><td>{fmt(r.volumeM3)}</td><td><details><summary>Источники · {r.sources.length}</summary>{r.sources.map((s,i)=><p key={i}>{s.name} · {s.layer}<br/>{fmt(s.assemblyLengthM)} м × {s.boards} досок = {fmt(s.lengthM)} пог. м</p>)}</details></td></tr>)}</tbody></table></div>
    {!register.rows.length?<p>В выбранном охвате нет досок с определённым составом и сечением.</p>:null}
    {register.compositions.length?<details className="timber-compositions"><summary>Состав пакетов и изделий · {register.compositions.length}</summary><p>Для изделий шириной 95 мм: две доски толщиной 45 мм; ширина доски соответствует глубине изделия. Например, 95×145 → 2 × 45×145. Состав можно изменить для этого проекта.</p>{register.compositions.map(c=><fieldset key={c.key}><legend>{c.name}</legend><div><Draft label={`Досок в изделии · ${c.name}`} value={c.recipe?.count||0} min={1} integer onCommit={count=>recipe(c.key,{count})}/><Draft label={`Толщина доски, мм · ${c.name}`} value={c.recipe?.thicknessMm||0} min={1} onCommit={thicknessMm=>recipe(c.key,{thicknessMm})}/><Draft label={`Ширина доски, мм · ${c.name}`} value={c.recipe?.widthMm||0} min={1} onCommit={widthMm=>recipe(c.key,{widthMm})}/></div><small>{c.basis}</small></fieldset>)}</details>:null}
    {register.unresolved.length?<details className="timber-unresolved" open><summary>Не включено в заказ · {register.unresolved.length}</summary>{register.unresolved.map((r,i)=><p key={i}>{r.name}: {r.reason}.</p>)}</details>:null}
  </section>;
}
