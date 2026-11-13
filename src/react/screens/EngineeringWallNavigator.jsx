import {houseContourPoints,roomPoints} from '../planner/geometry.js';
import {roomWallFaces} from '../state/placement-walls.js';
export default function EngineeringWallNavigator({plan,walls,rooms=[],roomId='',onRoom,selected,onSelect}){
 const contour=houseContourPoints(plan),points=walls.flatMap(w=>[w.a,w.b]);if(!points.length)return null;
 const xs=points.map(p=>p.x*100),ys=points.map(p=>p.y*100),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
 const room=rooms.find(r=>r.id===roomId),choices=roomWallFaces(room,walls),path=ps=>ps.map((p,i)=>`${i?'L':'M'}${p.x*100} ${p.y*100}`).join(' ')+'Z';
 const pick=(e,action)=>{if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();action();};
 return <section className="engineering-wall-navigator" aria-label="План выбора стены"><strong>{room?`${room.name} · выберите стену`:'1. Выберите комнату · 2. Стену'}</strong><svg viewBox={`${x-35} ${y-35} ${width+70} ${height+70}`} role="img" aria-label="Комнаты и стены дома">
 <path d={path(contour)} fill="#f9f8ec" stroke="#899184" strokeWidth="3"/>
 {rooms.map(r=>{const ps=roomPoints(r),cx=ps.reduce((n,p)=>n+p.x,0)/ps.length,cy=ps.reduce((n,p)=>n+p.y,0)/ps.length;return <g key={r.id} role="button" tabIndex="0" aria-label={'Выбрать комнату: '+r.name} onClick={e=>pick(e,()=>onRoom(r.id))} onKeyDown={e=>pick(e,()=>onRoom(r.id))}><path d={path(ps)} fill={roomId===r.id?'#a4d9a8':'#eef1e5'} stroke="#aab5a3" strokeWidth="2"/><text x={cx*100} y={cy*100} textAnchor="middle" style={{fontSize:22,pointerEvents:'none'}}>{r.name}</text></g>;})}
 {(room||!rooms.length?choices:[]).map(w=><g key={w.ref} role="button" tabIndex="0" aria-label={'Выбрать: '+w.label} onClick={e=>pick(e,()=>onSelect(w.ref))} onKeyDown={e=>pick(e,()=>onSelect(w.ref))}><line x1={w.a.x*100} y1={w.a.y*100} x2={w.b.x*100} y2={w.b.y*100} stroke={selected===w.ref?'#cc7627':'#354538'} strokeWidth={selected===w.ref?12:5}/><rect x={Math.min(w.a.x,w.b.x)*100-18} y={Math.min(w.a.y,w.b.y)*100-18} width={Math.abs(w.a.x-w.b.x)*100+36} height={Math.abs(w.a.y-w.b.y)*100+36} fill="transparent"><title>{w.label}</title></rect></g>)}
 </svg><small>{walls.find(w=>w.ref===selected)?.label||'Можно также выбрать комнату и стену в параметрах.'}</small>{room&&<button type="button" onClick={()=>onRoom('')}>Все комнаты</button>}</section>;
}
