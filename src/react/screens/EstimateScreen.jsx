import { lazy, Suspense, useMemo, useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { AlertTriangle, FileSpreadsheet, FileDown, Printer, ImagePlus, Trash2, ArrowLeft, ArrowRight, Plus, Box, FolderOpen, FileText, Share2, Send } from 'lucide-react';
import { useProject } from '../state/ProjectContext.jsx';
import { calculateProject } from '../calculations/estimate-engine.js';
import { adjustedEstimateCalculation } from '../calculations/price-adjustments.js';
import { buildCommercialScope } from '../calculations/commercial-scope.js';
import { buildClientEstimate, isEstimateCutting, unpricedClientLines } from '../calculations/client-estimate.js';
import { estimateLayerStages } from '../calculations/estimate-layer-scope.js';
import { downloadEstimateWorkbook } from '../export/xlsx.js';
import { estimatePdfTitle } from '../export/estimate-pdf-title.js';
import { downloadEstimatePdf } from '../export/download-estimate-pdf.js';
import { EditableEstimateTable, PreviewTable, ScreenHeader, Stat } from '../components/ui.jsx';
import { PrintProjectDiagrams } from '../components/PrintProjectDiagrams.jsx';
import { EstimateLayerControls } from '../components/EstimateLayerControls.jsx';
import { ProposalOverview } from '../components/ProposalOverview.jsx';
import { formatMoney, formatNumber } from '../utils/format.js';
import { addEstimateGroup, addEstimateLine, changeEstimateLine, removeEmptyEstimateGroup, removeEstimateLine, renameEstimateGroup, resetEstimateLine, resetEstimateSection } from '../state/estimate-edits.js';
import { MAX_ESTIMATE_IMAGES, MAX_ESTIMATE_IMAGE_DATA, estimateImageFullPage, prepareEstimateImage } from '../state/estimate-images.js';
import { MAX_ESTIMATE_FILES, estimateFileUrl, normalizeEstimateFiles } from '../state/estimate-files.js';
import { useCurrentPriceAction } from '../cloud/useCurrentPriceAction.js';
import { resolveEftApiUrl } from '../../shared/team-api.js';
import { eftApi } from '../../shared/team-api.js';
import { useTeam } from '../cloud/TeamContext.jsx';
import { ALEXEY_EMAIL, estimateMailContent } from '../export/estimate-mail.js';

const EstimateFilePicker = lazy(() => import('../components/EstimateFilePicker.jsx'));
const Estimate3DViewDialog = lazy(() => import('../components/Estimate3DViewDialog.jsx'));

function EstimateSectionEditor({ section, project, commit }) {
  const hiddenCount = (project.estimateOverrides || []).filter((item) => item.section === section.key && item.excluded).length;
  const update = (mutate) => commit((next) => { mutate(next); return next; });
  return <EditableEstimateTable
    lines={section.lines}
    grouped={section.key === 'sip' || section.key === 'engineering'}
    hiddenCount={hiddenCount}
    sharedCatalog={project.sharedPriceCatalog?.source === 'server' ? [...project.priceMat, ...project.priceLab] : null}
    priceChangedIds={new Set([...(project.estimateOverrides||[]).filter(item=>item.price!==undefined).map(item=>item.lineId), ...(project.customEstimateLines||[]).filter(item=>item.priceOverride!==undefined).map(item=>item.id)])}
    onChangeLine={(line, changes) => update((next) => changeEstimateLine(next, line, changes))}
    onRemoveLine={(line) => update((next) => removeEstimateLine(next, line))}
    onResetLine={(line) => update((next) => resetEstimateLine(next, line.id))}
    onAddLine={() => update((next) => addEstimateLine(next, section.key))}
    onResetSection={section.custom ? null : () => update((next) => resetEstimateSection(next, section.key))}
  />;
}

export default function EstimateScreen({ directPrint = false, onDirectPrintDone }) {
  const [settingsWidth,setSettingsWidth]=useState(()=>Math.max(300,Math.min(620,Number(localStorage.getItem('eft-estimate-settings-width'))||380)));
  const resizeSettings=event=>{event.preventDefault();const start=event.clientX,width=settingsWidth;const move=e=>setSettingsWidth(Math.max(300,Math.min(620,width+start-e.clientX)));const finish=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);};
  useEffect(()=>{localStorage.setItem('eft-estimate-settings-width',String(settingsWidth));},[settingsWidth]);
  const [formationDate, setFormationDate] = useState(() => new Date().toLocaleDateString('ru-RU'));
  useEffect(() => {
    const refreshDate = () => flushSync(() => setFormationDate(new Date().toLocaleDateString('ru-RU')));
    window.addEventListener('beforeprint', refreshDate);
    return () => window.removeEventListener('beforeprint', refreshDate);
  }, []);
  const { project, commit } = useProject();
  const team = useTeam();
  const pdfTitle = estimatePdfTitle(project.meta);
  useEffect(() => {
    const previousTitle = document.title;
    document.title = pdfTitle;
    return () => { document.title = previousTitle; };
  }, [pdfTitle]);
  const fileInput = useRef(null);
  const [imageError, setImageError] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [printReady, setPrintReady] = useState(false);
  const [printPreparing, setPrintPreparing] = useState(false);
  const [pdfPreparing, setPdfPreparing] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [mailSending,setMailSending]=useState(false);
  const [mailNotice,setMailNotice]=useState('');
  const estimateImages = project.estimateImages || [];
  const estimateFiles = project.estimateFiles || [];
  const appendImages = async (files, caption = '', { fullPage = false } = {}) => {
    if (!files.length) return;
    setImageError('');
    setUploadingImages(true);
    try {
      if (estimateImages.length + files.length > MAX_ESTIMATE_IMAGES) throw new Error(`В смету можно добавить не более ${MAX_ESTIMATE_IMAGES} изображений.`);
      const added = [];
      let total = estimateImages.reduce((sum, image) => sum + image.data.length, 0);
      for (const file of files) {
        const image = await prepareEstimateImage(file);
        if (caption) image.caption = caption.slice(0, 160);
        if (fullPage) image.fullPage = true;
        total += image.data.length;
        if (total > MAX_ESTIMATE_IMAGE_DATA) throw new Error('Общий размер изображений для сметы превышает 2,8 МБ. Удалите часть изображений или выберите другие.');
        added.push(image);
      }
      commit((next) => { next.estimateImages = [...(next.estimateImages || []), ...added]; return next; });
    } catch (error) {
      setImageError(error.message);
      throw error;
    } finally {
      setUploadingImages(false);
    }
  };
  const addImages = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    appendImages(files).catch(() => {});
  };
  const addInternalFile = async (file) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mime_type)) {
      const url = estimateFileUrl({ source: file.source, sourceId: file.id, name: file.original_name }, resolveEftApiUrl());
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error(`Не удалось открыть ${file.original_name} (${response.status}).`);
      await appendImages([new File([await response.blob()], file.original_name, { type: file.mime_type })]);
      return;
    }
    if (estimateFiles.length >= MAX_ESTIMATE_FILES) throw new Error(`В смете может быть не более ${MAX_ESTIMATE_FILES} ссылок на документы.`);
    if (estimateFiles.some(item => item.source === file.source && item.sourceId === file.id)) return;
    commit(next => { next.estimateFiles = normalizeEstimateFiles([...(next.estimateFiles || []), { id: crypto.randomUUID(), source: file.source, sourceId: file.id, name: file.original_name, mime: file.mime_type }]); return next; });
  };
  const removeFile = id => commit(next => { next.estimateFiles = (next.estimateFiles || []).filter(file => file.id !== id); return next; });
  const updateImage = (id, changes) => commit((next) => { next.estimateImages = (next.estimateImages || []).map(image => image.id === id ? { ...image, ...changes } : image); return next; });
  const removeImage = (id) => commit((next) => { next.estimateImages = (next.estimateImages || []).filter(image => image.id !== id); return next; });
  const moveImage = (index, direction) => commit((next) => { const images = [...(next.estimateImages || [])]; const target = index + direction; if (target < 0 || target >= images.length) return next; [images[index], images[target]] = [images[target], images[index]]; next.estimateImages = images; return next; });
  const calculation = useMemo(() => calculateProject(project), [project]);
  const adjustedCalculation = useMemo(() => adjustedEstimateCalculation(project, calculation), [project, calculation]);
  const setPrintOption = (key, value) => commit((next) => {
    next.settings.print = { ...(next.settings.print || {}), [key]: value };
    if (value && key === 'superCompact') next.settings.print.maximumCompact = false;
    if (value && key === 'maximumCompact') next.settings.print.superCompact = false;
    return next;
  });
  const printOptions = project.settings.print || {};
  const setExcludedLayers = (excluded, ids=[], enabled=false) => commit(next => {
    next.settings.print = { ...(next.settings.print || {}), excludedEstimateLayers: excluded };
    if (!excluded.length) { next.settings.print.includeLabor = true; next.settings.print.includeAccessories = true; }
    if (enabled && ids.some(id=>id.endsWith('|labor'))) next.settings.print.includeLabor = true;
    if (enabled && ids.some(id=>id.endsWith('|accessory'))) next.settings.print.includeAccessories = true;
    return next;
  });
  const layerStages = useMemo(() => {
    const stages=estimateLayerStages(adjustedCalculation);
    for(const [key,title,service] of [['missing:ceiling','Потолок','sipCeiling'],['missing:roof','Кровля','roof'],['missing:gables','Фронтоны',null]]) {
      const exists=key==='missing:ceiling'?stages.some(stage=>/потолок/iu.test(stage.title)):key==='missing:gables'?stages.some(stage=>stage.key==='roof:gables'):stages.some(stage=>stage.sectionKey==='roof');
      if(!exists)stages.push({key,title,service,layers:[]});
    }
    return stages;
  }, [adjustedCalculation]);
  const commercialScope = useMemo(() => buildCommercialScope(project, adjustedCalculation, printOptions), [project, adjustedCalculation, printOptions]);
  const clientEstimate = useMemo(
    () => buildClientEstimate(adjustedCalculation, printOptions),
    [adjustedCalculation, printOptions],
  );
  const pendingClientPrices = useMemo(
    () => unpricedClientLines(adjustedCalculation, printOptions),
    [adjustedCalculation, printOptions],
  );
  const visibleManagerSections = useMemo(
    () => calculation.sections
      .map((section) => ({
        ...section,
        lines: printOptions.includeLabor === false
          ? section.lines.filter((line) => line.kind !== 'labor' || isEstimateCutting(line))
          : section.lines,
      }))
      .filter((section) => section.lines.length || section.custom),
    [calculation, printOptions.includeLabor],
  );
  const handlePrint = () => {
    if (pendingClientPrices.length) {
      window.alert(`Заполните цены в прайс-листе: ${pendingClientPrices.map((line) => line.name).join(' · ')}`);
      return;
    }
    window.print();
  };
  const preparePrint = useCurrentPriceAction(() => {
    if (pendingClientPrices.length) {
      window.alert(`Заполните цены в прайс-листе: ${pendingClientPrices.map(line => line.name).join(' · ')}`);
      return;
    }
    setPrintReady(true);
  });
  const printCurrent = async () => {
    if (printPreparing) return;
    setPrintPreparing(true);
    try { await preparePrint(); }
    finally { setPrintPreparing(false); }
  };
  const confirmPrint = () => {
    flushSync(() => setPrintReady(false));
    handlePrint();
  };
  const runDirectPrint = useCurrentPriceAction(() => {
    if (pendingClientPrices.length) {
      window.alert(`Заполните цены в прайс-листе: ${pendingClientPrices.map((line) => line.name).join(' · ')}`);
      return false;
    }
    document.body.classList.add('print-estimate-from-plan');
    window.print();
    return true;
  });
  const directPrintActionRef = useRef(runDirectPrint);
  directPrintActionRef.current = runDirectPrint;
  const directPrintDoneRef = useRef(onDirectPrintDone);
  directPrintDoneRef.current = onDirectPrintDone;
  useEffect(() => {
    if (!directPrint) return undefined;
    let cancelled = false;
    const frame = requestAnimationFrame(() => requestAnimationFrame(async () => {
      if (cancelled) return;
      const started = await directPrintActionRef.current();
      if (started !== true) directPrintDoneRef.current?.();
    }));
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [directPrint]);
  useEffect(() => {
    if (!directPrint) return undefined;
    const finish = () => onDirectPrintDone?.();
    window.addEventListener('afterprint', finish);
    return () => {
      window.removeEventListener('afterprint', finish);
      document.body.classList.remove('print-estimate-from-plan');
    };
  }, [directPrint, onDirectPrintDone]);
  const exportCurrent = useCurrentPriceAction(() => {
    if (project.sharedPriceCatalog && pendingClientPrices.length) { window.alert('Заполните недостающие цены в общем прайс-листе перед выгрузкой сметы.'); return; }
    downloadEstimateWorkbook(project, calculation);
  });
  const preparePdf = useCurrentPriceAction(async () => {
    if (pendingClientPrices.length) { window.alert(`Заполните цены в прайс-листе: ${pendingClientPrices.map(line => line.name).join(' · ')}`); return; }
    await downloadEstimatePdf(document.querySelector('.estimate-screen .print-sheet'), pdfTitle);
  });
  const downloadPdf = async () => {
    if (pdfPreparing) return;
    setPdfPreparing(true); setPdfError('');
    try { await preparePdf(); } catch (error) { setPdfError(error?.message || 'Не удалось сохранить PDF.'); }
    finally { setPdfPreparing(false); }
  };
  const makePdfFile = async () => {
    if (pendingClientPrices.length) throw new Error('Укажите недостающие цены перед отправкой сметы.');
    const blob = await downloadEstimatePdf(document.querySelector('.estimate-screen .print-sheet'), pdfTitle, { save: false });
    return new File([blob], `${pdfTitle}.pdf`, { type: 'application/pdf' });
  };
  const shareEstimate = useCurrentPriceAction(async () => {
    setMailNotice('');
    try {
      const file = await makePdfFile();
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: pdfTitle, files: [file] });
      else {
        const url = URL.createObjectURL(file),link = document.createElement('a');
        link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
        setMailNotice('PDF сохранён. Его можно передать через почту или мессенджер.');
      }
    } catch (error) { if (error.name !== 'AbortError') setMailNotice(error.message || 'Не удалось поделиться сметой.'); }
  });
  const sendEstimateToAlexey = useCurrentPriceAction(async () => {
    if (mailSending) return;
    if (!team.user || team.user.role === 'viewer') { setMailNotice('Войдите в командный режим с правом отправки почты.'); return; }
    setMailSending(true);setMailNotice('Формирую PDF и отправляю письмо…');
    try {
      const file=await makePdfFile(),mail=estimateMailContent(project.meta),form=new FormData();
      form.append('to',ALEXEY_EMAIL);form.append('subject',mail.subject);form.append('body',mail.body);form.append('attachments[]',file);
      await eftApi('mail-send',{method:'POST',csrf:team.csrf,body:form});
      setMailNotice(`Письмо отправлено на ${ALEXEY_EMAIL}. PDF приложен.`);
    } catch (error) { setMailNotice(error.message || 'Письмо не отправлено.'); }
    finally { setMailSending(false); }
  });
  const planLayers = [
    ['showContour', 'Контур дома'], ['showRooms', 'Комнаты и перегородки'],
    ['showOpenings', 'Окна и двери'], ['showPlatforms', 'Терраса и крыльцо'],
    ['showPiles', project.settings.piles?.pileType === 'concreteBlock' ? 'Блоки' : 'Сваи'], ['showBinding', 'Обвязка'], ['showDimensions', 'Размеры'],
  ];
  return <div className={`screen estimate-screen${printOptions.maximumCompact === true ? ' maximum-compact' : ''}${printOptions.superCompact ? ' super-compact' : ''}`}><ScreenHeader title="Смета проекта" description={project.sharedPriceCatalog ? `Общий прайс · версия ${project.sharedPriceCatalog.revision}` : ''} actions={<><button className="button secondary no-print" onClick={exportCurrent}><FileSpreadsheet />Скачать Excel</button><button className="button primary no-print" onClick={printCurrent} disabled={printPreparing}><Printer />{printPreparing ? 'Подготовка…' : 'Печать'}</button><button className="button primary no-print estimate-download-pdf" onClick={downloadPdf} disabled={pdfPreparing}><FileDown />{pdfPreparing ? 'Создаю PDF…' : 'PDF ↓'}</button><button type="button" className="button secondary no-print" onClick={shareEstimate}><Share2 />Поделиться</button><button type="button" className="button primary no-print" onClick={sendEstimateToAlexey} disabled={mailSending}><Send />{mailSending?'Отправляю…':'Отправить Алексею'}</button></>} />
    {mailNotice ? <p className="notice no-print" role="status">{mailNotice}</p> : null}
    {pdfError ? <p className="estimate-pdf-error no-print" role="alert">{pdfError}</p> : null}
    <div className="estimate-workspace" style={{'--estimate-settings-width':`${settingsWidth}px`}}><aside className="estimate-settings-column no-print"><div className="estimate-settings-resizer" role="separator" aria-label="Ширина настроек сметы" aria-orientation="vertical" tabIndex={0} onPointerDown={resizeSettings} onKeyDown={event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();setSettingsWidth(width=>Math.max(300,Math.min(620,width+(event.key==='ArrowLeft'?20:-20))));}}}/>
    <section className="estimate-settings no-print"><h2>Настройки клиентской сметы</h2><details><summary>Оформление и печатные планы</summary><div className="estimate-mode-switch" role="group" aria-label="Подробность сметы">{[['super','Суперкомпактная'],['compact','Компактная'],['detailed','Подробная']].map(([key,label])=><button type="button" key={key} aria-pressed={key===(printOptions.superCompact?'super':printOptions.maximumCompact?'compact':'detailed')} onClick={()=>commit(next=>{next.settings.print={...next.settings.print,superCompact:key==='super',maximumCompact:key==='compact'};return next;})}>{label}</button>)}</div>
    {pendingClientPrices.length ? <div className="estimate-price-warning no-print"><AlertTriangle /><div><strong>В предложении есть позиции без цены</strong><span>{pendingClientPrices.map((line) => line.name).join(' · ')}. Укажите цену своей позиции в смете, либо выберите позицию общего прайса, либо исключите строку из предложения.</span></div></div> : null}
    <section className="print-diagram-options no-print" aria-label="Настройки предложения"><div><strong>Смета для клиента</strong></div><div className="print-option-group"><label><input type="checkbox" checked={printOptions.includeLabor !== false} onChange={(event) => setPrintOption('includeLabor', event.target.checked)} />Включить работы</label><label><input type="checkbox" checked={printOptions.includeAccessories !== false} onChange={(event) => setPrintOption('includeAccessories', event.target.checked)} />Включить крепёж и сопутствующие товары</label><label><input type="checkbox" checked={printOptions.compactAccessories !== false} onChange={(event) => setPrintOption('compactAccessories', event.target.checked)} />Сгруппировать их в монтажные комплекты</label></div><div><strong>Планы из редактора дома</strong><small>Планы этажей формируются из текущего проекта и обновляются вместе с ним.</small></div><div className="print-option-group"><label><input type="checkbox" checked={printOptions.includePlan !== false} onChange={(event) => setPrintOption('includePlan', event.target.checked)} />Планы этажей в смете</label><label><input type="checkbox" checked={printOptions.separatePlanSheets !== false} disabled={printOptions.includePlan === false} onChange={(event) => setPrintOption('separatePlanSheets', event.target.checked)} />Каждый этаж отдельным листом</label><label><input type="checkbox" checked={printOptions.includeRoof === true} onChange={(event) => setPrintOption('includeRoof', event.target.checked)} />Крыша на контуре дома</label><label><input type="checkbox" checked={printOptions.separatePileSheet === true} onChange={(event) => setPrintOption('separatePileSheet', event.target.checked)} />Свайное поле отдельным листом</label><label><input type="checkbox" checked={printOptions.separateRoofSheet !== false} disabled={printOptions.includeRoof !== true} onChange={(event) => setPrintOption('separateRoofSheet', event.target.checked)} />Крыша отдельным листом</label></div>{printOptions.includePlan !== false ? <div className="print-option-group plan-layers"><span>Слои плана:</span>{planLayers.map(([key, label]) => <label key={key}><input type="checkbox" checked={printOptions[key] !== false} onChange={(event) => setPrintOption(key, event.target.checked)} />{label}</label>)}</div> : null}</section>
    </details><label className="estimate-merge-option"><input type="checkbox" checked={printOptions.mergeConstructionMaterials === true} onChange={event=>setPrintOption('mergeConstructionMaterials',event.target.checked)}/>Объединить одинаковые панели и пиломатериал всех конструкций в сводные позиции</label><EstimateLayerControls stages={layerStages} options={printOptions} total={clientEstimate.totals.total} onChange={setExcludedLayers} onEnable={service=>commit(next=>{next.services[service]=true;return next;})} /></section>
        <header className="no-print"><div><h2>Изображения и 3D-виды в смете</h2><p>Изображения сохраняются с проектом и печатаются в PDF.</p></div><div className="estimate-image-source-actions"><button type="button" className="button secondary" disabled={uploadingImages || estimateImages.length >= MAX_ESTIMATE_IMAGES} onClick={() => fileInput.current?.click()}><ImagePlus />С компьютера</button><button type="button" className="button secondary" disabled={uploadingImages} onClick={() => setFilePickerOpen(true)}><FolderOpen />Из внутренних файлов</button><button type="button" className="button secondary" disabled={uploadingImages || estimateImages.length >= MAX_ESTIMATE_IMAGES} onClick={() => setViewDialogOpen(true)}><Box />Создать 3D-вид</button><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addImages} /></div></header></aside><main className="estimate-preview-column">
    <section className="print-sheet"><header className="print-title"><div className="print-brand"><img src="./icons/eft-logo.png" alt="Логотип ЭФТ" /><div><strong>ЭнергоЭффективные Технологии</strong><span>Проектирование и комплектация SIP-домов</span></div></div><div className="print-title-project"><span>СМЕТА · КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</span><h1>{project.meta.projectName || 'Проект дома'}</h1><strong>{project.meta.projectNum && project.meta.projectNum !== '0001' ? `Проект № ${project.meta.projectNum}` : 'Предварительный расчёт'} · {formationDate}</strong></div><div className="print-brand-contacts"><span>Связаться с нами</span><strong>+7 (495) 745-99-11 · +7 (901) 523-23-11</strong><span>eftsip.ru · info@eftsip.ru</span></div></header>
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
          {project.upperFloors?.[0]?.floorType === 'attic' && calculation.metrics.floorCount > 1 ? <div><dt>Мансардный этаж</dt><dd>Наружные стены {formatNumber(project.upperFloors[0].wallHeight)} м · перегородки {formatNumber(project.upperFloors[0].partitionHeight)} м · {project.upperFloors[0].atticHorizontalCeiling ? 'горизонтальный SIP-потолок' : 'потолок по скатам'}</dd></div> : null}
          <div><dt>Наружные / внутренние стены</dt><dd>{project.plan.wallThickness * 1000} / {project.plan.partitionThickness * 1000} мм</dd></div>
        </dl>
      </div>
      <div className="estimate-totals"><Stat label="Материалы" value={formatMoney(clientEstimate.totals.materials)} /><Stat label="Работы" value={formatMoney(clientEstimate.totals.labor)} /><Stat label="Итого по предложению" value={formatMoney(clientEstimate.totals.total)} tone="accent" /></div>
      <ProposalOverview scope={commercialScope} options={printOptions} />
      <PrintProjectDiagrams project={project} calculation={calculation} />
      <section className={`estimate-images${estimateImages.length ? '' : ' no-print'}`} aria-label="Изображения проекта в смете">

        {imageError ? <p className="estimate-image-error no-print" role="alert">{imageError}</p> : null}
        {estimateImages.length ? <div className="estimate-images-grid">{estimateImages.map((image, index) => <figure key={image.id} className={estimateImageFullPage(image) ? 'is-full-page' : ''}><img src={image.data} alt={image.caption || `Изображение проекта ${index + 1}`} /><figcaption><span className="print-only">{image.caption || `Изображение ${index + 1}`}</span><input className="no-print" aria-label={`Подпись изображения ${index + 1}`} value={image.caption} maxLength={160} placeholder="Подпись к изображению" onChange={(event) => updateImage(image.id, { caption: event.target.value })} /></figcaption><label className="estimate-image-page-option no-print"><input type="checkbox" checked={estimateImageFullPage(image)} onChange={(event) => updateImage(image.id, { fullPage: event.target.checked })} />На отдельный лист</label><div className="estimate-image-actions no-print"><button type="button" aria-label={`Переместить изображение ${index + 1} влево`} disabled={index === 0} onClick={() => moveImage(index, -1)}><ArrowLeft /></button><button type="button" aria-label={`Переместить изображение ${index + 1} вправо`} disabled={index === estimateImages.length - 1} onClick={() => moveImage(index, 1)}><ArrowRight /></button><button type="button" aria-label={`Удалить изображение ${index + 1}`} onClick={() => removeImage(image.id)}><Trash2 /></button></div></figure>)}</div> : <p className="estimate-images-empty no-print">Пока без дополнительных изображений.</p>}
      </section>
      {estimateFiles.length ? <section className="estimate-file-references" aria-label="Внутренние документы проекта"><h2>Внутренние документы · доступ сотрудникам</h2><p>Документы хранятся на сервере. Для открытия ссылки нужен вход во внутренние файлы.</p><ul>{estimateFiles.map(file => <li key={file.id}><FileText size={16} /><a href={estimateFileUrl(file, resolveEftApiUrl())} target="_blank" rel="noreferrer">{file.name}</a><button type="button" className="icon-button no-print" aria-label={`Удалить файл ${file.name}`} onClick={() => removeFile(file.id)}><Trash2 size={16} /></button></li>)}</ul></section> : null}
      <section className="commercial-scope" aria-labelledby="commercial-scope-title">
        <header><div><span>Комплектация проекта</span><h2 id="commercial-scope-title">Что посчитано и входит в предложение</h2></div><p>Перечень сформирован из активных разделов текущей сметы</p></header>
        <div className="commercial-scope-grid">{commercialScope.map((item, index) => <article key={item.key} data-scope={item.key} className={`commercial-scope-item${item.blocks?.length ? ' has-scope-blocks' : ''}`}><div className="commercial-scope-heading"><h3>{printOptions.superCompact ? `${String(index + 1).padStart(2, '0')} · ` : ''}{item.title}</h3><strong>{item.total}</strong></div><p>{item.summary}</p><small>{item.details}</small>{item.blocks?.length ? <dl className="proposal-assemblies">{item.blocks.map((block, blockIndex) => <div key={`${block.title}-${blockIndex}`}><dt>{block.title}</dt><dd>{block.paragraphs ? block.paragraphs.map((text, i) => <p key={i}>{text}</p>) : block.text}</dd></div>)}</dl> : null}{printOptions.superCompact ? <p className="scope-expanded">{item.expanded}</p> : null}<div className="commercial-scope-tags">{item.coverage.map((label) => <span key={label}>{label}</span>)}</div></article>)}</div>
        <footer>В стоимость входят только перечисленные выше разделы. {printOptions.superCompact ? 'Предложение показывает состав и стоимость выбранной комплектации. Детальная спецификация доступна в полной смете; дополнительные работы и изменения согласуются отдельно.' : 'Подробные количества, цены материалов и работ приведены далее в смете.'}</footer>
      </section>

      {!printOptions.superCompact ? <>

        <div className="print-only estimate-client-pages">{printOptions.maximumCompact ? <section className="estimate-section"><h2>Сводная смета</h2><PreviewTable lines={clientEstimate.compactLines} /></section> : clientEstimate.sections.map((section) => <section className="estimate-section" key={section.key}><h2>{section.title}</h2><PreviewTable lines={section.lines} /></section>)}</div>
      </> : null}
      <footer className="estimate-footer"><p>Расчёт сформирован в калькуляторе ЭФТ. Итоговая стоимость уточняется после проверки проекта специалистом.</p><strong>Итого: {formatMoney(clientEstimate.totals.total)}</strong></footer>
    </section>
        <details className="estimate-source-ledger no-print" open><summary>Исходная ведомость для редактирования</summary><div className="estimate-custom-groups-toolbar"><button type="button" className="button secondary compact-button" onClick={() => commit((next) => { addEstimateGroup(next); return next; })}><Plus />Добавить группу сметы</button><span>Новая группа и её строки сохраняются в проекте и попадают в итог, Excel и PDF.</span></div>{visibleManagerSections.map((section) => <section className="estimate-section" key={section.key}>{section.custom ? <div className="estimate-custom-group-title"><input aria-label={`Название группы: ${section.title}`} value={(project.customEstimateGroups || []).find((group) => group.id === section.key)?.name || ''} onChange={(event) => commit((next) => { renameEstimateGroup(next, section.key, event.target.value); return next; })} placeholder="Название группы" /><button type="button" className="icon-button danger" aria-label={`Удалить пустую группу: ${section.title}`} title={section.lines.length ? 'Сначала удалите позиции группы' : 'Удалить пустую группу'} disabled={section.lines.length > 0} onClick={() => commit((next) => { removeEmptyEstimateGroup(next, section.key); return next; })}><Trash2 /></button></div> : <h2>{section.title}</h2>}<EstimateSectionEditor section={section} project={project} commit={commit} /></section>)}</details>
