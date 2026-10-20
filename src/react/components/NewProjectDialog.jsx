import { useRef, useState } from 'react';
import { X } from 'lucide-react';

export default function NewProjectDialog({ onCreate, onClose }) {
  const [details, setDetails] = useState({ projectName: '', customer: '', address: '', buildingType: 'Жилой дом', length: '', width: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const update = (key) => (event) => setDetails((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current) return;
    const hasLength = details.length.trim() !== '';
    const hasWidth = details.width.trim() !== '';
    const length = Number(details.length.replace(',', '.'));
    const width = Number(details.width.replace(',', '.'));
    if (hasLength !== hasWidth || (hasLength && (!Number.isFinite(length) || !Number.isFinite(width) || length < 3 || width < 3 || length > 100 || width > 100))) {
      setError('Укажите обе стороны дома от 3 до 100 м или оставьте оба поля пустыми.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await onCreate({ ...details, length: hasLength ? length : null, width: hasWidth ? width : null });
    } catch (cause) {
      setError(cause.message || 'Не удалось создать проект.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={() => { if (!busy) onClose(); }}>
    <form className="modal new-project-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
      <header><div><h2 id="new-project-title">Новый проект</h2><p>Начните с чистого плана. Номер проекта присваивается автоматически.</p></div><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Закрыть"><X /></button></header>
      <div className="new-project-fields">
        <label>Название проекта<input autoFocus maxLength={120} placeholder="Например, Дом в Сосновке" value={details.projectName} onChange={update('projectName')} /></label>
        <label>Заказчик<input maxLength={120} placeholder="Имя или организация" value={details.customer} onChange={update('customer')} /></label>
        <label>Адрес объекта<input maxLength={200} placeholder="Можно заполнить позже" value={details.address} onChange={update('address')} /></label>
        <label>Тип строения<select value={details.buildingType} onChange={update('buildingType')}><option>Жилой дом</option><option>Гараж</option><option>Пристройка</option><option>Хозблок</option></select></label>
        <div className="new-project-dimensions"><strong>Габариты, если известны</strong><small>Контур и помещения вы нарисуете на плане. Без габаритов поле временно будет 10 × 8 м.</small><div><label>Длина, м<input type="number" min="3" max="100" step="0.1" placeholder="Не задана" value={details.length} onChange={update('length')} /></label><label>Ширина, м<input type="number" min="3" max="100" step="0.1" placeholder="Не задана" value={details.width} onChange={update('width')} /></label></div></div>
      </div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <footer><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Отмена</button><button type="submit" className="button primary" disabled={busy}>{busy ? 'Создаём проект…' : 'Создать и рисовать'}</button></footer>
    </form>
  </div>;
}
