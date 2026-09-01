import { polygonArea } from '../../calculations/plan-metrics.js';

const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 2) => Math.round(n(value) * 10 ** digits) / 10 ** digits;
const roomPoints = room => Array.isArray(room?.points) && room.points.length >= 3 ? room.points : [
  {x:n(room?.x),y:n(room?.y)}, {x:n(room?.x)+n(room?.w),y:n(room?.y)},
  {x:n(room?.x)+n(room?.w),y:n(room?.y)+n(room?.h)}, {x:n(room?.x),y:n(room?.y)+n(room?.h)},
];
const perimeter = points => points.reduce((sum,p,index)=>{const q=points[(index+1)%points.length];return sum+Math.hypot(q.x-p.x,q.y-p.y);},0);
const ceil = value => Math.ceil(Math.max(0, n(value)));

export const DEFAULT_INTERNAL = Object.freeze({
  assemblyVersion: 1,
  mode: 'rooms',
  reserve: 1.1,
  battenStep: 0.6,
  paintConsumption: 0.12,
  tileGlueConsumption: 4,
  waterproofConsumption: 1.5,
  drywallProfileRate: 2.4,
  includePreparation: true,
  includeThresholds: true,
  includeSlopes: true,
  slopeDepth: 0.2,
  stretchMinimumArea: 5,
  roomFinishes: {},
  wallArea: 300,
  ceilingArea: 72,
  laminateArea: 75,
  tileArea: 30,
  doors: 5,
});

export function inferInternalPreset(name='') {
  const value=String(name).toLocaleLowerCase('ru');
  const wet=/(сануз|ванн|душ|прачеч)/u.test(value);
  const utility=/(котель|бойлер|технич)/u.test(value);
  const hall=/(прихож|тамбур|коридор|холл)/u.test(value);
  return {
    enabled: true,
    floorFinish: wet || utility || hall ? 'tile' : 'laminate',
    floorSubstrate: wet || utility ? 'gvl20' : 'osb12',
    heatedFloor: false,
    skirting: !wet,
    wallsFinish: wet ? 'drywall' : 'timber',
    wallFrame: wet ? 'metal' : 'direct',
    wallInsulation: false,
    wallVaporBarrier: false,
    drywallType: wet ? 'moisture' : 'standard',
    drywallLayers: 1,
    wallFinal: wet ? 'tile' : 'none',
    wallPaintCoats: 0,
    timberPaintCoats: 0,
    wetZone: wet,
    waterproofFloor: wet,
    waterproofWallShare: wet ? 0.35 : 0,
    ceilingFinish: wet ? 'stretch' : 'stretch',
    ceilingFrame: 'wood25',
    ceilingPaintCoats: 0,
    ceilingVaporBarrier: false,
    stretchType: 'pvc',
    stretchLights: 0,
    stretchPipes: 0,
    curtainNicheLength: 0,
    wallArea: null,
    floorArea: null,
    ceilingArea: null,
  };
}

export function normalizeInternal(value={}) {
  const source=value && typeof value==='object'?value:{};
  return {...DEFAULT_INTERNAL,...source,roomFinishes:source.roomFinishes&&typeof source.roomFinishes==='object'?source.roomFinishes:{}};
}

export function internalRoomKey(floor, roomId) { return `${floor}:${roomId}`; }

export function resolveInternalRoom(settings, room) {
  const key=internalRoomKey(room.floor,room.id);
  return {...inferInternalPreset(room.name),...(settings.roomFinishes?.[key]||{})};
}

