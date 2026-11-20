import {useMemo} from 'react';
import '../styles/purchasing-register.css';
import {useProject} from '../state/ProjectContext.jsx';
import {foundationFootprint} from '../state/foundation-fit.js';
import {applyPileAxisEnvelope,resizePileAxisEnvelope} from '../state/pile-axis-envelope.js';
import {boundsOf} from '../planner/geometry.js';
const mm=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n*1000);
const size=b=>b?`${mm(b.width??b.w)} × ${mm(b.height??b.h)} мм`:'не заданы';
export default function FoundationFootprint({project,report,pending}) {
  const {commit}=useProject();
  const current=useMemo(()=>foundationFootprint(project),[project]);
  if(project.settings.piles.pileType==='slab')return null;
  const axes=project.plan.house.pileAxisContour?boundsOf(project.plan.house.pileAxisContour):null;
  const resize=(key,value)=>{const n=Number(value)/1000;if(!(n>.2&&n<=200)||!axes)return;commit(next=>resizePileAxisEnvelope(next,key==='w'?n:axes.w,key==='h'?n:axes.h));};
  return <details className="foundation-footprint"><summary>Оси свай → наружный контур обвязки, пола и стен</summary><label className="purchase-merge"><input type="checkbox" checked={project.settings.piles.pileAxisAuto!==false} onChange={e=>{const enabled=e.target.checked;commit(next=>{next.settings.piles.pileAxisAuto=enabled;return enabled?applyPileAxisEnvelope(next):next;});}}/>Автоматически строить наружный контур от осей свай</label><div className="foundation-footprint-sizes"><span>Оси крайних свай дома: <b>{size(current.axes)}</b></span><span>Обвязка, пол, стены и потолок снаружи: <b>{size(current.outside)}</b></span><span>Ширина пакета обвязки: <b>{current.widthMm} мм</b></span></div><p>Оси свай сохраняются. Обвязка выступает за крайние оси на {current.widthMm/2} мм с каждой стороны. Например, оси 10 000 × 4 000 мм и пакет 150 мм дают наружный габарит 10 150 × 4 150 мм. Ручные сваи, линии и правки сметы сохраняются; ручное опирание сверяйте по чертежу.</p>{axes?<div className="foundation-footprint-sizes">{[['w','Длина по осям свай, мм'],['h','Ширина по осям свай, мм']].map(([key,label])=><label key={`${key}:${axes[key]}`}>{label}<input type="number" aria-label={label} min="201" max="200000" step="1" defaultValue={Math.round(axes[key]*1000)} onBlur={e=>{if(Number(e.target.value)!==Math.round(axes[key]*1000))resize(key,e.target.value);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} disabled={pending}/></label>)}</div>:null}{project.settings.piles.datumIssue?<p role="alert">{project.settings.piles.datumIssue}</p>:null}</details>;
}
