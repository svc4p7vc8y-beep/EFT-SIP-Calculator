import reference from '../data/window-reference-273803.json' with {type:'json'};
import {WINDOW_DESIGN_LIBRARY} from '../data/window-design-library.js';

export const WINDOW_REFERENCE = reference;
export const WINDOW_SHAPES = [
  {id:'rectangle',label:'Прямоугольник'},
  {id:'trapezoid_sloped_top',label:'Трапеция'},
  {id:'triangle',label:'Треугольник'},
];
export const WINDOW_OPENINGS = [
  {id:'fixed',label:'Глухая'}, {id:'turn_left',label:'Поворотная левая'},
  {id:'turn_right',label:'Поворотная правая'}, {id:'tilt',label:'Откидная'},
  {id:'tilt_turn_left',label:'Поворотно-откидная левая'},
  {id:'tilt_turn_right',label:'Поворотно-откидная правая'},
  {id:'bottom_hinged_transom',label:'Фрамуга'},
];
const basis = reference.basis;
const positive = value => Number.isFinite(Number(value)) && Number(value)>0;
const round = (n,d=2) => Math.round((n+Number.EPSILON)*10**d)/10**d;

export function windowPolygon(product) {
  const w=Number(product.widthMm||product.baseWidthMm), h=Number(product.heightMm);
  if(!positive(w)) return [];
  if(product.shape==='trapezoid_sloped_top') {
    const left=Number(product.leftHeightMm), right=Number(product.rightHeightMm);
    return positive(left)&&positive(right)?[[0,0],[w,0],[w,right],[0,left]]:[];
  }
  if(product.shape==='triangle') {
    const apex=Number(product.apexPosition??.5);
    return positive(h)&&apex>=0&&apex<=1?[[0,0],[w,0],[w*apex,h]]:[];
  }
  return positive(h)?[[0,0],[w,0],[w,h],[0,h]]:[];
}
export function windowGeometry(product) {
  const vertices=windowPolygon(product);
  if(vertices.length<3) return {vertices,areaM2:0,perimeterMm:0};
  let area=0,perimeter=0;
  for(let i=0;i<vertices.length;i++) {
    const [x,y]=vertices[i], [nextX,nextY]=vertices[(i+1)%vertices.length];
    area+=x*nextY-nextX*y;
    perimeter+=Math.hypot(nextX-x,nextY-y);
  }
  return {vertices,areaM2:Math.abs(area)/2/1e6,perimeterMm:perimeter};
}
export function sectionWidths(product) {
  const width=Number(product.sectionAxis==='horizontal'?product.heightMm:(product.widthMm||product.baseWidthMm))||0;
  const sections=product.sections||[];
  const fixedTotal=sections.reduce((sum,s)=>sum+(positive(s.widthMm)?Number(s.widthMm):0),0);
  const flexible=sections.filter(s=>!positive(s.widthMm));
  const flexibleTotal=flexible.reduce((sum,s)=>sum+(positive(s.ratio)?Number(s.ratio):1),0);
  return sections.map(s=>positive(s.widthMm)?Number(s.widthMm):flexibleTotal?Math.max(0,width-fixedTotal)*(positive(s.ratio)?Number(s.ratio):1)/flexibleTotal:0);
}
export function validateWindow(product) {
  const errors=[];
  if(!windowPolygon(product).length) errors.push('Укажите положительные размеры и допустимую форму.');
  if(product.sectionAxis==='horizontal'&&product.shape!=='rectangle') errors.push('Горизонтальное деление нестандартной формы требует проверки изготовителя.');
  if(!Array.isArray(product.sections)||!product.sections.length) errors.push('Добавьте хотя бы одну секцию.');
  if(product.sections?.some(s=>!WINDOW_OPENINGS.some(mode=>mode.id===s.openingMode))) errors.push('Неизвестный тип открывания.');
  if(product.sections?.some(s=>s.widthMm!=null&&!positive(s.widthMm))) errors.push('Ширина секции должна быть больше нуля.');
  const fixed=product.sections?.filter(s=>positive(s.widthMm))||[];
  const sectionSpan=Number(product.sectionAxis==='horizontal'?product.heightMm:(product.widthMm||product.baseWidthMm));
  if(fixed.reduce((sum,s)=>sum+Number(s.widthMm),0)>sectionSpan+.01) errors.push('Сумма фиксированных размеров секций больше габарита изделия.');
  if(fixed.length===product.sections?.length && Math.abs(fixed.reduce((sum,s)=>sum+Number(s.widthMm),0)-sectionSpan)>.01) errors.push('Сумма размеров секций должна совпадать с габаритом изделия.');
  if(Number(product.quantity)<1 || !Number.isInteger(Number(product.quantity))) errors.push('Количество должно быть целым положительным числом.');
  return errors;
}
const referenceMode = mode => mode==='tilt_turn'?'tilt_turn_right':mode==='turn'?'turn_right':mode;
export function createWindowFromReference(item, overrides={}) {
  return {
    id:globalThis.crypto?.randomUUID?.()||`window-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    openingId:null,presetId:`273803-${item.number}`,mark:`ОК-${String(item.number).padStart(2,'0')}`,
    quantity:item.qty,shape:item.shape,sectionAxis:'vertical',widthMm:item.widthMm??item.baseWidthMm,
    baseWidthMm:item.baseWidthMm,heightMm:item.heightMm??null,
    leftHeightMm:item.leftHeightMm,rightHeightMm:item.rightHeightMm,apexPosition:item.apexPosition??.5,
    sections:item.sections.map((mode,index)=>({id:`section-${index+1}`,openingMode:referenceMode(mode),ratio:1,hardwareSystem:mode==='fixed'?null:item.hardware,handleSide:mode==='fixed'?null:'left'})),
    profile:{brand:basis.profileBrand,system:basis.profileSystem,installationDepthMm:basis.profileInstallationDepthMm,color:basis.profileColor},
    glazing:{formula:basis.glazingFormula,thicknessMm:basis.glazingThicknessMm},
    sealColor:basis.sealColor,glazingBead:basis.glazingBead,
    supportProfile:{heightMm:basis.supportProfileHeightMm,includedInOverallHeight:null},
    roughOpening:null,installationGaps:{leftMm:null,rightMm:null,topMm:null,bottomMm:null},
    options:{},price:{mode:'historical_supplier_quote',amountRub:item.priceRubExact,sourceId:reference.quoteId,issueDate:null,history:[]},
    ...overrides,
  };
}
export function createWindowFromDesign(design, overrides={}) {
  const source=reference.items[0];
  return createWindowFromReference(source,{
    presetId:`design-${design.id}`,mark:design.label,quantity:1,
    shape:design.shape||'rectangle',sectionAxis:design.sectionAxis||'vertical',
    widthMm:design.widthMm,baseWidthMm:design.widthMm,heightMm:design.heightMm,
    leftHeightMm:design.leftHeightMm??null,rightHeightMm:design.rightHeightMm??null,
    sections:design.sections.map((openingMode,index)=>({id:`section-${index+1}`,openingMode,ratio:1,hardwareSystem:openingMode==='fixed'?null:source.hardware,handleSide:openingMode.endsWith('_right')?'right':openingMode==='fixed'?null:'left'})),
    price:{mode:'design_unpriced',history:[]},...overrides,
  });
}
export {WINDOW_DESIGN_LIBRARY};
const referenceProducts=reference.items.map(item=>({item,base:createWindowFromReference(item)}));
export function normalizeWindowProducts(value) {
  if(!Array.isArray(value)) return [];
  const ids=new Set();
  return value.filter(item=>item&&typeof item==='object'&&typeof item.id==='string'&&!ids.has(item.id)&&ids.add(item.id))
    .map(item=>({...item,quantity:positive(item.quantity)?Number(item.quantity):1,sectionAxis:item.sectionAxis==='horizontal'?'horizontal':'vertical',sections:Array.isArray(item.sections)?item.sections:[],price:{mode:'unpriced',history:[],...(item.price||{})}}));
}
export function normalizeWindowPresets(value) {
  if(!Array.isArray(value)) return [];
  const seen=new Set();
  return value.filter(item=>item&&typeof item.id==='string'&&item.id.length<100&&typeof item.label==='string'&&item.product&&typeof item.product==='object'&&!seen.has(item.id)&&seen.add(item.id))
    .map(item=>({id:item.id,label:item.label.slice(0,120),product:{...item.product,openingId:null}}));
}
export function normalizeWindowTariffs(value) {
  if(!Array.isArray(value)) return [];
  const seen=new Set();
  return value.filter(t=>t&&typeof t==='object'&&typeof t.id==='string'&&t.id.length<100&&typeof t.supplierId==='string'&&t.supplierId.length<100&&t.currency==='RUB'&&t.profile&&t.glazing&&t.rates&&typeof t.source==='string'&&t.source.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(t.validFrom)&&/^\d{4}-\d{2}-\d{2}$/.test(t.validTo)&&t.validTo>=t.validFrom&&!seen.has(t.id)&&seen.add(t.id))
    .map(t=>({id:t.id,supplierId:t.supplierId,currency:'RUB',source:t.source,validFrom:t.validFrom,validTo:t.validTo,profile:t.profile,glazing:t.glazing,sealColor:t.sealColor,glazingBead:t.glazingBead,supportProfileHeightMm:t.supportProfileHeightMm,hardwareSystem:t.hardwareSystem,rates:t.rates}));
}
export function parametricWindowPrice(product,tariff) {
  if(!tariff||tariff.currency!=='RUB'||tariff.profile?.brand!==product.profile?.brand||tariff.profile?.system!==product.profile?.system||Number(tariff.profile?.installationDepthMm)!==Number(product.profile?.installationDepthMm)||tariff.profile?.color!==product.profile?.color||tariff.glazing?.formula!==product.glazing?.formula||Number(tariff.glazing?.thicknessMm)!==Number(product.glazing?.thicknessMm)||tariff.sealColor!==product.sealColor||tariff.glazingBead!==product.glazingBead||Number(tariff.supportProfileHeightMm)!==Number(product.supportProfile?.heightMm)) return null;
  const today=new Date().toISOString().slice(0,10);
  if(!tariff.validFrom||!tariff.validTo||today<tariff.validFrom||today>tariff.validTo) return null;
  const m=product.productionMeasures||{},r=tariff.rates||{};
  const required=[r.baseRub,r.profileRubPerMeter,r.glassRubPerM2,r.impostRubPerMeter,r.shapeSurchargeRubByShape?.[product.shape],m.profileLinearMeters,m.glassAreaM2,m.impostMeters];
  if(required.some(value=>value==null||!Number.isFinite(Number(value))||Number(value)<0)) return null;
  let hardware=0;
  for(const section of product.sections||[]){
    if(section.openingMode!=='fixed'&&section.hardwareSystem!==tariff.hardwareSystem) return null;
    const amount=r.hardwareRubByMode?.[section.openingMode];
    if(amount==null||!Number.isFinite(Number(amount))||Number(amount)<0) return null;
    hardware+=Number(amount);
  }
  const breakdown={base:Number(r.baseRub),profile:Number(m.profileLinearMeters)*Number(r.profileRubPerMeter),glass:Number(m.glassAreaM2)*Number(r.glassRubPerM2),impost:Number(m.impostMeters)*Number(r.impostRubPerMeter),hardware,shape:Number(r.shapeSurchargeRubByShape[product.shape])};
  const unitRub=round(Object.values(breakdown).reduce((a,b)=>a+b,0));
  return {mode:'parametric',unitRub,label:'Параметрический тариф поставщика',source:`${tariff.source} · ${tariff.supplierId}${tariff.validFrom?` · с ${tariff.validFrom}`:''}`,breakdown};
}
export function windowReferenceMatch(product) {
  if(Object.values(product.options||{}).some(Boolean)) return null;
  return referenceProducts.find(({base})=>{
    const matching=['shape','sectionAxis','widthMm','heightMm','leftHeightMm','rightHeightMm','apexPosition'].every(key=>(product[key]??null)===(base[key]??null));
    if(!matching||product.sections.length!==base.sections.length) return false;
    if(product.sections.some((section,i)=>section.openingMode!==base.sections[i].openingMode||section.hardwareSystem!==base.sections[i].hardwareSystem||section.handleSide!==base.sections[i].handleSide||Math.abs(sectionWidths(product)[i]-sectionWidths(base)[i])>.01)) return false;
    return JSON.stringify(product.profile)===JSON.stringify(base.profile)&&JSON.stringify(product.glazing)===JSON.stringify(base.glazing)&&product.sealColor===base.sealColor&&product.glazingBead===base.glazingBead&&JSON.stringify(product.supportProfile)===JSON.stringify(base.supportProfile);
  })?.item||null;
}
export function windowPrice(product,tariffs=[]) {
  const area=windowGeometry(product).areaM2;
  if(validateWindow(product).length) return {mode:'invalid',unitRub:null,label:'Уточните параметры'};
  if(product.price?.mode==='design_unpriced') return {mode:'unpriced',unitRub:null,label:'Цена поставщика не задана',source:'Эскиз из библиотеки вариантов; назначьте цену проекта или подтверждённый тариф'};
  if(product.price?.mode==='manual') return product.price.amountRub!==null&&product.price.amountRub!==''&&Number(product.price.amountRub)>=0&&product.price.source?.trim()?{mode:'manual',unitRub:Number(product.price.amountRub),label:'Цена проекта, ручная',source:product.price.source}:{mode:'unpriced',unitRub:null,label:'Укажите сумму и источник ручной цены',source:'Ручной ввод проекта'};
  if(product.price?.mode==='parametric') return parametricWindowPrice(product,tariffs.find(t=>t.id===product.price?.tariffId))||{mode:'unpriced',unitRub:null,label:'Нет подтверждённого параметрического тарифа',source:'Уточните тариф и производственные измерения'};
  const exact=windowReferenceMatch(product);
  if(exact) return {mode:'historical_supplier_quote',unitRub:exact.priceRubExact,label:'Историческая цена поставщика',source:'Расчёт № 273803; дата не установлена, срок действия 3 рабочих дня'};
  if(product.profile?.brand===basis.profileBrand&&product.profile?.system===basis.profileSystem&&product.profile?.installationDepthMm===60&&product.profile?.color==='white'&&product.glazing?.formula===basis.glazingFormula&&product.glazing?.thicknessMm===32&&product.sealColor==='black'&&product.glazingBead==='straight'&&Number(product.supportProfile?.heightMm)===30&&product.sections.every(s=>!s.hardwareSystem||['Vorne','Roto_NX'].includes(s.hardwareSystem))&&area>=.36&&area<=3.6) {
    return {mode:'preliminary',unitRub:round(4983.868694574176+4786.709802929846*area),label:'Предварительный ориентир',source:'Регрессия по 12 позициям расчёта № 273803; ошибка отдельных позиций до 31%; возможность изготовления подтвердить у поставщика'};
  }
  return {mode:'unpriced',unitRub:null,label:'Требуется цена поставщика',source:'Для этой системы или геометрии нет подтверждённого тарифа'};
}
export function windowTotals(products,tariffs=[]) {
  return products.reduce((result,product)=>{const qty=Number(product.quantity)||0,price=windowPrice(product,tariffs);result.quantity+=qty;result.areaM2+=windowGeometry(product).areaM2*qty;if(price.unitRub!=null)result.priceRub+=price.unitRub*qty;else result.unpriced+=qty;return result;},{quantity:0,areaM2:0,priceRub:0,unpriced:0});
}
