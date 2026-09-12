import { CheckCircle2, Home, X } from 'lucide-react';
import { RESIDENTIAL_PRESET } from '../state/residential-preset.js';

export default function ResidentialPresetDialog({ mode = 'existing', onApply, onManual, onClose }) {
  const creating = mode === 'new';
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="modal residential-preset-modal" role="dialog" aria-modal="true" aria-labelledby="residential-preset-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><h2 id="residential-preset-title">{creating ? 'Создание нового проекта' : 'Стандарт жилого дома'}</h2><p>{creating ? 'Выберите стартовый набор параметров.' : 'Проверьте параметры перед применением к текущему проекту.'}</p></div><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X /></button></header>
      <div className="preset-choice-card recommended"><div className="preset-choice-icon"><Home /></div><div><span>Рекомендуемый шаблон</span><h3>{RESIDENTIAL_PRESET.title}</h3><ul>{RESIDENTIAL_PRESET.summary.map((item) => <li key={item}><CheckCircle2 />{item}</li>)}</ul></div></div>
      <div className="preset-preserved"><strong>Останутся без изменений</strong><span>{creating ? 'Текущий прайс-лист будет перенесён в новый проект.' : 'План, этажи, проёмы, сваи, заказчик, прайс, отделка, инженерия, доставка, заявки и ручные изменения сметы.'}</span></div>
      <footer>{creating ? <button className="button secondary" onClick={onManual}>Без шаблона</button> : <button className="button secondary" onClick={onClose}>Отмена</button>}<button className="button primary" onClick={onApply}>{creating ? 'Создать жилой дом' : 'Применить стандарт'}</button></footer>
    </section>
  </div>;
}
