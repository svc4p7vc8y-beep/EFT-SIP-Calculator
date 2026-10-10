import { MousePointer2, Hand, Ruler, Type, Settings2, Construction, Box } from 'lucide-react';

export default function DrawingToolRail({tool,onTool,canMeasure,onProperties,onSupports,on3D,is3D,pending}) {
  return <nav className="drawing-tool-rail" aria-label="Инструменты рабочего поля">
    {[["select","Выбор",MousePointer2],["pan","Перемещение",Hand],["measure","Размер",Ruler],["labels","Подписи",Type]].map(([id,label,Icon])=><button key={id} aria-pressed={tool===id} disabled={pending||(['measure','labels'].includes(id)&&!canMeasure)} onClick={()=>onTool(id)} title={label}><Icon size={20}/><span>{label}</span></button>)}
    <button onClick={onProperties} disabled={pending} title="Параметры выбранной конструкции"><Settings2 size={20}/><span>Параметры</span></button>
    <button onClick={onSupports} disabled={pending} title="Рисовать прогоны, стойки и узлы"><Construction size={20}/><span>Опоры / узлы</span></button>
    <button onClick={on3D} aria-pressed={is3D} title="Объёмный домокомплект"><Box size={20}/><span>{is3D?'Чертёж':'3D дом'}</span></button>
  </nav>;
}
