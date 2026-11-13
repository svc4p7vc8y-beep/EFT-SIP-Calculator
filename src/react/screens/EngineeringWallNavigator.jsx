import { houseContourPoints } from '../planner/geometry.js';
export default function EngineeringWallNavigator({plan,walls,selected,onSelect}){
 const contour=houseContourPoints(plan),points=walls.flatMap(w=>[w.a,w.b]);if(!points.length)return null;
 const xs=points.map(p=>p.x*100),ys=points.map(p=>p.y*100),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
 const current=selected||walls[0]?.ref;
 return <section className="engineering-wall-navigator" aria-label="План выбора стены"><strong>План дома · выбор стены</strong><svg viewBox={`${x-35} ${y-35} ${width+70} ${height+70}`} role="img" aria-label="Нажмите стену или перегородку">
 <path d={contour.map((p,i)=>`${i?'L':'M'}${p.x*100} ${p.y*100}`).join(' ')+'Z'} fill="#f9f8ec" stroke="#899184" strokeWidth="3"/>
 {walls.filter(w=>w.type==='outer'||w.ref.endsWith('-0')).map(w=><g key={w.ref} role="button" tabIndex="0" aria-label={'Выбрать: '+w.label} onClick={()=>onSelect(w.ref)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(w.ref);}}}><line x1={w.a.x*100} y1={w.a.y*100} x2={w.b.x*100} y2={w.b.y*100} stroke={(current===w.ref||w.type==='partition'&&current.slice(0,-1)===w.ref.slice(0,-1))?'#5c8e31':w.type==='outer'?'#354538':'#9a9f90'} strokeWidth={current===w.ref?12:5}/><rect x={Math.min(w.a.x,w.b.x)*100-7} y={Math.min(w.a.y,w.b.y)*100-7} width={Math.abs(w.a.x-w.b.x)*100+14} height={Math.abs(w.a.y-w.b.y)*100+14} fill="transparent"><title>{w.label}</title></rect></g>)}
 </svg><small>{walls.find(w=>w.ref===current)?.label}</small></section>;
}
