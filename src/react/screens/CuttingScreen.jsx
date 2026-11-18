import { lazy, useEffect, useMemo, useState } from 'react';
import { useProject } from '../state/ProjectContext.jsx';
import { normalizeProductionCutting } from '../state/production-cutting.js';
import { productionMark as mark, productionFamily } from '../calculations/production-assembly.js';
import DrawingWorkbench from './DrawingWorkbench.jsx';
import PanelCutMaps from './PanelCutMaps.jsx';
import ProductionSettings from './ProductionSettings.jsx';
import '../styles/cutting.css';
const ProjectDocumentation=lazy(()=>import('./ProjectDocumentation.jsx'));
const n=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(Number(value)||0);
function NumberInput({ label, value, onChange, placeholder = 'Введите значение, мм', min = 0, max = 100000, suffix = 'мм' }) {
  const [draft, setDraft] = useState(value ?? '');
  const [error, setError] = useState('');
  useEffect(() => setDraft(value ?? ''), [value]);
  return <label>{label}<span className="cut-input"><input aria-label={label} aria-invalid={!!error} type="number" min={min} max={max} step="any" value={draft} placeholder={placeholder} onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={() => { if (draft !== '' && (!Number.isFinite(Number(draft)) || Number(draft)<min || Number(draft)>max || (suffix === 'шт.' && !Number.isInteger(Number(draft))))) { setError(`Не сохранено: введите ${suffix === 'шт.' ? 'целое ' : ''}от ${min} до ${max}`); return; } if (String(draft) !== String(value ?? '')) onChange(draft); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><small>{suffix}</small></span>{error ? <small role="alert">{error}</small> : null}</label>;
}

function StarterBoardDiagram({ walls = [] }) {
  if (!walls.length) return <p className="cut-empty">Стартовая доска не сформирована: включите наружные SIP-стены и проверьте контур.</p>;
  const points=walls.flatMap(wall=>[wall.start,wall.end]);
  const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
  const x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
  const pad=Math.max(width,height)*.12;
  const font=Math.max(140,Math.min(240,Math.max(width,height)*.017));
  const at=(wall,distance)=>{const t=wall.length ? distance/wall.length : 0;return [wall.start[0]+(wall.end[0]-wall.start[0])*t,wall.start[1]+(wall.end[1]-wall.start[1])*t];};
  const line=(wall,start,end,key,kind)=>{const a=at(wall,start),b=at(wall,end);return <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={kind} vectorEffect="non-scaling-stroke" />;};
  const label=(wall,start,end,text,key,kind)=>{const [cx,cy]=at(wall,(start+end)/2);const dx=wall.end[0]-wall.start[0],dy=wall.end[1]-wall.start[1],length=Math.hypot(dx,dy)||1;return <text key={key} x={cx-dy/length*font*.85} y={cy+dx/length*font*.85} className={kind} textAnchor="middle" fontSize={font}>{text}</text>;};
  return <div className="cut-starter"><svg viewBox={`${x-pad} ${y-pad} ${width+2*pad} ${height+2*pad}`} role="img" aria-label="Монтаж стартовой торцевой доски, вид сверху">
    {walls.map(wall=><g key={wall.id}>
      {line(wall,0,wall.length,`${wall.id}-base`,'starter-wall')}
      {wall.boards.map(board=>line(wall,board.start,board.end,board.id,'starter-board'))}
      {wall.openings.filter(opening=>opening.noBoard).map(opening=>line(wall,opening.start,opening.end,`${opening.id}-gap`,'starter-gap'))}
      {label(wall,0,wall.length,`${n(wall.length)} мм`,`${wall.id}-length`,'starter-length')}
      {wall.openings.map(opening=>label(wall,opening.start,opening.end,`${opening.noBoard?'ПРОЁМ':'ОКНО'} ${n(opening.width)}`,`${opening.id}-label`,'starter-opening-label'))}
    </g>)}
  </svg><div className="cut-starter-legend"><span>Зелёный — доска</span><span>Красный — разрыв у пола</span><span>Окно выше пола — доска непрерывна</span></div>
  <div className="cut-table-wrap"><table><thead><tr><th>Стена</th><th>Длина, мм</th><th>Стартовая доска · марка, от–до, длина</th><th>Проёмы от начала стены</th></tr></thead><tbody>{walls.map(wall=><tr key={wall.id}><td>{wall.name}</td><td>{n(wall.length)}</td><td>{wall.boards.map(board=><div key={mark(board.id)}>{mark(board.id)}: {n(board.start)}–{n(board.end)} · {n(board.length)} мм · {board.profile}</div>)}</td><td>{wall.openings.map(opening=><div key={opening.id}>{opening.name}: {n(opening.start)}–{n(opening.end)} · {n(opening.width)} мм · {opening.noBoard?'без доски':'доска продолжается'}</div>)}</td></tr>)}</tbody></table></div></div>;
}

function StockSheets(props){return <PanelCutMaps {...props}/>;}

export default function CuttingScreen({calculation,onNavigate}) {
  const { project, commit, recordMarks } = useProject();
  const settings = normalizeProductionCutting(project.settings.productionCutting);
  const inputKey = useMemo(()=>JSON.stringify({ project: { plan: project.plan, upperFloors: project.upperFloors, settings: project.settings, services: project.services, nodes: project.nodes, construction: project.construction }, calculation: { foundation: calculation.foundation, metrics: calculation.metrics, roof: calculation.roof, lines: calculation.lines } }),[project,calculation]);
  const [result, setResult] = useState({});
  useEffect(()=>{
    const worker = new Worker(new URL('../calculations/production-cutting.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({data})=>{setResult({...data,inputKey});if(data.report?.markRegistry)recordMarks(data.report.markRegistry,data.report.constructionSourceRequests);};
    worker.onerror = ()=>setResult({error:'Ошибка фонового расчёта. Перезагрузите раздел.',inputKey});
    worker.postMessage(JSON.parse(inputKey));
    return ()=>worker.terminate();
  },[inputKey,recordMarks]);

  const pending=result.inputKey!==inputKey;
  const report=result.report;
  const update=patch=>commit(next=>{next.settings.productionCutting=normalizeProductionCutting({...next.settings.productionCutting,...patch});return next;});
  return <DrawingWorkbench project={project} calculation={calculation} report={report} pending={pending} error={result.error} settings={settings} update={update} NumberInput={NumberInput} onAppNavigate={onNavigate} onNavigate={surface=>{sessionStorage.setItem('eft-drawing-plan-focus',JSON.stringify({floor:surface.floor||1,name:surface.name,a:surface.planStart,b:surface.planEnd,source:surface.constructionSourceRef}));onNavigate?.('plan');}} StarterBoardDiagram={StarterBoardDiagram} StockSheets={StockSheets} Documentation={ProjectDocumentation} settingsContent={<ProductionSettings project={project} report={report} pending={pending} settings={settings} update={update} NumberInput={NumberInput}/>}/>;
}
