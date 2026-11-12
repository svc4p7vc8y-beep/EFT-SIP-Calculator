// Descriptive project metadata only; choosing a type does not change calculations.
export const BUILDING_TYPES = [
  'Жилой дом', 'Дачный дом', 'Гостевой дом', 'Баня', 'Сауна', 'Баня с жилой частью',
  'Гараж', 'Мастерская', 'Пристройка', 'Хозблок', 'Летняя кухня', 'Беседка',
  'Торговый павильон', 'Офисное здание', 'Другое',
];

export function buildingTypeOptions(current) {
  const values = current && !BUILDING_TYPES.includes(current) ? [...BUILDING_TYPES, current] : BUILDING_TYPES;
  return values.map(value => ({ value, label: value }));
}
