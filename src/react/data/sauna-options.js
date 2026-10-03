// Supplier observations, 29 September 2026. Applying an offer is an explicit room action.
export const SAUNA_SOURCES = {
  lining: 'https://lipa-osina.ru/category/vagonka/vagonka-iz-lipy/',
  trim: 'https://lipa-osina.ru/category/pogonazh-iz-dereva-/',
  heater: 'https://vezuviy.su/pechi-dlya-bani-i-sauny/stalnye-pechi-dlya-bani-i-sauny/skif/pech-vezuviy-skif-kovka-16-panorama-2022/',
  single: 'https://vezuviy.su/dymohody-i-baki/dymohody-black/odnokonturnye/',
  sandwich: 'https://vezuviy.su/dymohody-i-baki/sendvich-truba-black-aisi-430-0-8mm-l-0-5m/',
  chimney: 'https://vezuviy.su/images/companies/1/docs/Паспорта%202024/ПАСПОРТ%20дымоходов%20Везувий.pdf',
};
export const LINING_OFFERS = [
  [1,1150,1300],[1.2,1380,1550],[1.5,1730,1940],[1.8,2330,2590],
  [2,3070,3360],[2.1,3220,3530],[2.2,3380,3700],[2.3,3530,3860],
  [2.4,3690,4030],[2.5,3840,4200],[2.7,4150,4540],[3,4610,5040],
].map(([length,a,extra])=>({length,a,extra}));

export const DETAILED_DEFAULT_PRICES = {liningWork:18000,heaterWork:15000,heaterDelivery:7000};
export const SAUNA_EXTRA_ITEMS = [
  ['glassDoor','Стеклянная дверь парной 700×1900 мм · прозрачная бронза','шт','material'],
  ['lindenWindow','Форточка парной 400×500 мм · липа, стеклопакет','шт','material'],
  ['liningPack','Вагонка липа 15×96 мм · 10 досок','упак','material'],
  ['foilRoll','Фольга алюминиевая 80 мкм · рулон 10 м²','рул','material'],
  ['tapeRoll','Фольгированный скотч 50 мм · рулон 30 м','рул','material'],
  ['battenStock','Брусок хвоя 50×50×3000 мм','шт','material'],
  ['counterStock','Рейка хвоя 20×40×3000 мм','шт','material'],
  ['liningWork','Работа по липе — стены и потолок','м2','labor'],
  ['heaterWork','Установка печи · предварительная ставка','шт','labor'],
  ['heaterDelivery','Доставка печи · без наценки','усл','material'],
  ['counterBatten','Контррейка вентиляционного зазора по узлу','м.п.','material'],
  ['staples','Скобы и крепёж фольги','упак','material'],
  ['frameFasteners','Крепёж каркаса и закладных','компл','material'],
  ['plinth','Плинтус липа 15×45 мм','м.п.','material'],
  ['cornice','Галтель липа 15×30 мм','м.п.','material'],
  ['corner','Уголок липа 30×40 мм','м.п.','material'],
  ['casing','Наличник липа 15×70 мм','м.п.','material'],
  ['lamp','Термостойкий светильник парной с лампой','шт','material'],
  ['wire','Термостойкий провод парной · сечение по электропроекту','м.п.','material'],
  ['drain','Трап парной · без работ по полу','шт','material'],
  ['vent','Приток и вытяжка парной по проекту','компл','material'],
  ['chimneySingle','Везувий BLACK Ø115 · одностенная труба L1 м','шт','material'],
  ['chimneyDamper','Везувий BLACK Ø115 · шибер поворотный','шт','material'],
  ['chimneyStart','Старт-сэндвич Ø115/200 · согласовать серию','шт','material'],
  ['chimneySandwich','Везувий BLACK Ø115/200 · сэндвич L0,5 м','шт','material'],
  ['chimneyPass','Проходной узел перекрытия Ø200 с изоляцией по проекту','компл','material'],
  ['chimneyRoof','Проходка кровли Ø200 · по уклону и покрытию','компл','material'],
  ['chimneyEnd','Завершение дымохода Ø115/200 по паспорту','компл','material'],
  ['chimneySupports','Опоры, хомуты и растяжки дымохода по проекту','компл','material'],
  ['chimneySeal','Высокотемпературный герметик по паспорту системы','шт','material'],
].map(([key,name,unit,kind])=>{const offer=key==='glassDoor'?{price:11400,url:'https://stroyudacha.ru/products/219307-blok-dvernoy-steklyannyy-bannyy-700h1900-mm-steklo-8-mm--bronza.html'}:key==='lindenWindow'?{price:3500,url:'https://stroyudacha.ru/products/206603-blok-okonnyy-lipa-400h500-mm.html'}:null;return {key,name,unit,kind,id:`${kind==='labor'?'LAB':'MAT'}-SAUNA-${key.toUpperCase()}`,cat:'Внутренняя отделка',price:offer?.price??DETAILED_DEFAULT_PRICES[key]??0,...(!offer&&!DETAILED_DEFAULT_PRICES[key]?{pricePending:true}:{}),priceNote:offer?`Розничный ориентир ${offer.price.toLocaleString('ru-RU')} ₽/шт по карточке товара; региональную цену и наличие уточнить: ${offer.url}. Монтаж не входит.`:DETAILED_DEFAULT_PRICES[key]?'Согласовано пользователем 29.09.2026; установка печи — предварительно.':'Цена и комплектность уточняются. Проектная цена не меняет общий прайс.'};});

export const CHIMNEY_KEYS = SAUNA_EXTRA_ITEMS.filter(i=>i.key.startsWith('chimney')).map(i=>i.key);
