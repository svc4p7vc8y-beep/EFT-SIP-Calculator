import { useMemo } from 'react';
import { AlertTriangle, FileSpreadsheet, Printer } from 'lucide-react';
import { useProject } from '../state/ProjectContext.jsx';
import { calculateProject } from '../calculations/estimate-engine.js';
import { buildCommercialScope } from '../calculations/commercial-scope.js';
import { buildClientEstimate, unpricedClientLines } from '../calculations/client-estimate.js';
import { downloadEstimateWorkbook } from '../export/xlsx.js';
import { EditableEstimateTable, PreviewTable, ScreenHeader, Stat } from '../components/ui.jsx';
import { PrintProjectDiagrams } from '../components/PrintProjectDiagrams.jsx';
import { formatMoney, formatNumber } from '../utils/format.js';
import { addEstimateLine, changeEstimateLine, removeEstimateLine, resetEstimateLine, resetEstimateSection } from '../state/estimate-edits.js';

function EstimateSectionEditor({ section, project, commit }) {
  const hiddenCount = (project.estimateOverrides || []).filter((item) => item.section === section.key && item.excluded).length;
  const update = (mutate) => commit((next) => { mutate(next); return next; });
  return <EditableEstimateTable
    lines={section.lines}
    grouped={section.key === 'sip' || section.key === 'engineering'}
    hiddenCount={hiddenCount}
    onChangeLine={(line, changes) => update((next) => changeEstimateLine(next, line, changes))}
    onRemoveLine={(line) => update((next) => removeEstimateLine(next, line))}
    onResetLine={(line) => update((next) => resetEstimateLine(next, line.id))}
    onAddLine={() => update((next) => addEstimateLine(next, section.key))}
    onResetSection={() => update((next) => resetEstimateSection(next, section.key))}
  />;
}

