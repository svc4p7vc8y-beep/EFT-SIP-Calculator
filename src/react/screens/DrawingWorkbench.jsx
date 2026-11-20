import {PlatformFrameDrawing} from './PlatformFrameDrawing.jsx';
import {HORIZONTAL_LAYOUT_DIRECTIONS} from '../calculations/surface-orientation.js';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Printer, AlertTriangle, Settings2, Maximize, Minimize, ZoomIn, ZoomOut, Undo2, Redo2, Layers, ChevronLeft, ChevronRight, Download, Box, PanelsTopLeft, SquareDashed, Scissors, Grid2X2, PencilRuler } from 'lucide-react';
import { useProject } from '../state/ProjectContext.jsx';
import { serializeCsv } from '../utils/csv.js';
import { groupPanels, groupMembers } from '../calculations/production-cutting.js';
import WallPanelPlan from './WallPanelPlan.jsx';
import WallPlanNavigator from './WallPlanNavigator.jsx';
import { productionMark as mark } from '../calculations/production-assembly.js';
import { combinedWall, drawingCategory, gableLinks } from '../calculations/drawing-workbench.js';
import { DrawingCanvas, DrawingViewport } from './DrawingCanvas.jsx';
import MountingAlbum, { buildMountingPages } from './MountingAlbum.jsx';
import { BindingSection, RoofSection, StructuralPlan } from './RoofDrawings.jsx';
import AssemblyPlan from './AssemblyPlan.jsx';
import AssemblyCanvas from './AssemblyCanvas.jsx';
import RoofCoverTool from './RoofCoverDrawing.jsx';
import {RoofProjectDrawing} from './RoofProjectDrawing.jsx';
import { approvalLabels, Reconciliation, CuttingApprovalControls, DraftText } from './CuttingControls.jsx';
import '../styles/drawing-workbench.css';
import PartitionProcurement from './PartitionProcurement.jsx';
import BindingRuleCheck from './BindingRuleCheck.jsx';
import ProductionIdentityInfo from './ProductionIdentityInfo.jsx';
import DrawingInspector from './DrawingInspector.jsx';
import WorkbenchSettingsDialog from './WorkbenchSettingsDialog.jsx';
import WorkbenchStock from './WorkbenchStock.jsx';
import {openProductionPrint} from '../export/production-print.js';
import {panelCutMapPages} from '../calculations/panel-cut-maps.js';
import {PanelCutMapPage} from './PanelCutMaps.jsx';
import { CONSTRUCTION_CATEGORIES as categories, WORKBENCH_MODES, workbenchSurfaces, scopedWorkbenchItems, scopedWorkbenchStock, scopedPurchases, timberMaterialSummary, locateWorkbenchItem } from './workbench-model.js';
import WorkbenchTree from './WorkbenchTree.jsx';
import WorkbenchDocuments from './WorkbenchDocuments.jsx';
import '../styles/cutting-workspace.css';
import FoundationFootprint from './FoundationFootprint.jsx';
import SourceChangesInfo from './SourceChangesInfo.jsx';
import CeilingSupportChecks from './CeilingSupportChecks.jsx';
import DrawingToolRail from './DrawingToolRail.jsx';
import ViewSwitcher from './ViewSwitcher.jsx';
const WorkbenchReleaseChecks=lazy(()=>import('./WorkbenchReleaseChecks.jsx'));
const PurchasingRegister=lazy(()=>import('./PurchasingRegister.jsx'));
const ProductionHouse3D=lazy(()=>import('./ProductionHouse3D.jsx'));
const RoofDesignTool=lazy(()=>import('./RoofDesignTool.jsx'));

