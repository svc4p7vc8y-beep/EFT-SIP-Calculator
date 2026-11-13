import {INLINE_FITTING_KINDS} from '../data/pipe-components.js';
import {engineeringSymbolSize} from './engineering-symbol-size.js';
// Planning connection points only. Their heights and sizes remain project inputs.
const port = (system, medium, label) => ({ system, medium, label });

const waterPair = [port('plumbing', 'cold', 'ХВС'), port('plumbing', 'hot', 'ГВС')];
const heatPair = [port('heating', 'supply', 'Подача'), port('heating', 'return', 'Обратка')];
const drain = port('sewer', 'waste', 'Сток');

export const CONNECTION_PORTS = {
  'hydro-tank': [{...port('plumbing', 'cold', 'Подключение ХВС'),side:'bottom'}],
  'expansion-tank': [port('heating', 'return', 'Подключение обратки')],
  'heat-pump': heatPair,
  boiler: [...heatPair, ...waterPair],
  'electric-boiler': [{...port('heating','return','Вход обратки'),side:'bottom'},{...port('heating','supply','Выход подачи'),side:'top'}],
  'heating-hydro-tank': [port('heating','return','Подключение отопления')],
  'pressure-switch': [port('plumbing','cold','Подключение давления')],
  'heat-safety-group': [port('heating','supply','Вход группы безопасности')],
  'radiator-point': heatPair,
  'heat-source': heatPair,
  'water-heater-point': waterPair,
  'water-heater': waterPair,
  manifold: [port('plumbing', 'cold', 'Вход ХВС'), port('plumbing', 'hot', 'Выход ГВС')],
  pump: [port('plumbing', 'cold', 'Вход'), port('plumbing', 'cold', 'Выход')],
  'water-filter': [port('plumbing', 'cold', 'Вход ХВС'), port('plumbing', 'cold', 'Выход ХВС')],
  bathtub: [...waterPair, drain],
  'corner-bathtub': [...waterPair, drain],
  shower: [...waterPair, drain],
  'walk-in-shower': [...waterPair, drain],
  'bathroom-sink': [...waterPair, drain],
  'double-sink': [...waterPair, drain],
  vanity: [...waterPair, drain],
  'kitchen-sink': [...waterPair, drain],
  bidet: [...waterPair, drain],
  toilet: [port('plumbing', 'cold', 'ХВС'), drain],
  'wall-toilet': [port('plumbing', 'cold', 'ХВС'), drain],
  dishwasher: [port('plumbing', 'cold', 'ХВС'), drain],
  washer: [port('plumbing', 'cold', 'ХВС')],
  'washer-dryer': [port('plumbing', 'cold', 'ХВС'), drain],
  'vent-unit': [port('ventilation', 'supply-air', 'Приток'), port('ventilation', 'extract-air', 'Вытяжка')],
  hood: [port('ventilation', 'extract-air', 'Вытяжка')],
  'air-conditioner': [port('sewer', 'waste', 'Конденсат')],
};

