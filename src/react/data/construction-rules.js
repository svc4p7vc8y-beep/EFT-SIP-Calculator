// Source-derived candidates, not approved engineering norms or price formulas.
export const BINDING_STRAIGHT_SUPPORT_RULE = Object.freeze({
  id: 'avado-binding-straight-support', version: 1,
  title: 'Прямой стык брусовой обвязки над опорой',
  status: 'formalized-candidate',
  source: { title: 'Методичка узлов АВАДО', pdfPage: 4, printedPage: null, section: 'Обвязка брусом' },
  statement: 'Соединение двух брусьев по длине размещается на свае.',
  unit: 'мм',
  scope: 'Прямой стык двух заданных участков брусовой обвязки на свайном основании.',
  parameters: [{ key: 'bindingJointToleranceMm', default: null, status: 'project-required',
    description: 'Допустимое расстояние от стыка до центра опоры; назначается проектом, не методичкой.' }],
  limits: 'Проверяются координаты в плане, не площадь опирания и не несущая способность. Угловые, Т-образные узлы, пакет досок, блоки и бетонное основание вне этого первого правила.',
  notAutomated: ['Сечение бруса', 'Размеры соединения вполдерева', 'Крепёж', 'Глубина выборки', 'Защита древесины', 'Допустимая нагрузка'],
  previousRule: 'Текстовое указание о стыках на опорах без проверки координат.',
  proposedRule: 'Диагностировать расстояние от явно заданного прямого стыка до центра ближайшей сваи; не перемещать детали.',
  estimateImpact: 'Нет: количества, цены, запас и монтаж не изменяются.',
});
