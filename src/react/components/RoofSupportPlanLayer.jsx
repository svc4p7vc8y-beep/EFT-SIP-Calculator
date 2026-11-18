import {roofEditablePlanGroups,transformRoofMembers,roofGestureOperation,roofMemberLength,roofMemberAngle} from '../planner/roof-support-editor.js';

export default function RoofSupportPlanLayer({groups,selected,gesture,config,active,p,objectDown,scale}){
 const source=groups.flatMap(g=>g.members),ids=selected?.type==='roofSupport'?selected.ids||[selected.id]:[];
 let items=source;
 if(gesture?.type==='roofSupport')try{items=transformRoofMembers(source,gesture.ids||[gesture.id],roofGestureOperation(source,gesture,config),config);}catch{/* Keep the last valid source visible during an invalid stretch. */}
 return <g className="roof-support-editor-layer" pointerEvents={active?undefined:"none"}>{roofEditablePlanGroups(items).sort((a,b)=>Number(ids.includes(a.id))-Number(ids.includes(b.id))).map(group=>{
  const m=group.members[0],chosen=ids.includes(group.id)||ids.includes(m.planGroupId)||ids.includes(m.frameGroup),post=m.type==='post',a=p(group.a.x,group.a.y),b=p(group.b.x,group.b.y),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,L=Math.hypot(b.x-a.x,b.y-a.y),color=chosen?'#a04fc9':post?'#3f7862':'#4866bf';
  const radius=Math.max(9,Math.min(15,220/Math.max(10,scale))),handle=(q,label,kind,index)=><g role="button" aria-label={`${label} · ${group.name}`} onPointerDown={e=>objectDown(e,'roofSupport',group.id,{kind,index})}><circle cx={q.x} cy={q.y} r={Math.max(32,radius+10)} fill="transparent"/><circle cx={q.x} cy={q.y} r={radius} fill="#fff" stroke={color} strokeWidth="2"/><title>{label}</title></g>;
  const rotation={x:cx+(L?-(b.y-a.y)/L:0)*50,y:cy+(L?(b.x-a.x)/L:-1)*50};
  return <g key={group.id} data-roof-support-group={group.id} className="planner-object" onPointerDown={e=>objectDown(e,'roofSupport',group.id)}>
   <title>{group.name} · {m.profile} · {Math.round(roofMemberLength(m))} мм</title>
   <rect x={Math.min(a.x,b.x)-14} y={Math.min(a.y,b.y)-14} width={Math.abs(b.x-a.x)+28} height={Math.abs(b.y-a.y)+28} fill="none" pointerEvents="none"/>
   {post?<><circle cx={a.x} cy={a.y} r="18" fill="transparent"/><rect x={a.x-7} y={a.y-7} width="14" height="14" fill={chosen?'#efe0f8':'#fff'} stroke={color} strokeWidth="3"/></>:<><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="28"/><line pointerEvents="none" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={chosen?8:5}/></>}
   {active&&chosen?<>{!post&&handle(a,'Первый конец','roofEndpoint',0)}{!post&&handle(b,'Второй конец','roofEndpoint',1)}{!post?<line x1={cx} y1={cy} x2={rotation.x} y2={rotation.y} stroke={color} strokeDasharray="4 4" pointerEvents="none"/>:null}{!post&&handle(rotation,'Повернуть','roofRotate')}{handle({x:cx,y:cy},'Переместить','move')}<text x={cx+18} y={cy-22} fill="#40334d" stroke="#fff" strokeWidth="4" paintOrder="stroke" fontSize="14" pointerEvents="none">{Math.round(roofMemberLength(m))} мм · {Math.round(roofMemberAngle(m))}° · X {Math.round((Number(m.x1)+Number(m.x2))/2)}, Y {Math.round((Number(m.y1)+Number(m.y2))/2)}</text></>:null}
  </g>;
 })}</g>;
}
