import { memo, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { formatMoney, formatNumber } from '../utils/format.js';
import { isPriceEditorUnlocked } from '../security/price-access.js';

export function Field({ label, hint, children, className = '' }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

function numericText(value) {
  if (value === '' || value === null || value === undefined) return '';
  return Number.isFinite(Number(value)) ? String(value) : '';
}

function parseNumericText(value) {
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampNumericValue(value, min, max) {
  let result = value;
  if (Number.isFinite(Number(min))) result = Math.max(Number(min), result);
  if (Number.isFinite(Number(max))) result = Math.min(Number(max), result);
  return result;
}

function stepPrecision(step) {
  const text = String(step);
  if (text.includes('e-')) return Number(text.split('e-')[1]) || 0;
  return text.includes('.') ? text.split('.')[1].length : 0;
}

export function NumericInput({ value, onChange, min, max, step = 1, disabled = false, suffix, className = '', ariaLabel, title }) {
  const [draft, setDraft] = useState(() => numericText(value));
  const focusedRef = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!focusedRef.current) setDraft(numericText(value));
  }, [value]);

  const commitValue = (nextValue) => {
    const precision = stepPrecision(step);
    const rounded = Number(clampNumericValue(nextValue, min, max).toFixed(precision));
    setDraft(String(rounded));
    onChange(rounded);
  };

  const changeDraft = (event) => {
    const nextDraft = event.target.value;
    if (!/^-?\d*(?:[.,]\d*)?$/.test(nextDraft)) return;
    setDraft(nextDraft);
    const parsed = parseNumericText(nextDraft);
    if (parsed !== null) onChange(parsed);
  };

  const blur = () => {
    focusedRef.current = false;
    const parsed = parseNumericText(draft);
    if (parsed === null) {
      setDraft(numericText(value));
      return;
    }
    commitValue(parsed);
  };

  const changeByStep = (direction) => {
    const current = parseNumericText(draft) ?? parseNumericText(value) ?? (Number.isFinite(Number(min)) ? Number(min) : 0);
    commitValue(current + direction * Number(step || 1));
    inputRef.current?.focus({ preventScroll: true });
  };

  return <div className={`numeric-input ${className}`}>
    <button type="button" className="numeric-step-button" disabled={disabled || (Number.isFinite(Number(min)) && Number(value) <= Number(min))} onClick={() => changeByStep(-1)} aria-label={`Уменьшить${ariaLabel ? `: ${ariaLabel}` : ''}`}><ChevronDown /></button>
    <div className={`numeric-input-value${suffix ? ' has-suffix' : ''}`}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        onFocus={(event) => {
          focusedRef.current = true;
          if (draft === '0') event.currentTarget.select();
        }}
        onChange={changeDraft}
        onBlur={blur}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          changeByStep(event.key === 'ArrowUp' ? 1 : -1);
        }}
      />
      {suffix ? <em>{suffix}</em> : null}
    </div>
    <button type="button" className="numeric-step-button" disabled={disabled || (Number.isFinite(Number(max)) && Number(value) >= Number(max))} onClick={() => changeByStep(1)} aria-label={`Увеличить${ariaLabel ? `: ${ariaLabel}` : ''}`}><ChevronUp /></button>
  </div>;
}

export function NumberField({ label, value, onChange, min = 0, max, step = 0.1, suffix, hint, disabled }) {
  return (
    <Field label={label} hint={hint}>
      <NumericInput value={value} onChange={onChange} min={min} max={max} step={step} suffix={suffix} disabled={disabled} ariaLabel={label} />
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, disabled, hint }) {
  return <Field label={label} hint={hint}><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>;
}

export function Toggle({ label, checked, onChange, hint }) {
  return <label className="toggle-row"><span><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}

export function ScreenHeader({ title, description, actions }) {
  return <header className="screen-header"><div><h1>{title}</h1><p>{description}</p></div>{actions ? <div className="screen-actions">{actions}</div> : null}</header>;
}

export function Panel({ title, description, children, className = '' }) {
  return <section className={`panel ${className}`}><header><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div></header>{children}</section>;
}

