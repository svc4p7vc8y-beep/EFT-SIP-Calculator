import { roomBearingEdges } from '../calculations/bearing-walls.js';

export default function BearingRoomControls({room,onChange}) {
  const edges=roomBearingEdges(room);
  const stale=Object.keys(room.bearingWalls||{}).some(key=>!edges.some(e=>e.key===key));
  return <details className="inspector-note"><summary>Несущие стороны комнаты и доска</summary>
    <p>Направления соответствуют плану: верх, низ, лево, право. Несущие участки выделены зелёным. Координаты в метрах; выбор опоры не подтверждает несущую способность.</p>
    {stale?<p>Контур изменился: прежние назначения сторон не применяются. Выберите несущие стены заново.</p>:null}
    {edges.map(edge=><div key={edge.key} style={{marginBottom:12}}>
      <label style={{display:'flex',gap:8,alignItems:'center',color:edge.bearing?'#006b3b':undefined}}><input type="checkbox" checked={edge.bearing} onChange={e=>onChange(edge.key,{enabled:e.target.checked,profile:edge.profile})}/><span>{edge.label}{edge.bearing?' · несущая':''}: ({edge.a.x}; {edge.a.y}) → ({edge.b.x}; {edge.b.y})</span></label>
      {edge.bearing?<label>Доска · {edge.label}<select value={edge.profile||''} onChange={e=>onChange(edge.key,{enabled:true,profile:e.target.value})}><option value="">Общее сечение перегородок</option><option value="50x100">50×100 мм</option><option value="50x150">50×150 мм</option><option value="50x200">50×200 мм</option></select></label>:null}
    </div>)}
  </details>;
}
