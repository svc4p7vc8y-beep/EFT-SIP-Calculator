import {lazy, Suspense, useEffect, useState} from 'react';
import '../styles/drawing-workbench.css';

const ProductionHouse3D=lazy(()=>import('./ProductionHouse3D.jsx'));

export default function PlanFullscreen3D({project,calculation}) {
  const [result,setResult]=useState({project:null,report:null,error:''});
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
  return <Suspense fallback={<p role="status" className="plan-3d-loading">Загружаю 3D…</p>}>
    <ProductionHouse3D report={result.report} project={project} initialZoom={0.9} showRoofStructureByDefault/>
  </Suspense>;
}