export function buildInternalRooms(project, metrics, settingsInput) {
  const settings=normalizeInternal(settingsInput);
  const floorCount=Math.max(1,Math.min(2,n(project.meta?.floors,1)));
  const plans=[project.plan,...(project.upperFloors||[]).slice(0,floorCount-1)];
  const openingAreaByFloor=metrics.floorPlans?.map(item=>n(item.metrics.exteriorOpeningsArea)+n(item.metrics.interiorOpeningsArea)*2)||[];
  const finishWallByFloor=metrics.floorPlans?.map(item=>n(item.metrics.exteriorWallNetArea)+n(item.metrics.partitionNetArea)*2)||[];
  const openingWidthByFloor=plans.map(plan=>(plan.openings||[]).filter(o=>o.type==='door'&&o.includeInEstimate!==false).reduce((sum,o)=>sum+n(o.width),0));
  const stairArea=n(metrics.secondFloorOpeningArea);
  return plans.flatMap((plan,floorIndex)=>{
    const floor=floorIndex+1;
    const included=(plan.rooms||[]).filter(room=>room.include!==false);
    const records=included.map(room=>{const points=roomPoints(room);return {floor,id:room.id,name:room.name||`Помещение ${room.id}`,area:polygonArea(points),perimeter:perimeter(points),ceilingMode:room.ceilingMode};});
    const totalArea=records.reduce((sum,item)=>sum+item.area,0);
    const totalPerimeter=records.reduce((sum,item)=>sum+item.perimeter,0);
    const floorArea=n(metrics.floorPlans?.[floorIndex]?.metrics.floorArea);
    const unassigned=Math.max(0,floorArea-totalArea);
    if(unassigned>.01) records.push({floor,id:'unassigned',name:'Нераспределённая площадь',area:unassigned,perimeter:0,ceilingMode:'flat'});
    if(!records.length&&floorArea>0) records.push({floor,id:'unassigned',name:'Нераспределённая площадь',area:floorArea,perimeter:n(metrics.floorPlans?.[floorIndex]?.metrics.perimeter),ceilingMode:'flat'});
    const denominator=records.reduce((sum,item)=>sum+(item.perimeter||Math.sqrt(item.area)*4),0)||1;
    return records.map(record=>{
      const weight=(record.perimeter||Math.sqrt(record.area)*4)/denominator;
      const openingShare=n(openingAreaByFloor[floorIndex])*weight;
      const finishWallArea=Math.max(0,n(finishWallByFloor[floorIndex])*weight);
      const openingWidth=n(openingWidthByFloor[floorIndex])*weight;
      const floorOpening=floorCount>1?stairArea*(record.area/(floorArea||totalArea||1)):0;
      const usableArea=Math.max(0,record.area-floorOpening);
      const ceilingArea=record.ceilingMode==='open-rafter'?0:usableArea;
      return {...record,area:round(usableArea,3),wallArea:round(finishWallArea,3),ceilingArea:round(ceilingArea,3),openingArea:round(openingShare,3),openingWidth:round(openingWidth,3),settings:resolveInternalRoom(settings,record)};
    });
  });
}

const line=(catalogId,key,qty,group,description,extra={})=>qty>0?{catalogId,key,qty,group,description,...extra}:null;
const stockTimber=(area,width,height,step,reserve)=>{const length=area/Math.max(.1,step);const purchased=ceil(length*reserve/6)*6;return purchased*width*height;};

