import {useId} from 'react';
import {sectionWidths,windowGeometry} from '../state/window-products.js';

// Local coordinates are millimetres, viewed from inside, Y up in elevations.
export default function WindowConstruction({product,plan=false,depth=150,selected=false}){
 const clip=useId().replace(/:/g,''),geometry=windowGeometry(product),w=Number(product.widthMm||product.baseWidthMm)||1,h=Math.max(...geometry.vertices.map(p=>p[1]),1),parts=sectionWidths(product),horizontal=product.sectionAxis==='horizontal';
 let offset=0;const bounds=parts.map((part,i)=>{const start=offset;offset+=part;return {start,end:offset,mode:product.sections[i]?.openingMode||'fixed'};});
 if(plan)return <g fill="none" stroke={selected?'#318343':'#3d7a88'} strokeWidth="18" pointerEvents="none"><rect x="0" y="0" width={w} height={depth} fill="#d7eff1"/><path d={`M0 ${depth*.35}H${w}M0 ${depth*.65}H${w}`}/>{!horizontal&&bounds.slice(0,-1).map(b=><path key={b.end} d={`M${b.end} 0V${depth}`}/>)}{!horizontal&&bounds.filter(b=>b.mode!=='fixed').map(b=><path key={b.start} d={`M${b.start} ${depth*.5}L${b.end} ${depth*.15}`} strokeDasharray="35 22"/>)}</g>;
 return <g pointerEvents="none"><defs><clipPath id={clip}><polygon points={geometry.vertices.map(p=>p.join(',')).join(' ')}/></clipPath></defs><polygon points={geometry.vertices.map(p=>p.join(',')).join(' ')} fill={selected?'#b3d9de':'#dceff2'} stroke="#3c707c" strokeWidth="35"/>
  <g clipPath={`url(#${clip})`} fill="none" stroke="#3c707c" strokeWidth="28">{bounds.slice(0,-1).map(b=><path key={b.end} d={horizontal?`M0 ${h-b.end}H${w}`:`M${b.end} 0V${h}`}/>)}
  {bounds.filter(b=>b.mode!=='fixed').map(b=>{const l=horizontal?0:b.start,r=horizontal?w:b.end,lo=horizontal?h-b.end:0,hi=horizontal?h-b.start:h,m=b.mode;return <g key={b.start} strokeWidth="12" strokeDasharray="40 25"><path d={m==='tilt'||m==='bottom_hinged_transom'?`M${l+30} ${hi-30}L${(l+r)/2} ${lo+30}L${r-30} ${hi-30}`:m.endsWith('_left')?`M${r-30} ${hi-30}L${l+30} ${(lo+hi)/2}L${r-30} ${lo+30}`:`M${l+30} ${hi-30}L${r-30} ${(lo+hi)/2}L${l+30} ${lo+30}`}/>{m.startsWith('tilt_turn')?<path d={`M${l+30} ${hi-30}L${(l+r)/2} ${lo+30}L${r-30} ${hi-30}`}/>:null}</g>;})}</g>
 </g>;
}
