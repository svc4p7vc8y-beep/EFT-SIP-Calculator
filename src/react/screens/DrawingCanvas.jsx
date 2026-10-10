import { useEffect, useRef, useState } from 'react';
import { polygonBounds } from '../calculations/production-cutting.js';
import { productionMark as mark } from '../calculations/production-assembly.js';
import DimensionChain from '../components/DrawingDimensions.jsx';
import { surfaceDimensions } from '../calculations/drawing-dimensions.js';
import { PartitionDrawingContents } from '../components/PartitionDrawing.jsx';
import { boardFootprint } from '../calculations/partition-geometry.js';
import { stairStepGeometry, stairOpeningPolygon } from '../planner/stair-steps.js';
import { panelLabelPoint } from '../calculations/drawing-labels.js';

const path=shape=>shape.map(r=>r.map((p,i)=>`${i?'L':'M'}${p.join(',')}`).join(' ')+'Z').join(' ');
export function DrawingCanvas({surface,parts=[],members=[],layers,selected=[],onSelect,fontScale=1,dimensions=[],draft,onPick,onHover,onLabelMove,labelOverrides={},onTextMove,onTextSelect,printable=false}) {
  const svgRef=useRef(null),[pixelSize,setPixelSize]=useState([800,430]);
  const labelDrag=useRef(null);
  useEffect(()=>{const update=()=>{const b=svgRef.current?.getBoundingClientRect();setPixelSize([b?.width||800,b?.height||430]);};const observer=new ResizeObserver(update);if(svgRef.current?.parentElement)observer.observe(svgRef.current.parentElement);update();return()=>observer.disconnect();},[]);
  if(!surface?.geometry?.length)return <p>Выберите конструкцию с геометрией.</p>;
  const box=polygonBounds(surface.geometry.flat()),size=Math.max(box.width,box.height,1000),pad=size*.24;
  const drawingDimensions=surfaceDimensions(surface,parts,members),hasOpenings=!!surface.openings?.length;
  const partition=surface.frameOnly&&surface.id?.includes('-ПГ');
  const viewHeight=box.height+pad*(partition?2.8:2)+(partition?(Number(surface.frameProfile?.split(/[×xх]/)[1])||100):0);
  const font=(printable?size*.022:Math.max(size*.022,12*Math.max((box.width+pad*2)/pixelSize[0],viewHeight/pixelSize[1])))*fontScale;
  const yy=y=>surface.horizontal?y:2*box.y+box.height-y;
  const shape=s=>s.map(r=>r.map(([x,y])=>[x,yy(y)]));
  const select=(event,id)=>{if(onPick)return;event.stopPropagation();onSelect?.(id);};
  const handlers=id=>({onClick:e=>select(e,id),onKeyDown:e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();select(e,id);}},tabIndex:onSelect?0:undefined,role:onSelect?'button':undefined});
  const visibleMembers=members.filter(m=>m.a&&m.b&&!m.excluded);
  const locate=event=>{const svg=svgRef.current,matrix=svg.getScreenCTM();if(!matrix)return null;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const q=p.matrixTransform(matrix.inverse());return [Math.round(q.x),Math.round(yy(q.y))];};
