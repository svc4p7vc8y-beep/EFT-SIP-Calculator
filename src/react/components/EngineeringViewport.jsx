import {useEffect,useRef,useState} from 'react';
import {ZoomIn,ZoomOut,Move,RotateCcw} from 'lucide-react';

export default function EngineeringViewport({children,onGestureStart}){
 const [zoom,setZoom]=useState(100),[hand,setHand]=useState(false),scroll=useRef(null),gesture=useRef(null),touches=useRef(new Map()),skip=useRef(false),value=useRef(100);
 value.current=zoom;
 const scale=(next,cx,cy)=>{const el=scroll.current;if(!el)return;next=Math.max(35,Math.min(800,next));const box=el.getBoundingClientRect(),x=cx-box.left,y=cy-box.top,ratio=next/value.current,left=(el.scrollLeft+x)*ratio-x,top=(el.scrollTop+y)*ratio-y;value.current=next;setZoom(next);requestAnimationFrame(()=>{el.scrollLeft=left;el.scrollTop=top;});};
 useEffect(()=>{const el=scroll.current;const wheel=e=>{if(e.target.closest('button,input,select'))return;e.preventDefault();onGestureStart?.();scale(value.current*Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[onGestureStart]);
 const end=e=>{touches.current.delete(e.pointerId);if(gesture.current){e.stopPropagation();gesture.current=null;skip.current=true;}};
 return <div className="engineering-viewport"><div className="engineering-viewport-tools" role="toolbar" aria-label="Масштаб и перемещение инженерии">
  <button aria-label="Уменьшить рабочее поле" onClick={()=>setZoom(z=>Math.max(35,z-25))}><ZoomOut size={17}/></button><button aria-label="Сбросить масштаб инженерии" onClick={()=>{setZoom(100);scroll.current.scrollTo(0,0);}}>{Math.round(zoom)}%</button><button aria-label="Увеличить рабочее поле" onClick={()=>setZoom(z=>Math.min(800,z+25))}><ZoomIn size={17}/></button><button aria-label="Перемещать рабочее поле" aria-pressed={hand} className={hand?'active':''} onClick={()=>setHand(v=>!v)}><Move size={17}/></button><button aria-label="Показать всю стену" onClick={()=>{setZoom(100);setHand(false);scroll.current.scrollTo(0,0);}}><RotateCcw size={16}/></button>
 </div><div ref={scroll} className={`engineering-viewport-scroll${hand?' hand-mode':''}`}
  onPointerDownCapture={e=>{if(e.pointerType==='touch')touches.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const pair=[...touches.current.values()];if(e.button!==1&&!hand&&pair.length<2)return;e.preventDefault();e.stopPropagation();onGestureStart?.();scroll.current.setPointerCapture(e.pointerId);gesture.current={x:e.clientX,y:e.clientY,left:scroll.current.scrollLeft,top:scroll.current.scrollTop,...(pair.length===2?{distance:Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y),zoom:value.current}: {})};}}
  onPointerMoveCapture={e=>{if(touches.current.has(e.pointerId))touches.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const g=gesture.current;if(!g)return;e.preventDefault();e.stopPropagation();const pair=[...touches.current.values()];if(g.distance&&pair.length===2)scale(g.zoom*Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y)/Math.max(1,g.distance),(pair[0].x+pair[1].x)/2,(pair[0].y+pair[1].y)/2);else{scroll.current.scrollLeft=g.left+g.x-e.clientX;scroll.current.scrollTop=g.top+g.y-e.clientY;}}}
  onPointerUpCapture={end} onPointerCancelCapture={end} onClickCapture={e=>{if(skip.current){skip.current=false;e.stopPropagation();e.preventDefault();}}}>
  <div className="engineering-viewport-content" style={{width:`${zoom}%`}}>{children}</div>
 </div></div>;
}