const defaultLayers={panels:true,frame:true,dimensions:true,labels:true};
const fmt=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value||0);
const download=(name,text,type)=>{const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

export default function DrawingWorkbench({project,calculation,report,pending,error,settings,update,NumberInput,StarterBoardDiagram,StockSheets,Documentation,settingsContent,onNavigate,onAppNavigate}) {
  const {undo,redo,canUndo,canRedo,commit}=useProject();
  const root=useRef(null),title=useRef(null);
  const threeControls=useRef(null);
  const [category,setCategory]=useState('walls'),[surfaceId,setSurfaceId]=useState(''),[view,setView]=useState('drawing');
  const [layers,setLayers]=useState(defaultLayers),[showLayers,setShowLayers]=useState(false),[mode,setMode]=useState('combined');
  const [selection,setSelection]=useState([]),[bottom,setBottom]=useState('assembly'),[expanded,setExpanded]=useState(false);
  const [zoomByView,setZoomByView]=useState({}),[pan,setPan]=useState(false),[fit,setFit]=useState(0);
  const [full,setFull]=useState(false),[sheetId,setSheetId]=useState('1'),[selectedSheets,setSelectedSheets]=useState([]),[paper,setPaper]=useState('A3');
  const [printing,setPrinting]=useState(null),[printError,setPrintError]=useState(''),[pdfBusy,setPdfBusy]=useState(false);
  const [measure,setMeasure]=useState(false),[measureStart,setMeasureStart]=useState(null),[measureCursor,setMeasureCursor]=useState(null);
  const [offsets,setOffsets]=useState({}),[locatorMode,setLocatorMode]=useState('plan'),[documentationOpened,setDocumentationOpened]=useState(false);
  const [archiveOpen,setArchiveOpen]=useState(false),[inspectorOpen,setInspectorOpen]=useState(true);
  const [workMode,setWorkMode]=useState('construction'),[scope,setScope]=useState('surface'),[floor,setFloor]=useState(1);
  const [settingsOpen,setSettingsOpen]=useState(false),[inspectorTab,setInspectorTab]=useState('properties');
  const onSettings=()=>setSettingsOpen(true),onDocumentation=()=>{setDocumentationOpened(true);setWorkMode('documentation');};
  const changeRoofType=type=>commit(next=>{next.settings.roof.type=type;return next;});
  const changeMode=next=>{setWorkMode(next);if(next==='documentation')setDocumentationOpened(true);setTool('select');if(next==='construction'){setBottom('assembly');setExpanded(false);}if(next==='checks'){setBottom('checks');setExpanded(true);}if(next==='production'){setBottom('production');setExpanded(false);}};
  const [editedLabel,setEditedLabel]=useState(null);
  const [labelTool,setLabelTool]=useState(false);
  const setTool=tool=>{setPan(tool==='pan');setMeasure(tool==='measure');setLabelTool(tool==='labels');if(tool!=='labels')setEditedLabel(null);setMeasureStart(null);setMeasureCursor(null);if(tool==='labels')setLayers(old=>({...old,labels:true}));};
  useEffect(()=>{const escape=e=>{if(e.key==='Escape'){setTool('select');setEditedLabel(null);}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  const pages=useMemo(()=>report?buildMountingPages(report):[],[report]);
  const links=useMemo(()=>report?gableLinks(report,settings.gableLinks):[],[report,settings.gableLinks]);
  const candidates=(report?workbenchSurfaces(report):[]).filter(s=>(drawingCategory(s)===category)&&(s.floor==null||s.floor===floor))||[];
  const surface=candidates.find(s=>s.id===surfaceId)||candidates[0];
  const viewOptions=[
    ['drawing',['walls','partitions','gables'].includes(category)?'Развёртка':'План / раскладка',PanelsTopLeft],
    ...(surface?.planStart?[['plan','План сверху',Grid2X2]]:[]),
    ...(['binding','roof'].includes(category)?[['section','Разрез',Scissors]]:[]),
    ...(category==='walls'?[['starter','Стартовая доска',SquareDashed]]:[]),
    ...(category==='roof'?[['roofproject','Кровля: проект',PencilRuler],['cover','Листы покрытия',Grid2X2],['overlay','Совмещённые слои',Layers],['edit','Разместить элементы',PencilRuler]]:category==='supports'&&view==='edit'?[['edit','Разместить элементы',PencilRuler]]:[]),
    ['model3d','3D дом',Box],
  ];
  const swipeStart=useRef(null);
  const onViewTouchStart=event=>{const touch=event.touches[0];swipeStart.current=!pan&&event.touches.length===1&&touch?{x:touch.clientX,y:touch.clientY}:null;};
  const onViewTouchEnd=event=>{
    const start=swipeStart.current,touch=event.changedTouches[0];swipeStart.current=null;
    if(!start||!touch||view!=='drawing'||!['walls','partitions','gables'].includes(category)||candidates.length<2)return;
    const dx=touch.clientX-start.x,dy=touch.clientY-start.y;
    if(Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.5)return;
    const index=candidates.indexOf(surface),step=dx<0?1:-1;
    go(category,candidates[(index+step+candidates.length)%candidates.length].id);
  };
  const drawing=useMemo(()=>!surface?null:category==='walls'?combinedWall(report,surface,links,mode):{surface,parts:report.parts.filter(p=>p.surfaceId===surface.id),members:report.members.filter(m=>m.surfaceId===surface.id)},[surface,report,category,links,mode]);
  const viewKey=`${category}:${surface?.layoutKey||''}:${view}`,zoom=zoomByView[viewKey]||1;
  const fontKey=`${category}:${surface?.id||'all'}`,fontScale=settings.drawingFontScales?.[fontKey]||1;
  const setFontScale=value=>update({drawingFontScales:{...settings.drawingFontScales,[fontKey]:value}});
  const dimensions=settings.drawingDimensions[viewKey]||[];
  const saveDimensions=list=>update({drawingDimensions:{...settings.drawingDimensions,[viewKey]:list}});
  const labels=settings.drawingLabels[viewKey]||{};
  const saveLabel=(key,patch)=>update({drawingLabels:{...settings.drawingLabels,[viewKey]:{...labels,[key]:{...labels[key],...patch}}}});
  const measurePick=point=>{if(!measureStart){setMeasureStart(point);setMeasureCursor(point);}else if(Math.hypot(point[0]-measureStart[0],point[1]-measureStart[1])>0){saveDimensions([...dimensions,{id:crypto.randomUUID(),a:measureStart,b:point}]);setMeasureStart(null);setMeasureCursor(null);}};
  const setZoom=value=>setZoomByView(old=>({...old,[viewKey]:value}));
  const scopedItems=useMemo(()=>report?scopedWorkbenchItems(report,{scope,surface,drawing,category,floor}):{parts:[],members:[]},[report,scope,surface,drawing,category,floor]);
  const members=scopedItems.members;
  const panelGroups=useMemo(()=>groupPanels(scopedItems.parts),[scopedItems]);
  const memberGroups=useMemo(()=>groupMembers(members),[members]);
  const stockReport=useMemo(()=>report?scopedWorkbenchStock(report,scopedItems,{scope,category}):null,[report,scopedItems,scope,category]);
  const purchases=useMemo(()=>report?scopedPurchases(report,scopedItems,{scope,category}):[],[report,scopedItems,scope,category]);
  const timberSummary=useMemo(()=>timberMaterialSummary(members),[members]);
  const chosenMember=report?.members.find(m=>selection.includes(m.id));
  const chosenPanel=report?.parts.find(p=>selection.includes(p.id));
  const chosenSupport=report?.assembly.supports.find(s=>selection.includes(s.mark)||selection.includes(s.id));
  const chosenRoofFace=report?.assembly.roofModel.faces.find(f=>selection.includes(f.id));
  const go=(next,id='')=>{setCategory(next);setSurfaceId(id);setSelection([]);setView('drawing');setTool('select');setEditedLabel(null);};
  const select=id=>{setSelection([id]);setInspectorTab('properties');setInspectorOpen(true);};
  const showGroup=id=>{const pg=panelGroups.find(g=>g.instances.includes(id)),mg=memberGroups.find(g=>g.instances.some(m=>m.id===id));setSelection(pg?pg.instances:mg?mg.instances.map(m=>m.id):[id]);};
  const showItem=id=>{const target=locateWorkbenchItem(report,id);if(target.surface){setFloor(target.surface.floor||floor);go(target.category,target.surface.id);}else if(target.category)go(target.category);setSelection([target.panel?.id||target.member?.id||id]);setInspectorTab('properties');setWorkMode('construction');setBottom('assembly');setExpanded(false);};
  const showStock=id=>{if(id)select(id);setWorkMode('production');setBottom('production');setView('drawing');setExpanded(false);};
  const selectLabel=label=>{if(label.key.startsWith('panel:'))select(label.key.slice(6));setEditedLabel({...label,viewKey});};
  const select3D=id=>{const support=report.assembly.supports.find(s=>s.mark===id||s.id===id),face=report.assembly.roofModel.faces.find(f=>f.id===id);if(support||face){setCategory('roof');setSurfaceId(face?.id||support?.faceId||'');setSelection([support?.mark||face.id]);setInspectorTab('properties');return;}const item=report.parts.find(p=>p.id===id)||report.members.find(m=>m.id===id);if(item?.worldA&&item.faceId){setCategory('roof');setSurfaceId(item.faceId);setSelection([id]);setInspectorTab('properties');return;}const s=report.surfaces.find(s=>s.id===(item?.surfaceId||id));if(s){const keep=view==='model3d';setFloor(s.floor||floor);go(drawingCategory(s),s.id);if(keep)setView('model3d');}setSelection([id]);};
  const openWall=id=>{const s=report.surfaces.find(s=>s.id===id||s.layoutKey===id);if(s){setFloor(s.floor||floor);go(drawingCategory(s),s.id);setInspectorTab('properties');setWorkMode('construction');}};
  useEffect(()=>{const cleanup=()=>{document.body.classList.remove('print-production');if(title.current!==null){document.title=title.current;title.current=null;}setPrinting(null);};window.addEventListener('afterprint',cleanup);return()=>{window.removeEventListener('afterprint',cleanup);document.body.classList.remove('print-production');if(title.current!==null)document.title=title.current;};},[]);
  const print=async(ids,current=false,detail=false,stock=false,pdf=false,customPages=null)=>{
    if(current&&workMode==='production'){stock=true;current=false;}
    if(pending||pdfBusy||!report)return;
    if(root.current?.querySelector('[aria-invalid="true"]')){setPrintError('Исправьте несохранённые значения перед печатью.');return;}
        if(current&&view==='cover'){ids=pages.filter(p=>p.title.startsWith('Покрытие ·')).map(p=>p.id);current=false;if(!ids.length){setPrintError('Сначала задайте размеры листа покрытия.');return;}}
    setPrintError('');title.current=document.title;document.title=project.meta.projectName||project.meta.projectNum||'Домокомплект';
    flushSync(()=>setPrinting({ids,current,detail,stock,customPages}));
    try{if(pdf){setPdfBusy(true);const {downloadProductionPdf}=await import('../export/production-pdf.js');await downloadProductionPdf(document.querySelector('body>.production-print'),{paper,filename:`${document.title}-${customPages?(ids?.length===1?customPages.find(p=>p.id===ids[0])?.title||'Лист':'Альбом'):stock?'карты-раскроя':currentTitle}`});}else openProductionPrint(document.querySelector('body>.production-print'),{title:document.title,paper});}
    catch(error){setPrintError(error.message);}
    finally{setPdfBusy(false);setPrinting(null);if(title.current!==null){document.title=title.current;title.current=null;}}
  };
  const exportTable=()=>{const rows=[['Материал','Размер / сечение','Ед.','Количество'],...purchases.map(r=>[r.name,r.profile,r.unit,r.qty])];download(`${project.meta.projectName||'Домокомплект'}-закупка.csv`,serializeCsv(rows),'text/csv;charset=utf-8');};
  const issueClick=issue=>{const target=locateWorkbenchItem(report,issue.target);if(target.surface||target.member){showItem(target.panel?.id||target.member?.id||target.surface.id);return;}if(issue.code==='ASSEMBLY'||issue.code==='ROOF_SUPPORTS'){go('supports');setWorkMode('construction');}else onSettings();};
  const resetView=()=>{setZoom(1);setOffsets(old=>({...old,[viewKey]:[0,0]}));setFit(v=>v+1);};
  const exportDrawing=async share=>{
    const source=root.current?.querySelector(view==='roofproject'?'.roof-project-plan':'.drawing-stage svg');if(!source)return;
    const svg=source.cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width','1200');svg.setAttribute('height','800');svg.querySelectorAll('[tabindex],[role="button"]').forEach(el=>{el.removeAttribute('tabindex');el.removeAttribute('role');});
    const text=new XMLSerializer().serializeToString(svg),name=`${project.meta.projectName||'Домокомплект'}-${surface?.id||category}.svg`.replace(/[<>:"/\\|?*]/g,'-');
    const file=new File([text],name,{type:'image/svg+xml'});
    if(share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:project.meta.projectName||'Чертёж'});}catch(e){if(e.name!=='AbortError')setPrintError('Не удалось открыть отправку. Скачайте чертёж и прикрепите к письму.');}}
    else download(name,text,'image/svg+xml');
  };
  const scene=()=>{
    if(category==='roof'&&view==='roofproject')return <RoofProjectDrawing model={report.assembly.roofModel} features={settings.roofDesign.features} supports={report.assembly.supports} rafters={report.assembly.rafters} selected={chosenRoofFace?.id||''} selectedSupport={chosenSupport?.mark||''} onSelect={id=>setSelection([id])} onSelectSupport={id=>setSelection([id])}/>;
        if(category==='overview')return <WallPanelPlan report={report} floor={floor} onSelect={openWall} layers={layers} fontScale={fontScale}/>;
    if(view==='plan'&&surface?.planStart)return <WallPanelPlan report={report} floor={surface.floor} selectedId={surface.id} onSelect={openWall} layers={layers} fontScale={fontScale}/>;
    if(category==='piles')return <StructuralPlan assembly={{...report.assembly,binding:[]}} kind="binding" layers={{...layers,platforms:settings.showPlatforms!==false}} fontScale={fontScale}/>;
    if(view==='starter')return <StarterBoardDiagram walls={report.starterBoards}/>;
    if(category==='platforms')return <PlatformFrameDrawing platform={report.assembly.platforms.find(p=>`platform:${p.id}`===surface?.id)} onSelect={select}/>;
    if(category==='supports')return <AssemblyCanvas assembly={report.assembly}/>;
    if(category==='binding')return view==='section'?<BindingSection assembly={report.assembly}/>:<StructuralPlan assembly={report.assembly} kind="binding" layers={{...layers,platforms:settings.showPlatforms!==false}} fontScale={fontScale}/>;
    if(category==='roof'&&(view!=='drawing'||!surface))return view==='cover'?<RoofCoverTool report={report} settings={settings} update={update} NumberInput={NumberInput}/>:view==='section'?<RoofSection assembly={report.assembly}/>:view==='overlay'?<AssemblyCanvas assembly={report.assembly}/>:<StructuralPlan assembly={report.assembly} selected={selection} onSelect={select} layers={layers}/>;
    if(drawing)return <DrawingCanvas {...drawing} layers={layers} selected={selection} onSelect={labelTool?undefined:select} fontScale={fontScale} dimensions={dimensions} labelOverrides={labels} onTextSelect={labelTool?selectLabel:label=>{if(label.key.startsWith('panel:'))select(label.key.slice(6));}} onTextMove={labelTool?(key,offset)=>saveLabel(key,{offset}):undefined} draft={measureStart&&measureCursor?{a:measureStart,b:measureCursor}:null} onPick={measure?measurePick:null} onHover={measureStart?setMeasureCursor:null} onLabelMove={(id,offset)=>saveDimensions(dimensions.map(d=>d.id===id?{...d,offset}:d))}/>;
    return <p className="cut-empty">Для этой конструкции нет деталей. Проверьте включение раздела в параметрах проекта.</p>;
  };
  if(!report)return <section className="screen cutting-screen"><h1>Чертежи и сборка</h1><p role="status">{error||'Подготавливаю геометрию и ведомости…'}</p></section>;
  const currentTitle=category==='piles'?(report.assembly.foundationType==='concreteBlock'?'План бетонных блоков':'Свайное поле'):surface?.name||categories.find(([id])=>id===category)?.[1]||({supports:'Опоры и проектные элементы',starter:'Стартовая доска'})[category]||'Домокомплект';
  const stockPages=panelCutMapPages(stockReport||report).map((page,i)=>({id:`КР${i+1}`,title:`Карты раскроя · ${page.format.height}×${page.format.width}`,content:<PanelCutMapPage page={page} report={stockReport||report} projectName={project.meta.projectName||project.meta.projectNum}/> }));
  const projectStockPages=panelCutMapPages(report).map((page,i)=>({id:`КР${i+1}`,title:`Карты раскроя · ${page.format.height}×${page.format.width} · ${page.format.thickness} мм`,content:<PanelCutMapPage page={page} report={report} projectName={project.meta.projectName||project.meta.projectNum}/> }));
  const currentPages=[{id:'В',title:currentTitle,content:<>{scene()}<p>Размеры: мм. {report.revision}. Геометрическая деталировка; несущие узлы по рабочему проекту.</p></>}];
  const detailPages=chosenPanel?[{id:'Д',title:`${mark(chosenPanel)} · ×${selection.length}`,content:<><DrawingCanvas surface={{...chosenPanel,name:mark(chosenPanel),geometry:[chosenPanel.shape]}} parts={[chosenPanel]} layers={defaultLayers}/><p>{chosenPanel.width}×{chosenPanel.height}×{chosenPanel.thickness} мм. Позиции: {selection.map(mark).join(', ')}</p></>}]:chosenMember?[{id:'Д',title:`${mark(chosenMember)} · ×${selection.length}`,content:<><h2>{chosenMember.material} · {chosenMember.profile} мм</h2><p>Чистая длина {chosenMember.length} мм; заготовка {chosenMember.cutLength} мм.</p><p>Узел: {chosenMember.nodeRef||'не задан'}. {chosenMember.processing||'Обработка по рабочему узлу'}</p><p>Позиции: {selection.map(mark).join(', ')}</p></>}]:[];
  return <section ref={root} className={`screen cutting-screen drawing-workbench ${inspectorOpen?'':'inspector-collapsed'} ${full?'workbench-full':''}`}>
    <header className="drawing-header"><div className="workbench-heading"><h1>Раскрой</h1><span>{project.meta.projectName||'Домокомплект'} · {pending?'Пересчёт…':approvalLabels[report.approvalStatus]}</span></div><nav className="workbench-modes" aria-label="Режим рабочего раздела">{WORKBENCH_MODES.map(([id,name])=><button key={id} aria-pressed={workMode===id||id==='construction'&&workMode==='checks'} onClick={()=>{setArchiveOpen(false);changeMode(id);}}>{name}</button>)}</nav><div className="workbench-header-actions"><button className="workbench-issues" aria-pressed={workMode==='checks'} onClick={()=>changeMode(workMode==='checks'?'construction':'checks')}><AlertTriangle size={16}/>Замечания {report.issues.length+links.filter(l=>l.stale).length}</button><button title="Настройки производства" aria-label="Настройки производства" onClick={onSettings}><Settings2 size={18}/></button><button className="workbench-primary" onClick={()=>{setArchiveOpen(false);changeMode('documentation');}}>PDF</button></div></header>
    <FoundationFootprint {...{project,report,pending}}/>{printError?<p role="alert" className="workbench-print-error">{printError}</p>:null}
    {workMode==='documentation'&&!archiveOpen?<WorkbenchDocuments {...{project,report,pages,paper,pending,pdfBusy}} stockPages={projectStockPages} onPaper={setPaper} onPrint={(ids,pdf,list)=>print(ids,false,false,false,pdf,list)} onArchive={()=>{setArchiveOpen(true);setDocumentationOpened(true);}} onPurchase={()=>changeMode('purchase')}/>:null}
    {workMode==='documentation'&&archiveOpen?<button onClick={()=>setArchiveOpen(false)}>Вернуться к листам альбома</button>:null}
    <div hidden={workMode!=='documentation'||!archiveOpen}>{documentationOpened?<Suspense fallback={<p role="status">Загрузка документации…</p>}><Documentation calculation={calculation} report={report} pending={pending} onBack={()=>changeMode('construction')} onLocate={block=>{const issue=report.issues.find(i=>i.message===block.message);if(issue){issueClick(issue);return;}if(block.target){const target=report.parts.find(p=>p.id===block.target)||report.members.find(m=>m.id===block.target);if(target){changeMode('construction');showItem(target.id);return;}}const item=[...report.parts,...report.members].find(i=>block.message.startsWith(i.id+':'));const s=report.surfaces.find(s=>block.message.startsWith(s.name+':'));if(item){showItem(item.id);return;}if(s){openWall(s.id);return;}if(block.code==='CATALOG'){onAppNavigate?.('price');return;}changeMode('checks');}} sheetNavigation={<ViewSwitcher items={pages.map(page=>({id:page.id,label:page.title,description:page.id}))} selected={sheetId} onChange={setSheetId} label="Лист текущей модели"/>} workingSheets={<><p>Предварительный просмотр текущей модели — не сохранённый выпуск.</p><label>Лист<select aria-label="Лист текущей модели" value={sheetId} onChange={e=>setSheetId(e.target.value)}>{pages.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>Формат<select aria-label="Формат текущей модели" value={paper} onChange={e=>setPaper(e.target.value)}><option>A3</option><option>A4</option></select></label><button disabled={pending} onClick={()=>print([sheetId])}>Печать листа</button><button disabled={pending} onClick={()=>print(null)}>Печать всех текущих листов</button><details><summary>Выбрать текущие листы · {selectedSheets.length}</summary><button onClick={()=>setSelectedSheets(pages.map(p=>p.id))}>Выбрать все листы</button><button onClick={()=>setSelectedSheets([])}>Снять выбор листов</button>{pages.map(p=><label key={p.id}><input type="checkbox" checked={selectedSheets.includes(p.id)} onChange={e=>setSelectedSheets(old=>e.target.checked?[...old,p.id]:old.filter(id=>id!==p.id))}/>{p.title}</label>)}<button disabled={pending||!selectedSheets.length} onClick={()=>print(selectedSheets)}>Печать выбранных листов</button></details><MountingAlbum project={project} report={report} pages={pages} selectedIds={[sheetId]} paper={paper} preview/></>}/></Suspense>:null}</div>
    {workMode==='purchase'?<Suspense fallback={<p role="status">Подготавливаю ведомость закупки…</p>}><PurchasingRegister project={project} calculation={calculation} report={report} pending={pending}/></Suspense>:null}
    <div className={`workbench-layout mode-${workMode}`} hidden={workMode==='documentation'||workMode==='purchase'}>
    {workMode==='construction'?<WorkbenchTree report={report} floor={floor} floors={Math.max(1,project.meta.floors||1)} category={category} surfaceId={surface?.id} onFloor={value=>{setFloor(value);setSurfaceId('');setSelection([]);setTool('select');}} onChoose={(cat,id)=>go(cat,id)}/>:null}
    <div className="workbench-main">
    {workMode==='production'?<label className="workbench-scope">Охват<select aria-label="Охват ведомости" value={scope} onChange={e=>{setScope(e.target.value);setSelection([]);}}><option value="surface">Выбранная конструкция · {currentTitle}</option><option value="category">Весь раздел</option><option value="floor">Этаж {floor}</option><option value="floors">Пол · все этажи</option><option value="ceilings">Потолок · все этажи</option><option value="allWalls">Все стены · все этажи</option><option value="project">Весь проект</option></select></label>:null}{workMode==='production'&&scope==='allWalls'?<p className="inspector-note">Все наружные стены, перегородки и фронтоны всех этажей. Пол и потолок в этот охват не входят.</p>:null}
    <div hidden={workMode!=='construction'}><div className="drawing-navigation"><strong>{currentTitle}</strong><details className="workbench-quick-print"><summary><Printer size={16}/>Печать вида</summary><label>Формат<select aria-label="Формат печати вида" value={paper} onChange={e=>setPaper(e.target.value)}><option>A3</option><option>A4</option></select></label><button disabled={pending||pdfBusy||view==='model3d'} onClick={()=>print(null,true)}>Печать вида</button><button disabled={pending||pdfBusy||view==='model3d'} onClick={()=>print(null,true,false,false,true)}>{pdfBusy?'Формирую PDF…':'PDF листа'}</button></details></div>
    <div className="workbench-view-bar" role="group" aria-label="Виды конструкции"><div className="workbench-view-icons">{viewOptions.map(([id,label,Icon])=><button key={id} title={label} aria-label={label} aria-pressed={view===id} onClick={()=>{setView(id);setTool('select');}}><Icon size={18}/><span>{label}</span></button>)}</div><button disabled={!canUndo||pending} onClick={undo} aria-label="Отменить"><Undo2 size={17}/></button><button disabled={!canRedo||pending} onClick={redo} aria-label="Повторить"><Redo2 size={17}/></button><button aria-expanded={showLayers} onClick={()=>setShowLayers(!showLayers)}><Layers size={17}/>Слои</button><button aria-pressed={inspectorOpen} onClick={()=>setInspectorOpen(!inspectorOpen)}>Параметры</button><button className="workbench-view-full" onClick={()=>setFull(!full)} aria-label={full?'Свернуть вид':'Развернуть вид'}>{full?<Minimize size={18}/>:<Maximize size={18}/>}</button></div>
    {measure?<p role="status">{measureStart?'Укажите вторую точку':'Укажите первую точку'}; размер сохраняется в проекте. Подписи редактируются инструментом «Подписи».</p>:null}
    {pending?<p role="status" className="drawing-pending">Обновляю чертежи. Печать и редактирование временно недоступны.</p>:null}
    {error?<p role="alert">{error}</p>:null}
    {surface?.blocked?<p role="alert">{surface.name}: раскладка неполная. Контур показан, но отсутствующие детали не включены в закупочную сверку. Откройте кнопку «Замечания».</p>:null}
    {surface?.automaticDirection?<p className="inspector-note">Автоматическая раскладка: направление панелей изменено для обхода узких деталей. Размеры конструкции и проёмов сохранены; опирание соединителей проверяется отдельно.</p>:null}
    {editedLabel?.viewKey===viewKey?<fieldset><legend>Подпись на чертеже</legend><DraftText label="Текст подписи" value={labels[editedLabel.key]?.text??editedLabel.text} onChange={text=>saveLabel(editedLabel.key,{text})}/><p>Подпись можно перетащить мышью или пальцем. Изменяется только надпись этого вида; техническая марка и спецификация сохраняются.</p><button onClick={()=>{const next={...labels};delete next[editedLabel.key];update({drawingLabels:{...settings.drawingLabels,[viewKey]:next}});}}>Сбросить подпись и положение</button><button onClick={()=>setEditedLabel(null)}>Закрыть</button></fieldset>:null}
    {category === 'binding' ? <BindingRuleCheck result={report.constructionRuleChecks?.bindingStraightSupport} value={settings.bindingJointToleranceMm} update={update} NumberInput={NumberInput} pending={pending}/> : null}
    </div><fieldset className={`drawing-content ${pending?'is-pending':''}`}>
      <div className="drawing-editor-grid" hidden={workMode==='checks'} onTouchStart={onViewTouchStart} onTouchEnd={onViewTouchEnd}>
{workMode==='production'?<div className="drawing-special-view workbench-map-view"><WorkbenchStock project={project} calculation={calculation} pending={pending} onPdf={()=>print(null,false,false,true,true)} pdfBusy={pdfBusy} onPrint={()=>print(null,false,false,true)} report={stockReport} onSelect={select} onLocate={showItem} selected={selection}/></div>:view==='model3d'?<Suspense fallback={<p role="status">Загружаю 3D…</p>}><ProductionHouse3D report={report} project={project} selected={selection} onSelect={select3D} controlsRef={threeControls} pan={pan} large/></Suspense>:
category==='roof'&&view==='roofproject'?<div className="drawing-special-view"><Suspense fallback={<p>Загрузка проекта кровли…</p>}><RoofDesignTool {...{project,calculation,report,settings,update,NumberInput}} selectedFaceId={chosenRoofFace?.id||''} selectedSupport={chosenSupport?.mark||''} onSelectFace={id=>setSelection([id])} onSelectSupport={id=>setSelection([id])} onSelectMember={id=>setSelection([id])} onRoofTypeChange={changeRoofType} onOpen3D={()=>setView('model3d')}/></Suspense></div>:view==='starter'||category==='roof'&&view==='cover'?<div className="drawing-special-view">{scene()}</div>:category==='supports'||view==='edit'||category==='roof'&&view==='overlay'?<AssemblyPlan report={report} settings={settings} update={update} NumberInput={NumberInput} compact/>:<div className="drawing-stage"><DrawingViewport key={`${viewKey}:${fit}`} zoom={zoom} pan={pan} onZoom={setZoom} offset={offsets[viewKey]||[0,0]} onOffset={offset=>setOffsets(old=>({...old,[viewKey]:offset}))}>{scene()}</DrawingViewport></div>
}
      <DrawingToolRail tool={pan?'pan':measure?'measure':labelTool?'labels':'select'} onTool={setTool} canMeasure={!!drawing&&view==='drawing'} pending={pending} onSupports={()=>{go('supports');setView('edit');}}/>
      <aside hidden={workMode==='production'} className="drawing-inspector" aria-label="Карточка выбранного элемента">
        <nav className="workbench-inspector-tabs">{[['properties','Карточка'],['location','В доме']].map(([id,name])=><button key={id} aria-pressed={inspectorTab===id} onClick={()=>setInspectorTab(id)}>{name}</button>)}</nav>
        {inspectorTab==='location'?<><label>Ориентация<select aria-label="Ориентация в доме" value={locatorMode} onChange={e=>setLocatorMode(e.target.value)}><option value="plan">Мини-план</option><option value="3d">3D</option></select></label>{locatorMode==='plan'?surface?.planStart?<WallPlanNavigator report={report} surface={surface} onSelect={openWall}/>:<WallPanelPlan report={report} floor={floor} onSelect={openWall} layers={layers}/>:<Suspense fallback={<p>Загрузка 3D…</p>}><ProductionHouse3D report={report} project={project} selected={selection} onSelect={select3D} onExpand={()=>{setView('model3d');setTool('select');}}/></Suspense>}</>:
        <><h2>{chosenPanel?mark(chosenPanel):chosenMember?mark(chosenMember):chosenSupport?chosenSupport.mark:chosenRoofFace?chosenRoofFace.id:currentTitle}</h2>
        {chosenSupport?<dl><dt>Элемент</dt><dd>{chosenSupport.name}</dd><dt>Скат</dt><dd>{chosenSupport.faceId||'общий'}</dd><dt>Сечение</dt><dd>{chosenSupport.profile}</dd><dt>Длина</dt><dd>{chosenSupport.length} мм</dd><dt>Начало XYZ</dt><dd>{chosenSupport.a.map(Math.round).join('; ')}</dd><dt>Конец XYZ</dt><dd>{chosenSupport.b.map(Math.round).join('; ')}</dd><dt>Узел</dt><dd>{chosenSupport.nodeRef||'не задан'}</dd><dt>Статус</dt><dd>{chosenSupport.trussTemplate?'Эскиз фермы, без расчёта':chosenSupport.referenceOnly?'Справочная линия':'Проектный элемент'}</dd></dl>:null}
        {chosenMember?.worldA&&category==='roof'?<dl><dt>Тип</dt><dd>{chosenMember.rafterKind==='jack'?'Нарожник':chosenMember.rafterKind==='common'?'Рядовое стропило':chosenMember.roofMemberKind==='hip'?'Накосное стропило':chosenMember.name}</dd><dt>Скат</dt><dd>{chosenMember.faceId}</dd><dt>Сечение</dt><dd>{chosenMember.profile}</dd><dt>Длина</dt><dd>{chosenMember.length} мм</dd><dt>Начало XYZ</dt><dd>{chosenMember.worldA.map(Math.round).join('; ')}</dd><dt>Конец XYZ</dt><dd>{chosenMember.worldB.map(Math.round).join('; ')}</dd><dt>Наклон оси</dt><dd>{chosenMember.slopeDeg?.toFixed(2)}°</dd><dt>Вертикальный торец к оси</dt><dd>{chosenMember.plumbCutDeg?.toFixed(2)}°</dd><dt>Чистый объём</dt><dd>{chosenMember.volumeM3?.toFixed(4)} м³</dd><dt>Сопряжение</dt><dd>{chosenMember.compoundCutRequired?'Сложный запил в узле накосного элемента — по рабочему чертежу':'Проверить опирание и узел'}</dd></dl>:null}
        {chosenRoofFace?<p>{chosenRoofFace.name}: {chosenRoofFace.area.toFixed(2)} м², уклон {chosenRoofFace.angle.toFixed(1)}°, отметки Z {chosenRoofFace.vertices.map(p=>Math.round(p[2])).join(' / ')} мм.</p>:null}
        {chosenPanel||chosenMember?<><button onClick={()=>showGroup((chosenPanel||chosenMember).id)}>Показать одинаковые ×N</button><p>Выбрано позиций: {selection.length}</p><button onClick={()=>showStock((chosenPanel||chosenMember).id)}>Найти в раскрое</button></>:null}
        {category==='gables'?<label>Материал всех фронтонов<select aria-label="Материал всех фронтонов" value={project.settings.roof.gableType||'auto'} onChange={e=>{const value=e.target.value;commit(draft=>{draft.settings.roof.gableType=value;return draft;});}}><option value="auto">По типу кровли</option><option value="sip">SIP-панели</option><option value="cold">Каркас</option><option value="none">Не считать</option></select><small>Общее изменение материала и сметы проекта.</small></label>:null}
        <DrawingInspector {...{surface,category,report,settings,update,NumberInput,project,chosenPanel,chosenMember,selection,links,onSettings}}/>
        {surface?.planStart?<button onClick={()=>onNavigate?.(surface)}>Открыть источник на плане</button>:null}
        <details><summary>Справка и идентификаторы</summary><ProductionIdentityInfo report={report}/><p>Выбор — одна позиция. Группа одинаковых деталей выделяется отдельной командой. Геометрия источника редактируется на плане дома.</p></details></>}
      </aside>
      </div>
      <div className="drawing-status"><span>{workMode==='production'?({floors:'Пол · все этажи',ceilings:'Потолок · все этажи',allWalls:'Все стены · все этажи',project:'Весь проект'}[scope]||currentTitle):currentTitle} · размеры в мм · вид не меняет количества</span></div>
      <section className="drawing-bottom"><div className="drawing-bottom-tabs"><button onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'Свернуть ведомость':`Детали · ${scopedItems.parts.length+members.length}`}</button>{expanded&&workMode!=='checks'?<nav aria-label="Ведомости конструкции">{[['assembly','Позиции'],['production','Детали ×N'],['purchase','Комплектация']].map(([id,name])=><button key={id} aria-pressed={bottom===id} onClick={()=>setBottom(id)}>{name}</button>)}</nav>:null}<span>{workMode==='checks'?'Проверки всего проекта':scope==='project'?'Весь проект':scope==='floor'?`Этаж ${floor}`:({floors:'Пол · все этажи',ceilings:'Потолок · все этажи',allWalls:'Все стены · все этажи'}[scope]||currentTitle)}</span></div>
        {expanded||workMode==='checks'?<div className="drawing-bottom-content">
          {workMode==='checks'?<SourceChangesInfo report={report} settings={settings} update={update} onSelect={openWall} pending={pending}/>:null}
          {workMode==='checks'?<CeilingSupportChecks report={report} settings={settings} update={update} NumberInput={NumberInput}/>:null}
          {bottom==='assembly'?<><p>Фактические позиции. Для стен X/Y — вдоль стены и от пола; для горизонтальных конструкций — координаты плана.</p><div className="cut-table-wrap"><table><thead><tr><th>Позиция</th><th>Конструкция</th><th>Начало / конец, мм</th><th>Размер</th></tr></thead><tbody>{scopedItems.parts.map(p=><tr key={p.id}><td><button onClick={()=>showItem(p.id)}>{mark(p)}</button></td><td>{report.surfaces.find(s=>s.id===p.surfaceId)?.name||p.surfaceId}</td><td>{p.x}; {p.y}</td><td>{p.width}×{p.height}×{p.thickness}</td></tr>)}{members.filter(m=>!m.excluded).map(m=><tr key={m.id}><td><button onClick={()=>showItem(m.id)}>{mark(m)}</button></td><td>{m.surface}</td><td>{m.a?`${m.a.map(fmt).join('; ')} → ${m.b.map(fmt).join('; ')}`:'См. план конструкции'}</td><td>{m.profile} · {m.length} мм</td></tr>)}</tbody></table></div></>:null}
          {bottom==='production'?<><p>Строка открывает одну позицию. Команда «Показать одинаковые ×N» выделяет группу; физические позиции сохраняются.</p><div className="cut-table-wrap"><table><thead><tr><th>Марка / деталь</th><th>Размер, мм</th><th>Количество</th><th>Позиции</th></tr></thead><tbody>{panelGroups.map(g=><tr key={g.part.id} className={selection.includes(g.part.id)?'selected':''}><td><button onClick={()=>showItem(g.part.id)}>{mark(g.part)} · панель</button></td><td>{fmt(g.part.width)}×{fmt(g.part.height)}×{g.part.thickness}</td><td><strong>×{g.qty}</strong></td><td><details><summary>{g.qty} поз.</summary>{g.instances.map(mark).join(', ')}</details></td></tr>)}{memberGroups.map(g=><tr key={g.member.id} className={selection.includes(g.member.id)?'selected':''}><td><button onClick={()=>showItem(g.member.id)}>{mark(g.member)} · {g.member.material}</button></td><td>{g.member.profile} · L {fmt(g.member.length)}</td><td><strong>×{g.qty}</strong></td><td><details><summary>{g.qty} поз.</summary>{g.instances.map(m=>mark(m)).join(', ')}</details></td></tr>)}</tbody></table></div><p>Резка всего комплекта: панели {report.cutting.panelCuts} резов / {fmt(report.cutting.panelCutLengthM)} м; пиломатериалы {report.cutting.timberCuts} резов. Без пазов и врубок.</p></>:null}
          {bottom==='purchase'?<>{category==='partitions'?<PartitionProcurement report={report} project={project} settings={settings} update={update} NumberInput={NumberInput}/>:null}<h3>Пиломатериал по выбранному охвату</h3><p>Чистые детали по чертежу: количество, суммарная длина и объём. Для всей кровли или всех перегородок выберите охват «Весь раздел».</p><div className="cut-table-wrap"><table><thead><tr><th>Материал</th><th>Сечение, мм</th><th>Детали</th><th>Длина, м</th><th>Объём, м³</th></tr></thead><tbody>{timberSummary.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.profile}</td><td>{r.qty}</td><td>{fmt(r.lengthM)}</td><td>{fmt(r.volumeM3)}</td></tr>)}</tbody><tfoot><tr><th colSpan="2">Итого</th><td>{timberSummary.reduce((n,r)=>n+r.qty,0)}</td><td>{fmt(timberSummary.reduce((n,r)=>n+r.lengthM,0))}</td><td>{fmt(timberSummary.reduce((n,r)=>n+r.volumeM3,0))}</td></tr></tfoot></table></div><h3>Закупка заготовок</h3><p>Полные заготовки, содержащие детали выбранного охвата. Одна заготовка может использоваться несколькими конструкциями: их отдельные ведомости нельзя складывать. Общая закупка — при охвате «Весь проект». Без дополнительного сметного запаса.</p><button onClick={exportTable}><Download size={16}/>Скачать ведомость CSV</button><div className="cut-table-wrap"><table><thead><tr><th>Материал</th><th>Заготовка, мм</th><th>Количество</th></tr></thead><tbody>{purchases.map(r=><tr key={r.id}><td><button onClick={()=>{if(r.ids[0])showStock(r.ids[0]);}}>{r.name}</button></td><td>{r.profile}</td><td>×{r.qty}</td></tr>)}</tbody></table></div></>:null}

          {workMode==='checks'?<><Suspense fallback={<p role="status">Проверка готовности выпуска…</p>}><WorkbenchReleaseChecks project={project} calculation={calculation} report={report} onDocumentation={onDocumentation} onLocate={block=>{const issue=report.issues.find(i=>i.message===block.message);if(issue)issueClick(issue);else if(block.code==='CATALOG')onAppNavigate?.('price');else{const item=[...report.parts,...report.members].find(i=>block.message.startsWith(i.id+':'));if(item)showItem(item.id);else onDocumentation();}}}/></Suspense><button onClick={onDocumentation}>Проверки полного выпуска и документы</button><Reconciliation report={report}/>{report.issues.map((issue,i)=><p key={i}><button onClick={()=>issueClick(issue)}>{issue.message}</button></p>)}{links.filter(l=>l.stale).map(l=><p key={l.gable.id} role="alert">{l.gable.name}: стена изменена, восстановите проектную привязку.</p>)}<details><summary>Расхождения со сметой и ограничения</summary>{report.notices.map(text=><p key={text}>{text}</p>)}</details><CuttingApprovalControls settings={settings} report={report} update={update} NumberInput={NumberInput}/></>:null}
        </div>:null}
      </section>
    </fieldset>
    <details className="workbench-additional"><summary>Дополнительно: виды, размеры и экспорт</summary>
    {category==='walls'?<div className="drawing-views">{[['combined','Стена с фронтоном'],['wall','Только стена'],['gable','Только фронтон']].map(([id,label])=><button key={id} aria-pressed={mode===id} disabled={id==='gable'&&!links.some(l=>l.wall?.id===surface?.id)} onClick={()=>setMode(id)}>{label}</button>)}</div>:null}
    {surface&&view!=='model3d'&&['floor','ceiling'].includes(category)?<div className="drawing-views" role="group" aria-label="Раскладка перекрытия">{HORIZONTAL_LAYOUT_DIRECTIONS.map(({value:direction,label})=><button key={direction} aria-pressed={(settings.layouts[surface.layoutKey]?.direction||'auto')===direction} onClick={()=>update({layouts:{...settings.layouts,[surface.layoutKey]:{...settings.layouts[surface.layoutKey],direction}}})}>{label}</button>)}<label><input type="checkbox" checked={settings.staggered} onChange={e=>update({staggered:e.target.checked})}/>Шахматная раскладка пола и потолка</label></div>:null}
    {surface?.roofFaceId&&category==='roof'&&view==='drawing'?<div className="drawing-views" role="group" aria-label="Ориентация SIP-панелей крыши">{[['auto','Автоматически'],['x','Вдоль ската'],['y','Поперёк ската · 90°']].map(([direction,label])=><button key={direction} type="button" aria-pressed={(settings.layouts[surface.layoutKey]?.direction||'auto')===direction} onClick={()=>update({layouts:{...settings.layouts,[surface.layoutKey]:{...settings.layouts[surface.layoutKey],direction}}})}>{label}</button>)}<small>Ориентация относится к выбранному скату. Контур крыши остаётся прежним; раскрой и количество деталей пересчитываются.</small></div>:null}
    {scope==='floor'?<p>Только детали конструкций с указанным этажом. Общая обвязка, кровля и проектные опоры без этажной привязки — в охвате «Весь проект».</p>:null}
    <div className="drawing-tools" role="toolbar" aria-label="Инструменты чертежа">
      <button disabled={!canUndo||pending} onClick={undo} aria-label="Отменить"><Undo2 size={17}/></button>
      <button disabled={!canRedo||pending} onClick={redo} aria-label="Повторить"><Redo2 size={17}/></button>
      <button disabled={['edit','cover','overlay','starter'].includes(view)||category==='supports'||workMode==='production'} onClick={()=>view==='model3d'?threeControls.current?.zoom(1.25):setZoom(Math.max(.5,zoom/1.25))} aria-label="Уменьшить"><ZoomOut size={17}/></button>
      <span>{view==='model3d'?'3D':Math.round(zoom*100)+'%'}</span>
      <button disabled={['edit','cover','overlay','starter'].includes(view)||category==='supports'||workMode==='production'} onClick={()=>view==='model3d'?threeControls.current?.zoom(.8):setZoom(Math.min(4,zoom*1.25))} aria-label="Увеличить"><ZoomIn size={17}/></button>
      <button onClick={()=>view==='model3d'?threeControls.current?.reset():resetView()}>По размеру</button>
      <button aria-pressed={settings.showPlatforms!==false} onClick={()=>update({showPlatforms:settings.showPlatforms===false})}>Терраса и крыльцо</button>
      {view!=='model3d'?<button aria-expanded={showLayers} onClick={()=>setShowLayers(!showLayers)}><Layers size={17}/>Слои</button>:null}
      <details className="workbench-export"><summary>Экспорт и размеры</summary>
        {detailPages.length?<button disabled={pending} onClick={()=>print(null,false,true)}>Печать детали ×{selection.length}</button>:null}
        {!['supports','sheets','starter','stock','nodes'].includes(category)&&!['edit','cover','overlay','model3d','starter'].includes(view)?<><button onClick={()=>exportDrawing(false)}>Скачать SVG</button><button onClick={()=>exportDrawing(true)}>Поделиться</button></>:null}
        {drawing&&view==='drawing'&&dimensions.length?<button onClick={()=>saveDimensions([])}>Убрать ручные размеры</button>:null}
      </details>
    </div>
    {showLayers&&view!=='model3d'?<div className="drawing-layers">{Object.entries({panels:'Панели',frame:'Каркас и соединители',dimensions:'Размеры',labels:'Марки'}).map(([key,label])=><label key={key}><input type="checkbox" checked={layers[key]} onChange={e=>setLayers({...layers,[key]:e.target.checked})}/>{label}</label>)}<button onClick={()=>setLayers(defaultLayers)}>Все слои</button><label>Текст<select value={fontScale} onChange={e=>setFontScale(Number(e.target.value))}>{[.8,1,1.25,1.5].map(n=><option key={n} value={n}>{Math.round(n*100)}%</option>)}</select></label></div>:null}
</details></div></div>{settingsOpen?<WorkbenchSettingsDialog pending={pending} onClose={()=>setSettingsOpen(false)}>{settingsContent}</WorkbenchSettingsDialog>:null}
    {printing?createPortal(<MountingAlbum project={project} report={report} pages={printing.customPages|| (printing.stock?stockPages:printing.detail?detailPages:printing.current?currentPages:pages)} selectedIds={printing.ids} totalPages={printing.customPages?pages.length:undefined} paper={paper}/>,document.body):null}
  </section>;
}
