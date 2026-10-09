import DrawingDimensions from './DrawingDimensions.jsx';
import { partitionBoardShape, partitionDrawingData } from '../calculations/partition-drawing.js';

// Shared by the interactive editor and printable mounting sheets.
export function PartitionDrawingContents({surface,members,pad,font,layers={frame:true,labels:true,dimensions:true},selected=[],handlers=()=>({})}) {
  const {boards,positions,depth,axes,openingX}=partitionDrawingData(surface,members),H=surface.height,W=surface.width;
  const yy=y=>H-y,top=H+pad*1.15;
  return <g className="partition-document-drawing">
    {(surface.openings||[]).map(o=><rect key={o.key} x={o.x} y={yy(Number(o.sill)+o.height)} width={o.width} height={o.height} fill="#f3f3f3" stroke="#000" strokeWidth=".5" vectorEffect="non-scaling-stroke"/>)}
    {layers.frame?boards.map((m,i)=>{const shape=partitionBoardShape(m);if(!shape)return null;const vertical=Math.abs(m.a[0]-m.b[0])<.01,x=Math.max(font,Math.min(W-font,(m.a[0]+m.b[0])/2+(vertical?0:(i%2?font*2:-font*2)))),y=yy((m.a[1]+m.b[1])/2),labelY=vertical?y+(i%2?font*.9:-font*.9):y;
      return <g key={m.id} {...handlers(m.id)} aria-label={`Деталь ${positions.get(m.id)} · ${m.material}`}><polygon points={shape.map(([x,y])=>`${x},${yy(y)}`).join(' ')} fill={selected.includes(m.id)?'#a9cdb6':'#ffdfae'} stroke="#000" strokeWidth=".7" vectorEffect="non-scaling-stroke"/><line x1={m.a[0]} y1={yy(m.a[1])} x2={m.b[0]} y2={yy(m.b[1])} stroke="transparent" strokeWidth="12" vectorEffect="non-scaling-stroke"/>{layers.labels?<text x={x} y={labelY} dominantBaseline="middle" textAnchor="middle" fontSize={font*.85} fill="#000" stroke="#fff" strokeWidth={font*.25} paintOrder="stroke">{positions.get(m.id)}</text>:null}<title>Поз. {positions.get(m.id)} · {m.material} · {m.profile} · {m.length} мм</title></g>;
    }):null}
    {layers.dimensions?<><DrawingDimensions values={axes} y={H+pad*.35} font={font*.8} label="Оси стоек"/><g transform="rotate(90)"><DrawingDimensions values={[0,H]} y={pad*.55} font={font}/></g>
      {(surface.openings||[]).filter(o=>!o.gap).map(o=><g key={o.key}><DrawingDimensions values={[o.x,o.x+o.width]} y={yy(Number(o.sill))+font*1.6} font={font*.8}/><g transform="rotate(90)"><DrawingDimensions values={[0,yy(Number(o.sill)+o.height),yy(Number(o.sill)),H]} y={-o.x-o.width/2} font={font*.8}/></g></g>)}
    </>:null}
    <text x={W/2} y={top-font} textAnchor="middle" fontSize={font}>Вид сверху · {surface.frameProfile} мм</text>
    <rect x="0" y={top} width={W} height={depth} fill="#fff" stroke="#000" strokeWidth=".7" vectorEffect="non-scaling-stroke"/>
    {boards.filter(m=>Math.abs(m.a[0]-m.b[0])<.01&&m.a[1]<=Number(surface.frameProfile?.split(/[×xх]/)[0])+.1).map(m=>{const t=Number(m.profile.split(/[×xх]/)[0]);return <path key={m.id} d={`M${m.a[0]-t/2},${top}h${t}v${depth}h${-t}z m0,0 l${t},${depth} m0,${-depth} l${-t},${depth}`} fill="#faf5df" stroke="#000" strokeWidth=".5" vectorEffect="non-scaling-stroke"/>;})}
    {(surface.openings||[]).filter(o=>Number(o.sill)===0).map(o=><rect key={o.key} x={o.x} y={top} width={o.width} height={depth} fill="#eee" stroke="#000" strokeWidth=".5" vectorEffect="non-scaling-stroke"/>)}
    {layers.dimensions?<>{openingX.length>2?<DrawingDimensions values={openingX} y={top+depth+pad*.3} font={font*.8}/>:null}<DrawingDimensions values={[0,W]} y={top+depth+pad*.7} font={font}/><g transform="rotate(90)"><DrawingDimensions values={[top,top+depth]} y={pad*.55} font={font*.8}/></g></>:null}
  </g>;
}
export default function PartitionDrawing({surface,members}) {
  const size=Math.max(surface.width,surface.height,1000),pad=size*.24,font=size*.024,{depth}=partitionDrawingData(surface,members);
  return <svg className="technical-drawing" viewBox={`${-pad} ${-pad*.25} ${surface.width+2*pad} ${surface.height+2.5*pad+depth}`} role="img" aria-label={`Каркас и вид сверху · ${surface.name}`}><PartitionDrawingContents surface={surface} members={members} pad={pad} font={font}/></svg>;
}
