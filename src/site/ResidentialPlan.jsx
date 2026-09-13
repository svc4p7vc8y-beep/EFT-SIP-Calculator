const number = (value) => value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

function Furniture({ room }) {
  const { x, y, w, h, kind } = room;
  return <g fill="#fffdf8" stroke="#b9ac96" strokeWidth=".025">
    {kind === 'bed' && <><rect x={x + .35} y={y + .25} width="1.6" height="2" rx=".07" /><path d={`M${x + .43} ${y + .65}h1.44`} strokeWidth=".22" /><rect x={x + w - .65} y={y + .2} width=".55" height={Math.min(1.4, h - .4)} /></>}
    {kind === 'living' && <><rect x={x + .15} y={y + .15} width={Math.min(w - .3, 3.3)} height=".6" /><circle cx={x + 1.3} cy={y + .45} r=".18" /><rect x={x + .4} y={y + h - 1.1} width="2.2" height=".85" rx=".1" /><rect x={x + w - 1.65} y={y + 1.1} width="1.4" height=".8" rx=".15" /></>}
    {kind === 'bath' && <><rect x={x + .15} y={y + h - 1.05} width=".9" height=".9" rx=".06" /><ellipse cx={x + w - .45} cy={y + h - .55} rx=".25" ry=".35" /><rect x={x + (w > 3 ? 1.7 : .15)} y={y + (h > 2 ? 1.15 : .12)} width=".55" height=".4" rx=".05" /></>}
    {kind === 'utility' && <><rect x={x + .15} y={y + h - .8} width=".65" height=".65" /><circle cx={x + .475} cy={y + h - .475} r=".22" /><rect x={x + 1} y={y + h - .8} width=".6" height=".6" /></>}
    {kind === 'hall' && w < 2 && <rect x={x + .05} y={y + .05} width={w - .1} height=".6" />}
  </g>;
}

export default function ResidentialPlan({ house }) {
  const { plan } = house;
  const iw = plan.width - .448, ih = plan.depth - .448;
  const doors = plan.entry === 'bottom'
    ? [{ x: 4.162, y: 5.7, vertical: true }, { x: 5.486, y: 1.5, vertical: true }, { x: 5.486, y: 3.25, vertical: true, size: .75 }, { x: 5.486, y: 5.65, vertical: true }, { x: 4.37, y: ih + .112, size: .95, exterior: true }]
    : [...[2.7, 6.75, 9.4].map(x => ({ x, y: 3.162 })), ...[6.8, 8.6, 10.7].map(x => ({ x, y: 4.386, size: .8 })), { x: iw + .112, y: 3.28, vertical: true, size: .95, exterior: true }];
  return <figure className="residential-plan">
    <svg viewBox={`-1 -1 ${plan.width + 1.6} ${plan.depth + 1.6}`} role="img" aria-label={`Планировка ${house.name}: ${house.rooms.join(', ')}`}>
      <g stroke="#92a095" strokeWidth=".015" fill="none"><path d={`M-.224 -.6H${iw + .224}M-.224 -.78V-.4M${iw + .224} -.78V-.4M-.6 -.224V${ih + .224}M-.78 -.224H-.4M-.78 ${ih + .224}H-.4`} /></g>
      <text x={iw / 2} y="-.72" textAnchor="middle" fontSize=".23" fill="#34473b">{number(plan.width)} м</text>
      <text transform={`translate(-.75 ${ih / 2}) rotate(-90)`} textAnchor="middle" fontSize=".23" fill="#34473b">{number(plan.depth)} м</text>
      <rect x="-.224" y="-.224" width={plan.width} height={plan.depth} fill="#34473b" />
      {plan.rooms.map((room, index) => <g key={room.name}><rect x={room.x} y={room.y} width={room.w} height={room.h} fill={room.kind === 'hall' ? '#f6f3ed' : room.kind === 'bath' || room.kind === 'utility' ? '#e6eeeb' : '#ede4d4'} /><Furniture room={room} /><circle cx={room.x + room.w - .25} cy={room.y + .25} r=".17" fill="#244b3b" /><text x={room.x + room.w - .25} y={room.y + .31} textAnchor="middle" fill="white" fontSize=".17">{index + 1}</text></g>)}
      <g stroke="#76aab5" strokeWidth=".13">
        {plan.entry === 'bottom' ? <><path d={`M.7 ${ih + .112}H3.5M6.2 ${ih + .112}H8.8M6.2 -.112H8.8`} /><path d="M-.112 1V2.5M-.112 4.5V6" /></> : <><path d={`M.7 ${ih + .112}H6.8M8.55 ${ih + .112}H9.55M10.6 ${ih + .112}H11.6`} />{[.9, 4.95, 9].map(x => <path key={x} d={`M${x} -.112h2`} />)}</>}
      </g>
      {doors.map((door, index) => { const size = door.size || .85; return <g key={index} transform={`translate(${door.x} ${door.y})${door.vertical ? ' rotate(90)' : ''}`}><path d={`M0 0H${size}`} stroke="#f6f3ed" strokeWidth={door.exterior ? .25 : .15} /><path d={`M0 0V${size}M0 ${size}A${size} ${size} 0 0 0 ${size} 0`} fill="none" stroke="#8c9b8c" strokeWidth=".025" /></g>; })}
      {plan.entry === 'bottom' ? <text x="4.85" y={ih + .65} textAnchor="middle" fontSize=".2" fill="#244b3b">↑ Вход</text> : <text x={iw + .48} y="4.15" transform={`rotate(-90 ${iw + .48} 4.15)`} fontSize=".2" fill="#244b3b">↑ Вход</text>}
    </svg>
    <ol className="plan-room-list">{plan.rooms.map(room => <li key={room.name}><span>{room.name}<small>{number(room.w)} × {number(room.h)} м</small></span><b>{number(room.area)} м²</b></li>)}</ol>
    <figcaption>Площадь помещений: {number(house.netArea)} м². Наружный контур: {house.grossArea} м². В эскизе приняты стены 224 мм и перегородки 124 мм; отделка не учтена. Размеры, конструкция и инженерия уточняются при разработке проекта.</figcaption>
  </figure>;
}
