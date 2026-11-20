import {useMemo} from 'react';
import {resolvePlan3DSelection} from '../calculations/plan-3d-selection.js';
import {useProject} from '../state/ProjectContext.jsx';
import {MemberEditor} from './CuttingControls.jsx';
import PlatformBuildControls from './PlatformBuildControls.jsx';
const n=v=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(v||0);
export default function Plan3DElementInspector({selection,onClose}){
 const {project,commit}=useProject(),detail=useMemo(()=>resolvePlan3DSelection(selection.report,project,selection.id),[selection,project]);
 if(!detail)return null;
 const update=patch=>commit(next=>{Object.assign(next.settings.productionCutting,patch);return next;});
 const NumberInput=({label,value,onChange,min=-100000})=><label>{label}<input type="number" defaultValue={value} min={min} onBlur={e=>{const value=Number(e.currentTarget.value);if(Number.isFinite(value))onChange(value);}}/></label>;
 return <section className="inspector-form plan-3d-element" aria-label="Параметры элемента 3D"><header><h3>{detail.name}</h3><button type="button" onClick={onClose} aria-label="Снять выбор 3D">×</button></header><dl>{detail.mark?<><dt>Марка</dt><dd>{detail.mark}</dd></>:null}{detail.surfaceName?<><dt>Конструкция</dt><dd>{detail.surfaceName}</dd></>:null}{detail.bundleLayers>1?<><dt>Досок в пакете</dt><dd>{detail.bundleLayers}</dd></>:null}{detail.profile?<><dt>Сечение</dt><dd>{detail.profile} мм</dd></>:null}{detail.length>0?<><dt>Длина</dt><dd>{n(detail.length)} мм</dd></>:null}{detail.width>0?<><dt>Ширина</dt><dd>{n(detail.width)} мм</dd></>:null}{detail.height>0?<><dt>Высота</dt><dd>{n(detail.height)} мм</dd></>:null}{detail.thickness>0?<><dt>Толщина</dt><dd>{n(detail.thickness)} мм</dd></>:null}{detail.material?<><dt>Материал</dt><dd>{detail.material}</dd></>:null}{detail.a?<><dt>Начало / положение XYZ, мм</dt><dd>{detail.a.map(n).join(' / ')}</dd></>:null}{detail.b?<><dt>Конец XYZ, мм</dt><dd>{detail.b.map(n).join(' / ')}</dd></>:null}</dl>{detail.platformId?<PlatformBuildControls platformId={detail.platformId}/>:null}{detail.member?<MemberEditor member={detail.member} settings={project.settings.productionCutting} update={update} NumberInput={NumberInput}/>:null}{detail.referenceOnly?<p>Справочная геометрия. Производственные параметры задаются у исходной конструкции.</p>:null}</section>;
}
