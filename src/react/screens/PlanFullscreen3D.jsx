import {lazy, Suspense, useEffect, useState} from 'react';
import '../styles/drawing-workbench.css';

const ProductionHouse3D=lazy(()=>import('./ProductionHouse3D.jsx'));

export default function PlanFullscreen3D({project,calculation}) {
  const [result,setResult]=useState({project:null,report:null,error:''});
  const [selectedMemberId,setSelectedMemberId]=useState('');
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
  return <Suspense fallback={<p role="status" className="plan-3d-loading">Загружаю 3D…</p>}>
    <ProductionHouse3D report={result.report} project={project} initialZoom={0.9} showRoofStructureByDefault showBearingPoints selected={selectedMemberId?[selectedMemberId]:[]} onSelect={setSelectedMemberId}/>
    {mauerlats.length?<p className="plan-3d-bearing-summary">Мауэрлат (зелёный): {mauerlats.length} участка · геометрическое пересечение: {bearingCount}/{rafters.length} стропил. Оранжевые точки — места пересечения, без расчёта врубки и крепежа.</p>:null}
    {selected?<p className="plan-3d-bearing-detail">{selected.id} · {selected.name||selected.material} · {Math.round(selected.length)} мм{selected.bearingPoint?` · мауэрлат ${selected.bearingMauerlatId} · XYZ ${selected.bearingPoint.map(Math.round).join(' / ')} мм`:selected.bearingStatus==='unresolved'?' · опирание на мауэрлат не найдено':''}</p>:null}
  </Suspense>;
}
