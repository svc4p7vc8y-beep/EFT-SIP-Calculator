import {outletAnchor} from './engineering-outlets.js';
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
  'heating-hydro-tank': [{...port('heating','return','Подключение отопления'),side:'bottom'}],
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
    const anchor=outletAnchor(item,index,definitions.length,definition);
    const location = definition.system === 'plumbing' ? { x: item.x + offset, y: item.y + item.depth / 2 + reach }
      : definition.system === 'heating' ? { x: item.x + offset, y: item.y - item.depth / 2 - reach }
        : definition.system === 'sewer' ? { x: item.x + item.width / 2 + reach, y: item.y + offset }
          : { x: item.x - item.width / 2 - reach, y: item.y + offset };
    let connectorU,connectorV;
    let height=item.displayPlane==='wall'?(Number(item.height)||0):0;
    if(wall){
      const size=engineeringSymbolSize(item),side=anchor.side;
      const u=(anchor.x-.5)*size.width/100,v=(.5-anchor.y)*size.height/100;
      const angle=(Number(item.rotation)||0)*Math.PI/180,along=u*Math.cos(angle)+v*Math.sin(angle),up=-u*Math.sin(angle)+v*Math.cos(angle);
      const sideU=side==='left'?-1:side==='right'?1:0,sideV=side==='top'?1:side==='bottom'?-1:0;
      connectorU=sideU*Math.cos(angle)+sideV*Math.sin(angle);connectorV=-sideU*Math.sin(angle)+sideV*Math.cos(angle);
      const ux=wall.length?(wall.b.x-wall.a.x)/wall.length:-wall.normal.y,uy=wall.length?(wall.b.y-wall.a.y)/wall.length:wall.normal.x;
      const baseHeight=(Number(item.height)||0)+(item.displayPlane!=='wall'&&!item.heightKnown?size.height/200:0);
      const origin=item.displayPlane==='wall'?item:{x:wall.a.x+ux*((item.x-wall.a.x)*ux+(item.y-wall.a.y)*uy)+wall.normal.x*.03,y:wall.a.y+uy*((item.x-wall.a.x)*ux+(item.y-wall.a.y)*uy)+wall.normal.y*.03};
      location.x=origin.x+ux*along;location.y=origin.y+uy*along;height=Math.max(0,baseHeight+up);
    }
    return {
      id: `port-${item.id}-${index}`, floor: item.floor, layer: definition.system,
      connectionMaterial:anchor.material??item.connectionMaterial??'',connectionThread:anchor.thread??item.connectionThread??'',connectionGender:anchor.gender??item.connectionGender??'',connectionDiameterMm:anchor.diameterMm??item.connectionDiameterMm??null,portIndex:index,connectorU,connectorV,kind: 'connection-port', label: `${item.label || item.kind} · ${definition.label}`,
      x: Math.round(location.x * 1000) / 1000, y: Math.round(location.y * 1000) / 1000,
      width: .12, depth: .12, rotation: 0, height: Math.round(height*1000)/1000, heightKnown: item.displayPlane==='wall'&&item.heightKnown===true,
      displayPlane:item.displayPlane==='wall'?'wall':'auto',
      wallRef: item.wallRef || '', surface: 'interior', dimensionSide: 'auto',
      showHeight: false, showName: false, labelOffsetX: .65, labelOffsetY: -.45,
      linkedApplianceId: item.id, followsAppliance: true, connectionMedium: anchor.medium||definition.medium,
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

// Explicit outlet edits keep the connector attached and retain its stable route endpoint ID.
export function refreshDeviceOutlets(items,id,wall) {
 const owner=items.find(i=>i.id===id);if(!owner)return;
 const generated=new Map(connectionPortsFor(owner,wall).map(p=>[p.id,p]));
 for(const port of items.filter(i=>i.kind==='connection-port'&&i.linkedApplianceId===id)){
  const next=generated.get(port.id);if(next)Object.assign(port,next);
 }
}