</main></div>
    {filePickerOpen ? <Suspense fallback={<p role="status">Загружаю файлы…</p>}><EstimateFilePicker onClose={() => setFilePickerOpen(false)} onSelect={addInternalFile} selectedFiles={estimateFiles} /></Suspense> : null}
    {viewDialogOpen ? <Suspense fallback={<p role="status">Загружаю 3D…</p>}><Estimate3DViewDialog project={project} calculation={calculation} onClose={() => setViewDialogOpen(false)} onCreate={(file, caption) => appendImages([file], caption, { fullPage: true })} /></Suspense> : null}
    {printReady ? <div className="modal-backdrop estimate-print-backdrop no-print" onMouseDown={event => { if (event.target === event.currentTarget) setPrintReady(false); }}>
      <section className="modal estimate-print-dialog" role="dialog" aria-modal="true" aria-label="Печать сметы">
        <header><div><h2>Смета готова к печати</h2><p>В окне печати выберите «Сохранить как PDF», чтобы сохранить файл на устройство.</p></div></header>
        <footer><button type="button" className="button secondary" onClick={() => setPrintReady(false)}>Отмена</button><button type="button" className="button primary" autoFocus onClick={confirmPrint}><Printer />Открыть печать / PDF</button></footer>
      </section>
    </div> : null}
  </div>;
}
