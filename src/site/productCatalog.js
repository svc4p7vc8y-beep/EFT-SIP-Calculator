// Public subset of the canonical catalog; the regression test checks every copied row.
import publicPrices from './product-price-rows.json' with { type: 'json' };

const materials = new Map(publicPrices.map((item) => [item.id, item]));

function product(catalogId, group, image, description, family = '', displayName) {
  const source = materials.get(catalogId);
  if (!source || !Number.isFinite(source.price) || source.price <= 0) {
    throw new Error(`Нет цены для товара ${catalogId} во встроенном прайсе`);
  }
  return {
    id: catalogId,
    catalogId,
    group,
    title: displayName || source.name,
    catalogName: source.name,
    price: source.price,
    unit: source.unit,
    image,
    description,
    family,
  };
}

export const productGroups = [
  { id: 'panels', label: 'СИП-панели', intro: 'Три сердцевины и три толщины в базовом формате 2500 × 1250 мм.' },
  { id: 'timber', label: 'Пиломатериалы', intro: 'Строганая доска для торцов и пакет клеёных досок для соединений.' },
  { id: 'foam', label: 'Пена и составы', intro: 'Составы для соединений панелей и монтажа проёмов.' },
  { id: 'fasteners', label: 'Саморезы и крепёж', intro: 'Конструкционные саморезы, анкеры, уголки и спиральный крепёж.' },
];

export const productsByGroup = {
  panels: [
    ...['MAT-010', 'MAT-011', 'MAT-012'].map((id) => product(id, 'panels', 'panel.webp', 'Обшивка ОСП и сердцевина PPS. Для стен, перекрытий и кровли по проекту.', 'ОСП / PPS')),
    ...['MAT-193', 'MAT-194', 'MAT-195'].map((id) => product(id, 'panels', 'panel-minwool.webp', 'Обшивка ОСП и минераловатная сердцевина. Состав и применение уточняются в проекте.', 'ОСП / Минвата')),
    ...['MAT-196', 'MAT-197', 'MAT-198'].map((id) => product(id, 'panels', 'panel-csp-pps.webp', 'Обшивка ЦСП и сердцевина PPS. Подбор по проекту.', 'ЦСП / PPS', materials.get(id).name.replace('CSP', 'ЦСП'))),
  ],
  timber: [
    ...['MAT-008', 'MAT-006', 'MAT-007'].map((id) => product(id, 'timber', 'planed-timber.png', 'Сухая строганая торцевая доска под выбранную толщину СИП-панели.', 'Строганая доска')),
    ...['MAT-186', 'MAT-187', 'MAT-188'].map((id) => product(id, 'timber', 'glued-board-pack.webp', 'Клеёный пакет досок для соединения СИП-панелей. Сечение подбирают по толщине панели.', 'Пакет клеёных досок')),
  ],
  foam: [
    product('MAT-009', 'foam', 'foam.webp', 'Пеноклей для соединений СИП-панелей, баллон 650 мл.', 'Для СИП'),
    product('MAT-OPENING-FOAM', 'foam', 'foam.webp', 'Монтажная пена для заполнения зазоров при установке окон и дверей, 750 мл.', 'Для проёмов'),
  ],
  fasteners: [
    ...['MAT-200', 'MAT-201', 'MAT-202', 'MAT-203'].map((id) => product(id, 'fasteners', 'fasteners.webp', 'Конструкционные саморезы. Длину подбирают по узлу и толщине панели.', 'Конструкционные саморезы')),
    product('MAT-081', 'fasteners', 'fasteners.webp', 'Конструкционные саморезы для узлов с размером, выбранным в проекте. Размер и наличие уточним при заказе.', 'Конструкционные саморезы', 'Саморезы конструкционные · размер по проекту'),
    product('MAT-080', 'fasteners', 'fasteners.webp', 'Саморезы 6 × 120 мм для узлов СИП-конструкции.', 'Саморезы'),
    product('MAT-071', 'fasteners', 'fasteners.webp', 'Спиральный крепёж, упаковка 100 штук.', 'Спиральный крепёж'),
    product('MAT-085', 'fasteners', 'fasteners.webp', 'Металлический уголок для соединения деревянных элементов.', 'Уголки'),
    product('MAT-067', 'fasteners', 'fasteners.webp', 'Анкер-шпилька для крепления мауэрлата, М12 × 150 мм.', 'Анкеры'),
  ],
};
