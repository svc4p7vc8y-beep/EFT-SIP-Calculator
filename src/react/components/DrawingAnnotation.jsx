import {useState,useRef} from 'react';
const point=e=>{const svg=e.currentTarget.ownerSVGElement,p=svg?.createSVGPoint(),ctm=e.currentTarget.getScreenCTM();if(!p||!ctm)return null;p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(ctm.inverse());};
// Offsets are graphical millimetres in the current projection, not world geometry.
export default function DrawingAnnotation({id,x,y,offset,onMove,children,...props}){
 const [preview,setPreview]=useState(null),drag=useRef(null),shift=preview||offset||{x:0,y:0};
 const end=e=>{if(!drag.current)return;e.stopPropagation();const p=point(e),d=drag.current;drag.current=null;setPreview(null);if(p)onMove?.(id,{x:Math.round(d.x+p.x-d.p.x),y:Math.round(d.y+p.y-d.p.y)});};
 return <g>{(shift.x||shift.y)?<path d={`M${x},${y}L${x+shift.x},${y+shift.y}`} fill="none" stroke="#555" strokeWidth=".3" vectorEffect="non-scaling-stroke"/>:null}<text {...props} x={x+shift.x} y={y+shift.y} data-annotation-id={id} style={{cursor:onMove?'move':undefined,touchAction:onMove?'none':undefined}} onPointerDown={e=>{if(!onMove)return;const p=point(e);if(!p)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current={p,x:shift.x,y:shift.y};}} onPointerMove={e=>{if(!drag.current)return;e.stopPropagation();const p=point(e),d=drag.current;if(p)setPreview({x:d.x+p.x-d.p.x,y:d.y+p.y-d.p.y});}} onPointerUp={end} onPointerCancel={()=>{drag.current=null;setPreview(null);}}>{children}</text></g>;
}
