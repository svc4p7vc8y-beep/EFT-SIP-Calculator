import { LINING_OFFERS, SAUNA_SOURCES } from './sauna-options.js';

export const liningCatalogId = (length, grade) => `MAT-SAUNA-LINING-${grade === 'extra' ? 'E' : 'A'}-${Math.round(Number(length) * 1000)}`;
export function liningCatalogVariants() {
  return LINING_OFFERS.flatMap(offer => ['a', 'extra'].map(grade => ({
    id: liningCatalogId(offer.length, grade), kind: 'material', cat: 'Парная / сауна', unit: 'упак',
    name: `Вагонка липа 15×96 мм · сорт ${grade === 'extra' ? 'Экстра' : 'А'} · ${offer.length} м · 10 досок`,
    price: offer[grade], priceSource: SAUNA_SOURCES.lining,
    note: 'Вариант из существующей таблицы предложений от 29.09.2026; цену обновляет редактор общего прайса.',
  })));
}