const label=(key,text,x,y,size=font)=>{const saved=labelOverrides[key]||{},offset=saved.offset||[0,0];return <text className="editable-drawing-label" x={x+offset[0]} y={yy(y+offset[1])} textAnchor="middle" fontSize={size} style={{cursor:onTextMove?'move':undefined,touchAction:'none',stroke:'#fff',strokeWidth:size*.2,paintOrder:'stroke'}} onClick={e=>{e.stopPropagation();onTextSelect?.({key,text});}} onPointerDown={e=>{if(!onTextMove||onPick)return;e.stopPropagation();e.preventDefault();labelDrag.current={key,text,start:locate(e),offset};svgRef.current.setPointerCapture(e.pointerId);}}>{saved.text??text}</text>;};
return <svg ref={svgRef} className={printable?"technical-drawing workbench-drawing":"workbench-drawing"} viewBox={`${box.x-pad} ${box.y-pad*.45} ${box.width+pad*2} ${viewHeight}`} aria-label={`Чертёж ${surface.name}`} role="img" style={{cursor:onPick?'crosshair':undefined,touchAction:onPick?'none':undefined}} onClick={e=>{const p=locate(e);if(p)onPick?.(p);}} onPointerMove={e=>{const p=locate(e);if(p)onHover?.(p);}} onPointerUp={e=>{if(labelDrag.current){const p=locate(e),drag=labelDrag.current;if(drag.key){if(p&&drag.start&&Math.hypot(p[0]-drag.start[0],p[1]-drag.start[1])>3)onTextMove?.(drag.key,[drag.offset[0]+p[0]-drag.start[0],drag.offset[1]+p[1]-drag.start[1]]);onTextSelect?.({key:drag.key,text:drag.text});}else{const d=dimensions.find(d=>d.id===drag);if(p&&d)onLabelMove?.(d.id,[p[0]-(d.a[0]+d.b[0])/2,p[1]-(d.a[1]+d.b[1])/2]);}labelDrag.current=null;}}} onPointerCancel={()=>{labelDrag.current=null;}}>
    {partition?<PartitionDrawingContents surface={surface} members={members} pad={pad} font={font} layers={layers} selected={selected} handlers={handlers} renderLabel={label} labelOverrides={labelOverrides}/>:<>
    {surface.geometry.map((g,i)=><path key={i} d={path(shape(g))} fill="white" fillRule="evenodd" stroke="#000" vectorEffect="non-scaling-stroke"/>)}
{layers.panels?parts.map(p=><g key={p.id} {...handlers(p.id)} aria-label={`Панель ${mark(p)}`}><path d={path(shape(p.shape))} fill={selected.includes(p.id)?'#a9cdb6':'#e5efdf'} fillRule="evenodd" stroke={selected.includes(p.id)?'#075b37':'#577448'} strokeWidth={selected.includes(p.id)?1.2:.55} vectorEffect="non-scaling-stroke"/><title>{mark(p)} · {Math.round(p.width)} × {Math.round(p.height)} × {p.thickness} мм</title></g>):null}
    {layers.frame?visibleMembers.map(m=><g key={m.id} {...handlers(m.id)} aria-label={`Элемент ${mark(m)}`}><polygon points={(boardFootprint(m)||[]).map(([x,y])=>`${x},${yy(y)}`).join(' ')} fill={selected.includes(m.id)?'#d5e8dd':'#fcf8ee'} stroke="#000" strokeWidth={selected.includes(m.id)?1:.45} vectorEffect="non-scaling-stroke"/><line x1={m.a[0]} y1={yy(m.a[1])} x2={m.b[0]} y2={yy(m.b[1])} stroke="transparent" strokeWidth="12" vectorEffect="non-scaling-stroke"/>{layers.labels&&selected.includes(m.id)?<text x={(m.a[0]+m.b[0])/2} y={yy((m.a[1]+m.b[1])/2)-font} fontSize={font} textAnchor="middle">{mark(m)} · {m.length} мм</text>:null}<title>{mark(m)} · {m.profile} · {m.length} мм</title></g>):null}
    {layers.dimensions?<><DimensionChain values={drawingDimensions.x} y={box.y+box.height+pad*.4} font={font*.8}/>{hasOpenings?<DimensionChain values={drawingDimensions.openingX} y={box.y+box.height+pad*.85} font={font*.8}/>:null}<DimensionChain values={[box.x,box.x+box.width]} y={box.y+box.height+pad*(hasOpenings?1.3:.85)} font={font} label="Габарит конструкции"/><g transform="rotate(90)"><DimensionChain values={[box.y,box.y+box.height]} y={-box.x+pad*.65} font={font}/><DimensionChain values={drawingDimensions.openingY.map(yy)} y={-box.x-box.width-pad*.65} font={font*.8} label={hasOpenings?'Высоты проёмов':''}/></g></>:null}
    {(surface.openings||[]).map(o=><g key={o.key}>{label('opening:'+o.key,`${o.width}×${o.height}`,o.x+o.width/2,Number(o.sill)+o.height/2,font*.75)}</g>)}
    </>}
    {!partition&&layers.panels&&layers.labels?parts.map(p=><g key={'label:'+p.id}>{label('panel:'+p.id,mark(p).replace(`${mark(surface.id)}-`,''),...panelLabelPoint(p))}</g>):null}
    {layers.labels?label('surface-title',surface.name,box.x+box.width/2,surface.horizontal?box.y-font*2:box.y+box.height+font*2):null}
    {(surface.stairOpenings||[]).map(o=>{const x=o.x*1000,y=o.y*1000,w=o.width*1000,h=o.length*1000,steps=stairStepGeometry({x,y,width:w,height:h},o.direction,o.stepCount,o.stairType);return <g key={o.id} aria-label="Проём лестницы"><polygon points={stairOpeningPolygon(o).map(([x,y])=>`${x*1000},${y*1000}`).join(' ')} fill="none" stroke="#000" strokeWidth=".55" vectorEffect="non-scaling-stroke"/>{[...steps.treads,...(steps.landings||[])].map((t,i)=><line key={i} {...t} stroke="#000" strokeWidth=".4" vectorEffect="non-scaling-stroke"/>)}{steps.path?<polyline points={steps.path} fill="none" stroke="#000" vectorEffect="non-scaling-stroke"/>:<line {...steps.arrow} stroke="#000" vectorEffect="non-scaling-stroke"/>}<polygon points={steps.head} fill="#000"/>{layers.labels?label('stair:'+o.id,o.name||'Лестничный проём',x+w/2,y+h/2,font*.9):null}</g>;})}
    {[...dimensions,...(draft?[{...draft,id:'draft'}]:[])].map(d=><g key={d.id}><line x1={d.a[0]} y1={yy(d.a[1])} x2={d.b[0]} y2={yy(d.b[1])} stroke="#000" strokeDasharray="5 3" vectorEffect="non-scaling-stroke"/><text x={(d.a[0]+d.b[0])/2+(d.offset?.[0]||0)} y={yy((d.a[1]+d.b[1])/2+(d.offset?.[1]||0))-font*.4} fontSize={font} textAnchor="middle" onPointerDown={e=>{if(onLabelMove&&d.id!=='draft'&&!onPick){e.stopPropagation();e.preventDefault();labelDrag.current=d.id;svgRef.current.setPointerCapture(e.pointerId);}}}>{Math.round(Math.hypot(d.b[0]-d.a[0],d.b[1]-d.a[1]))} мм</text></g>)}
  </svg>;
}

