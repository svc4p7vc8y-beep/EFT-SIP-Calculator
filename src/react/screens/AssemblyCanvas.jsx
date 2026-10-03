import { useState } from 'react';

const layerNames={roof:'Контур кровли',rooms:'Стены и комнаты',openings:'Проёмы',rafters:'Стропила',laths:'Обрешётка',counterLaths:'Контробрешётка',supports:'Опоры',binding:'Обвязка',piles:'Фундамент',panels:'Панели потолка',labels:'Марки и размеры'};
export default function AssemblyCanvas({assembly,onPick,onMove,draft,initialFloor}) {
  const [floor,setFloor]=useState(initialFloor||assembly.floors.at(-1)?.floor||1);
  const [layers,setLayers]=useState(()=>Object.fromEntries(Object.keys(layerNames).map(k=>[k,true])));
  const plan=assembly.floors.find(p=>p.floor===floor)||assembly.floors[0];
  if(!plan?.contour.length)return <p>Задайте контур дома.</p>;
  const {x,y,width,height}=assembly.bounds,pad=Math.max(width,height)*.14,font=Math.max(width,height)*.02;
  const points=items=>items.map(p=>p.slice(0,2).join(',')).join(' ');
  const locate=(event,handler)=>{if(!handler)return;const svg=event.currentTarget,m=svg.getScreenCTM();if(!m)return;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const q=p.matrixTransform(m.inverse());handler(Math.round(q.x/10)*10,Math.round(q.y/10)*10);};
  const line=(a,b,props)=> <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} vectorEffect="non-scaling-stroke" {...props}/>;
  return <div className="cut-assembly"><div className="cut-tabs assembly-controls">{assembly.floors.map(p=><button key={p.floor} aria-pressed={floor===p.floor} onClick={()=>setFloor(p.floor)}>План {p.floor} этажа</button>)}<button onClick={()=>setLayers(Object.fromEntries(Object.keys(layerNames).map(k=>[k,true])))}>Все слои</button><button onClick={()=>setLayers(Object.fromEntries(Object.keys(layerNames).map(k=>[k,false])))}>Скрыть слои</button></div>
    <div className="cut-tabs assembly-controls">{Object.entries(layerNames).map(([key,name])=><label className="cut-check" key={key}><input type="checkbox" checked={layers[key]} onChange={e=>setLayers({...layers,[key]:e.target.checked})}/>{name}</label>)}</div>
    <svg viewBox={`${x-pad} ${y-pad} ${width+2*pad} ${height+2*pad}`} aria-label="Совмещённый монтажный план" role="img" onClick={e=>locate(e,onPick)} onPointerMove={e=>locate(e,onMove)} style={{cursor:onPick?'crosshair':'default'}}>
      {layers.roof?<polygon points={points(assembly.roofOutline)} fill="#eaf1f7" stroke="#345d86" strokeWidth="1" vectorEffect="non-scaling-stroke"/>:null}
      {layers.rooms?<><polygon points={points(plan.contour)} fill="white" fillOpacity=".6" stroke="#000" strokeWidth="2" vectorEffect="non-scaling-stroke"/>{plan.rooms.map((r,i)=><g key={i}><polygon points={points(r.points)} fill="none" stroke="#888" vectorEffect="non-scaling-stroke"/>{layers.labels?<text x={r.points.reduce((s,p)=>s+p[0],0)/r.points.length} y={r.points.reduce((s,p)=>s+p[1],0)/r.points.length} fontSize={font} textAnchor="middle">{r.name}</text>:null}</g>)}{(plan.bearing||[]).map((e,i)=>line(e.a,e.b,{key:i,stroke:'#25734d',strokeWidth:4}))}</>:null}
      {layers.panels?(assembly.panelLayers||[]).filter(p=>p.floor===floor).map(p=><path key={p.id} d={p.shape.map(r=>r.map((q,i)=>`${i?'L':'M'}${q.join(',')}`).join(' ')+'Z').join(' ')} fill="none" stroke="#609047" strokeWidth=".7" vectorEffect="non-scaling-stroke"/>):null}
      {layers.binding?(assembly.binding||[]).map(s=>line(s.a,s.b,{key:s.id,stroke:'#8c652d',strokeWidth:4})):null}
      {layers.piles?(assembly.piles||[]).map((p,i)=><rect key={i} x={p[0]-font*.15} y={p[1]-font*.15} width={font*.3} height={font*.3} fill="#333"/>):null}
      {layers.openings?plan.openings.map((o,i)=>{const v=o.orientation==='v';return line([o.x-(v?0:o.width/2),o.y-(v?o.width/2:0)],[o.x+(v?0:o.width/2),o.y+(v?o.width/2:0)],{key:i,stroke:o.type==='window'?'#347196':'#bd7b30',strokeWidth:5});}):null}
      {layers.rafters?assembly.rafters.map(r=>line(r.a,r.b,{key:r.id,stroke:'#879baf',strokeWidth:1})):null}
      {layers.laths?(assembly.laths||[]).map(r=>line(r.a,r.b,{key:r.id,stroke:'#a78747',strokeWidth:.7})):null}
      {layers.counterLaths?(assembly.counterLaths||[]).map(r=>line(r.a,r.b,{key:r.id,stroke:'#735534',strokeWidth:2})):null}
      {layers.roof&&assembly.ridge.length===2?line(...assembly.ridge,{stroke:'#345d86',strokeWidth:2,strokeDasharray:'8 4'}):null}
      {layers.supports?assembly.supports.map(s=><g key={s.id}>{line(s.a,s.b,{stroke:'#a85528',strokeWidth:3,strokeDasharray:'8 5'})}<circle cx={s.a[0]} cy={s.a[1]} r={font*.16} fill="#a85528"/>{layers.labels?<text x={(s.a[0]+s.b[0])/2} y={(s.a[1]+s.b[1])/2-font*.5} fontSize={font} textAnchor="middle">{s.mark} · {s.length} мм</text>:null}</g>):null}
      {draft?<g>{line(draft.a,draft.b,{stroke:'#000',strokeWidth:2,strokeDasharray:'6 4'})}<text x={draft.b[0]} y={draft.b[1]-font} fontSize={font}>{Math.round(Math.hypot(draft.b[0]-draft.a[0],draft.b[1]-draft.a[1]))} мм</text></g>:null}
      {layers.labels?<g><text x={x+width/2} y={y+height+pad*.65} fontSize={font} textAnchor="middle">{width} мм</text><text x={x-pad*.6} y={y+height/2} fontSize={font} textAnchor="middle" transform={`rotate(-90 ${x-pad*.6} ${y+height/2})`}>{height} мм</text></g>:null}
    </svg><p>Пунктир — проектные линии опор. Зелёным выделены выбранные несущие стены. Размеры в мм; несущую способность и узлы подтверждает проектировщик.</p>
  </div>;
}
