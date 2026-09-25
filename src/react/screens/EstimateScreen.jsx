import { useMemo, useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { AlertTriangle, FileSpreadsheet, Printer, ImagePlus, Trash2, ArrowLeft, ArrowRight } from 'lucide-react';
import { useProject } from '../state/ProjectContext.jsx';
import { calculateProject } from '../calculations/estimate-engine.js';
import { buildCommercialScope } from '../calculations/commercial-scope.js';
import { buildClientEstimate, isEstimateCutting, unpricedClientLines } from '../calculations/client-estimate.js';
import { downloadEstimateWorkbook } from '../export/xlsx.js';
import { EditableEstimateTable, PreviewTable, ScreenHeader, Stat } from '../components/ui.jsx';
import { PrintProjectDiagrams } from '../components/PrintProjectDiagrams.jsx';
import { formatMoney, formatNumber } from '../utils/format.js';
import { addEstimateLine, changeEstimateLine, removeEstimateLine, resetEstimateLine, resetEstimateSection } from '../state/estimate-edits.js';
import { MAX_ESTIMATE_IMAGES, MAX_ESTIMATE_IMAGE_DATA, prepareEstimateImage } from '../state/estimate-images.js';

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
  const [formationDate, setFormationDate] = useState(() => new Date().toLocaleDateString('ru-RU'));
  useEffect(() => {
    const refreshDate = () => flushSync(() => setFormationDate(new Date().toLocaleDateString('ru-RU')));
    window.addEventListener('beforeprint', refreshDate);
    return () => window.removeEventListener('beforeprint', refreshDate);
  }, []);
  const { project, commit } = useProject();
  const fileInput = useRef(null);
  const [imageError, setImageError] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);
  const estimateImages = project.estimateImages || [];
  const addImages = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setImageError('');
    setUploadingImages(true);
    try {
      if (estimateImages.length + files.length > MAX_ESTIMATE_IMAGES) throw new Error(`В смету можно добавить не более ${MAX_ESTIMATE_IMAGES} изображений.`);
      const added = [];
      let total = estimateImages.reduce((sum, image) => sum + image.data.length, 0);
      for (const file of files) {
        const image = await prepareEstimateImage(file);
        total += image.data.length;
        if (total > MAX_ESTIMATE_IMAGE_DATA) throw new Error('Общий размер изображений для сметы превышает 2,8 МБ. Удалите часть изображений или выберите другие.');
        added.push(image);
      }
      commit((next) => { next.estimateImages = [...(next.estimateImages || []), ...added]; return next; });
    } catch (error) {
      setImageError(error.message);
    } finally {
      setUploadingImages(false);
    }
  };
  const updateImage = (id, changes) => commit((next) => { next.estimateImages = (next.estimateImages || []).map(image => image.id === id ? { ...image, ...changes } : image); return next; });
  const removeImage = (id) => commit((next) => { next.estimateImages = (next.estimateImages || []).filter(image => image.id !== id); return next; });
  const moveImage = (index, direction) => commit((next) => { const images = [...(next.estimateImages || [])]; const target = index + direction; if (target < 0 || target >= images.length) return next; [images[index], images[target]] = [images[target], images[index]]; next.estimateImages = images; return next; });
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
  const visibleManagerSections = useMemo(
    () => calculation.sections
      .map((section) => ({
        ...section,
        lines: printOptions.includeLabor === false
          ? section.lines.filter((line) => line.kind !== 'labor' || isEstimateCutting(line))
          : section.lines,
      }))
      .filter((section) => section.lines.length),
    [calculation, printOptions.includeLabor],
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
    <section className="print-diagram-options no-print" aria-label="Настройки предложения"><div><strong>Смета для клиента</strong></div><div className="print-option-group"><label className="maximum-compact-option"><input type="checkbox" checked={printOptions.maximumCompact === true} onChange={(event) => setPrintOption('maximumCompact', event.target.checked)} />Максимально компактная смета</label><label><input type="checkbox" checked={printOptions.includeLabor !== false} onChange={(event) => setPrintOption('includeLabor', event.target.checked)} />Включить работы</label><label><input type="checkbox" checked={printOptions.includeAccessories !== false} onChange={(event) => setPrintOption('includeAccessories', event.target.checked)} />Включить крепёж и сопутствующие товары</label><label><input type="checkbox" checked={printOptions.compactAccessories !== false} onChange={(event) => setPrintOption('compactAccessories', event.target.checked)} />Сгруппировать их в монтажные комплекты</label></div><div><strong>Планы из редактора дома</strong><small>Планы этажей формируются из текущего проекта и обновляются вместе с ним.</small></div><div className="print-option-group"><label><input type="checkbox" checked={printOptions.includePlan !== false} onChange={(event) => setPrintOption('includePlan', event.target.checked)} />Планы этажей в смете</label><label><input type="checkbox" checked={printOptions.separatePlanSheets !== false} disabled={printOptions.includePlan === false} onChange={(event) => setPrintOption('separatePlanSheets', event.target.checked)} />Каждый этаж отдельным листом</label><label><input type="checkbox" checked={printOptions.includeRoof === true} onChange={(event) => setPrintOption('includeRoof', event.target.checked)} />Крыша на контуре дома</label><label><input type="checkbox" checked={printOptions.separatePileSheet === true} onChange={(event) => setPrintOption('separatePileSheet', event.target.checked)} />Свайное поле отдельным листом</label><label><input type="checkbox" checked={printOptions.separateRoofSheet !== false} disabled={printOptions.includeRoof !== true} onChange={(event) => setPrintOption('separateRoofSheet', event.target.checked)} />Крыша отдельным листом</label></div>{printOptions.includePlan !== false ? <div className="print-option-group plan-layers"><span>Слои плана:</span>{planLayers.map(([key, label]) => <label key={key}><input type="checkbox" checked={printOptions[key] !== false} onChange={(event) => setPrintOption(key, event.target.checked)} />{label}</label>)}</div> : null}</section>
    {printOptions.maximumCompact === true ? <section className="compact-estimate-preview no-print"><header><div><strong>Предпросмотр компактной сметы</strong><span>Фильтр работ применяется и к подробной ведомости ниже</span></div><strong>{clientEstimate.sections.reduce((sum, section) => sum + section.lines.length, 0)} строк</strong></header>{clientEstimate.sections.map((section) => <section className="estimate-section" key={`preview-${section.key}`}><h2>{section.title}</h2><PreviewTable lines={section.lines} /></section>)}</section> : null}
    <section className="print-sheet"><header className="print-title"><div className="print-brand"><img src="./icons/eft-logo.png" alt="ЭФТ" /><div><strong>ЭнергоЭффективные Технологии</strong><span>Расчёт комплектации дома</span></div></div><div><h1>КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</h1><strong>Проект № {project.meta.projectNum || '—'}</strong></div></header>
      <div className="project-summary">
        <dl>
          <div><dt>Заказчик</dt><dd>{project.meta.customer || 'Не указан'}</dd></div>
          <div><dt>Адрес</dt><dd>{project.meta.address || 'Не указан'}</dd></div>
          <div><dt>Дата расчёта</dt><dd>{formationDate}</dd></div>
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
      <section className="estimate-images" aria-label="Изображения проекта в смете">
        <header className="no-print"><div><h2>Свои изображения в смете</h2><p>Планы, эскизы и фотографии сохраняются вместе с проектом и печатаются в PDF.</p></div><button type="button" className="button secondary" disabled={uploadingImages || estimateImages.length >= MAX_ESTIMATE_IMAGES} onClick={() => fileInput.current?.click()}><ImagePlus />{uploadingImages ? 'Обработка…' : 'Добавить изображения'}</button><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addImages} /></header>
        {imageError ? <p className="estimate-image-error no-print" role="alert">{imageError}</p> : null}
        {estimateImages.length ? <div className="estimate-images-grid">{estimateImages.map((image, index) => <figure key={image.id}><img src={image.data} alt={image.caption || `Изображение проекта ${index + 1}`} /><figcaption><span className="print-only">{image.caption || `Изображение ${index + 1}`}</span><input className="no-print" aria-label={`Подпись изображения ${index + 1}`} value={image.caption} maxLength={160} placeholder="Подпись к изображению" onChange={(event) => updateImage(image.id, { caption: event.target.value })} /></figcaption><div className="estimate-image-actions no-print"><button type="button" aria-label={`Переместить изображение ${index + 1} влево`} disabled={index === 0} onClick={() => moveImage(index, -1)}><ArrowLeft /></button><button type="button" aria-label={`Переместить изображение ${index + 1} вправо`} disabled={index === estimateImages.length - 1} onClick={() => moveImage(index, 1)}><ArrowRight /></button><button type="button" aria-label={`Удалить изображение ${index + 1}`} onClick={() => removeImage(image.id)}><Trash2 /></button></div></figure>)}</div> : <p className="estimate-images-empty no-print">Пока без дополнительных изображений.</p>}
      </section>
      <section className="commercial-scope" aria-labelledby="commercial-scope-title">
        <header><div><span>Комплектация проекта</span><h2 id="commercial-scope-title">Что посчитано и входит в предложение</h2></div><p>Перечень сформирован из активных разделов текущей сметы</p></header>
        <div className="commercial-scope-grid">{commercialScope.map((item) => <article key={item.key} className="commercial-scope-item"><div className="commercial-scope-heading"><h3>{item.title}</h3><strong>{item.total}</strong></div><p>{item.summary}</p><small>{item.details}</small><div className="commercial-scope-tags">{item.coverage.map((label) => <span key={label}>{label}</span>)}</div></article>)}</div>
        <footer>В стоимость входят только перечисленные выше разделы. Подробные количества, цены материалов и работ приведены далее в смете.</footer>
      </section>
      <div className="no-print">{visibleManagerSections.map((section) => <section className="estimate-section" key={section.key}><h2>{section.title}</h2><EstimateSectionEditor section={section} project={project} commit={commit} /></section>)}</div>
      <div className="print-only">{clientEstimate.sections.map((section) => <section className="estimate-section" key={section.key}><h2>{section.title}</h2><PreviewTable lines={section.lines} /></section>)}</div>
      <footer className="estimate-footer"><p>Расчёт сформирован в калькуляторе ЭФТ. Итоговая стоимость уточняется после проверки проекта специалистом.</p><strong>Итого: {formatMoney(clientEstimate.totals.total)}</strong></footer>
    </section>
  </div>;
}