export function connectionPortsFor(item, wall = null) {
  const inline=INLINE_FITTING_KINDS.has(item?.kind);
  const allowed=item.layer==='heating'?['supply','return']:item.layer==='sewer'?['waste','vent-stack']:['cold','hot','recirculation'];
  const medium=allowed.includes(item.connectionMedium)?item.connectionMedium:allowed[0];
  const definitions = CONNECTION_PORTS[item?.kind] || (inline?[{...port(item.layer,medium,'Вход'),side:'left'},{...port(item.layer,medium,'Выход'),side:'right'},...(/tee/.test(item.kind)?[{...port(item.layer,medium,'Ответвление'),side:'top'}]:[])]:[]);
  return definitions.map((definition, index) => {
    const siblings = definitions.filter(entry => entry.system === definition.system);
    const station = siblings.indexOf(definition);
    const offset = (station - (siblings.length - 1) / 2) * .18;
    const reach = .12;
    const location = definition.system === 'plumbing' ? { x: item.x + offset, y: item.y + item.depth / 2 + reach }
      : definition.system === 'heating' ? { x: item.x + offset, y: item.y - item.depth / 2 - reach }
        : definition.system === 'sewer' ? { x: item.x + item.width / 2 + reach, y: item.y + offset }
          : { x: item.x - item.width / 2 - reach, y: item.y + offset };
    let connectorU,connectorV;
    let height=item.displayPlane==='wall'?(Number(item.height)||0):0;
    if(item.displayPlane==='wall'&&wall){
      const size=engineeringSymbolSize(item),side=definition.side||'bottom',siblingsOnSide=definitions.filter(d=>(d.side||'bottom')===side),slot=siblingsOnSide.indexOf(definition)-(siblingsOnSide.length-1)/2;
      let u=side==='left'?-size.width/200:side==='right'?size.width/200:slot*Math.min(.18,(item.width||.2)/Math.max(2,siblingsOnSide.length));
      let v=side==='top'?size.height/200:side==='bottom'?-size.height/200:0;
      const angle=(Number(item.rotation)||0)*Math.PI/180,along=u*Math.cos(angle)+v*Math.sin(angle),up=-u*Math.sin(angle)+v*Math.cos(angle);
      const sideU=side==='left'?-1:side==='right'?1:0,sideV=side==='top'?1:side==='bottom'?-1:0;
      connectorU=sideU*Math.cos(angle)+sideV*Math.sin(angle);connectorV=-sideU*Math.sin(angle)+sideV*Math.cos(angle);
      const ux=wall.length?(wall.b.x-wall.a.x)/wall.length:-wall.normal.y,uy=wall.length?(wall.b.y-wall.a.y)/wall.length:wall.normal.x;
      location.x=item.x+ux*along;location.y=item.y+uy*along;height=Math.max(0,(Number(item.height)||0)+up);
    }
    if(wall&&item.displayPlane!=='wall'){
      const ux=wall.length?(wall.b.x-wall.a.x)/wall.length:-wall.normal.y,uy=wall.length?(wall.b.y-wall.a.y)/wall.length:wall.normal.x;
      const station=Math.max(0,Math.min(wall.length||Infinity,(item.x-(wall.a?.x||0))*ux+(item.y-(wall.a?.y||0))*uy));
      location.x=(wall.a?.x||0)+ux*(station+offset)+wall.normal.x*.03;location.y=(wall.a?.y||0)+uy*(station+offset)+wall.normal.y*.03;
    }
    return {
      id: `port-${item.id}-${index}`, floor: item.floor, layer: definition.system,
      connectionMaterial:item.connectionMaterial||'',connectionDiameterMm:item.connectionDiameterMm||null,connectorU,connectorV,kind: 'connection-port', label: `${item.label || item.kind} · ${definition.label}`,
      x: Math.round(location.x * 100) / 100, y: Math.round(location.y * 100) / 100,
      width: .12, depth: .12, rotation: 0, height: Math.round(height*1000)/1000, heightKnown: item.displayPlane==='wall'&&item.heightKnown===true,
      displayPlane:item.displayPlane==='wall'?'wall':'auto',
      wallRef: item.wallRef || '', surface: 'interior', dimensionSide: 'auto',
      showHeight: false, showName: false, labelOffsetX: .65, labelOffsetY: -.45,
      linkedApplianceId: item.id, followsAppliance: true, connectionMedium: definition.medium,
    };
  });
}

export function addMissingConnectionPorts(items,wallFor=()=>null,used=new Set()) {
  const ids=new Set(items.map(item=>item.id)),owners=new Map(items.map(i=>[i.id,i]));
  const generated=items.flatMap(item=>connectionPortsFor(item,wallFor(item))),byId=new Map(generated.map(i=>[i.id,i]));
  const preserved=items.map(item=>{
    const parent=owners.get(item.linkedApplianceId),next=byId.get(item.id);
    if(item.kind!=='connection-port'||!item.followsAppliance||used.has(item.id)||!next||!parent||!wallFor(parent))return item;
    return {...item,x:next.x,y:next.y,height:next.height,heightKnown:next.heightKnown,connectorU:next.connectorU,connectorV:next.connectorV,displayPlane:'wall'};
  });
  return [...preserved,...generated.filter(item=>!ids.has(item.id))];
}
