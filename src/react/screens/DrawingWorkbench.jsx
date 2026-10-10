import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Printer, Settings2, Maximize, Minimize, ZoomIn, ZoomOut, Undo2, Redo2, Layers, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useProject } from '../state/ProjectContext.jsx';
import { groupPanels, groupMembers } from '../calculations/production-cutting.js';
import WallPanelPlan from './WallPanelPlan.jsx';
import WallPlanNavigator from './WallPlanNavigator.jsx';
import { productionMark as mark } from '../calculations/production-assembly.js';
import { combinedWall, drawingCategory, gableLinks, purchaseRows } from '../calculations/drawing-workbench.js';
import { DrawingCanvas, DrawingViewport } from './DrawingCanvas.jsx';
import MountingAlbum, { buildMountingPages } from './MountingAlbum.jsx';
import { BindingSection, RoofPerspective, RoofSection, StructuralPlan } from './RoofDrawings.jsx';
import AssemblyPlan from './AssemblyPlan.jsx';
import AssemblyCanvas from './AssemblyCanvas.jsx';
import RoofCoverTool from './RoofCoverDrawing.jsx';
import { approvalLabels, MemberEditor, SurfaceLayoutControls, Reconciliation, CuttingControls, DraftText } from './CuttingControls.jsx';
import '../styles/drawing-workbench.css';
import PartitionProcurement from './PartitionProcurement.jsx';
import BindingRuleCheck from './BindingRuleCheck.jsx';
import ProductionIdentityInfo, {ConstructionSourceInfo} from './ProductionIdentityInfo.jsx';
import ConstructionSourcePicker from './ConstructionSourcePicker.jsx';
import SourceChangesInfo from './SourceChangesInfo.jsx';
import CeilingSupportChecks from './CeilingSupportChecks.jsx';
import DrawingToolRail from './DrawingToolRail.jsx';

