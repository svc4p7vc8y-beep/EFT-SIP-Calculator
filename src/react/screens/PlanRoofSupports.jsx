import {useState} from 'react';
import {useProject} from '../state/ProjectContext.jsx';
import {roofSupportPlanGroups,copyPlanRoofGroup} from '../planner/roof-support-plan.js';
import {windowSupportHeaders} from '../calculations/window-support-headers.js';
import {NumberField} from '../components/ui.jsx';
import {ROOF_JUNCTION_SKETCH,roofJunctionSketch} from '../calculations/roof-junction-sketch.js';

export default function PlanRoofSupports({project,calculation,onSelect,onDraw,embedded=false}) {
  const {commit}=useProject();
  const [mode,setMode]=useState(()=>project.settings.roof.type==='sip'?'purlin':'frame'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const groups=roofSupportPlanGroups(project.settings.productionCutting.roofSupports);
  const truss=calculation.roof.rafterStructure?.system==='truss';
  const selectedMode=truss?'purlin':mode;
  const canSketch=project.settings.roof.type==='cold' && !truss && (calculation.roof.mainRoofShape==='hip'||calculation.roof.mainRoofShape==='gable'&&calculation.roof.pitched);
  const hasSketch=project.settings.productionCutting.roofSupports.some(item=>item.autoLayout===ROOF_JUNCTION_SKETCH);
  const buildSketch=async()=>{
    setBusy(true);setMessage('Строю схему по конькам и диагоналям…');
    try {
      const {calculateProductionCutting}=await import('../calculations/production-cutting.js');
      const report=calculateProductionCutting(project,calculation);
      const {items,skippedOpenings}=roofJunctionSketch(project,calculation,report);
      if(!items.length)throw new Error('Нет подходящих узлов для стоек. Проверьте сечения и расположение проёмов.');
      if(project.settings.productionCutting.roofSupports.filter(item=>item.autoLayout!==ROOF_JUNCTION_SKETCH).length+items.length>200)throw new Error('Превышен лимит 200 элементов. Существующие опоры сохранены.');
      commit(next=>{
        const kept=next.settings.productionCutting.roofSupports.filter(item=>item.autoLayout!==ROOF_JUNCTION_SKETCH);
        if(kept.length+items.length<=200)next.settings.productionCutting.roofSupports=[...kept,...items];
        return next;
      });
      setMessage(`Схема в слое «Опоры» 3D. Элементов: ${items.length}.${skippedOpenings?` Пропущено над проёмами: ${skippedOpenings}.`:''}`);
    } catch(error) { setMessage(error.message); } finally { setBusy(false); }
  };
  const add=async()=>{
    setBusy(true);setMessage('Строю опору по текущей кровле…');
    try{
      const [{calculateProductionCutting},{roofSupportFrame},{generateRoofSupportLayout}]=await Promise.all([import('../calculations/production-cutting.js'),import('../calculations/roof-support-frame.js'),import('../calculations/auto-roof-supports.js')]);
      const next=structuredClone(project);next.settings.productionCutting.windowSupportHeaders={bearingMm:150,...next.settings.productionCutting.windowSupportHeaders,enabled:true};
      const report=calculateProductionCutting(next,calculation);
      const config={...report.settings.autoRoofSupports,variant:'single',profile:'50×150',gapMm:590};
      if(selectedMode==='purlin'&&!truss){
        const catalog=profile=>project.priceMat.find(row=>{const dims=row.name.match(/(\d+)\s*[×xх*]\s*(\d+)/)?.slice(1).map(Number);const needed=profile.split('×').map(Number);return ['м3','м³'].includes(row.unit)&&dims&&dims[0]===needed[0]&&dims[1]===needed[1];})?.id||'';
        config.purlinCatalogId=config.purlinCatalogId||catalog(config.purlinProfile);config.postCatalogId=config.postCatalogId||catalog(config.postProfile);config.estimateEnabled=!!config.purlinCatalogId&&!!config.postCatalogId;
      }
      const proposal=selectedMode==='frame'?roofSupportFrame(next,report,config):generateRoofSupportLayout(next,report,config);
      if(proposal.errors.length)throw new Error(proposal.errors.join(' '));
      const available=roofSupportPlanGroups(proposal.items);
      if(!available.length)throw new Error('Для этой кровли опора не сформирована. Проверьте тип кровли и сечения.');
      const samePosition=(a,b)=>a.type===b.type&&a.profile===b.profile&&['x1','y1','z1','x2','y2','z2'].every(key=>Math.abs(Number(a[key])-Number(b[key]))<.1);
      const added=available.filter(group=>!groups.some(saved=>saved.members.length===group.members.length&&group.members.every(item=>saved.members.some(existing=>samePosition(item,existing)))))
        .map(group=>copyPlanRoofGroup(group.members,`plan-support-${crypto.randomUUID()}`));
      if(!added.length)throw new Error('Такая схема уже добавлена. Выберите опору на плане, чтобы её передвинуть.');
      const items=added.flat();
      if(windowSupportHeaders(next,[...next.settings.productionCutting.roofSupports,...items]).items.length>200)throw new Error('Слишком много деталей опор: разделите схему на проекты.');
      commit(current=>{
        current.settings.productionCutting.windowSupportHeaders={bearingMm:150,...current.settings.productionCutting.windowSupportHeaders,enabled:true};
        const all=[...current.settings.productionCutting.roofSupports,...items];
        const result=windowSupportHeaders(current,all);
        current.settings.productionCutting.roofSupports=result.items;return current;
      });
      if(added.length===1)onSelect?.(items[0].planGroupId);
      setMessage(`Добавлено групп опор: ${added.length}. Выберите цветную линию на плане. Прогоны, стойки и лежни перемещаются вместе. Материал показан в смете.`);
    }catch(error){setMessage(error.message);}finally{setBusy(false);}
  };
  const refreshHeaders=()=>{if(windowSupportHeaders({...project,settings:{...project.settings,productionCutting:{...project.settings.productionCutting,windowSupportHeaders:{...project.settings.productionCutting.windowSupportHeaders,enabled:true}}}}).items.length>200){setMessage('Превышен лимит 200 деталей опор. Существующие детали сохранены.');return;}commit(next=>{next.settings.productionCutting.windowSupportHeaders={bearingMm:150,...next.settings.productionCutting.windowSupportHeaders,enabled:true};next.settings.productionCutting.roofSupports=windowSupportHeaders(next).items;return next;});};
  const controls=<div className="inspector-form plan-roof-support-controls">
    {onDraw&&(calculation.roof.layeredFrame?.items>0||project.settings.productionCutting.roofPlanLines?.enabled)?<><button type="button" className="button primary" onClick={onDraw}>Нарисовать / передвинуть линии на крыше</button><p>Автоматические рамы уже показаны синими линиями в слое «Крыша». Рисуйте новые линии и тяните круг на существующей. Подсказка показывает симметрию.</p></>:null}
    <label className="field">Добавляемая опора<select aria-label="Добавляемая опора" value={selectedMode} onChange={event=>setMode(event.target.value)}><option value="frame" disabled={truss}>Опорный каркас под стропилами</option><option value="purlin">Прогон со стойками / ферма выбранной системы</option></select></label>
    <button type="button" className="button primary" disabled={busy} onClick={add}>{busy?'Строю…':'Добавить прогон / ферму на план'}</button>
    {canSketch?<><button type="button" className="button secondary" disabled={busy} onClick={buildSketch}>{hasSketch?'Обновить схему опор коньков':'Показать схему опор коньков'}</button><p>Стойки, подкосы и лежни под коньками. Для лежней вне заданных несущих линий укажите рабочее основание. Схема видна в 3D и не входит в смету и раскрой.</p></>:null}
    {hasSketch?<button type="button" className="button secondary" disabled={busy} onClick={()=>commit(next=>{next.settings.productionCutting.roofSupports=next.settings.productionCutting.roofSupports.filter(item=>item.autoLayout!==ROOF_JUNCTION_SKETCH);return next;})}>Убрать схему опор коньков</button>:null}
    <p>Проектные опоры с плана входят в смету по чистому объёму. Позиции без цены отмечены в ведомости. Сечения берутся из настроек каркаса. Размещение и смещение не являются проверкой прочности и пути нагрузки.</p>
    {groups.map(group=><div className="readout" key={group.id}><button type="button" className="button secondary" onClick={()=>onSelect?.(group.id)}>{group.name} · {group.members.length} деталей</button><button type="button" className="button secondary" onClick={()=>commit(next=>{const ids=new Set(group.members.map(item=>item.id));next.settings.productionCutting.roofSupports=windowSupportHeaders(next,next.settings.productionCutting.roofSupports.filter(item=>!ids.has(item.id))).items;return next;})}>Убрать</button></div>)}
    <p>Усиление над окном: 3 × 50×150 мм, опирание по 150 мм по умолчанию. Материал — чистый объём из текущего прайса; крепёж и рабочие узлы отдельно.</p>
    <NumberField label="Опирание усиления с каждой стороны" suffix="мм" min={1} max={1000} step={10} value={project.settings.productionCutting.windowSupportHeaders?.bearingMm??150} onChange={bearingMm=>commit(next=>{next.settings.productionCutting.windowSupportHeaders={...next.settings.productionCutting.windowSupportHeaders,bearingMm};return next;})}/>
    <button type="button" className="button secondary" onClick={refreshHeaders}>Обновить усиления под существующими прогонами</button>
    {message?<p role="status">{message}</p>:null}
    {windowSupportHeaders(project).issues.map((issue,index)=><p role="alert" key={index}>{issue.message}</p>)}
  </div>;
  return embedded?controls:<details className="plan-top-advanced"><summary>Прогоны и опорные фермы</summary>{controls}</details>;
}