export function DrawingViewport({children,zoom=1,pan,onZoom,offset=[0,0],onOffset}){
  const ref=useRef(null),drag=useRef(null);
  const setOffset=value=>onOffset?.(value);
  return <div ref={ref} className={`drawing-viewport ${pan?'is-pan':''}`} onWheel={e=>{if(e.ctrlKey||e.altKey){onZoom?.(Math.min(4,Math.max(.5,zoom*(e.deltaY<0?1.1:1/1.1))));}}} onPointerDown={e=>{if(!pan&&e.button!==1)return;e.preventDefault();drag.current=[e.clientX,e.clientY,...offset];e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current)setOffset([drag.current[2]+e.clientX-drag.current[0],drag.current[3]+e.clientY-drag.current[1]]);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
    <div className="drawing-transform" style={{transform:`translate(${offset[0]}px,${offset[1]}px) scale(${zoom})`,pointerEvents:pan?'none':undefined}}>{children}</div>
  </div>;
}

export function WallLocator({report,surface,onSelect,large=false}){
  const floor=surface?.floor||report.assembly.floors.at(-1)?.floor,plan=report.assembly.floors.find(p=>p.floor===floor);
  if(!plan)return null;
  const b=report.assembly.bounds,pad=Math.max(b.width,b.height)*.12,font=Math.max(b.width,b.height)*(large?.046:.025);
  return <svg className={large?'workbench-drawing':'drawing-locator'} viewBox={`${b.x-pad} ${b.y-pad} ${b.width+pad*2} ${b.height+pad*2}`} aria-label="План выбора стены и направление взгляда" role="img">
    <polygon points={plan.contour.map(p=>p.join(',')).join(' ')} fill="none" stroke="#000" vectorEffect="non-scaling-stroke"/>
    {plan.rooms.map((r,i)=><polygon key={i} points={r.points.map(p=>p.join(',')).join(' ')} fill="none" stroke="#ccc" vectorEffect="non-scaling-stroke"/>)}
    {report.surfaces.filter(s=>s.planStart&&s.floor===floor).map(s=><g key={s.id} role="button" tabIndex={0} aria-label={`Открыть ${s.name}`} onClick={()=>onSelect?.(s.id)} onKeyDown={e=>{if(e.key==='Enter')onSelect?.(s.id);}}><line x1={s.planStart[0]} y1={s.planStart[1]} x2={s.planEnd[0]} y2={s.planEnd[1]} stroke={s.id===surface?.id?'#10734c':'#000'} strokeWidth={s.id===surface?.id?3:1} vectorEffect="non-scaling-stroke"/><line x1={s.planStart[0]} y1={s.planStart[1]} x2={s.planEnd[0]} y2={s.planEnd[1]} stroke="transparent" strokeWidth="18" vectorEffect="non-scaling-stroke"/>{large?<text x={(s.planStart[0]+s.planEnd[0])/2} y={(s.planStart[1]+s.planEnd[1])/2-font*.4} textAnchor="middle" fontSize={font}>{mark(s)}</text>:null}</g>)}
    {surface?.planStart?(()=>{const a=surface.planStart,c=surface.planEnd,dx=c[0]-a[0],dy=c[1]-a[1],l=Math.hypot(dx,dy)||1,x=(a[0]+c[0])/2,y=(a[1]+c[1])/2;return <g transform={`translate(${x},${y}) rotate(${Math.atan2(dy,dx)*180/Math.PI})`}><path d={`M0,${font*2.5}V${font*.5}m${-font*.3},${font*.5}l${font*.3},${-font*.5}l${font*.3},${font*.5}`} fill="none" stroke="#000" strokeWidth="2" vectorEffect="non-scaling-stroke"/><title>Взгляд на стену; начало развёртки {Math.round(a[0])}, {Math.round(a[1])}</title></g>;})():null}
  </svg>;
}