export function Stat({ label, value, tone = '' }) {
  return <div className={`stat ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

export const PreviewTable = memo(function PreviewTable({ lines, empty = 'Нет позиций для расчёта' }) {
  if (!lines?.length) return <div className="empty-state">{empty}</div>;
  const total = lines.reduce((sum, line) => sum + line.qty * line.price, 0);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Номенклатура</th><th>Вид</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
        <tbody>
          {lines.map((line) => <tr key={line.id}><td>{line.name}</td><td><span className={`kind ${line.kind}`}>{line.kind === 'labor' ? 'Работа' : 'Материал'}</span></td><td>{line.unit}</td><td>{formatNumber(line.qty, line.qty % 1 ? 2 : 0)}</td><td>{formatMoney(line.price)}</td><td>{formatMoney(line.qty * line.price)}</td></tr>)}
        </tbody>
        <tfoot><tr><td colSpan="5">Итого раздела</td><td>{formatMoney(total)}</td></tr></tfoot>
      </table>
    </div>
  );
});

export function EditableEstimateTable({ lines, empty = 'Нет позиций для расчёта', onChangeLine, onRemoveLine, onResetLine, onAddLine, onResetSection, hiddenCount = 0, grouped = false }) {
  const total = (lines || []).reduce((sum, line) => sum + line.qty * line.price, 0);
  const changed = hiddenCount > 0 || (lines || []).some((line) => line.custom || line.projectOverride);
  const priceUnlocked = isPriceEditorUnlocked();
  return <div className="estimate-editor">
    <div className="estimate-editor-toolbar no-print">
      <div><strong>Ведомость текущего проекта</strong><span>Правки не изменяют общий прайс-лист · цены {priceUnlocked ? 'разблокированы' : 'защищены паролем'}</span></div>
      <div><button className="button secondary compact-button" onClick={onAddLine}><Plus />Добавить позицию</button>{changed ? <button className="button secondary compact-button" onClick={onResetSection}><RotateCcw />Сбросить правки{hiddenCount ? ` · скрыто ${hiddenCount}` : ''}</button> : null}</div>
    </div>
    {!lines?.length ? <div className="empty-state">{empty}</div> : <div className="table-wrap">
      <table className="data-table editable-estimate-table">
        <thead><tr><th>Номенклатура</th><th>Вид</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th><th className="no-print">Действия</th></tr></thead>
        <tbody>{lines.flatMap((line, index) => {
          const group = line.estimateGroup || 'Дополнительные позиции';
          const previousGroup = index ? (lines[index - 1].estimateGroup || 'Дополнительные позиции') : null;
          return [grouped && group !== previousGroup ? <tr className="estimate-group-row" key={`group-${group}-${index}`}><th colSpan="7">{group}</th></tr> : null, <tr key={line.id} className={line.custom ? 'custom-estimate-line' : line.projectOverride ? 'overridden-estimate-line' : ''}>
          <td><input className="estimate-cell-input no-print" aria-label={`Наименование: ${line.name}`} value={line.name} onChange={(event) => onChangeLine(line, { name: event.target.value })} /><span className="print-only">{line.name}</span></td>
          <td><select className="estimate-cell-input no-print" aria-label={`Вид: ${line.name}`} value={line.kind} onChange={(event) => onChangeLine(line, { kind: event.target.value })}><option value="material">Материал</option><option value="labor">Работа</option></select><span className={`kind ${line.kind} print-only`}>{line.kind === 'labor' ? 'Работа' : 'Материал'}</span></td>
          <td><input className="estimate-cell-input unit-input no-print" aria-label={`Единица: ${line.name}`} value={line.unit} onChange={(event) => onChangeLine(line, { unit: event.target.value })} /><span className="print-only">{line.unit}</span></td>
          <td><NumericInput className="estimate-number-input no-print" min={0} step={0.01} ariaLabel={`Количество: ${line.name}`} value={line.qty} onChange={(qty) => onChangeLine(line, { qty })} /><span className="print-only">{formatNumber(line.qty, line.qty % 1 ? 2 : 0)}</span></td>
          <td><NumericInput className="estimate-number-input no-print" min={0} step={1} ariaLabel={`Цена: ${line.name}`} title={priceUnlocked ? 'Цена только для текущего проекта' : 'Разблокируйте цены в разделе «Прайс-лист»'} disabled={!priceUnlocked} value={line.price} onChange={(price) => onChangeLine(line, { price })} /><span className="print-only">{formatMoney(line.price)}</span></td>
          <td>{formatMoney(line.qty * line.price)}</td>
          <td className="estimate-row-actions no-print">{line.projectOverride ? <button title="Вернуть строку к прайс-листу" onClick={() => onResetLine(line)}><RotateCcw /></button> : null}<button title="Удалить из ведомости" onClick={() => onRemoveLine(line)}><Trash2 /></button></td>
        </tr>];
        })}</tbody>
        <tfoot><tr><td colSpan="5">Итого раздела</td><td>{formatMoney(total)}</td><td className="no-print" /></tr></tfoot>
      </table>
    </div>}
  </div>;
}
