import {useEffect,useMemo,useState} from 'react';
import {FRAME_LAYOUT,roofSupportFrame,roofFrameSource} from '../calculations/roof-support-frame.js';
import {useProject} from '../state/ProjectContext.jsx';
export default function RoofSupportFrame({project,report,settings,update,NumberInput}){
 const {commit}=useProject();
 const [config,setConfig]=useState(()=>({variant:'double',profile:'50×150',gapMm:590,...settings.roofFrameConfig}));
 const savedConfigKey=JSON.stringify(settings.roofFrameConfig??{});
 useEffect(()=>{setConfig({variant:'double',profile:'50×150',gapMm:590,...JSON.parse(savedConfigKey)});},[savedConfigKey]);
 const preview=useMemo(()=>roofSupportFrame(project,report,config),[project,report,config]);
 const apply=()=>{
  const kept=settings.roofSupports.filter(s=>s.autoLayout!==FRAME_LAYOUT||s.autoLocked),oldIds=new Set(kept.map(s=>s.id));
  const fresh=preview.items.filter(s=>!oldIds.has(s.id));
  if(kept.length+fresh.length>200)return;
  update({roofFrameConfig:{...config,sourceKey:roofFrameSource(project,report.assembly,settings),replaceRidge:config.variant!=='double'},roofSupports:[...kept,...fresh],rafterClearGapMm:590,partitionClearGapMm:590,rafterEndCuts:true,partitionSipAlignment:true});
 };
 return <details className="cut-layout-settings roof-support-frame" open><summary>Опорный каркас под стропилами · по образцу EFT</summary><div className="cut-fields">
  <label>Расположение каркасов<select value={config.variant} onChange={e=>setConfig({...config,variant:e.target.value})}><option value="single">Под коньком</option><option value="double">Два под скатами</option><option value="triple">Под коньком и скатами</option></select></label>
  <label>Доска поясов и стоек<select value={config.profile} onChange={e=>setConfig({...config,profile:e.target.value})}><option>50×150</option><option>50×100</option></select></label>
  <NumberInput label="Чистый просвет каркаса, мм" value={config.gapMm} min={100} max={1200} onChange={gapMm=>setConfig({...config,gapMm})}/>
  <NumberInput label="Низ каркаса Z, мм · пусто: верх потолка" value={config.baseZ??''} min={-100000} onChange={baseZ=>setConfig({...config,baseZ})}/>
 </div><p>Пояса плашмя, стойки до нижней поверхности стропил. Высота автоматически по сохранённой крыше; проёмы и высоты стен не меняются. Укороченная крайняя ячейка показана отдельно. Это опорный каркас, не расчётная ферма.</p>
 <button disabled={report.assembly.roofShape!=='gable'} onClick={()=>commit(draft=>{const a=report.assembly,span=a.axis==='x'?a.bounds.height:a.bounds.width;draft.settings.roof.ridgeHeight=Math.round(span/2*Math.tan(Math.PI/8))/1000;return draft;})}>Установить уклон основной крыши 22,5°</button>
 <p>Предпросмотр: <b>{preview.counts.frames} каркасов · {preview.counts.posts} стоек</b>. Материал выбирается из существующего прайса по сечению; цены не меняются.</p>
 {preview.errors.map(e=><p key={e} role="alert">{e}</p>)}{preview.warnings.map(e=><p key={e}>{e}</p>)}
 <button disabled={!!preview.errors.length||!preview.items.length||settings.roofSupports.filter(s=>s.autoLayout!==FRAME_LAYOUT||s.autoLocked).length+preview.items.length>200} onClick={apply}>Применить опорный каркас и просвет 590 мм</button>
 </details>;
}
