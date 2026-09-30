import { LINING_OFFERS } from '../data/sauna-options.js';

// Budget allowances requested by the user 30.09.2026, NOT installation norms
// or verified market averages. Existing project overrides always take priority.
export const SAUNA_BUDGET_PRICES = {
  insulation:9000,fasteners:1500,bench:12000,backrest:1500,stones:100,
  shield:3500,guard:3500,staples:350,frameFasteners:1500,lamp:2500,
  wire:200,drain:6000,vent:3500,chimneyStart:2500,chimneyPass:6500,
  chimneyRoof:4500,chimneyEnd:2500,chimneySupports:4000,chimneySeal:700,
};
export const SAUNA_OFFER_PRICES = {heater:42010,foilRoll:2100,tapeRoll:300,
  battenStock:280,counterStock:110,plinth:100,cornice:100,corner:170,casing:170,
  chimneySingle:2729,chimneyDamper:1522,chimneySandwich:2713};
const n=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;

export function automaticLining(room,s,reserve=1.1) {
  const area=n(room.settings.wallArea??room.wallArea)+n(room.settings.ceilingArea??room.ceilingArea);
  const height=n(room.saunaGeometry?.height)||2.5;
  const offer=LINING_OFFERS.find(o=>o.length>=height)||LINING_OFFERS.at(-1);
  const length=n(s.liningStock?.length)||offer.length;
  const chosen=LINING_OFFERS.find(o=>o.length===length)||offer;
  const width=n(s.liningStock?.workingWidth??88)/1000;
  const price=chosen[s.liningStock?.grade==='extra'?'extra':'a'];
  return {length:chosen.length,packs:width?Math.ceil(area*Math.max(1,n(reserve))/(width*chosen.length*10)-1e-9):0,price};
}

export function resolveSauna(room) {
  const raw=room.settings?.sauna||{};
  if(!raw.autoEstimate)return raw;
  const g=room.saunaGeometry||{}, height=n(g.height)||2.5;
  const area=n(room.settings.wallArea??room.wallArea)+n(room.settings.ceilingArea??room.ceilingArea);
  const perimeter=n(room.perimeter)||4*Math.sqrt(n(room.area));
  const above=n(g.upperHeight), ridge=n(g.ridgeHeight);
  // Conservative budget route to ridge + allowance. No actual exit coordinate exists.
  const dims={ceilingHeight:height,roofRise:above+ridge,aboveRoof:.5,inletHeight:.65,
    singleEffective:.95,sandwichEffective:.45,fittingsEffective:.3,passages:n(g.passages)||1};
  dims.aboveRoof=Math.max(.5,5-(height+dims.roofRise-dims.inletHeight));
  return {detailVersion:1,wood:'linden',materialMarkup:25,heaterType:'wood',
    heaterModel:'Везувий Скиф Ковка 16 Панорама М',liningMode:'auto',frameMode:'area',
    insulationThickness:50,battenStep:.6,counterStep:.4,stockMaterials:true,
    chimneyMode:'auto',benchLength:2,benchWidth:.6,benchTiers:2,...raw,
    quantities:{tape:area*1.5,fasteners:1,frameFasteners:1,staples:1,
      plinth:perimeter,cornice:perimeter,corner:height*4,casing:5,
      lamp:1,wire:perimeter+height*2,drain:1,vent:1,stones:100,shield:4,guard:1,...raw.quantities},
    chimneyDimensions:raw.chimneyMode==='parts'?raw.chimneyDimensions:{...dims,...raw.chimneyOverrides}};
}

export function enableAutoSauna(s={}) {
  // Switch only calculation modes; never overwrite user quantities/prices/geometry.
  return {...s,enabled:true,autoEstimate:true,detailVersion:1,
    liningMode:'auto',chimneyMode:'auto',frameMode:'area',stockMaterials:true,
    ...(s.heaterType==='none'&&!s.heaterModel?{heaterType:'wood',heaterModel:'Везувий Скиф Ковка 16 Панорама М'}:{})};
}