const categories=[['overview','Дом'],['piles','Свайное поле'],['binding','Обвязка'],['floor','Пол'],['walls','Стены'],['partitions','Перегородки'],['ceiling','Потолок'],['gables','Фронтоны'],['roof','Крыша'],['supports','Опоры'],['starter','Стартовая доска'],['nodes','Узлы и детали'],['stock','Карты раскроя'],['sheets','Листы альбома']];
const defaultLayers={panels:true,frame:true,dimensions:true,labels:true};
const fmt=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value||0);
const download=(name,text,type)=>{const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

export default function DrawingWorkbench({project,report,pending,error,settings,update,NumberInput,StarterBoardDiagram,StockSheets,onSettings,onClassic}) {
  const {undo,redo,canUndo,canRedo,commit}=useProject();
  const root=useRef(null),title=useRef(null);
  const [category,setCategory]=useState('walls'),[surfaceId,setSurfaceId]=useState(''),[view,setView]=useState('drawing');
  const [layers,setLayers]=useState(defaultLayers),[showLayers,setShowLayers]=useState(false),[mode,setMode]=useState('combined');
  const [selection,setSelection]=useState([]),[bottom,setBottom]=useState('production'),[expanded,setExpanded]=useState(true);
  const [zoomByView,setZoomByView]=useState({}),[pan,setPan]=useState(false),[fit,setFit]=useState(0),[fontScale,setFontScale]=useState(1);
  const [full,setFull]=useState(false),[sheetId,setSheetId]=useState('1'),[selectedSheets,setSelectedSheets]=useState([]),[paper,setPaper]=useState('A3');
  const [printing,setPrinting]=useState(null),[printError,setPrintError]=useState('');
  const [measure,setMeasure]=useState(false),[measureStart,setMeasureStart]=useState(null),[measureCursor,setMeasureCursor]=useState(null),[yaw,setYaw]=useState(0);
  const [offsets,setOffsets]=useState({});
  const [groupAll,setGroupAll]=useState(true);
  const [editedLabel,setEditedLabel]=useState(null);
  const [labelTool,setLabelTool]=useState(false);
  const setTool=tool=>{setPan(tool==='pan');setMeasure(tool==='measure');setLabelTool(tool==='labels');setMeasureStart(null);setMeasureCursor(null);if(tool==='labels')setLayers(old=>({...old,labels:true}));};
  useEffect(()=>{const escape=e=>{if(e.key==='Escape'){setTool('select');setEditedLabel(null);}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  const pages=useMemo(()=>report?buildMountingPages(report):[],[report]);
  const links=useMemo(()=>report?gableLinks(report,settings.gableLinks):[],[report,settings.gableLinks]);
  const candidates=report?.surfaces.filter(s=>category==='nodes'||drawingCategory(s)===category)||[];
  const surface=candidates.find(s=>s.id===surfaceId)||candidates[0];
  const drawing=useMemo(()=>!surface?null:category==='walls'?combinedWall(report,surface,links,mode):{surface,parts:report.parts.filter(p=>p.surfaceId===surface.id),members:report.members.filter(m=>m.surfaceId===surface.id)},[surface,report,category,links,mode]);
  const viewKey=`${category}:${surface?.layoutKey||''}:${view}`,zoom=zoomByView[viewKey]||1;
  const dimensions=settings.drawingDimensions[viewKey]||[];
  const saveDimensions=list=>update({drawingDimensions:{...settings.drawingDimensions,[viewKey]:list}});
  const labels=settings.drawingLabels[viewKey]||{};
  const saveLabel=(key,patch)=>update({drawingLabels:{...settings.drawingLabels,[viewKey]:{...labels,[key]:{...labels[key],...patch}}}});
  const measurePick=point=>{if(!measureStart){setMeasureStart(point);setMeasureCursor(point);}else if(Math.hypot(point[0]-measureStart[0],point[1]-measureStart[1])>0){saveDimensions([...dimensions,{id:crypto.randomUUID(),a:measureStart,b:point}]);setMeasureStart(null);setMeasureCursor(null);}};
  const setZoom=value=>setZoomByView(old=>({...old,[viewKey]:value}));
  const members=useMemo(()=>drawing?.members||report?.members.filter(m=>category==='binding'?m.surface==='Обвязка':category==='roof'?m.surface==='Кровля':category==='supports'?m.source==='Проектная опора':true)||[],[drawing,report,category]);
  const groupIds=new Set(candidates.map(s=>s.id));
  const panelGroups=groupPanels(groupAll&&['walls','partitions'].includes(category)?report?.parts.filter(p=>groupIds.has(p.surfaceId))||[]:drawing?.parts||[]);
  const memberGroups=groupMembers((groupAll&&['walls','partitions'].includes(category)?report?.members.filter(m=>groupIds.has(m.surfaceId))||[]:members).filter(m=>!m.excluded));
  const purchases=useMemo(()=>report?purchaseRows(report):[],[report]);
  const chosenMember=report?.members.find(m=>selection.includes(m.id));
  const chosenPanel=report?.parts.find(p=>selection.includes(p.id));
  const go=(next,id='')=>{setCategory(next);setSurfaceId(id);setSelection([]);setView('drawing');setTool('select');setEditedLabel(null);};
  const select=id=>{const pg=panelGroups.find(g=>g.instances.includes(id)),mg=memberGroups.find(g=>g.instances.some(m=>m.id===id));setSelection(pg?pg.instances:mg?mg.instances.map(m=>m.id):[id]);setExpanded(true);};
  const selectLabel=label=>{if(label.key.startsWith('panel:'))select(label.key.slice(6));setEditedLabel({...label,viewKey});};
  const openWall=id=>{const s=report.surfaces.find(s=>s.id===id);if(s){go(drawingCategory(s),id);setBottom('properties');setExpanded(true);}};
  useEffect(()=>{const cleanup=()=>{document.body.classList.remove('print-production');if(title.current!==null){document.title=title.current;title.current=null;}setPrinting(null);};window.addEventListener('afterprint',cleanup);return()=>{window.removeEventListener('afterprint',cleanup);document.body.classList.remove('print-production');if(title.current!==null)document.title=title.current;};},[]);
  const print=(ids,current=false,detail=false)=>{
    if(pending||!report)return;
    if(root.current?.querySelector('[aria-invalid="true"]')){setPrintError('Исправьте несохранённые значения перед печатью.');return;}
    if(current&&category==='sheets'){ids=[sheetId];current=false;}
    if(current&&view==='cover'){ids=pages.filter(p=>p.title.startsWith('Покрытие ·')).map(p=>p.id);current=false;if(!ids.length){setPrintError('Сначала задайте размеры листа покрытия.');return;}}
    setPrintError('');title.current=document.title;document.title=project.meta.projectName||project.meta.projectNum||'Домокомплект';
    flushSync(()=>setPrinting({ids,current,detail}));document.body.classList.add('print-production');window.print();
  };
  const exportTable=()=>{const rows=[['Материал','Размер / сечение','Ед.','Количество'],...purchases.map(r=>[r.name,r.profile,r.unit,r.qty])];download(`${project.meta.projectName||'Домокомплект'}-закупка.csv`,'\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\r\n'),'text/csv;charset=utf-8');};
  const issueClick=issue=>{const m=report.members.find(m=>m.key===issue.target);if(m){if(m.surfaceId)openWall(m.surfaceId);else go(m.surface==='Обвязка'?'binding':'roof');setSelection([m.id]);setBottom('properties');return;}const s=report.surfaces.find(s=>s.id===issue.target)||report.surfaces.find(s=>s.openings?.some(o=>o.key===issue.target));if(s)openWall(s.id);else if(issue.code==='ASSEMBLY'||issue.code==='ROOF_SUPPORTS')go('supports');else onSettings();};
  const resetView=()=>{setZoom(1);setOffsets(old=>({...old,[viewKey]:[0,0]}));setFit(v=>v+1);};
  const exportDrawing=async share=>{
    const source=root.current?.querySelector('.drawing-stage svg');if(!source)return;
    const svg=source.cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width','1200');svg.setAttribute('height','800');svg.querySelectorAll('[tabindex],[role="button"]').forEach(el=>{el.removeAttribute('tabindex');el.removeAttribute('role');});
    const text=new XMLSerializer().serializeToString(svg),name=`${project.meta.projectName||'Домокомплект'}-${surface?.id||category}.svg`.replace(/[<>:"/\\|?*]/g,'-');
    const file=new File([text],name,{type:'image/svg+xml'});
    if(share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:project.meta.projectName||'Чертёж'});}catch(e){if(e.name!=='AbortError')setPrintError('Не удалось открыть отправку. Скачайте чертёж и прикрепите к письму.');}}
    else download(name,text,'image/svg+xml');
  };
  const scene=()=>{
    if(category==='sheets')return <MountingAlbum project={project} report={report} pages={pages} selectedIds={[sheetId]} paper={paper} preview/>;
    if(category==='overview')return <WallPanelPlan report={report} floor={surface?.floor||1} onSelect={openWall} layers={layers}/>;
    if(view==='plan'&&surface?.planStart)return <WallPanelPlan report={report} floor={surface.floor} selectedId={surface.id} onSelect={openWall} layers={layers}/>;
    if(category==='piles')return <StructuralPlan assembly={{...report.assembly,binding:[]}} kind="binding" layers={layers}/>;
    if(category==='starter')return <StarterBoardDiagram walls={report.starterBoards}/>;
    if(category==='stock')return <StockSheets report={report}/>;
    if(category==='supports')return <AssemblyCanvas assembly={report.assembly}/>;
    if(category==='binding')return view==='section'?<BindingSection assembly={report.assembly}/>:<StructuralPlan assembly={report.assembly} kind="binding" layers={layers}/>;
    if(category==='roof'&&(view!=='drawing'||!surface))return view==='cover'?<RoofCoverTool report={report} settings={settings} update={update} NumberInput={NumberInput}/>:view==='section'?<RoofSection assembly={report.assembly}/>:view==='3d'?<RoofPerspective assembly={report.assembly} yaw={yaw}/>:view==='overlay'?<AssemblyCanvas assembly={report.assembly}/>:<StructuralPlan assembly={report.assembly} selected={selection} onSelect={select} layers={layers}/>;
    if(drawing)return <DrawingCanvas {...drawing} layers={layers} selected={selection} onSelect={labelTool?undefined:select} fontScale={fontScale} dimensions={dimensions} labelOverrides={labels} onTextSelect={selectLabel} onTextMove={(key,offset)=>saveLabel(key,{offset})} draft={measureStart&&measureCursor?{a:measureStart,b:measureCursor}:null} onPick={measure?measurePick:null} onHover={measureStart?setMeasureCursor:null} onLabelMove={(id,offset)=>saveDimensions(dimensions.map(d=>d.id===id?{...d,offset}:d))}/>;
    return <p className="cut-empty">Для этой конструкции нет деталей. Проверьте включение раздела в параметрах проекта.</p>;
  };
  if(!report)return <section className="screen cutting-screen"><h1>Чертежи и сборка</h1><p role="status">{error||'Подготавливаю геометрию и ведомости…'}</p></section>;
  const currentTitle=surface?.name||categories.find(([id])=>id===category)?.[1];
  const currentPages=[{id:'В',title:currentTitle,content:<>{scene()}<p>Размеры: мм. {report.revision}. Геометрическая деталировка; несущие узлы по рабочему проекту.</p></>}];
  const detailPages=chosenPanel?[{id:'Д',title:`${mark(chosenPanel)} · ×${selection.length}`,content:<><DrawingCanvas surface={{...chosenPanel,name:mark(chosenPanel),geometry:[chosenPanel.shape]}} parts={[chosenPanel]} layers={defaultLayers}/><p>{chosenPanel.width}×{chosenPanel.height}×{chosenPanel.thickness} мм. Позиции: {selection.map(mark).join(', ')}</p></>}]:chosenMember?[{id:'Д',title:`${mark(chosenMember)} · ×${selection.length}`,content:<><h2>{chosenMember.material} · {chosenMember.profile} мм</h2><p>Чистая длина {chosenMember.length} мм; заготовка {chosenMember.cutLength} мм.</p><p>Узел: {chosenMember.nodeRef||'не задан'}. {chosenMember.processing||'Обработка по рабочему узлу'}</p><p>Позиции: {selection.map(mark).join(', ')}</p></>}]:[];
  return <section ref={root} className={`screen cutting-screen drawing-workbench ${full?'workbench-full':''}`}>
    <header className="drawing-header"><div><h1>Чертежи и сборка</h1><span>{project.meta.projectName||'Домокомплект'} · {report.revision} · {pending?'Пересчёт…':approvalLabels[report.approvalStatus]}</span></div><button onClick={()=>setFull(!full)} aria-label={full?'Свернуть окно чертежей':'Развернуть окно чертежей'}>{full?<Minimize size={18}/>:<Maximize size={18}/>}</button></header>
    <ProductionIdentityInfo report={report}/>
    <div className="drawing-navigation"><label>Конструкция<select aria-label="Раздел чертежей" value={category} onChange={e=>go(e.target.value)}>{categories.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      {candidates.length?<><button aria-label="Предыдущая конструкция" onClick={()=>go(category,candidates[(candidates.indexOf(surface)-1+candidates.length)%candidates.length].id)}><ChevronLeft size={18}/></button><select aria-label="Выбранная конструкция" value={surface.id} onChange={e=>{setSurfaceId(e.target.value);setSelection([]);}}>{candidates.map(s=><option key={s.id} value={s.id}>{s.name}{s.blocked?' · есть замечания':''}</option>)}</select><button aria-label="Следующая конструкция" onClick={()=>go(category,candidates[(candidates.indexOf(surface)+1)%candidates.length].id)}><ChevronRight size={18}/></button></>:null}
      <button onClick={onSettings}><Settings2 size={16}/>Настройки</button><button disabled={pending} onClick={()=>print(null,true)}><Printer size={16}/>Печать вида</button><button onClick={()=>go('sheets')}>Альбом</button>
    </div>
    <div className="drawing-tools" role="toolbar" aria-label="Инструменты чертежа">
      {category==='roof'?<><button aria-pressed={view==='cover'} onClick={()=>setView('cover')}>Листы покрытия</button><button aria-pressed={view==='overlay'} onClick={()=>setView('overlay')}>Совмещённые слои</button></>:null}
      {drawing&&view==='drawing'&&dimensions.length?<button onClick={()=>saveDimensions([])}>Убрать ручные размеры</button>:null}
      <button disabled={!canUndo||pending} onClick={undo} aria-label="Отменить"><Undo2 size={17}/></button><button disabled={!canRedo||pending} onClick={redo} aria-label="Повторить"><Redo2 size={17}/></button>
      {detailPages.length?<button disabled={pending} onClick={()=>print(null,false,true)}>Печать детали ×{selection.length}</button>:null}
      {!['supports','sheets','starter','stock','nodes'].includes(category)&&!['edit','cover','overlay'].includes(view)?<><button onClick={()=>exportDrawing(false)}>Скачать SVG</button><button onClick={()=>exportDrawing(true)}>Поделиться</button></>:null}
      <button onClick={()=>setZoom(Math.max(.5,zoom/1.25))} aria-label="Уменьшить"><ZoomOut size={17}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(Math.min(4,zoom*1.25))} aria-label="Увеличить"><ZoomIn size={17}/></button><button onClick={resetView}>По размеру</button>
      <button aria-expanded={showLayers} onClick={()=>setShowLayers(!showLayers)}><Layers size={17}/>Слои</button>
      {surface?.planStart?<button aria-pressed={view==='plan'} onClick={()=>setView(view==='plan'?'drawing':'plan')}>План сверху</button>:null}
      {category==='binding'||category==='roof'?<><button aria-pressed={view==='drawing'} onClick={()=>setView('drawing')}>Чертёж</button><button aria-pressed={view==='section'} onClick={()=>setView('section')}>Разрез</button>{category==='roof'?<><button aria-pressed={view==='3d'} onClick={()=>setView('3d')}>Объёмный вид</button><button aria-pressed={view==='edit'} onClick={()=>{setView('edit');setPan(false);}}>Разместить опоры</button></>:null}</>:null}
    </div>
    {showLayers?<div className="drawing-layers">{Object.entries({panels:'Панели',frame:'Каркас и соединители',dimensions:'Размеры',labels:'Марки'}).map(([key,label])=><label key={key}><input type="checkbox" checked={layers[key]} onChange={e=>setLayers({...layers,[key]:e.target.checked})}/>{label}</label>)}<button onClick={()=>setLayers(defaultLayers)}>Все слои</button><label>Текст<select value={fontScale} onChange={e=>setFontScale(Number(e.target.value))}>{[.8,1,1.25,1.5].map(n=><option key={n} value={n}>{Math.round(n*100)}%</option>)}</select></label></div>:null}
    {category==='walls'?<div className="drawing-views">{[['combined','Стена с фронтоном'],['wall','Только стена'],['gable','Только фронтон']].map(([id,label])=><button key={id} aria-pressed={mode===id} disabled={id==='gable'&&!links.some(l=>l.wall?.id===surface?.id)} onClick={()=>setMode(id)}>{label}</button>)}</div>:null}
    {category==='roof'&&view==='3d'?<label className="drawing-rotation">Поворот <input aria-label="Поворот крыши" type="range" min="0" max="360" step="5" value={yaw} onChange={e=>setYaw(Number(e.target.value))}/>{yaw}°</label>:null}
    {measure?<p role="status">{measureStart?'Укажите вторую точку':'Укажите первую точку'}; размер сохраняется в проекте. Подпись можно перенести в режиме выбора.</p>:null}
    {category==='sheets'?<div className="drawing-sheet-picker"><label>Лист<select aria-label="Лист альбома" value={sheetId} onChange={e=>setSheetId(e.target.value)}>{pages.map(p=><option key={p.id} value={p.id}>{p.id}. {p.title}</option>)}</select></label><label>Формат<select aria-label="Формат" value={paper} onChange={e=>setPaper(e.target.value)}><option>A3</option><option>A4</option></select></label><button disabled={pending} onClick={()=>print([sheetId])}>Печать листа</button><button disabled={pending} onClick={()=>print(null)}>Весь альбом</button><details><summary>Выбор листов · {selectedSheets.length}</summary><button onClick={()=>setSelectedSheets(pages.map(p=>p.id))}>Выбрать все</button><button onClick={()=>setSelectedSheets([])}>Снять выбор</button>{pages.map(p=><label key={p.id}><input type="checkbox" checked={selectedSheets.includes(p.id)} onChange={e=>setSelectedSheets(e.target.checked?[...selectedSheets,p.id]:selectedSheets.filter(id=>id!==p.id))}/>{p.id}. {p.title}</label>)}<button disabled={!selectedSheets.length||pending} onClick={()=>print(selectedSheets)}>Печать выбранных</button></details></div>:null}
    {pending?<p role="status" className="drawing-pending">Обновляю чертежи. Печать и редактирование временно недоступны.</p>:null}
    {error?<p role="alert">{error}</p>:null}{printError?<p role="alert">{printError}</p>:null}
    {surface?.blocked?<p role="alert">{surface.name}: раскладка неполная. Контур показан, но отсутствующие детали не включены в закупочную сверку. Откройте «Проверка и выпуск».</p>:null}
    {surface?.automaticDirection?<p className="inspector-note">Автоматическая раскладка: направление панелей изменено для обхода узких деталей. Размеры конструкции и проёмов сохранены; опирание соединителей проверяется отдельно.</p>:null}
    {editedLabel?.viewKey===viewKey?<fieldset><legend>Подпись на чертеже</legend><DraftText label="Текст подписи" value={labels[editedLabel.key]?.text??editedLabel.text} onChange={text=>saveLabel(editedLabel.key,{text})}/><p>Подпись можно перетащить мышью или пальцем. Изменяется только надпись этого вида; техническая марка и спецификация сохраняются.</p><button onClick={()=>{const next={...labels};delete next[editedLabel.key];update({drawingLabels:{...settings.drawingLabels,[viewKey]:next}});}}>Сбросить подпись и положение</button><button onClick={()=>setEditedLabel(null)}>Закрыть</button></fieldset>:null}
    {category === 'binding' ? <BindingRuleCheck result={report.constructionRuleChecks?.bindingStraightSupport} value={settings.bindingJointToleranceMm} update={update} NumberInput={NumberInput} pending={pending}/> : null}
    <fieldset className={`drawing-content ${pending?'is-pending':''}`}>
      <div className="drawing-editor-grid">
        <DrawingToolRail tool={pan?'pan':measure?'measure':labelTool?'labels':'select'} onTool={setTool} canMeasure={!!drawing&&view==='drawing'} pending={pending} onProperties={()=>{setBottom('properties');setExpanded(true);}} onSupports={()=>{go('supports');setView('edit');}}/>
{['starter','stock'].includes(category)||category==='roof'&&view==='cover'?<div className="drawing-special-view">{scene()}</div>:category==='supports'||view==='edit'||category==='roof'&&view==='overlay'?<AssemblyPlan report={report} settings={settings} update={update} NumberInput={NumberInput} compact/>:<div className="drawing-stage"><DrawingViewport key={`${viewKey}:${fit}`} zoom={zoom} pan={pan} onZoom={setZoom} offset={offsets[viewKey]||[0,0]} onOffset={offset=>setOffsets(old=>({...old,[viewKey]:offset}))}>{scene()}</DrawingViewport></div>}
      <aside className="drawing-inspector" aria-label="Свойства рабочего поля">
        <h2>{chosenPanel||chosenMember?'Выбранная деталь':'Конструкция'}</h2>
        <strong>{chosenPanel?mark(chosenPanel):chosenMember?mark(chosenMember):currentTitle}</strong>
        {chosenPanel?<><p>SIP {chosenPanel.thickness} мм</p><p>{fmt(chosenPanel.width)} × {fmt(chosenPanel.height)} мм</p><p>Одинаковых: ×{selection.length}</p></>:chosenMember?<><p>{chosenMember.material} · {chosenMember.profile} мм</p><p>Длина {fmt(chosenMember.length)} мм · ×{selection.length}</p></>:surface?<><p>{fmt(surface.width)} × {fmt(surface.height)} мм</p><p>{surface.frameOnly?'Каркас':'SIP '+surface.thickness+' мм'} · {drawing?.parts.length||0} панелей</p></>:<p>Выберите элемент на чертеже.</p>}
        <button onClick={()=>{setBottom('properties');setExpanded(true);}}>Открыть параметры / узел</button>
        {category==='gables'?<><h3>Материал фронтонов</h3><label>Общее исполнение<select aria-label="Материал фронтонов" value={project.settings.roof.gableType||'auto'} onChange={e=>{const value=e.target.value;commit(draft=>{draft.settings.roof.gableType=value;return draft;});}}><option value="auto">По типу кровли</option><option value="sip">SIP-панели</option><option value="cold">Каркас</option><option value="none">Не считать</option></select></label><p>Меняет материал и смету. Отдельный выбор торцов комбинированной кровли — в разделе «Кровля».</p>{surface?.frameOnly?<p>Выбран каркас: панели не закупаются. Для панелей выберите SIP.</p>:<p>Швы соответствуют раскрою. Нажмите панель, чтобы увидеть размеры.</p>}<SurfaceLayoutControls surface={surface} settings={settings} update={update} NumberInput={NumberInput}/></>:null}
        {surface?.planStart&&view!=='plan'?<><h3>Выбор на плане</h3><WallPlanNavigator report={report} surface={surface} onSelect={openWall}/></>:null}
        <p className="drawing-tool-hint">{pan?'Перетащите поле для перемещения.':measure?'Укажите две точки. Esc — отмена.':labelTool?'Нажмите подпись для редактирования; перетащите для перемещения.':'Нажмите панель, доску или стену на мини-плане.'}</p>
      </aside>
      </div>
      <div className="drawing-status"><span>{currentTitle} · размеры в мм · вид не меняет количества</span><button onClick={()=>{setBottom('checks');setExpanded(true);}}>Проверки: {report.issues.length+links.filter(l=>l.stale).length}</button></div>
      <section className="drawing-bottom"><div className="drawing-bottom-tabs"><button onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'Свернуть':'Развернуть'}</button>{[['assembly','Монтаж'],['production','Производство'],['purchase','Закупка'],['properties','Параметры / узел'],['checks','Проверка и выпуск']].map(([id,label])=><button key={id} aria-pressed={bottom===id&&expanded} onClick={()=>{setBottom(id);setExpanded(true);}}>{label}</button>)}</div>
        {expanded?<div className="drawing-bottom-content">
          {['properties','checks'].includes(bottom)?<SourceChangesInfo report={report} settings={settings} update={update} onSelect={openWall} pending={pending}/>:null}
          {['properties','checks'].includes(bottom)?<CeilingSupportChecks report={report} settings={settings} update={update} NumberInput={NumberInput}/>:null}
          {bottom==='assembly'?<><p>Фактические позиции. Для стен X/Y — вдоль стены и от пола; для горизонтальных конструкций — координаты плана.</p><div className="cut-table-wrap"><table><thead><tr><th>Позиция</th><th>Конструкция</th><th>Начало / конец, мм</th><th>Размер</th></tr></thead><tbody>{(drawing?.parts||[]).map(p=><tr key={p.id}><td><button onClick={()=>setSelection([p.id])}>{mark(p)}</button></td><td>{p.surfaceId}</td><td>{p.x}; {p.y}</td><td>{p.width}×{p.height}×{p.thickness}</td></tr>)}{members.filter(m=>!m.excluded).map(m=><tr key={m.id}><td><button onClick={()=>setSelection([m.id])}>{mark(m)}</button></td><td>{m.surface}</td><td>{m.a?`${m.a.map(fmt).join('; ')} → ${m.b.map(fmt).join('; ')}`:'См. план конструкции'}</td><td>{m.profile} · {m.length} мм</td></tr>)}</tbody></table></div></>:null}
          {bottom==='production'?<>{['walls','partitions'].includes(category)?<label><input type="checkbox" checked={groupAll} onChange={e=>setGroupAll(e.target.checked)}/>Группировать все {category==='partitions'?'перегородки':'стены'} всех этажей</label>:null}<p>Выберите строку — одинаковые детали подсветятся на чертеже. Физические позиции сохраняются.</p><div className="cut-table-wrap"><table><thead><tr><th>Марка / деталь</th><th>Размер, мм</th><th>Количество</th><th>Позиции</th></tr></thead><tbody>{panelGroups.map(g=><tr key={g.part.id} className={selection.includes(g.part.id)?'selected':''}><td><button onClick={()=>select(g.part.id)}>{mark(g.part)} · панель</button></td><td>{fmt(g.part.width)}×{fmt(g.part.height)}×{g.part.thickness}</td><td><strong>×{g.qty}</strong></td><td><details><summary>{g.qty} поз.</summary>{g.instances.map(mark).join(', ')}</details></td></tr>)}{memberGroups.map(g=><tr key={g.member.id} className={selection.includes(g.member.id)?'selected':''}><td><button onClick={()=>select(g.member.id)}>{mark(g.member)} · {g.member.material}</button></td><td>{g.member.profile} · L {fmt(g.member.length)}</td><td><strong>×{g.qty}</strong></td><td><details><summary>{g.qty} поз.</summary>{g.instances.map(m=>mark(m)).join(', ')}</details></td></tr>)}</tbody></table></div><p>Резка всего комплекта: панели {report.cutting.panelCuts} резов / {fmt(report.cutting.panelCutLengthM)} м; пиломатериалы {report.cutting.timberCuts} резов. Без пазов и врубок.</p></>:null}
          {bottom==='purchase'?<>{category==='partitions'?<PartitionProcurement report={report} project={project} settings={settings} update={update} NumberInput={NumberInput}/>:null}<p>Заготовки всего домокомплекта по картам раскроя, без дополнительного сметного запаса. Неразмещённые детали перечислены в проверках.</p><button onClick={exportTable}><Download size={16}/>Скачать ведомость CSV</button><div className="cut-table-wrap"><table><thead><tr><th>Материал</th><th>Заготовка, мм</th><th>Количество</th></tr></thead><tbody>{purchases.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.profile}</td><td>×{r.qty}</td></tr>)}</tbody></table></div><Reconciliation report={report}/></>:null}
{bottom==='properties'?<>{surface?<div className="drawing-surface-properties" aria-label="Характеристики выбранной стены"><h2>{surface.name}</h2><dl><dt>Длина</dt><dd>{fmt(surface.width)} мм</dd><dt>Высота</dt><dd>{fmt(surface.height)} мм</dd><dt>Конструкция</dt><dd>{surface.frameOnly?'Каркас '+surface.frameProfile+' мм':'SIP '+surface.thickness+' мм'}</dd><dt>Назначение</dt><dd>{surface.bearing?'Несущая':surface.id.includes('-ПГ')?'Перегородка':'Наружная стена'}</dd><dt>Панели / элементы каркаса</dt><dd>{report.parts.filter(p=>p.surfaceId===surface.id).length} / {report.members.filter(m=>m.surfaceId===surface.id&&!m.excluded).length}</dd><dt>Проёмы</dt><dd>{surface.openings?.length||0}</dd></dl></div>:null}<ConstructionSourceInfo surface={surface}/><ConstructionSourcePicker key={surface?.sourceBindingKey} surface={surface} plan={surface?.floor===1?project.plan:project.upperFloors?.[surface?.floor-2]} settings={settings} update={update}/><SurfaceLayoutControls surface={surface} settings={settings} update={update} NumberInput={NumberInput}/>{chosenPanel?<p><b>{mark(chosenPanel)} · ×{selection.length}</b> — {chosenPanel.width}×{chosenPanel.height}×{chosenPanel.thickness} мм; заготовка {chosenPanel.blankWidth??chosenPanel.width}×{chosenPanel.blankHeight??chosenPanel.height} мм. Геометрия из плана, раскладка из настроек конструкции.</p>:null}{chosenMember?<MemberEditor member={chosenMember} settings={settings} update={update} NumberInput={NumberInput}/>:null}
            {['walls','gables'].includes(category)?<details><summary>Связь стены с фронтоном</summary><p>Связь меняет совмещённый вид, а не количество деталей. Внутренний фронтон связывается только явно. Отметки и направление проверить по проекту.</p>{links.map(link=><div className="cut-fields" key={link.gable.id}><label>{link.gable.name} · {link.automatic?'из геометрии крыши':'проектная привязка'}<select value={link.wall?.layoutKey||''} onChange={e=>update({gableLinks:{...settings.gableLinks,[link.gable.layoutKey]:{wallKey:e.target.value,offset:0}}})}><option value="">Отдельная конструкция</option>{report.surfaces.filter(s=>s.planStart&&s.floor===link.gable.floor).map(s=><option key={s.layoutKey} value={s.layoutKey}>{s.name}</option>)}</select></label>{link.wall?<><NumberInput label={`${link.gable.id} · смещение вдоль стены`} value={link.offset} min={-100000} onChange={offset=>update({gableLinks:{...settings.gableLinks,[link.gable.layoutKey]:{...settings.gableLinks[link.gable.layoutKey],wallKey:link.wall.layoutKey,offset}}})}/><NumberInput label={`${link.gable.id} · высота основания`} value={link.elevation} onChange={elevation=>update({gableLinks:{...settings.gableLinks,[link.gable.layoutKey]:{...settings.gableLinks[link.gable.layoutKey],wallKey:link.wall.layoutKey,elevation}}})}/><label><input type="checkbox" checked={link.reverse} onChange={e=>update({gableLinks:{...settings.gableLinks,[link.gable.layoutKey]:{...settings.gableLinks[link.gable.layoutKey],wallKey:link.wall.layoutKey,reverse:e.target.checked}}})}/>Обратное направление</label></>:null}<button onClick={()=>{const next={...settings.gableLinks};delete next[link.gable.layoutKey];update({gableLinks:next});}}>Вернуть автоматическую связь</button></div>)}</details>:null}
            <button onClick={onSettings}>Все настройки производства, проёмов и ручных деталей</button></>:null}
          {bottom==='checks'?<>{report.issues.map((issue,i)=><p key={i}><button onClick={()=>issueClick(issue)}>{issue.message}</button></p>)}{links.filter(l=>l.stale).map(l=><p key={l.gable.id} role="alert">{l.gable.name}: стена изменена, восстановите проектную привязку.</p>)}<details><summary>Расхождения со сметой и ограничения</summary>{report.notices.map(text=><p key={text}>{text}</p>)}</details><CuttingControls settings={settings} report={report} update={update} NumberInput={NumberInput}/></>:null}
        </div>:null}
      </section>
    </fieldset><button className="drawing-classic" onClick={onClassic}>Подробные карты заготовок и прежние инструменты</button>
    {printing?createPortal(<MountingAlbum project={project} report={report} pages={printing.detail?detailPages:printing.current?currentPages:pages} selectedIds={printing.ids} paper={paper}/>,document.body):null}
  </section>;
}
