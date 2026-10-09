import { BINDING_STRAIGHT_SUPPORT_RULE as rule } from '../data/construction-rules.js';

const labels = {
  'not-applicable': 'Правило не применимо к выбранной конструкции',
  'needs-data': 'Проверьте исходные данные',
  'no-declared-joints': 'Прямые стыки не заданы',
  'geometry-conflict': 'Есть расхождения положения стыков и опор',
  'needs-project-parameter': 'Нужен проектный допуск',
  'geometry-checked': 'Координаты проверены по заданному допуску',
  'within-project-tolerance': 'В пределах проектного допуска',
  'outside-project-tolerance': 'Вне проектного допуска',
  'missing-support': 'Опоры не заданы',
};
const number = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);

export default function BindingRuleCheck({ result, value, update, NumberInput, pending }) {
  if (!result) return null;
  return <details className="binding-rule-check" aria-label="Правило прямого стыка обвязки">
    <summary>Правило узла обвязки · {labels[result.status]}</summary>
    <h3>{rule.title}</h3>
    <p>{rule.statement} Источник: {rule.source.title}, PDF-страница {rule.source.pdfPage}; печатный номер на странице не указан.</p>
    <p>Статус правила: формализованный кандидат, не утверждённая расчётная норма EFT.</p>
    <p>Пока это отдельная диагностика: она не блокирует выпуск альбома и не заменяет проверку рабочего узла.</p>
    <p>{rule.scope} {rule.limits}</p>
    <p>{result.reason}</p>
    {result.status !== 'not-applicable' ? <fieldset disabled={pending}>
      <NumberInput label="Допуск смещения стыка от центра опоры, мм (по проекту)"
        value={value === '' || Number.isFinite(Number(value)) ? value : ''}
        placeholder="Не назначен" onChange={bindingJointToleranceMm => update({ bindingJointToleranceMm })}/>
      <p>Допуск не указан в источнике. Значение 0 проверяет совпадение координат; любое другое значение назначается проектом. Площадь опирания и несущая способность не проверяются.</p>
    </fieldset> : <p>Тип обвязки выбирается в разделе «Сваи». Пакет досок не заменяется брусом автоматически.</p>}
    <p role="status" data-rule-status={result.status}>{labels[result.status]}</p>
    <ul>{result.checks.map(check => <li key={check.id}>
      <strong>{check.id}</strong> · участки {check.lineIds.join(' / ')} · стык ({check.point.map(number).join('; ')}) мм.
      {check.nearestSupportPoint ? <> Ближайшая опора {check.nearestSupportId}: ({check.nearestSupportPoint.map(number).join('; ')}) мм; расстояние {number(check.distanceMm)} мм.</> : ' Ближайшая опора не найдена.'}
      <br/>{labels[check.status]}
    </li>)}</ul>
    <p>{result.coverage}</p>
    {result.outsideScopeJunctions > 0 ? <p>Узлов других типов, не проверенных этим правилом: {result.outsideScopeJunctions}.</p> : null}
    {result.invalidLineIds?.length || result.invalidSupportCount ? <p role="alert">Есть некорректные координаты линий или опор. Проверка неполная.</p> : null}
    <details><summary>Что изменено относительно прежней модели</summary>
      <p>Ранее: {rule.previousRule}</p><p>Теперь: {rule.proposedRule}</p>
      <p>Влияние на смету: {rule.estimateImpact}</p>
      <p>Не назначаются автоматически: {rule.notAutomated.join(', ').toLowerCase()}.</p>
    </details>
  </details>;
}
