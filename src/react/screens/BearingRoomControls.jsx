import { roomBearingEdges } from '../calculations/bearing-walls.js';

export default function BearingRoomControls({room,onChange}) {
  const edges=roomBearingEdges(room);
  const stale=Object.keys(room.bearingWalls||{}).some(key=>!edges.some(e=>e.key===key));
  return <details className="inspector-note"><summary>Несущие стороны комнаты и доска</summary>
    <p>Стороны по обходу контура, координаты в метрах. Выбор задаёт опору потолка, но не подтверждает несущую способность. Сметный расход распределяется по длинам стен; раскрой проверяется отдельно.</p>
    {stale?<p>Контур изменился: прежние назначения сторон не применяются. Выберите несущие стены заново.</p>:null}
    {edges.map(edge=><div key={edge.key} style={{marginBottom:12}}>
      <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={edge.bearing} onChange={e=>onChange(edge.key,{enabled:e.target.checked,profile:edge.profile})}/><span>Сторона {edge.index+1}: ({edge.a.x}; {edge.a.y}) → ({edge.b.x}; {edge.b.y})</span></label>
      {edge.bearing?<label>Доска стороны {edge.index+1}<select value={edge.profile||''} onChange={e=>onChange(edge.key,{enabled:true,profile:e.target.value})}><option value="">Общее сечение перегородок</option><option value="50x100">50×100 мм</option><option value="50x150">50×150 мм</option><option value="50x200">50×200 мм</option></select></label>:null}
    </div>)}
  </details>;
}
