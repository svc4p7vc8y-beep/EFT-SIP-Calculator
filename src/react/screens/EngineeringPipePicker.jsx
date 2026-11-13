import {PIPE_MATERIALS, PIPE_DIAMETERS} from '../state/engineering-pipe-tools.js';

export default function EngineeringPipePicker({profile,onProfile}) {
 const materials=PIPE_MATERIALS.includes(profile.material)||!profile.material?PIPE_MATERIALS:[profile.material,...PIPE_MATERIALS];
 return <div className="engineering-pipe-picker" role="group" aria-label="Параметры инструмента Труба" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
  <label>Труба<select aria-label="Тип трубы" value={profile.material||PIPE_MATERIALS[0]} onChange={e=>onProfile({...profile,material:e.target.value})}>{materials.map(v=><option key={v}>{v}</option>)}</select></label>
  <label>Ø, мм<input aria-label="Диаметр трубы, мм" type="number" min="1" max="500" list="engineering-pipe-diameters" value={profile.diameterMm??20} onChange={e=>onProfile({...profile,diameterMm:e.target.value?Number(e.target.value):null})}/><datalist id="engineering-pipe-diameters">{PIPE_DIAMETERS.map(v=><option key={v} value={v}/>)}</datalist></label>
 </div>;
}
