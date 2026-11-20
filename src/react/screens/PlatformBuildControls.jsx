import {useProject} from '../state/ProjectContext.jsx';
export default function PlatformBuildControls({platformId}){
 const {project,commit}=useProject(),p=project.plan.platforms.find(p=>p.id===platformId);
 if(!p)return null;
 const set=(key,value)=>commit(next=>{const p=next.plan.platforms.find(p=>p.id===platformId);if(p)p[key]=value;return next;});
 return <fieldset className="platform-build-controls"><legend>Состав площадки</legend>{[['deckEnabled','Настил террасы'],['joistsEnabled','Нижняя рама и лаги']].map(([key,label])=><label key={key}><input type="checkbox" checked={p[key]!==false} onChange={e=>{const checked=e.currentTarget.checked;set(key,checked);}}/>{label}</label>)}<small>Отключение исключает материал и монтаж из расчёта. Опорные столбы и кровля остаются.</small></fieldset>;
}
