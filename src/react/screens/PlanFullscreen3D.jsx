import {useTeam} from '../cloud/TeamContext.jsx';
import {square3DSnapshot,snapshotFilename} from '../export/square-3d-snapshot.js';
import {saveScreenshot} from '../cloud/save-screenshot.js';
import {lazy, Suspense, useEffect, useState, useRef} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import '../styles/drawing-workbench.css';

const ProductionHouse3D=lazy(()=>import('./ProductionHouse3D.jsx'));
const DrawingCanvas=lazy(()=>import('./DrawingCanvas.jsx').then(module=>({default:module.DrawingCanvas})));

export default function PlanFullscreen3D({project,calculation,view='3d',onViewChange=()=>{},viewerPreferences,onViewerPreferencesChange,cameraRef}) {
  const team=useTeam(),captureRef=useRef(null);
  const [screenshotBusy,setScreenshotBusy]=useState(false),[screenshotNotice,setScreenshotNotice]=useState('');
  const [result,setResult]=useState({project:null,report:null,error:''});
  const [selectedMemberId,setSelectedMemberId]=useState('');
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
  if(!result.report && !result.error)return <p role="status" className="plan-3d-loading">Обновляю 3D по плану…</p>;
  if(result.error)return <p role="alert" className="plan-3d-loading">{result.error}</p>;
  const displayedProject=result.project||project;
  const assembly=result.report.assembly,mauerlats=assembly.roofTimbers.filter(item=>!item.excluded&&(item.name==='Мауэрлат'||item.material?.startsWith('Мауэрлат')));
  const rafters=[...assembly.rafters,...assembly.roofTimbers.filter(item=>item.roofMemberKind==='hip')].filter(item=>!item.excluded);
  const mainFaceIds=new Set(assembly.roofModel?.faces.filter(face=>face.group==='main').map(face=>face.id)||[]);
  const mainRafters=rafters.filter(item=>!item.faceId||mainFaceIds.has(item.faceId));
  const platformRafterCount=rafters.length-mainRafters.length;
  const tapered=calculation.roof?.flatSlopeMode==='tapered'&&calculation.roof?.mainRoofShape==='flat'&&project.settings.roof.type==='cold';
  const bearingMembers=tapered?assembly.roofTimbers.filter(item=>item.roofMemberKind==='flat-frame-chord'):mainRafters;
  const bearingCount=tapered
    ? new Set(bearingMembers.filter(item=>item.bearingStatus==='geometry-only').map(item=>item.id.split('-НП')[0])).size
    : bearingMembers.filter(item=>item.bearingStatus==='geometry-only').length;
  const bearingTotal=tapered?mainRafters.length:bearingMembers.length;
  const plateWord=mauerlats.length%100>=11&&mauerlats.length%100<=14?'участков':mauerlats.length%10===1?'участок':[2,3,4].includes(mauerlats.length%10)?'участка':'участков';
  const selected=rafters.find(item=>item.id===selectedMemberId)||mauerlats.find(item=>item.id===selectedMemberId)||bearingMembers.find(item=>item.id===selectedMemberId);
  const surfaces=(result.report.surfaces||[]).filter(item=>item.geometry?.length);
  const index=Math.min(drawingIndex,Math.max(0,surfaces.length-1));
  const surface=surfaces[index];
  const makeScreenshot=async()=>{
    if(screenshotBusy)return;
    setScreenshotBusy(true);setScreenshotNotice('Создаю квадратный снимок…');
    try{
      const blob=await square3DSnapshot(captureRef.current?.capture(1600));
      const file=new File([blob],snapshotFilename(displayedProject.meta),{type:'image/png'});
      if(!team.user||team.user.role==='viewer'){
        const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
        setScreenshotNotice('PNG скачан. Для сохранения в «Файлы» войдите с правом загрузки файлов.');
      }else{
        await saveScreenshot(file,team.csrf);
        setScreenshotNotice('Снимок сохранён: Файлы → Скриншоты. Его можно скачать и прикрепить в CRM.');
      }
    }catch(error){setScreenshotNotice(`Снимок не сохранён: ${error.message}`);}
    finally{setScreenshotBusy(false);}
  };
  return <Suspense fallback={<p role="status" className="plan-3d-loading">Загружаю 3D…</p>}>
    <div className="plan-3d-view-switch" role="group" aria-label="Вид в окне 3D"><button type="button" aria-pressed={view==='3d'} onClick={()=>onViewChange('3d')}>3D</button><button type="button" aria-pressed={view==='drawing'} onClick={()=>onViewChange('drawing')}>Развёртки</button></div>
    {result.project!==project?<p role="status" className="plan-3d-loading">Обновляю 3D по плану…</p>:null}
    {screenshotNotice?<div className="plan-3d-shot-notice" role="status"><span>{screenshotNotice}</span><button type="button" aria-label="Закрыть уведомление о снимке" onClick={()=>setScreenshotNotice('')}>×</button></div>:null}
    {view==='3d'?<>
      <ProductionHouse3D report={result.report} project={displayedProject} captureRef={captureRef} onScreenshot={makeScreenshot} screenshotBusy={screenshotBusy||result.project!==project} initialZoom={0.9} showRoofStructureByDefault showBearingPoints selected={selectedMemberId?[selectedMemberId]:[]} onSelect={setSelectedMemberId} viewerPreferences={viewerPreferences} onViewerPreferencesChange={onViewerPreferencesChange} savedViewRef={cameraRef}/>
      {mauerlats.length?<p className="plan-3d-bearing-summary">Мауэрлат (зелёный): {mauerlats.length} {plateWord} · геометрическое пересечение: {bearingCount}/{bearingTotal} {tapered?'линий нижнего пояса':'стропил'} дома{platformRafterCount?` · ${platformRafterCount} стропил пристроек проверяются отдельно`:''}. Оранжевые точки — места пересечения, без расчёта врубки и крепежа.</p>:null}
      {selected?<p className="plan-3d-bearing-detail">{selected.id} · {selected.name||selected.material} · {Math.round(selected.length)} мм{selected.bearingPoint?` · мауэрлат ${selected.bearingMauerlatId} · врезка ${Math.round(selected.bearingNotchMm||0)} мм (предел 50 мм) · XYZ ${selected.bearingPoint.map(Math.round).join(' / ')} мм`:selected.bearingStatus==='unresolved'?' · опирание на мауэрлат не подтверждено':''}</p>:null}
    </>:<div className="plan-3d-drawing">
      <div className="plan-3d-drawing-nav"><button type="button" aria-label="Предыдущая развёртка" disabled={!surfaces.length} onClick={()=>setDrawingIndex((value)=>(value-1+surfaces.length)%surfaces.length)}><ChevronLeft size={15}/></button><select aria-label="Выбрать развёртку" value={surface?.id||''} onChange={event=>setDrawingIndex(surfaces.findIndex(item=>item.id===event.target.value))}>{surfaces.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" aria-label="Следующая развёртка" disabled={!surfaces.length} onClick={()=>setDrawingIndex((value)=>(value+1)%surfaces.length)}><ChevronRight size={15}/></button></div>
      {surface?<DrawingCanvas surface={surface} parts={result.report.parts.filter(item=>item.surfaceId===surface.id)} members={result.report.members.filter(item=>item.surfaceId===surface.id)} layers={{panels:true,frame:true,labels:true}} selected={[]} />:<p>Развёрток для этого проекта пока нет.</p>}
    </div>}
  </Suspense>;
}
