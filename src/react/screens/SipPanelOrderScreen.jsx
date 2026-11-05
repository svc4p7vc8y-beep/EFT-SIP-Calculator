import { useMemo, useRef, useState } from 'react';
import { NumberField, ScreenHeader, SelectField } from '../components/ui.jsx';
import { useProject } from '../state/ProjectContext.jsx';
import { SIP_ORDER_FORMATS, SIP_ORDER_RATES } from '../data/sip-panel-order.js';
import {
  SIP_ORDER_LIMIT, SIP_ORDER_SECTION, calculateSipOrderRow,
  newSipOrderPanel, normalizeSipPanelOrder, sipOrderRates,
} from '../calculations/sip-panel-order.js';
import { formatNumber, uid } from '../utils/format.js';
import './sip-panel-order.css';

const CUT_MODES = [
  { value: 'along', label: 'Пополам вдоль · пол 625 мм при ширине 1250 мм' },
  { value: 'across', label: 'Пополам поперёк' },
  { value: 'split', label: 'Вдоль и затем поперёк половинок' },
];
const CORE_TYPES = [
  { value: 'pps', label: 'Пенополистирол (ППС)' },
  { value: 'wool', label: 'Минеральная вата' },
  { value: 'custom', label: 'Другой материал' },
];
const THICKNESSES = [100, 150, 200].map(value => ({ value: String(value), label: `${value} мм` }));
const SPLITS = [0, 1, 2].map(value => ({ value: String(value), label: String(value) }));
const rowSum = row => Number(row.price) * Number(row.qty);
const money = value => `${formatNumber(value, 2)} ₽`;

