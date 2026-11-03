import {useState} from 'react';
import {useProject} from '../state/ProjectContext.jsx';
import {roofSupportPlanGroups,copyPlanRoofGroup} from '../planner/roof-support-plan.js';
import {windowSupportHeaders} from '../calculations/window-support-headers.js';
import {NumberField} from '../components/ui.jsx';

export default function PlanRoofSupports({project,calculation,onSelect,onDraw,embedded=false}) {
  const {commit}=useProject();
  const [mode,setMode]=useState(()=>project.settings.roof.type==='sip'?'purlin':'frame'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const groups=roofSupportPlanGroups(project.settings.productionCutting.roofSupports);
  const add=async()=>{
    setBusy(true);setMessage('Строю опору по текущей кровле…');
    try{
      const [{calculateProductionCutting},{roofSupportFrame},{generateRoofSupportLayout}]=await Promise.all([import('../calculations/production-cutting.js'),import('../calculations/roof-support-frame.js'),import('../calculations/auto-roof-supports.js')]);
      const next=structuredClone(project);next.settings.productionCutting.windowSupportHeaders={bearingMm:150,...next.settings.productionCutting.windowSupportHeaders,enabled:true};
      const report=calculateProductionCutting(next,calculation);
      const config={...report.settings.autoRoofSupports,variant:'single',profile:'50×150',gapMm:590};
      if(mode==='purlin'){
        const catalog=profile=>project.priceMat.find(row=>{const dims=row.name.match(/(\d+)\s*[×xх*]\s*(\d+)/)?.slice(1).map(Number);const needed=profile.split('×').map(Number);return ['м3','м³'].includes(row.unit)&&dims&&dims[0]===needed[0]&&dims[1]===needed[1];})?.id||'';
        config.purlinCatalogId=config.purlinCatalogId||catalog(config.purlinProfile);config.postCatalogId=config.postCatalogId||catalog(config.postProfile);config.estimateEnabled=!!config.purlinCatalogId&&!!config.postCatalogId;
      }
      const proposal=mode==='frame'?roofSupportFrame(next,report,config):generateRoofSupportLayout(next,report,config);
      if(proposal.errors.length)throw new Error(proposal.errors.join(' '));
      const group=roofSupportPlanGroups(proposal.items)[0];if(!group)throw new Error('Для этой кровли опора не сформирована. Проверьте тип кровли и сечения.');
      const id=`plan-support-${crypto.randomUUID()}`,items=copyPlanRoofGroup(group.members,id);
      if(windowSupportHeaders(next,[...next.settings.productionCutting.roofSupports,...items]).items.length>200)throw new Error('Слишком много деталей опор: разделите схему на проекты.');
      commit(current=>{
        current.settings.productionCutting.windowSupportHeaders={bearingMm:150,...current.settings.productionCutting.windowSupportHeaders,enabled:true};
        const all=[...current.settings.productionCutting.roofSupports,...items];
        const result=windowSupportHeaders(current,all);
        current.settings.productionCutting.roofSupports=result.items;return current;
      });
      onSelect?.(id);setMessage('Опора добавлена. Выберите цветную линию на плане и перетащите её. Пояса и стойки перемещаются вместе.');
    }catch(error){setMessage(error.message);}finally{setBusy(false);}
  };
  const refreshHeaders=()=>{if(windowSupportHeaders({...project,settings:{...project.settings,productionCutting:{...project.settings.productionCutting,windowSupportHeaders:{...project.settings.productionCutting.windowSupportHeaders,enabled:true}}}}).items.length>200){setMessage('Превышен лимит 200 деталей опор. Существующие детали сохранены.');return;}commit(next=>{next.settings.productionCutting.windowSupportHeaders={bearingMm:150,...next.settings.productionCutting.windowSupportHeaders,enabled:true};next.settings.productionCutting.roofSupports=windowSupportHeaders(next).items;return next;});};
  const controls=<div className="inspector-form plan-roof-support-controls">
    {onDraw&&(calculation.roof.layeredFrame?.items>0||project.settings.productionCutting.roofPlanLines?.enabled)?<><button type="button" className="button primary" onClick={onDraw}>Нарисовать / передвинуть линии на крыше</button><p>Автоматические рамы уже показаны синими линиями в слое «Крыша». Рисуйте новые линии и тяните круг на существующей. Подсказка показывает симметрию.</p></>:null}
    <label className="field">Добавляемая опора<select aria-label="Добавляемая опора" value={mode} onChange={event=>setMode(event.target.value)}><option value="frame">Опорный каркас под стропилами</option><option value="purlin">Прогон со стойками / ферма выбранной системы</option></select></label>
    <button type="button" className="button primary" disabled={busy} onClick={add}>{busy?'Строю…':'Добавить прогон / ферму на план'}</button>
    <p>Сечения и раскладка берутся из существующих настроек каркаса. Размещение и смещение не являются проверкой прочности и пути нагрузки.</p>
    {groups.map(group=><div className="readout" key={group.id}><button type="button" className="button secondary" onClick={()=>onSelect?.(group.id)}>{group.name} · {group.members.length} деталей</button><button type="button" className="button secondary" onClick={()=>commit(next=>{const ids=new Set(group.members.map(item=>item.id));next.settings.productionCutting.roofSupports=windowSupportHeaders(next,next.settings.productionCutting.roofSupports.filter(item=>!ids.has(item.id))).items;return next;})}>Убрать</button></div>)}
    <p>Усиление над окном: 3 × 50×150 мм, опирание по 150 мм по умолчанию. Материал — чистый объём из текущего прайса; крепёж и рабочие узлы отдельно.</p>
    <NumberField label="Опирание усиления с каждой стороны" suffix="мм" min={1} max={1000} step={10} value={project.settings.productionCutting.windowSupportHeaders?.bearingMm??150} onChange={bearingMm=>commit(next=>{next.settings.productionCutting.windowSupportHeaders={...next.settings.productionCutting.windowSupportHeaders,bearingMm};return next;})}/>
    <button type="button" className="button secondary" onClick={refreshHeaders}>Обновить усиления под существующими прогонами</button>
    {message?<p role="status">{message}</p>:null}
    {windowSupportHeaders(project).issues.map((issue,index)=><p role="alert" key={index}>{issue.message}</p>)}
  </div>;
  return embedded?controls:<details className="plan-top-advanced"><summary>Прогоны и опорные фермы</summary>{controls}</details>;
}
