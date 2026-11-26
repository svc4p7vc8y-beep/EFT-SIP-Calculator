import {useMemo} from 'react';
import '../styles/purchasing-register.css';
import {useProject} from '../state/ProjectContext.jsx';
import {foundationFootprint,fitFoundationToFloor} from '../state/foundation-fit.js';
const mm=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n*1000);
const size=b=>b?`${mm(b.width??b.w)} × ${mm(b.height??b.h)} мм`:'не заданы';
export default function FoundationFootprint({project,pending}) {
 const {commit}=useProject();
 const current=useMemo(()=>foundationFootprint(project),[project]);
 if(project.settings.piles.pileType==='slab')return null;
 const fit=()=>commit(next=>{try{return fitFoundationToFloor(next);}catch(error){next.settings.piles.datumIssue=error.message;return next;}});
 return <details className="foundation-footprint"><summary>Габариты здания → оси свай</summary>
 <label className="purchase-merge"><input type="checkbox" checked={project.settings.piles.externalBindingDatum===true} disabled={pending} onChange={e=>{if(e.target.checked)fit();else commit(next=>{next.settings.piles.externalBindingDatum=false;next.settings.piles.buildingEnvelopeDatum=true;return next;});}}/>Автоматически привязывать свайное поле к габаритам здания</label>
 <div className="foundation-footprint-sizes"><span>Здание, обвязка, пол и стены снаружи: <b>{size(current.outside)}</b></span><span>Оси крайних свай дома: <b>{size(current.axes)}</b></span><span>Ширина пакета обвязки: <b>{current.widthMm} мм</b></span></div>
 <p>Габариты здания сохраняются. Оси автоматических крайних свай смещаются внутрь на {current.widthMm/2} мм с каждой стороны. При здании 10 000 × 4 000 мм и пакете 150 мм оси составят 9 850 × 3 850 мм. Ручные опоры и линии сохраняются.</p>
 <button type="button" className="button secondary" disabled={pending} onClick={fit}>Привязать сваи к габаритам здания</button>
 {project.settings.piles.datumIssue?<p role="alert">{project.settings.piles.datumIssue}</p>:null}</details>;
}
