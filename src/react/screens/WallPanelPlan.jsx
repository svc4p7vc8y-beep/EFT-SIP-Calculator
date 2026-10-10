import { useMemo } from 'react';
import Dimensions from '../components/DrawingDimensions.jsx';
import { productionMark } from '../calculations/production-assembly.js';
import { wallTopView } from '../calculations/wall-top-view.js';

export default function WallPanelPlan({report,floor=1,onSelect,selectedId,compact=false,layers={}}) {
  const {contour,walls,box}=useMemo(()=>wallTopView(report,floor),[report,floor]);
  const size=Math.max(box.width,box.height,1000),pad=size*(compact ? .06 : .2),font=Math.min(size*.018,Math.max(100,Math.min(box.width,box.height)*.04));
  return <svg className="workbench-drawing technical-drawing wall-top-view" viewBox={[box.x-pad,box.y-pad,box.width+2*pad,box.height+2*pad].join(' ')} role="img" aria-label={compact?'План стен и перегородок без подписей':'Расположение стеновых панелей · этаж '+floor}>
    <polygon points={contour.map(p=>p.join(',')).join(' ')} fill="#fff" stroke="#aaa" strokeWidth=".4" vectorEffect="non-scaling-stroke"/>
    {walls.map(({surface:w,partition,frame,depth,offset,side,angle,panels,studs,openings})=>{
      const selected=w.id===selectedId,color=selected?'#08784b':w.bearing?'#3f718e':'#000';
      const readable=(x,y)=>Math.abs(angle)>90?'rotate(180 '+x+' '+y+')':undefined;
      const values=[0,w.width,...panels.flatMap(p=>[p.x,p.x+p.width]),...(w.openings||[]).flatMap(o=>[o.x,o.x+o.width])];
      return <g key={w.id} transform={'translate('+w.planStart.join(' ')+') rotate('+angle+')'} role={onSelect?'button':undefined} tabIndex={onSelect?0:undefined} aria-label={'Открыть '+w.name} aria-pressed={onSelect?selected:undefined} onClick={()=>onSelect?.(w.id)} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onSelect?.(w.id);}}}>
        <g transform={'scale(1 '+side+')'}>
          <rect y={offset} width={w.width} height={depth} fill={selected?'#e1f1e7':frame?'#fffaf0':'#f1f3ef'} stroke={color} strokeWidth={selected?1:.55} vectorEffect="non-scaling-stroke"/>
          {layers.panels!==false?panels.map((p,i)=><g key={p.part.id+':'+i}><rect className="top-view-panel" x={p.x} y={offset} width={p.width} height={depth} fill={selected?'#d7eddf':'#f1f3ef'} stroke={color} strokeWidth=".5" vectorEffect="non-scaling-stroke"/><title>{productionMark(p.part)} · {p.part.width}×{p.part.height}×{p.part.thickness} мм</title></g>):null}
          {openings.map(o=><g key={o.key}><rect className="top-view-opening" x={o.x} y={offset-.5} width={o.width} height={depth+1} fill="#fff" stroke={color} strokeWidth=".5" vectorEffect="non-scaling-stroke"/>{o.type==='window'&&!o.gap?<><line x1={o.x} x2={o.x+o.width} y1={offset+depth*.4} y2={offset+depth*.4} stroke="#526a77" strokeWidth=".4" vectorEffect="non-scaling-stroke"/><line x1={o.x} x2={o.x+o.width} y1={offset+depth*.6} y2={offset+depth*.6} stroke="#526a77" strokeWidth=".4" vectorEffect="non-scaling-stroke"/></>:null}<title>{o.gap?'Разрыв':o.type==='door'?'Дверь':'Окно'} · {o.width} мм</title></g>)}
          {layers.frame!==false?studs.map(({x,width,member})=><rect className="top-view-stud" key={member.id} x={Math.max(0,x-width/2)} y={offset} width={Math.min(width,w.width-Math.max(0,x-width/2))} height={depth} fill={selected?'#9cc9af':'#c9b58b'} stroke={color} strokeWidth=".45" vectorEffect="non-scaling-stroke"><title>{productionMark(member)} · {member.profile} мм</title></rect>):null}
        </g>
        <title>{w.name}{w.bearing?' · несущая':''} · {w.width} мм</title>
        {!compact?<>
          {layers.labels!==false&&layers.panels!==false?panels.map((p,i)=><text key={p.part.id+':'+i} x={p.x+p.width/2} y={-font*.8} transform={readable(p.x+p.width/2,-font*.8)} fontSize={font*.7} textAnchor="middle">{productionMark(p.part)}</text>):null}
          {layers.labels!==false&&(!partition||selected||!onSelect)?<text x={w.width/2} y={-font*2.3} transform={readable(w.width/2,-font*2.3)} fontSize={font*(partition?.8:1)} textAnchor="middle">{w.displayMark||w.id.replace(/^Э\d+-/,'')}</text>:null}
          {!partition&&layers.dimensions!==false?<Dimensions values={values} y={depth+font*2.5} font={font*.65} textRotation={Math.abs(angle)>90?180:0}/>:null}
        </>:null}
        {onSelect?<line x1="0" x2={w.width} y1={side*(offset+depth/2)} y2={side*(offset+depth/2)} stroke="transparent" strokeWidth="10" vectorEffect="non-scaling-stroke"/>:null}
      </g>;
    })}
    {!compact&&layers.dimensions!==false?<><Dimensions values={[box.x,box.x+box.width]} y={box.y+box.height+pad*.75} font={font} label="Наружный габарит"/><g transform="rotate(90)"><Dimensions values={[box.y,box.y+box.height]} y={-box.x+pad*.75} font={font}/></g><text x={box.x+box.width/2} y={box.y+box.height+pad*.95} fontSize={font*.65} textAnchor="middle">Сечение +1000 мм · Н2 — угол; Н3 — примыкание. Высотные ряды — на развёртках.</text></>:null}
  </svg>;
}
