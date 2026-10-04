import { useState } from 'react';
import { DrawingCanvas } from './DrawingCanvas.jsx';
export function RoofCoverDrawing({slope}) {
 if(!slope)return <p>Задайте рабочую и полную ширину листа в параметрах покрытия. Скат берётся из геометрии крыши.</p>;
 const surface={id:'Л',name:`Покрытие · ${slope.name}`,horizontal:true,geometry:[[[[0,0],[slope.width,0],[slope.width,slope.length],[0,slope.length],[0,0]]]]};
 const parts=slope.sheets.map(s=>({...s,thickness:'',shape:[[[s.x,s.y],[s.x+s.width,s.y],[s.x+s.width,s.y+s.height],[s.x,s.y+s.height],[s.x,s.y]]]}));
 return <DrawingCanvas surface={surface} parts={parts} layers={{panels:true,labels:true,dimensions:true}}/>;
}
export default function RoofCoverTool({report,settings,update,NumberInput}) {
 const [index,setIndex]=useState(0),slopes=report.roofCover?.slopes||[],slope=slopes[index]||slopes[0];
 const change=patch=>update({roofSheets:{...settings.roofSheets,...patch}});
 return <div><p>Размеры листа — по паспорту выбранного покрытия. Длины скатов уже рассчитаны. Карта не меняет площадь покрытия и цены в смете; отверстия и примыкания требуют отдельных узлов.</p><div className="cut-fields">
  <NumberInput label="Рабочая ширина листа" value={settings.roofSheets.usefulWidth??''} min={100} max={10000} onChange={usefulWidth=>change({usefulWidth})}/>
  <NumberInput label="Полная ширина листа" value={settings.roofSheets.grossWidth??''} min={100} max={10000} onChange={grossWidth=>change({grossWidth})}/>
  <NumberInput label="Длина исходного листа (пусто — по скату)" value={settings.roofSheets.stockLength??''} min={100} max={30000} onChange={stockLength=>change({stockLength})}/>
  <NumberInput label="Поперечный нахлёст рядов" value={settings.roofSheets.overlap??0} max={2000} onChange={overlap=>change({overlap})}/>
 </div>{slopes.length?<><label>Скат<select value={index} onChange={e=>setIndex(Number(e.target.value))}>{slopes.map((s,i)=><option key={s.name} value={i}>{s.name}</option>)}</select></label><RoofCoverDrawing slope={slope}/><p>Скат {slope.width}×{slope.length} мм. Лист {slope.sheets[0].blankWidth}×{slope.sheets[0].blankLength} мм — <b>×{slope.sheets.length}</b>. {slope.columns} колонок, {slope.rows} рядов. Закупочная площадь {slope.stockArea.toFixed(2)} м²; покрываемая {slope.netArea.toFixed(2)} м².</p></>:null}</div>;
}
