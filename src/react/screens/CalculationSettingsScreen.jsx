import { useMemo } from 'react';
import { ArrowRight, CheckCircle2, CircleDollarSign, RotateCcw, Unplug } from 'lucide-react';
import { calculationFlowRows, DEFAULT_FORMULAS } from '../calculations/calculation-links.js';
import { calculateProject } from '../calculations/estimate-engine.js';
import {
  createDefaultPriceAdjustments,
  normalizePriceAdjustments,
  PRICE_ADJUSTMENT_GROUPS,
} from '../calculations/price-adjustments.js';
import { NumberField, Panel, ScreenHeader, Stat, Toggle } from '../components/ui.jsx';
import { useProject } from '../state/ProjectContext.jsx';
import { formatMoney, formatNumber } from '../utils/format.js';

const LINK_FIELDS = [
  ['roofRidgeFromPlan', 'Кровля из габаритов дома', 'Длина конька меняется вместе с шириной дома'],
  ['engineeringFromPlan', 'Инженерия из площади', 'Трассы и точки зависят от площади и мокрых помещений'],
  ['internalFinishFromPlan', 'Внутренняя отделка из плана', 'Стены, полы и двери берутся из геометрии'],
  ['externalFinishFromPlan', 'Фасад из наружных стен', 'Фасад, мембрана и утепление следуют за стенами'],
  ['deliveryVolumeFromPlan', 'Объём доставки из площадей', 'Груз оценивается по дому и пристройкам']
];