export function calculateInternal(project, metrics, inputs) {
  const settings=normalizeInternal(project.settings.internal);
  if(settings.assemblyVersion!==1||settings.mode==='legacy') return {mode:'legacy',rooms:[],lines:[],totals:{floorArea:inputs.internal.laminateArea+inputs.internal.tileArea,wallArea:inputs.internal.wallArea,ceilingArea:inputs.internal.ceilingArea}};
  const reserve=Math.max(1,n(settings.reserve,1.1));
  const rooms=buildInternalRooms(project,metrics,settings);
  const lines=[];
  const add=(...args)=>{const value=line(...args);if(value)lines.push(value);};
  for(const room of rooms) {
    const s=room.settings;if(s.enabled===false)continue;
    const floorArea=Math.max(0,s.floorArea==null?room.area:n(s.floorArea));
    const wallArea=Math.max(0,s.wallArea==null?room.wallArea:n(s.wallArea));
    const ceilingArea=Math.max(0,s.ceilingArea==null?room.ceilingArea:n(s.ceilingArea));
    const roomLabel=`${room.floor} этаж · ${room.name}`;
    const floorGroup=`${roomLabel} · Пол`,wallGroup=`${roomLabel} · Стены`,ceilingGroup=`${roomLabel} · Потолок`;
    if(s.floorFinish!=='none'&&floorArea>0) {
      if(settings.includePreparation) add('LAB-119',`${room.floor}-${room.id}-floor-prep`,floorArea,floorGroup,'Подготовка основания пола');
      if(s.floorSubstrate==='osb12') {add('MAT-111',`${room.floor}-${room.id}-osb`,ceil(floorArea*reserve/3.125),floorGroup,'OSB-3 12 мм · лист 3,125 м²');add('MAT-218',`${room.floor}-${room.id}-osb-screws`,ceil(floorArea*20/500),floorGroup,'Крепёж OSB · 20 шт/м²');add('LAB-065',`${room.floor}-${room.id}-osb-work`,floorArea,floorGroup,'Монтаж OSB');}
      if(['gvl12','gvl20','gvl-double'].includes(s.floorSubstrate)) {const factor=s.floorSubstrate==='gvl-double'?2:1;const sheetArea=s.floorSubstrate==='gvl20'?.72:3;const id=s.floorSubstrate==='gvl20'?'MAT-207':'MAT-206';add(id,`${room.floor}-${room.id}-gvl`,ceil(floorArea*reserve*factor/sheetArea),floorGroup,'Основание ГВЛВ');add('MAT-214',`${room.floor}-${room.id}-gvl-screws`,ceil(floorArea*20*factor/500),floorGroup,'Крепёж ГВЛВ');add('MAT-230',`${room.floor}-${room.id}-gvl-glue`,ceil(floorArea*factor/20),floorGroup,'Клей соединений ГВЛВ');add('LAB-065',`${room.floor}-${room.id}-gvl-work`,floorArea*factor,floorGroup,'Монтаж основания ГВЛВ');}
      if(s.floorFinish==='laminate') {add('MAT-116',`${room.floor}-${room.id}-underlay`,floorArea*reserve,floorGroup,'Подложка под ламинат');add('MAT-108',`${room.floor}-${room.id}-laminate`,floorArea*reserve,floorGroup,'Ламинат');add('LAB-067',`${room.floor}-${room.id}-laminate-work`,floorArea,floorGroup,'Укладка ламината');}
      if(s.floorFinish==='tile') {add('MAT-215',`${room.floor}-${room.id}-floor-primer`,ceil(floorArea*.15/10),floorGroup,'Грунтовка пола');add('LAB-125',`${room.floor}-${room.id}-floor-primer-work`,floorArea,floorGroup,'Грунтование пола');if(s.waterproofFloor){add('MAT-103',`${room.floor}-${room.id}-waterproof`,ceil(floorArea*n(settings.waterproofConsumption,1.5)/20),floorGroup,'Гидроизоляция в два слоя');add('MAT-109',`${room.floor}-${room.id}-waterproof-tape`,room.perimeter*reserve,floorGroup,'Лента примыканий');add('LAB-057',`${room.floor}-${room.id}-waterproof-work`,floorArea,floorGroup,'Гидроизоляция пола');}add('MAT-115',`${room.floor}-${room.id}-tile-glue`,ceil(floorArea*n(settings.tileGlueConsumption,4)/25),floorGroup,'Плиточный клей');add('MAT-106',`${room.floor}-${room.id}-tile`,floorArea*reserve,floorGroup,'Керамогранит / плитка');add('MAT-104',`${room.floor}-${room.id}-grout`,ceil(floorArea*.3/2),floorGroup,'Затирка');add('MAT-216',`${room.floor}-${room.id}-sealant`,ceil(room.perimeter/10),floorGroup,'Герметик примыканий');add('LAB-062',`${room.floor}-${room.id}-tile-work`,floorArea,floorGroup,'Монтаж плитки');add('LAB-058',`${room.floor}-${room.id}-grout-work`,floorArea,floorGroup,'Затирка швов');add('LAB-126',`${room.floor}-${room.id}-seal-work`,room.perimeter,floorGroup,'Герметизация примыканий');}
      if(s.skirting){add('MAT-114',`${room.floor}-${room.id}-skirting`,ceil(Math.max(0,room.perimeter-room.openingWidth)*reserve/2.5),floorGroup,'Плинтус · планка 2,5 м');add('MAT-120',`${room.floor}-${room.id}-skirting-parts`,ceil(room.openingWidth*2+4),floorGroup,'Углы и соединители плинтуса');add('LAB-069',`${room.floor}-${room.id}-skirting-work`,Math.max(0,room.perimeter-room.openingWidth),floorGroup,'Монтаж плинтуса');}
    }
    if(s.wallsFinish==='timber'&&wallArea>0) {if(s.wallFrame==='wood25'){add('MAT-213',`${room.floor}-${room.id}-wall-batten`,stockTimber(wallArea,.025,.05,n(settings.battenStep,.6),reserve),wallGroup,'Брусок 25×50 · закупка хлыстами 6 м');add('LAB-060',`${room.floor}-${room.id}-wall-batten-work`,wallArea,wallGroup,'Монтаж обрешётки 25×50');}if(s.wallFrame==='wood50'){add('MAT-102',`${room.floor}-${room.id}-wall-batten`,stockTimber(wallArea,.05,.05,n(settings.battenStep,.6),reserve),wallGroup,'Брусок 50×50 · закупка хлыстами 6 м');add('LAB-128',`${room.floor}-${room.id}-wall-batten-work`,wallArea,wallGroup,'Монтаж обрешётки 50×50');}if(s.wallInsulation){add('MAT-100',`${room.floor}-${room.id}-wall-insulation`,wallArea*(s.wallFrame==='wood50'?.05:.025)*reserve,wallGroup,'Тепло- и звукоизоляция');add('LAB-127',`${room.floor}-${room.id}-wall-insulation-work`,wallArea,wallGroup,'Монтаж изоляции');}if(s.wallVaporBarrier){add('MAT-112',`${room.floor}-${room.id}-wall-vapor`,ceil(wallArea*reserve/70),wallGroup,'Пароизоляция по проектному решению');add('MAT-119',`${room.floor}-${room.id}-wall-vapor-staples`,ceil(wallArea/70),wallGroup,'Крепёж пароизоляции');add('LAB-064',`${room.floor}-${room.id}-wall-vapor-work`,wallArea,wallGroup,'Монтаж пароизоляции');}add('MAT-105',`${room.floor}-${room.id}-wall-timber`,wallArea*.016*reserve,wallGroup,'Имитация бруса');add('MAT-121',`${room.floor}-${room.id}-wall-pins`,ceil(wallArea/25),wallGroup,'Скрытый крепёж');add('MAT-231',`${room.floor}-${room.id}-wall-trim`,room.perimeter*.25*reserve,wallGroup,'Углы и обрамления');add('LAB-061',`${room.floor}-${room.id}-wall-timber-work`,wallArea,wallGroup,'Монтаж имитации бруса');const coats=ceil(s.timberPaintCoats);if(coats){add('MAT-107',`${room.floor}-${room.id}-wall-paint`,wallArea*n(settings.paintConsumption,.12)*coats*reserve,wallGroup,'Краска для дерева');add('MAT-118',`${room.floor}-${room.id}-wall-paint-kit`,1,wallGroup,'Расходные материалы для окраски');add('LAB-066',`${room.floor}-${room.id}-wall-paint-work`,wallArea*coats,wallGroup,'Окраска имитации бруса');}}
    if(s.wallsFinish==='drywall'&&wallArea>0) {if(s.wallFrame==='metal'){add('MAT-211',`${room.floor}-${room.id}-pp`,ceil(wallArea*n(settings.drywallProfileRate,2.4)/3),wallGroup,'Профиль ПП 60×27');add('MAT-212',`${room.floor}-${room.id}-pn`,ceil(wallArea*.7/3),wallGroup,'Профиль ПН 28×27');add('MAT-222',`${room.floor}-${room.id}-hangers`,ceil(wallArea*1.1),wallGroup,'Прямые подвесы');add('MAT-223',`${room.floor}-${room.id}-seal-tape`,ceil(wallArea*.04),wallGroup,'Уплотнительная лента');add('LAB-114',`${room.floor}-${room.id}-frame-work`,wallArea,wallGroup,'Монтаж металлического каркаса');}else if(s.wallFrame==='wood25'||s.wallFrame==='wood50'){const thick=s.wallFrame==='wood50'?.05:.025;add(s.wallFrame==='wood50'?'MAT-102':'MAT-213',`${room.floor}-${room.id}-drywall-batten`,stockTimber(wallArea,thick,.05,n(settings.battenStep,.6),reserve),wallGroup,'Деревянная обрешётка · хлысты 6 м');add(s.wallFrame==='wood50'?'LAB-128':'LAB-060',`${room.floor}-${room.id}-drywall-batten-work`,wallArea,wallGroup,'Монтаж деревянной обрешётки');}if(s.wallInsulation){add('MAT-100',`${room.floor}-${room.id}-drywall-insulation`,wallArea*(s.wallFrame==='wood50'?.05:.025)*reserve,wallGroup,'Тепло- и звукоизоляция');add('LAB-127',`${room.floor}-${room.id}-drywall-insulation-work`,wallArea,wallGroup,'Монтаж изоляции');}const boardId=s.drywallType==='moisture'?'MAT-209':s.drywallType==='fire'?'MAT-210':s.drywallType==='gvl'?'MAT-206':'MAT-208';const layers=Math.max(1,ceil(s.drywallLayers));add(boardId,`${room.floor}-${room.id}-drywall`,ceil(wallArea*layers*reserve/3),wallGroup,'Листовая облицовка');add('MAT-221',`${room.floor}-${room.id}-drywall-screws`,ceil(wallArea*32*layers/500),wallGroup,'Саморезы облицовки');add('LAB-115',`${room.floor}-${room.id}-drywall-work`,wallArea*layers,wallGroup,'Монтаж листов');add('MAT-219',`${room.floor}-${room.id}-putty`,ceil(wallArea*.8/20),wallGroup,'Шпаклёвка швов');add('MAT-220',`${room.floor}-${room.id}-joint-tape`,ceil(wallArea*2/50),wallGroup,'Армирующая лента');add('LAB-116',`${room.floor}-${room.id}-q2`,wallArea,wallGroup,'Заделка швов Q2');const final=s.wallFinal||'none';if(final==='paint'){const coats=Math.max(1,ceil(s.wallPaintCoats||2));add('MAT-219',`${room.floor}-${room.id}-finish-putty`,ceil(wallArea*1.2/20),wallGroup,'Финишная шпаклёвка');add('MAT-215',`${room.floor}-${room.id}-wall-primer`,ceil(wallArea*.15/10),wallGroup,'Грунтовка');add('MAT-224',`${room.floor}-${room.id}-wall-color`,wallArea*.12*coats*reserve,wallGroup,'Интерьерная краска');add('LAB-117',`${room.floor}-${room.id}-paint-prep`,wallArea,wallGroup,'Подготовка Q3/Q4');add('LAB-129',`${room.floor}-${room.id}-paint-work`,wallArea*coats,wallGroup,'Окраска стен');}if(final==='wallpaper'){add('MAT-225',`${room.floor}-${room.id}-wallpaper`,ceil(wallArea*reserve/5),wallGroup,'Обои');add('MAT-226',`${room.floor}-${room.id}-wallpaper-glue`,ceil(wallArea/30),wallGroup,'Клей для обоев');add('LAB-118',`${room.floor}-${room.id}-wallpaper-work`,wallArea,wallGroup,'Поклейка обоев');}if(final==='tile'){const tileWallArea=wallArea*Math.max(0,Math.min(1,n(s.waterproofWallShare,1)||1));if(s.wetZone){add('MAT-103',`${room.floor}-${room.id}-wall-waterproof`,ceil(tileWallArea*n(settings.waterproofConsumption,1.5)/20),wallGroup,'Гидроизоляция стен');add('LAB-057',`${room.floor}-${room.id}-wall-waterproof-work`,tileWallArea,wallGroup,'Гидроизоляция стен');}add('MAT-115',`${room.floor}-${room.id}-wall-tile-glue`,ceil(tileWallArea*n(settings.tileGlueConsumption,4)/25),wallGroup,'Плиточный клей');add('MAT-106',`${room.floor}-${room.id}-wall-tile`,tileWallArea*reserve,wallGroup,'Плитка стен');add('LAB-062',`${room.floor}-${room.id}-wall-tile-work`,tileWallArea,wallGroup,'Монтаж плитки стен');}}
    if(s.ceilingFinish==='timber'&&ceilingArea>0){if(s.ceilingFrame==='wood25'||s.ceilingFrame==='wood50'){const is50=s.ceilingFrame==='wood50';add(is50?'MAT-102':'MAT-213',`${room.floor}-${room.id}-ceiling-frame`,stockTimber(ceilingArea,is50?.05:.025,.05,n(settings.battenStep,.6),reserve),ceilingGroup,'Обрешётка потолка · хлысты 6 м');add(is50?'LAB-059':'LAB-060',`${room.floor}-${room.id}-ceiling-frame-work`,ceilingArea,ceilingGroup,'Монтаж обрешётки потолка');}if(s.ceilingVaporBarrier){add('MAT-112',`${room.floor}-${room.id}-ceiling-vapor`,ceil(ceilingArea*reserve/70),ceilingGroup,'Пароизоляция потолка');add('MAT-119',`${room.floor}-${room.id}-ceiling-vapor-staples`,ceil(ceilingArea/70),ceilingGroup,'Крепёж пароизоляции');add('LAB-064',`${room.floor}-${room.id}-ceiling-vapor-work`,ceilingArea,ceilingGroup,'Монтаж пароизоляции потолка');}add('MAT-105',`${room.floor}-${room.id}-ceiling-timber`,ceilingArea*.016*reserve,ceilingGroup,'Имитация бруса потолка');add('LAB-061',`${room.floor}-${room.id}-ceiling-timber-work`,ceilingArea,ceilingGroup,'Монтаж имитации бруса потолка');const coats=ceil(s.ceilingPaintCoats);if(coats){add('MAT-107',`${room.floor}-${room.id}-ceiling-paint`,ceilingArea*n(settings.paintConsumption,.12)*coats*reserve,ceilingGroup,'Краска потолка');add('LAB-066',`${room.floor}-${room.id}-ceiling-paint-work`,ceilingArea*coats,ceilingGroup,'Окраска потолка');}}
    if(s.ceilingFinish==='stretch'&&ceilingArea>0){const chargedArea=Math.max(ceilingArea,n(settings.stretchMinimumArea,5));add(s.stretchType==='fabric'?'MAT-233':'MAT-110',`${room.floor}-${room.id}-stretch`,chargedArea*reserve,ceilingGroup,'Полотно натяжного потолка');add('MAT-117',`${room.floor}-${room.id}-stretch-profile`,room.perimeter*reserve,ceilingGroup,'Профиль натяжного потолка');add('LAB-063',`${room.floor}-${room.id}-stretch-work`,chargedArea,ceilingGroup,'Монтаж натяжного потолка');add('MAT-227',`${room.floor}-${room.id}-stretch-lights`,ceil(s.stretchLights),ceilingGroup,'Платформы светильников');add('LAB-122',`${room.floor}-${room.id}-stretch-lights-work`,ceil(s.stretchLights),ceilingGroup,'Монтаж светильников');add('MAT-228',`${room.floor}-${room.id}-stretch-pipes`,ceil(s.stretchPipes),ceilingGroup,'Обходы труб');add('LAB-123',`${room.floor}-${room.id}-stretch-pipes-work`,ceil(s.stretchPipes),ceilingGroup,'Монтаж обходов труб');add('MAT-229',`${room.floor}-${room.id}-curtain-niche`,n(s.curtainNicheLength),ceilingGroup,'Профиль ниши карниза');add('LAB-124',`${room.floor}-${room.id}-curtain-niche-work`,n(s.curtainNicheLength),ceilingGroup,'Монтаж ниши карниза');}
  }
  const doors=Math.max(0,n(inputs.internal.doors));
  add('MAT-180','doors',doors,'Межкомнатные двери','Комплект межкомнатной двери');add('LAB-068','doors-work',doors,'Межкомнатные двери','Установка межкомнатной двери');add('MAT-050','doors-fasteners',doors,'Межкомнатные двери','Комплект крепежа двери');if(settings.includeThresholds){add('MAT-217','doors-threshold',doors,'Межкомнатные двери','Пороги');add('LAB-120','doors-threshold-work',doors,'Межкомнатные двери','Монтаж порогов');}
  if(settings.includeSlopes){const plans=[project.plan,...(project.upperFloors||[]).slice(0,Math.max(0,n(project.meta?.floors,1)-1))];const slopeLength=plans.flatMap(plan=>plan.openings||[]).filter(opening=>opening.includeInEstimate!==false&&(opening.outer!==false)&&(opening.type==='window'||opening.type==='door')).reduce((sum,opening)=>sum+n(opening.width)+2*n(opening.height),0);const slopeArea=slopeLength*Math.max(.05,n(settings.slopeDepth,.2));add('MAT-208','opening-slopes-board',ceil(slopeArea*reserve/3),'Откосы окон и входных дверей','Гипсокартон для откосов');add('MAT-219','opening-slopes-putty',ceil(slopeArea*1.2/20),'Откосы окон и входных дверей','Шпаклёвка откосов');add('MAT-215','opening-slopes-primer',ceil(slopeArea*.15/10),'Откосы окон и входных дверей','Грунтовка откосов');add('LAB-121','opening-slopes-work',slopeLength,'Откосы окон и входных дверей','Отделка откосов');}
  return {mode:'rooms',rooms,lines:lines.filter(Boolean),totals:{floorArea:round(rooms.reduce((sum,r)=>sum+n(r.settings.floorArea==null?r.area:r.settings.floorArea),0)),wallArea:round(rooms.reduce((sum,r)=>sum+n(r.settings.wallArea==null?r.wallArea:r.settings.wallArea),0)),ceilingArea:round(rooms.reduce((sum,r)=>sum+n(r.settings.ceilingArea==null?r.ceilingArea:r.settings.ceilingArea),0))}};
}
