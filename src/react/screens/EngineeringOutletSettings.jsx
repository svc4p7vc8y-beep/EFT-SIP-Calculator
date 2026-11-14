import {mediumColor} from '../state/engineering-scheme.js';
import {outletAnchor} from '../state/engineering-outlets.js';
const media={cold:'ХВС',hot:'ГВС',recirculation:'Рециркуляция',supply:'Подача',return:'Обратка',waste:'Канализация','vent-stack':'Фановая труба'};
export default function EngineeringOutletSettings({owner,items,onChange}) {
 if(!owner)return null;
 const ports=items.filter(p=>p.kind==='connection-port'&&p.linkedApplianceId===owner.id);
 if(!ports.length)return null;
 return <section className="engineering-outlet-settings" aria-label="Настройки выходов прибора"><strong>Выходы · {owner.label}</strong>{ports.map((port,index)=>{
  const anchor=outletAnchor(owner,index,ports.length,{side:port.connectorU<0?'left':port.connectorU>0?'right':port.connectorV>0?'top':'bottom'});
  const update=patch=>onChange(owner,index,patch);
  return <details key={port.id}><summary><i style={{background:mediumColor(port.connectionMedium)}}/>{port.label.split(' · ').at(-1)}</summary>
   <label>Среда<select value={port.connectionMedium} onChange={e=>update({medium:e.target.value})}>{Object.entries(media).filter(([id])=>port.layer==='heating'?['supply','return'].includes(id):port.layer==='sewer'?['waste','vent-stack'].includes(id):['cold','hot','recirculation'].includes(id)).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   <label>Материал<select value={port.connectionMaterial||''} onChange={e=>update({material:e.target.value})}><option value="">Автоподбор по соединению</option><option value="metal">Металл / резьба</option><option value="pp">Полипропилен</option><option value="mixed">Переход металл–ПП</option><option value="pex">Металлопластик</option><option value="pvc">ПВХ</option></select></label>
   <label>Диаметр, мм<input type="number" min="1" value={port.connectionDiameterMm||''} placeholder="Авто" onChange={e=>update({diameterMm:Number(e.target.value)||null})}/></label>
   <label>Резьба<select value={port.connectionThread||''} onChange={e=>update({thread:e.target.value})}><option value="">Авто от ответной части</option>{['1/2"','3/4"','1"','1 1/4"','1 1/2"','2"'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label>Присоединение<select value={port.connectionGender||''} onChange={e=>update({gender:e.target.value})}><option value="">Авто</option><option value="male">Наружная резьба</option><option value="female">Внутренняя резьба</option></select></label>
   <label>Направление<select value={anchor.side} onChange={e=>update({side:e.target.value})}>{[['left','Влево'],['right','Вправо'],['top','Вверх'],['bottom','Вниз']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   <div className="engineering-outlet-position"><label>По ширине, %<input type="number" min="0" max="100" value={Math.round(anchor.x*100)} onChange={e=>update({x:Math.max(0,Math.min(100,Number(e.target.value)))/100})}/></label><label>От верха, %<input type="number" min="0" max="100" value={Math.round(anchor.y*100)} onChange={e=>update({y:Math.max(0,Math.min(100,Number(e.target.value)))/100})}/></label></div>
  </details>;
 })}<small>Выходы закреплены на приборе. Неуказанные резьба и размер подбираются от ответного выхода; заданные вручную сохраняются.</small></section>;
}
