import { ELECTRICAL_CABLE_CHOICES } from './placement-electrical.js';

// The paper form is a checklist of possible purchases, independent of the
// quantities already calculated for this floor.
export function blankElectricalBillRows(bill, custom = []) {
  const standard = [
    ['Электрощит', 'шт'], ['Автоматический выключатель', 'шт'], ['Дифавтомат', 'шт'],
    ['УЗО', 'шт'], ['Шины N/PE и комплектующие щита', 'компл'],
    ['Розетка', 'шт'], ['Двойная розетка', 'шт'], ['Силовая точка', 'шт'],
    ['Уличная розетка', 'шт'], ['Выключатель', 'шт'], ['Двухклавишный выключатель', 'шт'],
    ['Проходной выключатель', 'шт'], ['Диммер', 'шт'], ['Подрозетник', 'шт'],
    ['Светильник', 'шт'], ['Точечный светильник', 'шт'], ['Подвесной светильник', 'шт'],
    ['Настенный светильник', 'шт'], ['LED-лента', 'м'], ['Фасадный светильник', 'шт'],
    ['Фасадный прожектор', 'шт'], ['Распределительная коробка', 'шт'],
    ...ELECTRICAL_CABLE_CHOICES.map(cable => [`Кабель · ${cable}`, 'м']),
    ['Гофра', 'м'], ['Кабель-канал', 'м'], ['Клипсы для трассы', 'шт'],
    ['Кабельные хомуты', 'шт'], ['Стяжки для трассы', 'шт'],
    ['WAGO 221-412 · 2 ввода', 'шт'], ['WAGO 221-413 · 3 ввода', 'шт'],
    ['WAGO 221-415 · 5 вводов', 'шт'], ['Наконечники и гильзы', 'шт'],
    ['Маркировка', 'компл'], ['Расходные материалы', 'компл'],
  ];
  const result = new Map(standard.map(([name, unit]) => [name, { name, unit }]));
  for (const row of [...bill.components, ...bill.manualComponents, ...custom]) {
    if (row.name?.trim() && !result.has(row.name.trim())) result.set(row.name.trim(), { name: row.name.trim(), unit: row.unit || 'шт' });
  }
  return [...result.values()].map((row, index) => ({ ...row, key: `blank-${index}`, quantity: '', note: '' }));
}
