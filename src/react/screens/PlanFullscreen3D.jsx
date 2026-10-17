import {lazy, Suspense, useEffect, useState} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import '../styles/drawing-workbench.css';

const ProductionHouse3D=lazy(()=>import('./ProductionHouse3D.jsx'));
const DrawingCanvas=lazy(()=>import('./DrawingCanvas.jsx').then(module=>({default:module.DrawingCanvas})));

export default function PlanFullscreen3D({project,calculation}) {
  const [result,setResult]=useState({project:null,report:null,error:''});
  const [selectedMemberId,setSelectedMemberId]=useState('');
  const [view,setView]=useState('3d');
  const [drawingIndex,setDrawingIndex]=useState(0);
  useEffect(()=>{
    let worker;
    const timer=window.setTimeout(()=>{
      worker=new Worker(new URL('../calculations/production-cutting.worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>setResult({project,report:data.report||null,error:data.error||''});
      worker.onerror=()=>setResult({project,report:null,error:'Не удалось построить 3D-модель.'});
      worker.postMessage({project,calculation});
    },180);
    return()=>{window.clearTimeout(timer);worker?.terminate();};
  },[project,calculation]);
  if(result.project!==project)return <p role="status" className="plan-3d-loading">Обновляю 3D по плану…</p>;
  if(result.error)return <p role="alert" className="plan-3d-loading">{result.error}</p>;
  const assembly=result.report.assembly,mauerlats=assembly.roofTimbers.filter(item=>!item.excluded&&(item.name==='Мауэрлат'||item.material?.startsWith('Мауэрлат')));
  const rafters=[...assembly.rafters,...assembly.roofTimbers.filter(item=>item.roofMemberKind==='hip')].filter(item=>!item.excluded);
  const bearingCount=rafters.filter(item=>item.bearingStatus==='geometry-only').length;
  const selected=rafters.find(item=>item.id===selectedMemberId)||mauerlats.find(item=>item.id===selectedMemberId);
  const surfaces=(result.report.surfaces||[]).filter(item=>item.geometry?.length);
  const index=Math.min(drawingIndex,Math.max(0,surfaces.length-1));
  const surface=surfaces[index];
  return <Suspense fallback={<p role="status" className="plan-3d-loading">Загружаю 3D…</p>}>
    <div className="plan-3d-view-switch" role="group" aria-label="Вид в окне 3D"><button type="button" aria-pressed={view==='3d'} onClick={()=>setView('3d')}>3D</button><button type="button" aria-pressed={view==='drawing'} onClick={()=>setView('drawing')}>Развёртки</button></div>
    {view==='3d'?<>
      <ProductionHouse3D report={result.report} project={project} initialZoom={0.9} showRoofStructureByDefault showBearingPoints selected={selectedMemberId?[selectedMemberId]:[]} onSelect={setSelectedMemberId}/>
      {mauerlats.length?<p className="plan-3d-bearing-summary">Мауэрлат (зелёный): {mauerlats.length} участка · геометрическое пересечение: {bearingCount}/{rafters.length} стропил. Оранжевые точки — места пересечения, без расчёта врубки и крепежа.</p>:null}
      {selected?<p className="plan-3d-bearing-detail">{selected.id} · {selected.name||selected.material} · {Math.round(selected.length)} мм{selected.bearingPoint?` · мауэрлат ${selected.bearingMauerlatId} · врезка ${Math.round(selected.bearingNotchMm||0)} мм (предел 50 мм) · XYZ ${selected.bearingPoint.map(Math.round).join(' / ')} мм`:selected.bearingStatus==='unresolved'?' · опирание на мауэрлат не подтверждено':''}</p>:null}
    </>:<div className="plan-3d-drawing">
      <div className="plan-3d-drawing-nav"><button type="button" aria-label="Предыдущая развёртка" disabled={!surfaces.length} onClick={()=>setDrawingIndex((value)=>(value-1+surfaces.length)%surfaces.length)}><ChevronLeft size={15}/></button><select aria-label="Выбрать развёртку" value={surface?.id||''} onChange={event=>setDrawingIndex(surfaces.findIndex(item=>item.id===event.target.value))}>{surfaces.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" aria-label="Следующая развёртка" disabled={!surfaces.length} onClick={()=>setDrawingIndex((value)=>(value+1)%surfaces.length)}><ChevronRight size={15}/></button></div>
      {surface?<DrawingCanvas surface={surface} parts={result.report.parts.filter(item=>item.surfaceId===surface.id)} members={result.report.members.filter(item=>item.surfaceId===surface.id)} layers={{panels:true,frame:true,labels:true}} selected={[]} />:<p>Развёрток для этого проекта пока нет.</p>}
    </div>}
  </Suspense>;
}