const FORMULA_GROUPS = [
  ['Связи с планом', [
    ['roofRidgeExtra', 'Добавка к длине конька', 'м'], ['cableMetersPerM2', 'Кабель на 1 м² дома', 'м'],
    ['electricPointsPerM2', 'Электроточек на 1 м²', 'шт'], ['waterPipeMetersPerM2', 'Водопровод на 1 м²', 'м'],
    ['waterPointsPerWetRoom', 'Точек воды на мокрую комнату', 'шт'], ['sewerMetersPerWetRoom', 'Канализации на мокрую комнату', 'м'],
    ['sewerPointsPerWetRoom', 'Точек канализации на мокрую комнату', 'шт'], ['ventMetersPerWetRoom', 'Вентиляции на мокрую комнату', 'м'],
    ['ventGrillesPerWetRoom', 'Решёток на мокрую комнату', 'шт'],
    ['cargoM3PerM2', 'Груза на 1 м² дома', 'м³'], ['terraceCargoM3PerM2', 'Груза на 1 м² террасы', 'м³'],
    ['internalPartitionFaces', 'Сторон отделки перегородки', 'сторон'], ['laminateShare', 'Доля пола под ламинат', 'коэф.'], ['tileShare', 'Доля пола под плитку', 'коэф.']
  ]],
  ['СИП и крепёж', [
    ['panelArea', 'Площадь одной СИП-панели', 'м²'], ['panelWidth', 'Ширина СИП-панели', 'м'],
    ['panelLength', 'Длина СИП-панели', 'м'], ['sipTimberReservePercent', 'Запас бруса и торцевой доски', '%'],
    ['sipTimberStockLength', 'Складская длина бруса и торцевой доски', 'м'],
    ['partitionBoardM3PerM2', 'Доска перегородок на 1 м²', 'м³'],
    ['foamUnitsPerJointMeter', 'Пеноклея на 1 м шва', 'баллона'], ['sipSeamScrewSpacingM', 'Шаг саморезов 3,8×41', 'м'],
    ['sipPanelSupportScrews', 'Саморезов 3,8×41 на панель к основанию', 'шт'], ['sipEdgeScrewSpacingM', 'Шаг саморезов 4,2×75', 'м'],
    ['sipBindingScrewSpacingM', 'Шаг конструкционных саморезов нижней/верхней обвязки', 'м'], ['sipCornerScrewSpacingM', 'Шаг конструкционных саморезов вертикальных углов', 'м'],
    ['sipUniversalScrewsPerTNode', 'Саморезов 6×120 на Т-узел', 'шт'], ['sipUniversalScrewKgEach', 'Масса одного самореза 6×120', 'кг'],
    ['sipSealStaplesPerMeter', 'Скоб T53 на 1 м уплотнителя', 'шт'], ['sipSealStaplesPerPack', 'Скоб T53 в упаковке', 'шт'],
    ['sipRoofSupportPointsPerPanel', 'Точек опирания одной панели SIP-кровли', 'шт'], ['sipRidgePlateScrews', 'Саморезов на коньковую пластину', 'шт'],
    ['sipSeamScrewKgEach', 'Масса одного самореза 3,8×41', 'кг'],
    ['sipEdgeScrewKgEach', 'Масса одного самореза 4,2×75', 'кг'], ['sipStructuralScrewKg124', 'Масса одного 8×180', 'кг'],
    ['sipStructuralScrewKg174', 'Масса одного 8×220', 'кг'], ['sipStructuralScrewKg224', 'Масса одного 8×280', 'кг'], ['sipStructuralScrewKg320', 'Масса одного 8×320', 'кг'],
    ['foamUnitsPerPanel', 'Быстрый режим: баллонов на панель', 'шт'], ['structuralFastenerKgPerM2', 'Быстрый режим: конструкционного крепежа на 1 м²', 'кг'],
    ['seamScrewKgPerM2', 'Быстрый режим: саморезов шва на 1 м²', 'кг'], ['spiralPackPerPanels', 'Быстрый режим: панелей на упаковку', 'шт']
  ]],
  ['Фундамент, кровля, терраса', [
    ['pileConcreteM3', 'Пескобетона на сваю', 'м³'], ['pileScrewKg', 'Саморезов обвязки на сваю', 'кг'],
    ['pileLagScrews', 'Глухарей на сваю', 'шт'], ['hangingRafterReserve', 'Коэффициент висячей системы', 'коэф.'], ['layeredRafterReserve', 'Коэффициент наслонной системы', 'коэф.'], ['trussRafterReserve', 'Коэффициент стропильной фермы', 'коэф.'],
    ['gableBoardM3PerM2', 'Доски каркаса на 1 м² фронтона', 'м³'], ['lathM3PerM2', 'Обрешётки на 1 м² кровли', 'м³'], ['roofScrewsPerM2', 'Кровельных саморезов на 1 м²', 'шт'],
    ['roofFramingNailKgEach', 'Масса гвоздя стропильного узла', 'кг'], ['roofLathNailKgEach', 'Масса крепежа обрешётки', 'кг'],
    ['roofRafterSupportNails', 'Гвоздей на опору стропила', 'шт'], ['roofRafterRidgeNails', 'Гвоздей на соединение у конька', 'шт'], ['roofRafterTieNails', 'Гвоздей на узел затяжки', 'шт'],
    ['roofAngleNailsPerBracket', 'Гвоздей на усиленный уголок', 'шт'], ['roofLathNailsPerCrossing', 'Крепежей на пересечение обрешётки', 'шт'], ['roofTrussPlatesPerFrame', 'Соединительных пластин на ферму', 'шт'],
    ['ridgeReserve', 'Запас планки конька', 'коэф.'], ['mauerlatReserve', 'Запас мауэрлата', 'коэф.'], ['mauerlatAnchorSpacing', 'Шаг анкеров мауэрлата', 'м'], ['mauerlatScrewSpacing', 'Шаг саморезов мауэрлата', 'м'], ['mauerlatScrewRows', 'Рядов саморезов мауэрлата', 'шт'],
    ['ridgeBeamReserve', 'Запас коньковой доски', 'коэф.'], ['roofTrimReserve', 'Запас карнизных и ветровых планок', 'коэф.'], ['gutterBracketSpacing', 'Шаг кронштейнов жёлоба', 'м'], ['gutterOutletSpacing', 'Макс. длина жёлоба на один выпуск', 'м'], ['downpipeClampSpacing', 'Шаг хомутов водосточной трубы', 'м'], ['rafterInsulationThicknessM', 'Толщина минваты второго света', 'м'],
    ['vaporBarrierRollArea', 'Площадь рулона пароизоляции', 'м²'], ['terraceRoofPostSpacing', 'Предельный шаг столбов кровли террасы', 'м'], ['terraceFrameBoardM3PerM2', 'Каркаса на 1 м² террасы', 'м³'],
    ['terraceDeckReserve', 'Запас настила террасы', 'коэф.'], ['terraceScrewKgPerM2', 'Саморезов на 1 м² террасы', 'кг']
  ]]
];

