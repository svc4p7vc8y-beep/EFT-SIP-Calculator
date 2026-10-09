import { useEffect, useRef, useState } from 'react';
import { Hand, MousePointer2, ZoomIn, ZoomOut } from 'lucide-react';
import WallPanelPlan from './WallPanelPlan.jsx';

export default function WallPlanNavigator({report,surface,onSelect}) {
  const [zoom,setZoom]=useState(1),[offset,setOffset]=useState([0,0]),[pan,setPan]=useState(false);
  const pointers=useRef(new Map()),gesture=useRef(null),moved=useRef(false);
  const viewport=useRef(null);
  useEffect(()=>{const node=viewport.current;const wheel=e=>{e.preventDefault();setZoom(z=>Math.min(8,Math.max(.5,z*(e.deltaY<0?1.1:1/1.1))));};node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);},[]);
  const start=()=>{
    const points=[...pointers.current.values()];
    gesture.current=points.length>=2?{distance:Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]),zoom}:points.length?{point:points[0],offset}:null;
  };
  const end=e=>{pointers.current.delete(e.pointerId);start();};
  return <aside className="drawing-wall-selector" aria-label="Навигатор стен и перегородок">
    <div className="wall-navigator-tools"><button aria-label="Выбор стены на мини-плане" aria-pressed={!pan} onClick={()=>setPan(false)}><MousePointer2 size={14}/></button><button aria-label="Перемещение мини-плана" aria-pressed={pan} onClick={()=>setPan(true)}><Hand size={14}/></button><button aria-label="Уменьшить мини-план" onClick={()=>setZoom(z=>Math.max(.5,z/1.25))}><ZoomOut size={14}/></button><button aria-label="Увеличить мини-план" onClick={()=>setZoom(z=>Math.min(8,z*1.25))}><ZoomIn size={14}/></button><button aria-label="Мини-план по размеру" onClick={()=>{setZoom(1);setOffset([0,0]);}}>Сброс</button></div>
    <div ref={viewport} className="wall-navigator-viewport" data-zoom={zoom} onPointerDown={e=>{
      moved.current=false;pointers.current.set(e.pointerId,[e.clientX,e.clientY]);start();
      if(pan||pointers.current.size>1){e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);}
    }} onPointerMove={e=>{
      if(!pointers.current.has(e.pointerId))return;pointers.current.set(e.pointerId,[e.clientX,e.clientY]);const points=[...pointers.current.values()],g=gesture.current;if(!g)return;
      if(points.length>=2&&g.distance){moved.current=true;const d=Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]);setZoom(Math.min(8,Math.max(.5,g.zoom*d/g.distance)));}
      else if(pan&&g.point){const dx=e.clientX-g.point[0],dy=e.clientY-g.point[1];if(Math.hypot(dx,dy)>3)moved.current=true;setOffset([g.offset[0]+dx,g.offset[1]+dy]);}
    }} onPointerUp={end} onPointerCancel={end} onPointerLeave={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))end(e);}}>
      <div className="wall-navigator-transform" style={{transform:`translate(${offset[0]}px,${offset[1]}px) scale(${zoom})`}}><WallPanelPlan report={report} floor={surface?.floor||1} selectedId={surface?.id} compact onSelect={id=>{if(!pan&&!moved.current)onSelect(id);}}/></div>
    </div>
  </aside>;
}
