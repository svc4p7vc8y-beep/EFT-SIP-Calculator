import Dimensions from '../components/DrawingDimensions.jsx';
import { productionMark } from '../calculations/production-assembly.js';
import { pointBounds } from '../calculations/drawing-dimensions.js';

export default function WallPanelPlan({report,floor=1,onSelect}) {
  const walls=report.surfaces.filter(s=>s.planStart&&s.floor===floor&&!s.partitionFrame&&!s.id.includes('-ПГ'));
  const contour=report.assembly.floors.find(f=>f.floor===floor)?.contour||[],box=pointBounds(contour),size=Math.max(box.width,box.height,1000),pad=size*.16,font=size*.018;
  return <svg className="workbench-drawing technical-drawing" viewBox={`${box.x-pad} ${box.y-pad} ${box.width+2.5*pad} ${box.height+2.6*pad}`} role="img" aria-label={`Расположение стеновых панелей · этаж ${floor}`}>
    <polygon points={contour.map(p=>p.join(',')).join(' ')} fill="none" stroke="#888" strokeWidth=".5" vectorEffect="non-scaling-stroke"/>
    {walls.map(w=>{const [a,b]=[w.planStart,w.planEnd],angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
      const readable=(x,y)=>Math.abs(angle)>90?`rotate(180 ${x} ${y})`:undefined;
      return <g key={w.id} transform={`translate(${a.join(' ')}) rotate(${angle})`} onClick={()=>onSelect?.(w.id)} role={onSelect?'button':undefined} tabIndex={onSelect?0:undefined} onKeyDown={e=>{if(e.key==='Enter')onSelect?.(w.id);}}>
        <rect width={w.width} height={w.thickness} fill="#f2f5ed" stroke="#000" strokeWidth=".5" vectorEffect="non-scaling-stroke"/>
        {report.parts.filter(p=>p.surfaceId===w.id).map(p=><g key={p.id}><line x1={p.x} y1="0" x2={p.x} y2={w.thickness} stroke="#000" strokeWidth=".5" vectorEffect="non-scaling-stroke"/><text x={p.x+p.width/2} y={-font*(1.5+Math.floor(p.y/report.panelLength))} transform={readable(p.x+p.width/2,-font*(1.5+Math.floor(p.y/report.panelLength)))} fontSize={font*.75} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={font*.3}>{productionMark(p)}</text><title>{productionMark(p)} · высота ряда {p.y}–{p.y+p.height} мм</title></g>)}
        {(w.openings||[]).map(o=><g key={o.key}><rect x={o.x} y="0" width={o.width} height={w.thickness} fill="#fff" stroke="#000" strokeWidth=".5" vectorEffect="non-scaling-stroke"/><text x={o.x+o.width/2} y={w.thickness+font} fontSize={font*.65} textAnchor="middle">{o.gap?'Разрыв':o.type==='door'?'Дверь':'Окно'} {o.width}</text></g>)}
        <text x={w.width/2} y={-font*3.3} transform={readable(w.width/2,-font*3.3)} fontSize={font} textAnchor="middle">{w.id} · {w.width} мм</text>
      </g>;
    })}
    <Dimensions values={[box.x,box.x+box.width]} y={box.y+box.height+pad*.8} font={font} label="Наружный габарит"/>
    <g transform="rotate(90)"><Dimensions values={[box.y,box.y+box.height]} y={-box.x+pad*.7} font={font}/></g>
    <text x={box.x+box.width/2} y={box.y+box.height+pad*1.35} fontSize={font*.8} textAnchor="middle">Н2 — угловое сопряжение; П — марка панели; ряды раскрыты на развёртках</text>
  </svg>;
}