export default function CalculationSettingsScreen() {
  const { project, commit } = useProject();
  const calculation = useMemo(() => calculateProject(project), [project]);
  const flows = useMemo(() => calculationFlowRows(project, calculation), [project, calculation]);
  const priced = calculation.lines.filter((line) => line.catalogId && line.price > 0);
  const missing = calculation.lines.filter((line) => !line.catalogId || line.price <= 0);
  const priceAdjustments = normalizePriceAdjustments(project.settings.priceAdjustments);
  const sectionTotals = useMemo(() => Object.fromEntries(calculation.sections.map((section) => [section.key, section.lines.reduce((totals, line) => {
    const amount = line.qty * line.price;
    if (line.kind === 'labor') totals.labor += amount;
    else totals.materials += amount;
    return totals;
  }, { materials: 0, labor: 0 })])), [calculation.sections]);
  const updateLink = (key, value) => commit((next) => { next.settings.links[key] = value; return next; });
  const updateFormula = (key, value) => commit((next) => { next.settings.formulas[key] = Math.max(0, value); return next; });
  const updatePriceAdjustment = (section, kind, value) => commit((next) => {
    next.settings.priceAdjustments = normalizePriceAdjustments(next.settings.priceAdjustments);
    next.settings.priceAdjustments[section][kind] = Math.max(-100, Math.min(500, value));
    return next;
  });
  const resetFormulas = () => commit((next) => { next.settings.formulas = structuredClone(DEFAULT_FORMULAS); return next; });
  const resetPriceAdjustments = () => commit((next) => { next.settings.priceAdjustments = createDefaultPriceAdjustments(); return next; });
  return <div className="screen calculation-settings-screen"><ScreenHeader title="Настройки расчёта" actions={<button className="button secondary" onClick={resetFormulas}><RotateCcw />Исходные коэффициенты</button>} />
    <div className="stats-row"><Stat label="Автоматические связи" value={`${Object.values(calculation.inputs.links).filter(Boolean).length} из ${LINK_FIELDS.length}`} tone="accent" /><Stat label="Расчётных строк" value={`${calculation.lines.length} шт`} /><Stat label="Связано с прайсом" value={`${priced.length} шт`} /><Stat label="Требует цены" value={`${missing.length} шт`} tone={missing.length ? 'danger' : ''} /><Stat label="Итого сметы" value={formatMoney(calculation.totals.total)} /></div>
    <Panel className="price-adjustment-panel" title="Скрытая скидка и наценка" description="Настройка влияет только на верхнюю плашку «Изменённая цена». Прайс-лист, строки сметы, печать, коммерческое предложение и экспорт сохраняют базовые цены.">
      <div className="price-adjustment-toolbar"><div><CircleDollarSign /><span><strong>Минус — скидка, плюс — наценка</strong><small>Процент материалов и работ задаётся независимо для каждой группы.</small></span></div><button className="button secondary compact-button" type="button" onClick={resetPriceAdjustments}><RotateCcw />Обнулить</button></div>
      <div className="price-adjustment-grid">{PRICE_ADJUSTMENT_GROUPS.map(({ key, label }) => { const totals = sectionTotals[key] || { materials: 0, labor: 0 }; return <article key={key}><div className="price-adjustment-group"><strong>{label}</strong><small>База: материалы {formatMoney(totals.materials)} · работы {formatMoney(totals.labor)}</small></div><NumberField label="Материалы" value={priceAdjustments[key].materials} min={-100} max={500} step={1} suffix="%" onChange={(value) => updatePriceAdjustment(key, 'materials', value)} /><NumberField label="Работы" value={priceAdjustments[key].labor} min={-100} max={500} step={1} suffix="%" onChange={(value) => updatePriceAdjustment(key, 'labor', value)} /></article>; })}</div>
    </Panel>
    <Panel title="Структурная схема" description="Каждая строка показывает источник, применённую формулу, текущий результат и потребителей"><div className="calculation-flow">{flows.map((row) => <article key={`${row.group}-${row.target}`}><span className="flow-group">{row.group}</span><div><small>Источник</small><strong>{row.source}</strong></div><ArrowRight /><div><small>Формула</small><code>{row.formula}</code></div><ArrowRight /><div className="flow-result"><small>Результат</small><strong>{formatNumber(row.result, 3)} {row.unit}</strong></div><ArrowRight /><div><small>Передаётся</small><span>{row.target}</span></div>{row.auto === false ? <i className="manual"><Unplug />Вручную</i> : <i><CheckCircle2 />Связано</i>}</article>)}</div></Panel>
    <div className="two-column-layout settings-columns"><Panel title="Автоматические связи" description="Отключите связь, если хотите вводить величину вручную в соответствующем калькуляторе">{LINK_FIELDS.map(([key, label, hint]) => <Toggle key={key} label={label} hint={hint} checked={project.settings.links[key]} onChange={(value) => updateLink(key, value)} />)}</Panel><Panel title="Контроль прайса" description="Расчётная строка должна найти номенклатуру и цену"><div className={`price-link-status ${missing.length ? 'warning' : 'ok'}`}>{missing.length ? <Unplug /> : <CircleDollarSign />}<div><strong>{missing.length ? `Не найдено или без цены: ${missing.length}` : 'Все расчётные строки имеют цену'}</strong><span>{missing.length ? missing.slice(0, 6).map((line) => line.name).join(' · ') : `Материалы ${formatMoney(calculation.totals.materials)}, работы ${formatMoney(calculation.totals.labor)}`}</span></div></div><div className="price-link-list">{calculation.sections.map((section) => { const sectionMissing = section.lines.filter((line) => !line.catalogId || line.price <= 0).length; return <div key={section.key}><span>{section.title}</span><strong className={sectionMissing ? 'bad' : ''}>{section.lines.length - sectionMissing}/{section.lines.length}</strong></div>; })}</div></Panel></div>
    <Panel title="Полная расчётная ведомость" description="Все количества после формул и точная позиция прайса, из которой взята цена"><div className="table-wrap formula-ledger"><table className="data-table"><thead><tr><th>Раздел</th><th>Номенклатура</th><th>Источник</th><th>ID прайса</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>{calculation.lines.map((line) => <tr key={line.id}><td>{line.section}</td><td>{line.name}</td><td>{line.source}</td><td><code>{line.catalogId || 'НЕ НАЙДЕНО'}</code></td><td>{formatNumber(line.qty, 3)} {line.unit}</td><td>{formatMoney(line.price)}</td><td>{formatMoney(line.qty * line.price)}</td></tr>)}</tbody></table></div></Panel>
    {FORMULA_GROUPS.map(([group, fields]) => <Panel key={group} title={group}><div className="form-grid four formula-grid">{fields.map(([key, label, unit]) => <NumberField key={key} label={label} value={project.settings.formulas[key]} suffix={unit} min={0} step={project.settings.formulas[key] < 0.1 ? .001 : .1} onChange={(value) => updateFormula(key, value)} />)}</div></Panel>)}
  </div>;
}
