import { SAUNA_EXTRA_ITEMS } from './sauna-options.js';
// New supplier-priced assemblies; no invented market prices or installation norms.
export const SAUNA_ITEMS = [
  ['lining', 'Обшивка парной', 'м2', 'material'],
  ['foil', 'Высокотемпературная пароизоляция парной', 'м2', 'material'],
  ['batten', 'Обрешётка парной по рабочему узлу', 'м.п.', 'material'],
  ['tape', 'Алюминиевая лента пароизоляции', 'м.п.', 'material'],
  ['insulation', 'Утеплитель парной по проекту', 'м3', 'material'],
  ['fasteners', 'Крепёж обшивки парной', 'компл', 'material'],
  ['bench', 'Полки парной с опорным каркасом', 'м2', 'material'],
  ['backrest', 'Спинки полков', 'м.п.', 'material'],
  ['heater', 'Печь для парной', 'шт', 'material'],
  ['stones', 'Камни для печи', 'кг', 'material'],
  ['control', 'Блок управления печью', 'компл', 'material'],
  ['chimney', 'Дымоход с проходными и защитными узлами по проекту', 'компл', 'material'],
  ['shield', 'Теплозащитный экран по паспорту печи', 'м2', 'material'],
  ['guard', 'Ограждение печи', 'шт', 'material'],
  ['installation', 'Монтаж комплектации парной по согласованному объёму', 'компл', 'labor'],
].map(([key, name, unit, kind]) => ({key, id:`${kind==='labor'?'LAB':'MAT'}-SAUNA-${key.toUpperCase()}`, name, unit, kind, cat:'Внутренняя отделка', price:0, pricePending:true, priceNote:'Запросить цену поставщика/подрядчика. Состав и пригодность для парной подтвердить проектом.'})).concat(SAUNA_EXTRA_ITEMS);

export const SAUNA_WOODS = [{value:'linden',label:'Липа'},{value:'aspen',label:'Осина'},{value:'alder',label:'Ольха'},{value:'abachi',label:'Абаш'},{value:'custom',label:'По спецификации проекта'}];
