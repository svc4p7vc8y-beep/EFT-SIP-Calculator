import { LINING_OFFERS } from '../data/sauna-options.js';
export const positive = value => Number.isFinite(Number(value)) ? Math.max(0,Number(value)) : 0;
const ceil = value => Math.ceil(value-1e-9);

// Stock comparison for identical cuts; not nesting across different wall lengths.
export function liningOptions(area, settings={}, reserve=1.1) {
  const width=positive(settings.workingWidth)/1000, cut=positive(settings.cutLength);
  if(!width||width>.096||!cut)return [];
  const required=ceil(positive(area)*Math.max(1,positive(reserve))/(width*cut));
  const kerf=positive(settings.kerf)/1000;
  return LINING_OFFERS.flatMap(offer=>{
    const perBoard=Math.floor((offer.length+kerf+1e-9)/(cut+kerf));
    if(!perBoard)return [];
    const packs=ceil(required/(perBoard*10));
    const purchased=packs*10*offer.length;
    return [{...offer,packs,required,perBoard,waste:Math.max(0,purchased-required*cut),price:offer[settings.grade==='extra'?'extra':'a']}];
  }).sort((a,b)=>a.waste-b.waste||a.packs*a.price-b.packs*b.price);
}

// Geometry only. Fire distances, roof clearance and effective joint lengths are designer inputs.
export function chimneySchedule(c={}) {
  const warnings=[];
  for(const [key,label] of [['ceilingHeight','высоту потолка'],['roofRise','расстояние от потолка до кровли в месте выхода'],['aboveRoof','возвышение над кровлей'],['inletHeight','отметку патрубка печи'],['singleEffective','монтажную длину одностенной трубы'],['sandwichEffective','монтажную длину сэндвич-модуля']]) {
    if(c[key]==null||!Number.isFinite(Number(c[key]))||Number(c[key])<0||(key!=='roofRise'&&Number(c[key])===0))warnings.push(`Укажите ${label}.`);
  }
  if(warnings.length)return {valid:false,warnings,quantities:{},length:0};
  if(Number(c.singleEffective)>1||Number(c.sandwichEffective)>.5||c.fittingsEffective==null||!Number.isFinite(Number(c.fittingsEffective))||Number(c.fittingsEffective)<0){
    return {valid:false,warnings:['Монтажная длина не может превышать габарит (1 / 0,5 м). Укажите суммарную монтажную длину шибера и старта.'],quantities:{},length:0};
  }
  const length=positive(c.ceilingHeight)+positive(c.roofRise)+positive(c.aboveRoof)-positive(c.inletHeight);
  const single=positive(c.singleEffective), fittings=positive(c.fittingsEffective);
  if(length<=single+fittings||positive(c.inletHeight)+single+fittings>=positive(c.ceilingHeight))return {valid:false,warnings:['Проверьте отметки: переход на сэндвич должен быть ниже перекрытия, с отступом по рабочему узлу.'],quantities:{},length};
  const sandwichCount=ceil((length-single-fittings)/positive(c.sandwichEffective));
  if(sandwichCount>200)return {valid:false,warnings:['Проверьте размеры дымохода: более 200 модулей.'],quantities:{},length};
  return {valid:true,length,purchased:single+fittings+sandwichCount*positive(c.sandwichEffective),warnings:['Предварительная ведомость: проверить тягу, общую высоту от колосника, отступы, отсутствие стыков в проходках и опоры.'],quantities:{chimneySingle:1,chimneyDamper:1,chimneyStart:1,chimneySandwich:sandwichCount,chimneyPass:ceil(positive(c.passages)),chimneyRoof:1,chimneyEnd:1,chimneySupports:1,chimneySeal:1}};
}

export function saunaIncomplete(room,reserve=1.1){
  const s=room.settings?.sauna;
  if(!s?.enabled||s.detailVersion!==1||room.settings.enabled===false)return [];
  const result=[];
  const area=positive(room.settings.wallArea??room.wallArea)+positive(room.settings.ceilingArea??room.ceilingArea);
  if(area>0&&s.liningMode==='packs'&&!liningOptions(area,s.liningStock,reserve).some(o=>o.length===Number(s.liningStock?.length)))result.push('Вагонка не учтена: проверьте рабочую ширину, отрезок и выбранную длину упаковки.');
  if(area>0&&s.frameMode==='area'&&(!positive(s.insulationThickness)||!positive(s.battenStep)||!positive(s.counterStep)))result.push('Каркас/утеплитель учтены не полностью: заполните толщину и оба шага.');
  if(s.heaterType==='wood'&&s.chimneyMode==='parts'){
    const schedule=chimneySchedule(s.chimneyDimensions);
    if(!schedule.valid)result.push('Дымоход не учтён: заполните корректные отметки и монтажные длины.');
    else result.push('Дымоход — предварительная ведомость: требуются согласованные проходки, отступы, опоры, высота от колосника и проверка тяги.');
    if(!positive(s.chimneyDimensions?.passages))result.push('Проходы перекрытий дымохода не учтены.');
  }
  return result.map(text=>`${room.floor} этаж · ${room.name}: ${text}`);
}
