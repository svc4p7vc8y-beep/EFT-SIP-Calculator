import { memo } from 'react';
import { formatMoney, formatNumber } from '../utils/format.js';

export function Field({ label, hint, children, className = '' }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

export function NumberField({ label, value, onChange, min = 0, max, step = 0.1, suffix, hint, disabled }) {
  return (
    <Field label={label} hint={hint}>
      <div className="input-with-suffix">
        <input type="number" value={Number.isFinite(Number(value)) ? value : 0} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
        {suffix ? <em>{suffix}</em> : null}
      </div>
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