export default function EstimateScreen() {
  const { project, commit } = useProject();
  const calculation = useMemo(() => calculateProject(project), [project]);
  const commercialScope = useMemo(() => buildCommercialScope(project, calculation), [project, calculation]);
  const setPrintOption = (key, value) => commit((next) => { next.settings.print = { ...(next.settings.print || {}), [key]: value }; return next; });
  const printOptions = project.settings.print || {};
  const clientEstimate = useMemo(
    () => buildClientEstimate(calculation, printOptions),
    [calculation, printOptions],
  );
  const pendingClientPrices = useMemo(
    () => unpricedClientLines(calculation, printOptions),
    [calculation, printOptions],
  );
  const handlePrint = () => {
    if (pendingClientPrices.length) {
      window.alert(`Заполните цены в прайс-листе: ${pendingClientPrices.map((line) => line.name).join(' · ')}`);
      return;
    }
    window.print();
  };
  const planLayers = [
    ['showContour', 'Контур дома'], ['showRooms', 'Комнаты и перегородки'],
    ['showOpenings', 'Окна и двери'], ['showPlatforms', 'Терраса и крыльцо'],
    ['showPiles', 'Сваи'], ['showBinding', 'Обвязка'], ['showDimensions', 'Размеры'],
  ];
  return <div className={`screen estimate-screen${printOptions.maximumCompact === true ? ' maximum-compact' : ''}`}><ScreenHeader title="Смета проекта" actions={<><button className="button secondary no-print" onClick={() => downloadEstimateWorkbook(project, calculation)}><FileSpreadsheet />Скачать Excel</button><button className="button primary no-print" onClick={handlePrint}><Printer />Печать / PDF</button></>} />
    {pendingClientPrices.length ? <div className="estimate-price-warning no-print"><AlertTriangle /><div><strong>В предложении есть позиции без цены</strong><span>{pendingClientPrices.map((line) => line.name).join(' · ')}. Укажите цену в прайс-листе или ведомости проекта либо исключите эти позиции из предложения.</span></div></div> : null}
    <section className="print-diagram-options no-print" aria-label="Настройки предложения"><div><strong>Смета для клиента</strong></div><div className="print-option-group"><label className="maximum-compact-option"><input type="checkbox" checked={printOptions.maximumCompact === true} onChange={(event) => setPrintOption('maximumCompact', event.target.checked)} />Максимально компактная смета</label><label><input type="checkbox" checked={printOptions.includeLabor !== false} onChange={(event) => setPrintOption('includeLabor', event.target.checked)} />Включить работы</label><label><input type="checkbox" checked={printOptions.includeAccessories !== false} onChange={(event) => setPrintOption('includeAccessories', event.target.checked)} />Включить крепёж и сопутствующие товары</label><label><input type="checkbox" checked={printOptions.compactAccessories !== false} onChange={(event) => setPrintOption('compactAccessories', event.target.checked)} />Сгруппировать их в монтажные комплекты</label></div><div><strong>Схемы в предложении</strong></div><div className="print-option-group"><label><input type="checkbox" checked={printOptions.includePlan !== false} onChange={(event) => setPrintOption('includePlan', event.target.checked)} />План комнат</label><label><input type="checkbox" checked={printOptions.includeRoof === true} onChange={(event) => setPrintOption('includeRoof', event.target.checked)} />Крыша на контуре дома</label></div>{printOptions.includePlan !== false ? <div className="print-option-group plan-layers"><span>Слои плана:</span>{planLayers.map(([key, label]) => <label key={key}><input type="checkbox" checked={printOptions[key] !== false} onChange={(event) => setPrintOption(key, event.target.checked)} />{label}</label>)}</div> : null}</section>
    {printOptions.maximumCompact === true ? <section className="compact-estimate-preview no-print"><header><div><strong>Предпросмотр компактной сметы</strong><span>Подробная ведомость менеджера ниже не изменяется</span></div><strong>{clientEstimate.sections.reduce((sum, section) => sum + section.lines.length, 0)} строк</strong></header>{clientEstimate.sections.map((section) => <section className="estimate-section" key={`preview-${section.key}`}><h2>{section.title}</h2><PreviewTable lines={section.lines} /></section>)}</section> : null}
    <section className="print-sheet"><header className="print-title"><div className="print-brand"><img src="./icons/eft-logo.png" alt="ЭФТ" /><div><strong>ЭнергоЭффективные Технологии</strong><span>Расчёт комплектации дома</span></div></div><div><h1>КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</h1><strong>Проект № {project.meta.projectNum || '—'}</strong></div></header>
      <div className="project-summary">
        <dl>
          <div><dt>Заказчик</dt><dd>{project.meta.customer || 'Не указан'}</dd></div>
          <div><dt>Адрес</dt><dd>{project.meta.address || 'Не указан'}</dd></div>
          <div><dt>Дата расчёта</dt><dd>{project.meta.date}</dd></div>
          <div><dt>Автор</dt><dd>{project.meta.author || 'ЭФТ'}</dd></div>
        </dl>
        <dl>
          <div><dt>Габариты дома</dt><dd>{formatNumber(project.plan.house.w)} × {formatNumber(project.plan.house.h)} м · {calculation.metrics.floorCount} эт.</dd></div>
          <div><dt>Площадь этажей</dt><dd>{formatNumber(calculation.metrics.totalFloorArea)} м²</dd></div>
          {calculation.metrics.floorCount > 1 ? <div><dt>Полезная площадь / лестничный проём</dt><dd>{formatNumber(calculation.metrics.totalUsableFloorArea)} / {formatNumber(calculation.metrics.secondFloorOpeningArea)} м²</dd></div> : null}
          <div><dt>Помещения / СИП-потолок</dt><dd>{formatNumber(calculation.metrics.roomArea)} / {formatNumber(calculation.metrics.ceilingArea)} м²</dd></div>
          <div><dt>Перегородки 1 / 2 этаж</dt><dd>{formatNumber(calculation.metrics.firstFloorPartitionNetArea)} / {formatNumber(calculation.metrics.secondFloorPartitionNetArea)} м²</dd></div>
          <div><dt>Второй свет</dt><dd>{formatNumber(calculation.metrics.openCeilingArea)} м²</dd></div>
          <div><dt>Высота стен</dt><dd>{calculation.metrics.floorPlans.map(({ floor, plan }) => `${floor} эт. ${formatNumber(plan.wallHeight)} м`).join(' · ')}</dd></div>
          <div><dt>Наружные / внутренние стены</dt><dd>{project.plan.wallThickness * 1000} / {project.plan.partitionThickness * 1000} мм</dd></div>
        </dl>
      </div>
      <div className="estimate-totals"><Stat label="Материалы" value={formatMoney(clientEstimate.totals.materials)} /><Stat label="Работы" value={formatMoney(clientEstimate.totals.labor)} /><Stat label="Итого по предложению" value={formatMoney(clientEstimate.totals.total)} tone="accent" /></div>
      <PrintProjectDiagrams project={project} calculation={calculation} />
      <section className="commercial-scope" aria-labelledby="commercial-scope-title">
        <header><div><span>Комплектация проекта</span><h2 id="commercial-scope-title">Что посчитано и входит в предложение</h2></div><p>Перечень сформирован из активных разделов текущей сметы</p></header>
        <div className="commercial-scope-grid">{commercialScope.map((item) => <article key={item.key} className="commercial-scope-item"><div className="commercial-scope-heading"><h3>{item.title}</h3><strong>{item.total}</strong></div><p>{item.summary}</p><small>{item.details}</small><div className="commercial-scope-tags">{item.coverage.map((label) => <span key={label}>{label}</span>)}</div></article>)}</div>
        <footer>В стоимость входят только перечисленные выше разделы. Подробные количества, цены материалов и работ приведены далее в смете.</footer>
      </section>
      <div className="no-print">{calculation.sections.map((section) => <section className="estimate-section" key={section.key}><h2>{section.title}</h2><EstimateSectionEditor section={section} project={project} commit={commit} /></section>)}</div>
      <div className="print-only">{clientEstimate.sections.map((section) => <section className="estimate-section" key={section.key}><h2>{section.title}</h2><PreviewTable lines={section.lines} /></section>)}</div>
      <footer className="estimate-footer"><p>Расчёт сформирован в калькуляторе ЭФТ. Итоговая стоимость уточняется после проверки проекта специалистом.</p><strong>Итого: {formatMoney(clientEstimate.totals.total)}</strong></footer>
    </section>
  </div>;
}