function csvCell(value) {
  let text = String(value);
  if (/^\s*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function CustomerTable({ lines }) {
  return <table className="sip-order-table">
    <thead><tr><th>Позиция</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr></thead>
    <tbody>{lines.map(line => <tr key={line.id || 'draft'}>
      <td>{line.name}</td><td>{formatNumber(line.qty, 5)} {line.unit}</td>
      <td>{money(line.price)}</td><td>{money(rowSum(line))}</td>
    </tr>)}</tbody>
    <tfoot><tr><td colSpan="3">Итого</td><td>{money(lines.reduce((sum, line) => sum + rowSum(line), 0))}</td></tr></tfoot>
  </table>;
}

function SipPanelOrder({ calculation, onNavigate }) {
  const { project, commit } = useProject();
  const order = useMemo(() => normalizeSipPanelOrder(project.sipPanelOrder), [project.sipPanelOrder]);
  const rates = useMemo(() => sipOrderRates(project), [project.priceMat, project.priceLab, project.sipPanelOrder?.rates]);
  const [panel, setPanel] = useState(newSipOrderPanel);
  const [cut, setCut] = useState({ mode: 'along', split: 0, qty: '', sourceId: '' });
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdfRef = useRef(null);
  const panelRef = useRef(null);
  const cutRef = useRef(null);
  const panelResult = calculateSipOrderRow(panel, rates);
  const source = order.rows.find(row => row.type === 'panel' && row.id === cut.sourceId) || panel;
  const cutRow = { type: 'cut', length: cut.length ?? source.length, width: cut.width ?? source.width,
    qty: cut.qty === '' ? source.qty : cut.qty, mode: cut.mode, split: cut.split };
  const cutResult = calculateSipOrderRow(cutRow, rates);
  const lines = calculation.sections.find(section => section.key === SIP_ORDER_SECTION)?.lines || [];
  const quote = order.rows.length ? lines : panelResult ? [panelResult] : [];
  const update = (mutate) => commit(next => {
    const saved = normalizeSipPanelOrder(next.sipPanelOrder);
    mutate(saved, next);
    next.sipPanelOrder = saved;
    return next;
  });
  const updatePanel = (key, value) => setPanel(previous => ({ ...previous, [key]: value }));
  const updateCut = (key, value) => setCut(previous => ({ ...previous, [key]: value }));
  const clearEdit = () => {
    setEditing(null);
    setCut({ mode: 'along', split: 0, qty: '', sourceId: '' });
  };
  const saveRow = (row, duplicate = false) => {
    const isEdit = !duplicate && editing?.type === row.type;
    const id = isEdit ? editing.id : uid('sip');
    update((saved, next) => {
      const index = saved.rows.findIndex(item => item.id === id);
      if (index >= 0) {
        saved.rows[index] = { ...row, id };
        const override = next.estimateOverrides?.find(item => item.lineId === `${SIP_ORDER_SECTION}:${id}`);
        if (override) delete override.qty;
      } else if (saved.rows.length < SIP_ORDER_LIMIT) saved.rows.push({ ...row, id });
    });
    setStatus(isEdit ? 'Позиция обновлена.' : 'Позиция добавлена в смету проекта.');
    if (isEdit) clearEdit();
  };
  const editRow = (row) => {
    setEditing({ type: row.type, id: row.id });
    if (row.type === 'panel') setPanel({ ...row });
    else setCut({ ...row, sourceId: '' });
    setStatus('Измените параметры и сохраните позицию.');
    (row.type === 'panel' ? panelRef : cutRef).current?.scrollIntoView({ block: 'start' });
  };
  const removeRow = (row) => {
    update((saved, next) => {
      saved.rows = saved.rows.filter(item => item.id !== row.id);
      next.estimateOverrides = (next.estimateOverrides || []).filter(item => item.lineId !== `${SIP_ORDER_SECTION}:${row.id}`);
    });
    if (editing?.id === row.id) clearEdit();
    else if (cut.sourceId === row.id) updateCut('sourceId', '');
  };
  const changeRate = (key, value) => {
    if (value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return;
    update(saved => { saved.rates[key] = Number(value); });
  };
  const exportCsv = () => {
    const rows = [['Наименование', 'Количество', 'Ед.', 'Цена', 'Сумма'],
      ...quote.map(row => [row.name, row.qty, row.unit, row.price, rowSum(row).toFixed(2)])];
    const url = URL.createObjectURL(new Blob(['\ufeff', rows.map(row => row.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Смета ЭФТ - СИП-панели.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const share = async () => {
    const text = ['Смета ЭФТ · СИП-панели', ...quote.map(row => `${row.name} · ${formatNumber(row.qty, 5)} ${row.unit} × ${money(row.price)} = ${money(rowSum(row))}`),
      `Итого: ${money(quote.reduce((sum, row) => sum + rowSum(row), 0))}`].join('\n');
    try {
      if (navigator.share) await navigator.share({ title: 'Смета ЭФТ · СИП-панели', text });
      else {
        await navigator.clipboard.writeText(text);
        setStatus('Клиентская смета скопирована.');
      }
    } catch (error) {
      if (error.name !== 'AbortError') setStatus('Не удалось поделиться. Скачайте CSV или PDF.');
    }
  };
  const savePdf = async () => {
    setPdfBusy(true);
    try {
      const { downloadEstimatePdf } = await import('../export/download-estimate-pdf.js');
      await downloadEstimatePdf(pdfRef.current, 'Смета ЭФТ - СИП-панели');
    } catch {
      setStatus('Не удалось создать PDF. Попробуйте ещё раз.');
    } finally {
      setPdfBusy(false);
    }
  };
  const full = order.rows.length >= SIP_ORDER_LIMIT;
  return <div className="screen sip-order-screen">
    <ScreenHeader title="СИП-панели на заказ" description="Расчёт производства и заказных позиций · EFT SIP v18"
      actions={<button className="button secondary" onClick={() => onNavigate('estimate')}>Открыть смету проекта</button>} />
    <div className="sip-order-columns">
      <section className="panel" ref={panelRef}>
        <h2>Параметры панели</h2>
        <div className="sip-order-fields">
          <SelectField label="Обшивка" value={panel.format} options={SIP_ORDER_FORMATS}
            onChange={value => setPanel(previous => {
              const { format, length, width, coreLength, coreWidth } = newSipOrderPanel(value);
              return { ...previous, format, length, width, coreLength, coreWidth };
            })} />
          <SelectField label="Сердцевина" value={panel.core} options={CORE_TYPES} onChange={value => updatePanel('core', value)} />
          {panel.core === 'custom' ? <>
            <label className="field"><span>Материал сердцевины</span><input maxLength={80} value={panel.customCore}
              onChange={event => updatePanel('customCore', event.target.value)} /></label>
            <NumberField label="Цена сердцевины" suffix="₽/м³" value={panel.customRate} onChange={value => updatePanel('customRate', value)} />
          </> : null}
          <NumberField label="Длина панели" suffix="мм" min={1} max={30000} step={50} value={panel.length}
            onChange={value => setPanel(previous => ({ ...previous, length: value, coreLength: Math.max(1, Number(value) - 100) }))} />
          <NumberField label="Ширина панели" suffix="мм" min={1} max={30000} step={50} value={panel.width}
            onChange={value => setPanel(previous => ({ ...previous, width: value, coreWidth: Math.max(1, Number(value) - 100) }))} />
          <NumberField label="Длина сердцевины" suffix="мм" min={1} max={Number(panel.length)} step={10} value={panel.coreLength} onChange={value => updatePanel('coreLength', value)} />
          <NumberField label="Ширина сердцевины" suffix="мм" min={1} max={Number(panel.width)} step={10} value={panel.coreWidth} onChange={value => updatePanel('coreWidth', value)} />
          <SelectField label="Толщина сердцевины" value={String(panel.thickness)} options={THICKNESSES} onChange={value => updatePanel('thickness', Number(value))} />
          <NumberField label="Количество панелей" suffix="шт." min={1} max={100000} step={1} value={panel.qty} onChange={value => updatePanel('qty', value)} />
        </div>
        {panelResult ? <div className="sip-order-total"><strong>{money(rowSum(panelResult))}</strong>
          <span>{money(panelResult.price)} / шт. · {money(panelResult.price / panelResult.area)} / м²</span>
          <span>Площадь партии {formatNumber(panelResult.area * panelResult.qty, 4)} м² · сердцевина {formatNumber(panelResult.volume * panelResult.qty, 5)} м³</span>
        </div> : <p role="status">Укажите размеры сердцевины в пределах панели и целое количество.</p>}
        <button className="button primary" disabled={!panelResult || (full && editing?.type !== 'panel')} onClick={() => saveRow(panel)}>
          {editing?.type === 'panel' ? 'Сохранить панель' : 'Добавить панель в смету'}
        </button>
        {panelResult ? <details className="sip-order-details"><summary>Внутренний расчёт партии</summary>
          <p>Обшивка {money(panelResult.skins * panelResult.qty)} · сердцевина {money(panelResult.coreCost * panelResult.qty)} ·
            клей {formatNumber(panelResult.glueKg * panelResult.qty, 3)} кг / {money(panelResult.glue * panelResult.qty)} ·
            работа {money(panelResult.labor * panelResult.qty)}.</p>
          <p>Себестоимость {money(panelResult.cost * panelResult.qty)}. Клей рассчитан на обе стороны сердцевины с запасом.</p>
        </details> : null}
      </section>
      <section className="panel" ref={cutRef}>
        <h2>Раскрой готовых панелей</h2>
        <div className="sip-order-fields">
          {editing?.type !== 'cut' ? <SelectField label="Источник раскроя" value={cut.sourceId} options={[
            { value: '', label: 'Текущая панель' }, ...order.rows.filter(row => row.type === 'panel').map(row => ({
              value: row.id, label: calculateSipOrderRow(row, rates).name,
            })),
          ]} onChange={value => updateCut('sourceId', value)} /> : <>
            <NumberField label="Длина панели для раскроя" suffix="мм" min={1} max={30000} step={50} value={cut.length} onChange={value => updateCut('length', value)} />
            <NumberField label="Ширина панели для раскроя" suffix="мм" min={1} max={30000} step={50} value={cut.width} onChange={value => updateCut('width', value)} />
          </>}
          <SelectField label="Режим раскроя" value={cut.mode} options={CUT_MODES} onChange={value => updateCut('mode', value)} />
          {cut.mode === 'split' ? <SelectField label="Половинок для поперечного реза" value={String(cut.split)} options={SPLITS}
            onChange={value => updateCut('split', Number(value))} /> : null}
          <NumberField label="Панелей в раскрой" suffix="шт." min={1} max={100000} step={1} value={cutRow.qty} onChange={value => updateCut('qty', value)} />
          <NumberField label="Цена раскроя" suffix="₽/м.п." value={rates.cut} onChange={value => changeRate('cut', value)} />
        </div>
        {cutResult ? <div className="sip-order-total"><strong>{money(rowSum(cutResult))}</strong>
          <span>{formatNumber(cutResult.qty, 5)} м.п. · {cutResult.detail}</span></div> : null}
        <button className="button primary" disabled={!cutResult || (full && editing?.type !== 'cut')} onClick={() => saveRow(cutRow)}>
          {editing?.type === 'cut' ? 'Сохранить раскрой' : 'Добавить раскрой в смету'}
        </button>
      </section>
    </div>
    <details className="panel sip-order-details">
      <summary>Ставки производства для этого проекта</summary>
      <p>ОСП 2500 × 1250 и раскрой связаны с основным прайсом до ручного переопределения. Остальные ставки взяты из EFT SIP v18.</p>
      <div className="sip-order-fields">
        {SIP_ORDER_RATES.map(([key, label, unit]) => <NumberField key={key} label={label} suffix={unit}
          value={rates[key]} min={0} max={key === 'discount' ? 100 : 100000000} step={0.01}
          onChange={value => changeRate(key, value)} />)}
      </div>
      <button className="button secondary" onClick={() => update((saved, next) => {
        const standardCut = SIP_ORDER_RATES.find(([key]) => key === 'cut')[3];
        saved.rates = sipOrderRates({ ...next, sipPanelOrder: undefined }).cut === standardCut ? {} : { cut: standardCut };
      })}>Сбросить ставки проекта</button>
    </details>
    <section className="panel sip-order-customer">
      <h2>Позиции заказа</h2>
      {editing ? <button className="button secondary" onClick={clearEdit}>Отменить редактирование позиции</button> : null}
      {order.rows.length ? <ul className="sip-order-list">{order.rows.map(row => <li key={row.id}>
        <span>{calculateSipOrderRow(row, rates).name}</span>
        <button className="button secondary" onClick={() => editRow(row)}>Изменить</button>
        <button className="button secondary" disabled={full} onClick={() => saveRow(row, true)}>Копировать</button>
        <button className="button secondary" aria-label={`Удалить ${calculateSipOrderRow(row, rates).name}`} onClick={() => removeRow(row)}>Удалить</button>
      </li>)}</ul> : <p>Добавьте панели или раскрой. До добавления в клиентском листе показан текущий расчёт панели.</p>}
      {full ? <p>В заказе достигнут лимит в {SIP_ORDER_LIMIT} позиций.</p> : null}
      <div className="sip-order-actions">
        <button className="button secondary" disabled={!quote.length} onClick={exportCsv}>Скачать CSV</button>
        <button className="button secondary" disabled={!quote.length || pdfBusy} onClick={savePdf}>{pdfBusy ? 'Готовлю PDF…' : 'Клиентский PDF'}</button>
        <button className="button secondary" disabled={!quote.length} onClick={() => window.print()}>Печать</button>
        <button className="button secondary" disabled={!quote.length} onClick={share}>Поделиться</button>
      </div>
      <p role="status">{status}</p>
      {quote.length ? <div ref={pdfRef} className="sip-order-quote">
        <header className="sip-order-quote-head"><img src="./icons/eft-logo.png" alt="ЭФТ" /><h2>Смета на СИП-панели</h2></header>
        <section className="estimate-section sip-order-table-wrap" data-pdf-table-section><CustomerTable lines={quote} /></section>
      </div> : null}
    </section>
  </div>;
}

export default function SipPanelOrderScreen(props) {
  const { activeTabId } = useProject();
  return <SipPanelOrder key={activeTabId} {...props} />;
}
