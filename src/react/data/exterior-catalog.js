// New budget allowances only. Existing EFT catalog prices are not replaced.
const date = '31.08.2026';
const allowance = 'Предварительный бюджетный ориентир ЭФТ; уточнить марку, цвет, профиль и поставщика перед заказом.';
const material = (id, name, unit, price, source = allowance) => ({ id: `EXT-MAT-${id}`, name, unit, price, kind: 'material', cat: 'Наружная отделка и освещение', priceEstimated: true, priceNote: `${date}. ${source}` });
const labor = (id, name, unit, price) => ({ id: `EXT-LAB-${id}`, name, unit, price, kind: 'labor', cat: 'Наружная отделка и освещение', priceEstimated: true, priceNote: `${date}. Предварительная расценка ЭФТ; уточнить сложность, высоту и доступ.` });
export const EXTERIOR_MATERIALS = [
  material('PLINTH-TUBE', 'Труба профильная 50×25×2 мм для цоколя · хлыст 6 м', 'м.п.', 115, 'Предварительно 115 ₽/м, проверить цену закупки. https://gostmetal.ru/truba-profilnaya/pryamougolnaya/50-25-2/'),
  material('PLINTH-COATING', 'Антикоррозионные материалы для трубы цоколя (на метр)', 'м.п.', 25),
  material('SIDING', 'Виниловый сайдинг · панель, рабочая площадь 0,84 м²', 'шт', 421, 'Ориентир Döcke D4.5D: 421 ₽/панель 0,84 м². https://www.docke.ru/siding/premium/korabelnyy-brus-d45d/karamel/'),
  material('BRICK', 'Полимерная фасадная панель под кирпич · 0,44 м²', 'шт', 799, 'Ориентир Döcke BERG: 799 ₽/панель 0,44 м². https://www.docke.ru/facade/premium/berg/kirpichnyy/'),
  material('BITUMEN', 'Битумная фасадная плитка типа HAUBERK', 'м²', 1000, 'Округлённый ориентир, не цена конкретного цвета/коллекции; предложения от 892 ₽/м². https://spb.favor-group.ru/catalog/fasadnye_materialy/plitka/hauberk/'),
  material('SOFFIT', 'Софит перфорированный для свесов', 'м²', 600, 'Бюджетный ориентир по каталогу Döcke; уточнить рабочую площадь выбранной панели. https://www.docke.ru/siding/soffits/'),
  material('PVC-CORNER', 'ПВХ угол фасада (наружный/внутренний)', 'м.п.', 500),
  material('PVC-TRIM', 'ПВХ профиль фасада (старт/финиш/J/H/околооконный)', 'м.п.', 300),
  material('METAL-CORNER', 'Металлический угол фасада', 'м.п.', 300),
  material('METAL-TRIM', 'Металлическая планка примыкания/обрамления фасада', 'м.п.', 300),
  material('WOOD-CORNER', 'Деревянный наружный/внутренний угол фасада', 'м.п.', 300),
  material('WOOD-TRIM', 'Деревянный наличник/планка фасада', 'м.п.', 250),
  material('BITUMEN-CORNER', 'Угол с гранулятом для битумной фасадной плитки', 'м.п.', 750),
  material('BITUMEN-TRIM', 'Наличник/планка с гранулятом для фасадной плитки', 'м.п.', 600),
  material('SILL', 'Наружный оконный отлив, окрашенный металл', 'м.п.', 450),
  material('MESH', 'Защитная вентиляционная сетка фасада', 'м.п.', 100),
  material('TAPE', 'Лента для стыков фасадной мембраны', 'м.п.', 50),
  material('SCREW', 'Фасадный оцинкованный крепёж', 'шт', 3),
  material('NAIL', 'Оцинкованные гвозди для битумной фасадной плитки', 'шт', 2),
  material('PRIMER', 'Грунт/антисептик для наружной деревянной отделки', 'л', 400),
  material('LIGHT', 'Уличный светильник LED IP65', 'шт', 1500),
  material('SOCKET', 'Наружная розетка с крышкой IP65', 'шт', 800),
  material('CONDUIT', 'УФ-стойкая защитная труба для наружной проводки', 'м.п.', 55),
  material('BOX', 'Наружная распаечная коробка IP65', 'шт', 250),
  material('PAD', 'Монтажная площадка под наружный электроприбор', 'шт', 150),
  material('RCD', 'Дифавтомат 16 А / 30 мА для наружной группы (уточнить проектом)', 'шт', 1800),
];
export const EXTERIOR_LABOR = [
  labor('PLINTH-FRAME', 'Монтаж каркаса цоколя из трубы с креплением к сваям', 'м.п.', 300),
  labor('PLINTH-COATING', 'Антикоррозионная обработка трубы и соединений цоколя', 'м.п.', 75),
  labor('SIDING', 'Монтаж винилового сайдинга', 'м²', 900),
  labor('BRICK', 'Монтаж полимерных фасадных панелей', 'м²', 1100),
  labor('BITUMEN', 'Монтаж битумной фасадной плитки', 'м²', 1000),
  labor('FRAME', 'Монтаж каркаса под фасадное утепление 50 мм', 'м²', 350),
  labor('PRIMER', 'Грунтование наружной деревянной отделки', 'м²', 150),
  labor('RCD', 'Монтаж и подключение защиты наружной группы', 'шт', 800),
  labor('ACCESS', 'Леса/вышка для фасадных работ', 'компл', 15000),
];
