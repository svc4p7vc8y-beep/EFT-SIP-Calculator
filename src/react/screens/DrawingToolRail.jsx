import { MousePointer2, Hand, Ruler, Type, Construction } from 'lucide-react';

export default function DrawingToolRail({tool,onTool,canMeasure,onSupports,pending}) {
  return <nav className="drawing-tool-rail" aria-label="Инструменты рабочего поля">
    {[["select","Выбор",MousePointer2],["pan","Двигать поле",Hand],["measure","Размер",Ruler],["labels","Подписи",Type]].map(([id,label,Icon])=><button key={id} aria-pressed={tool===id} disabled={pending||(['measure','labels'].includes(id)&&!canMeasure)} onClick={()=>onTool(id)} title={label}><Icon size={20}/><span>{label}</span></button>)}
    <button onClick={onSupports} disabled={pending} title="Рисовать прогоны, стойки и узлы"><Construction size={20}/><span>Элементы</span></button>
  </nav>;
}
