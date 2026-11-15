import {strToU8,zipSync} from 'fflate';
import {WINDOW_OPENINGS,WINDOW_SHAPES,sectionWidths,windowGeometry} from '../state/window-products.js';

const labels={white:'Белый',black:'Чёрный',straight:'Прямой'};
const known=value=>value==null||value===''?'Не задано':labels[value]||String(value);
const mm=value=>value==null||value===''?'Не задано':`${Math.round(Number(value)*100)/100} мм`;
export function windowRequestFields(product,project={}){
 const plans=[project.plan,...(project.upperFloors||[])],floor=plans.findIndex(p=>p?.openings?.some(o=>o.id===product.openingId)),opening=plans[floor]?.openings?.find(o=>o.id===product.openingId),widths=sectionWidths(product),rough=product.roughOpening||{};
 return [
  ['Марка',known(product.mark)],['ID изделия',product.id],['ID проёма',known(product.openingId)],['Этаж',floor<0?'Не задано':floor+1],['Количество',Number(product.quantity)||1],
  ['Вид','Изнутри'],['Форма',WINDOW_SHAPES.find(s=>s.id===product.shape)?.label||product.shape],
  ['Ширина изделия',mm(product.widthMm||product.baseWidthMm)],['Высота изделия',mm(product.heightMm||Math.max(product.leftHeightMm||0,product.rightHeightMm||0))],
  ...(product.shape==='trapezoid_sloped_top'?[['Высота слева',mm(product.leftHeightMm)],['Высота справа',mm(product.rightHeightMm)]]:[]),
  ...(product.shape==='triangle'?[['Вершина от левого края',mm(Number(product.apexPosition??.5)*Number(product.widthMm||product.baseWidthMm))]]:[]),
  ['Контур изделия, мм · X,Y',windowGeometry(product).vertices.map(p=>p.map(n=>Math.round(n*100)/100).join(', ')).join(' / ')],
  ['Деление секций',product.sectionAxis==='horizontal'?'По высоте, сверху вниз':'По ширине, слева направо'],
  ...(product.sections||[]).flatMap((s,i)=>[
   [`Секция ${i+1}`,WINDOW_OPENINGS.find(m=>m.id===s.openingMode)?.label||s.openingMode],
   [`Секция ${i+1} · ${product.sectionAxis==='horizontal'?'высота':'ширина'}`,mm(widths[i])],
   [`Секция ${i+1} · фурнитура`,s.openingMode==='fixed'?'Нет':known(s.hardwareSystem)],
   [`Секция ${i+1} · ручка`,s.handleSide==='left'?'Слева':s.handleSide==='right'?'Справа':s.openingMode==='fixed'?'Нет':'Не задано']]),
  ['Профиль',`${known(product.profile?.brand)} / ${known(product.profile?.system)}`],['Монтажная глубина профиля',mm(product.profile?.installationDepthMm)],['Цвет профиля',known(product.profile?.color)],
  ['Стеклопакет',known(product.glazing?.formula)],['Толщина стеклопакета',mm(product.glazing?.thicknessMm)],['Уплотнение',known(product.sealColor)],['Штапик',known(product.glazingBead)],
  ['Подставочный профиль',mm(product.supportProfile?.heightMm)],['Подставочный входит в высоту',product.supportProfile?.includedInOverallHeight==null?'Не задано':product.supportProfile.includedInOverallHeight?'Да':'Нет'],
  ['Порог',known(product.threshold)],['Ширина проёма',mm(rough.widthMm??(opening?.width!=null?opening.width*1000:null))],['Высота проёма',mm(rough.heightMm??(opening?.height!=null?opening.height*1000:null))],
  ...['leftMm','rightMm','topMm','bottomMm'].map((k,i)=>[`Монтажный зазор · ${['слева','справа','сверху','снизу'][i]}`,mm(product.installationGaps?.[k])]),
  ['Опции',Object.entries(product.options||{}).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join('; ')||'Не заданы'],
  ['Дополнительно',product.accessoriesNote||'Комплектацию согласовать с изготовителем'],
 ];
}
export function windowRequestRows(project){
 return [['ЭФТ · Запрос на расчёт окон и остеклённых дверей'],['Проект',project.meta?.projectNum||''],['Вид изнутри. Габариты изделия и проёма указаны отдельно.'],['Просим проверить возможность изготовления, комплектацию, открывание и стоимость.'],['Схемы и контуры не являются производственным раскроем.'],[],...(project.windowProducts||[]).flatMap(p=>[...windowRequestFields(p,project),[]])];
}
const xml=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function createWindowRequestWorkbook(project){
 const rows=windowRequestRows(project),sheet=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="43" customWidth="1"/><col min="2" max="2" width="100" customWidth="1"/></cols><sheetData>${rows.map((r,i)=>`<row r="${i+1}">${r.map((v,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
 const files={
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Окна для расчёта" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml':sheet,
 };
 return new Blob([zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])),{level:6})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
export function downloadWindowRequestWorkbook(project){
 const link=document.createElement('a');link.href=URL.createObjectURL(createWindowRequestWorkbook(project));link.download=`Окна_на_расчёт_${String(project.meta?.projectNum||'ЭФТ').replace(/[\\/:*?"<>|]/g,'_')}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),0);
}
