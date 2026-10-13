import {useEffect,useMemo,useState} from 'react';
import {FRAME_LAYOUT,roofSupportFrame,roofFrameSource} from '../calculations/roof-support-frame.js';
import {useProject} from '../state/ProjectContext.jsx';
import {calculateProject} from '../calculations/estimate-engine.js';
import {calculateProductionCutting} from '../calculations/production-cutting.js';
import {mergeRoofSupportLayout} from '../calculations/auto-roof-supports.js';
export default function RoofSupportFrame({project,report,settings,update,NumberInput}){
 const {commit}=useProject();
 const [config,setConfig]=useState(()=>({variant:'double',profile:'50×150',gapMm:590,...settings.roofFrameConfig}));
 const savedConfigKey=JSON.stringify(settings.roofFrameConfig??{});
 useEffect(()=>{setConfig({variant:'double',profile:'50×150',gapMm:590,...JSON.parse(savedConfigKey)});},[savedConfigKey]);
 const previewModel=useMemo(()=>{if(!report.assembly.rafters.length)return {project,report};const next=structuredClone(project);next.settings.roof={...next.settings.roof,structureMode:'manual',rafterSystem:config.variant==='a-frame'?'hanging':'layered'};const calculation=calculateProject(next);return {project:next,report:calculateProductionCutting(next,calculation)};},[project,report,config.variant]);
 const preview=useMemo(()=>roofSupportFrame(previewModel.project,previewModel.report,config),[previewModel,config]);
 const apply=()=>{
  const supports=mergeRoofSupportLayout(settings.roofSupports,preview.items,FRAME_LAYOUT);
  commit(draft=>{draft.settings.roof={...draft.settings.roof,structureMode:'manual',rafterSystem:config.variant==='a-frame'?'hanging':'layered'};draft.settings.productionCutting={...draft.settings.productionCutting,roofFrameConfig:{...config,sourceKey:roofFrameSource(previewModel.project,previewModel.report.assembly,settings),replaceRidge:config.variant==='single'||config.variant==='triple'},roofSupports:supports,roofSupportSipAlignment:config.alignSipPosts!==false,rafterEndCuts:true};return draft;});
 };
 return <details className="cut-layout-settings roof-support-frame" open><summary>Опорный каркас под стропилами · по образцу EFT</summary><div className="cut-fields">
  <label>Расположение каркасов<select value={config.variant} onChange={e=>setConfig({...config,variant:e.target.value,baseZ:''})}><option value="single">Под коньком</option><option value="double">Два под скатами · наслонная</option><option value="triple">Под коньком и скатами</option><option value="a-frame">А-фрейм · висячие пары с затяжкой</option></select></label>
  <label>Доска каркаса / затяжек<select value={config.profile} onChange={e=>setConfig({...config,profile:e.target.value})}><option>50×150</option><option>50×100</option></select></label>
  {config.variant!=='a-frame'?<NumberInput label="Чистый просвет каркаса, мм" value={config.gapMm} min={100} max={1200} onChange={gapMm=>setConfig({...config,gapMm})}/>:null}
  <NumberInput label={config.variant==='a-frame'?'Ось затяжки Z, мм · пусто: низ затяжки над потолком':'Низ каркаса Z, мм · пусто: верх потолка'} value={config.baseZ??''} min={-100000} onChange={baseZ=>setConfig({...config,baseZ})}/>
  <label><input type="checkbox" checked={config.alignSipPosts!==false} onChange={e=>setConfig({...config,alignSipPosts:e.target.checked})}/>Совместить соединители SIP стен и фронтонов под опорами кровли</label>
 </div>{config.variant==='a-frame'?<p>Затяжки на ребре соединяют стропильные пары на выбранной высоте. Сечения, растянутые соединения и распор требуют проверки конструктора; это проектный шаблон, не расчёт несущей способности.</p>:<p>Пояса плашмя, стойки до нижней поверхности стропил. Высота автоматически по сохранённой крыше; проёмы и высоты стен не меняются. Укороченная крайняя ячейка показана отдельно. Это опорный каркас, не расчётная ферма.</p>}
 <button disabled={report.assembly.roofShape!=='gable'} onClick={()=>commit(draft=>{const a=report.assembly,span=a.axis==='x'?a.bounds.height:a.bounds.width;draft.settings.roof.ridgeHeight=Math.round(span/2*Math.tan(Math.PI/8))/1000;return draft;})}>Установить уклон основной крыши 22,5°</button>
 <p>Предпросмотр: <b>{preview.counts.frames} каркасов · {preview.counts.posts} стоек · {preview.counts.ties||0} затяжек</b>. Материал выбирается из существующего прайса по сечению; цены не меняются. Шаг существующих стропил не заменяется шагом опорного каркаса.</p>
 <p>При применении включится {config.variant==='a-frame'?'висячая система с затяжкой каждой пары':'наслонная система с опорным каркасом'}. Ручные и закреплённые опоры сохраняются: проверьте их необходимость. Новые детали учитываются отдельными позициями; действующие нормы и коэффициенты не заменяются.</p>
 {preview.errors.map(e=><p key={e} role="alert">{e}</p>)}{preview.warnings.map(e=><p key={e}>{e}</p>)}
 <button disabled={!!preview.errors.length||!preview.items.length||settings.roofSupports.filter(s=>s.autoLayout!==FRAME_LAYOUT||s.autoLocked).length+preview.items.length>200} onClick={apply}>Применить схему крыши</button>
 </details>;
}
