import {useEffect,useRef,useState} from 'react';
import {ZoomIn,ZoomOut,Move,RotateCcw} from 'lucide-react';
import './engineering-viewport.css';

// Screen transform is independent of content overflow, so pan also works at 100%.
export default function EngineeringViewport({children,onGestureStart,label='Масштаб и перемещение инженерии',className='',compact=false}){
 const [view,setView]=useState({zoom:100,x:0,y:0}),[hand,setHand]=useState(false),scroll=useRef(null),gesture=useRef(null),touches=useRef(new Map()),skip=useRef(false),value=useRef(view),callback=useRef(onGestureStart);
 value.current=view;callback.current=onGestureStart;
 const update=next=>{value.current=next;setView(next);};
 const scale=(zoom,cx,cy)=>{const el=scroll.current;if(!el)return;zoom=Math.max(25,Math.min(800,zoom));const box=el.getBoundingClientRect(),x=cx-box.left,y=cy-box.top,old=value.current,r=zoom/old.zoom;update({zoom,x:x-(x-old.x)*r,y:y-(y-old.y)*r});};
 useEffect(()=>{const el=scroll.current,wheel=e=>{if(e.target.closest('button,input,select'))return;e.preventDefault();callback.current?.();scale(value.current.zoom*Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
 const end=e=>{touches.current.delete(e.pointerId);if(gesture.current){e.preventDefault();e.stopPropagation();gesture.current=null;skip.current=true;}};
 const zoomAtCenter=multiplier=>{const b=scroll.current.getBoundingClientRect();scale(value.current.zoom*multiplier,b.left+b.width/2,b.top+b.height/2);};
 return <div className={`engineering-viewport ${className}`}><div className="engineering-viewport-tools" role="toolbar" aria-label={label}>
  {!compact&&<><button aria-label="Уменьшить рабочее поле" onClick={()=>zoomAtCenter(.8)}><ZoomOut size={17}/></button><button aria-label="Сбросить масштаб инженерии" onClick={()=>update({zoom:100,x:0,y:0})}>{Math.round(view.zoom)}%</button><button aria-label="Увеличить рабочее поле" onClick={()=>zoomAtCenter(1.25)}><ZoomIn size={17}/></button></>}
  <button aria-label="Перемещать рабочее поле" aria-pressed={hand} className={hand?'active':''} onClick={()=>setHand(v=>!v)}><Move size={17}/></button><button aria-label="Показать всю стену" onClick={()=>{update({zoom:100,x:0,y:0});setHand(false);}}><RotateCcw size={16}/></button><small>Колесо — масштаб · нажатое колесо — сдвиг</small>
 </div><div ref={scroll} className={`engineering-viewport-scroll${hand?' hand-mode':''}`} onAuxClick={e=>e.preventDefault()}
  onPointerDownCapture={e=>{if(e.pointerType==='touch')touches.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const pair=[...touches.current.values()];if(e.button!==1&&!hand&&pair.length<2)return;e.preventDefault();e.stopPropagation();callback.current?.();scroll.current.setPointerCapture(e.pointerId);gesture.current={x:e.clientX,y:e.clientY,start:{...value.current},...(pair.length===2?{distance:Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y)}:{})};}}
  onPointerMoveCapture={e=>{if(touches.current.has(e.pointerId))touches.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const g=gesture.current;if(!g)return;e.preventDefault();e.stopPropagation();const pair=[...touches.current.values()];if(g.distance&&pair.length===2){const zoom=Math.max(25,Math.min(800,g.start.zoom*Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y)/Math.max(1,g.distance)));scale(zoom,(pair[0].x+pair[1].x)/2,(pair[0].y+pair[1].y)/2);}else update({...g.start,x:g.start.x+e.clientX-g.x,y:g.start.y+e.clientY-g.y});}}
  onPointerUpCapture={end} onPointerCancelCapture={end} onClickCapture={e=>{if(skip.current){skip.current=false;e.stopPropagation();e.preventDefault();}}}>
  <div className="engineering-viewport-content" style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.zoom/100})`,transformOrigin:'0 0'}}>{children}</div>
 </div></div>;
}
