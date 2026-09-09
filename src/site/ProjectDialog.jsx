import { useEffect, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { asset } from './data.js';

function FloorPlan({ house }) {
  return <figure className="floor-plan"><svg viewBox="0 0 620 500" role="img" aria-label={`Пример зонирования дома ${house.name}`}>
    <defs><pattern id="planks" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 0V18" stroke="#d5cbbb" strokeWidth="1" /></pattern></defs>
    <rect x="40" y="35" width="540" height="360" fill="#eee9df" stroke="#35473e" strokeWidth="9" />
    <rect x="45" y="40" width="530" height="350" fill="url(#planks)" />
    <path d="M230 40V180 M230 220V390 M400 40V170 M400 210V390 M45 225H170 M210 225H230 M400 225H475 M515 225H575" fill="none" stroke="#35473e" strokeWidth="7" />
    <path d="M85 35H175 M440 35H540 M85 395H175 M580 85V175" stroke="#a6cad1" strokeWidth="8" />
    <rect x="245" y="80" width="115" height="45" rx="4" fill="#fdfcf9" stroke="#b7ab98" /><rect x="273" y="150" width="64" height="105" rx="22" fill="#c0ac8e" />
    <rect x="80" y="70" width="100" height="95" rx="5" fill="#fff" stroke="#baa98e" /><path d="M88 93H172" stroke="#d2c8b9" strokeWidth="22" />
    <rect x="445" y="75" width="85" height="95" rx="4" fill="#fff" stroke="#baa98e" />
    <rect x="70" y="265" width="80" height="48" rx="15" fill="#fafafa" stroke="#aabcb3" />
    <rect x="430" y="255" width="80" height="65" rx="4" fill="#fff" stroke="#baa98e" />
    <g fill="#344238" fontSize="14" textAnchor="middle" fontFamily="Arial, sans-serif"><text x="135" y="194">{house.rooms[1]}</text><text x="485" y="196">{house.rooms[2]}</text><text x="314" y="290">{house.rooms[0]}</text><text x="132" y="355">{house.type === 'family' ? 'Санузел' : house.rooms[3]}</text><text x="487" y="355">{house.type === 'family' ? 'Детская' : 'Прихожая'}</text></g>
    <rect x="210" y="401" width="220" height="63" fill="#d0b694" /><text x="320" y="440" textAnchor="middle" fontSize="15" fill="#344238">Терраса</text>
  </svg><figcaption>Схема зонирования для обсуждения. Не строительный чертёж.</figcaption></figure>;
}

export default function ProjectDialog({ house, onClose, onDiscuss }) {
  const dialog = useRef(null);
  const [view, setView] = useState('facade');
  const [packageName, setPackageName] = useState('Домокомплект');
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    dialog.current.showModal();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = oldOverflow; previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="project-dialog" aria-labelledby="project-title" onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog-top"><span className="wordmark"><img src={asset('eft-logo.webp')} alt="ЭФТ" /><span> / </span><small>Коллекция домов</small></span><button className="icon-btn" aria-label="Закрыть проект" onClick={onClose}><X /></button></div>
    <div className="dialog-body"><div className="dialog-visual"><div className="segmented" aria-label="Вид проекта"><button aria-pressed={view === 'facade'} onClick={() => setView('facade')}>Фасад</button><button aria-pressed={view === 'plan'} onClick={() => setView('plan')}>Планировка</button></div>{view === 'facade' ? <img src={asset(house.image)} alt={`Визуализация дома ${house.name}`} /> : <FloorPlan house={house} />}</div>
      <div className="dialog-info"><span className="muted">{house.mood}</span><h2 id="project-title">{house.name}</h2><p>{house.description}</p><div className="spec-row"><span>Этажность</span><strong>Один этаж</strong></div><div className="spec-row"><span>Площадь и размеры</span><strong>Уточняются</strong></div><label className="field">Комплектация<select value={packageName} onChange={(e) => setPackageName(e.target.value)}><option>Домокомплект</option><option>Домокомплект со сборкой</option><option>Индивидуальная комплектация</option></select></label><div className="project-price"><span>Стоимость комплектации</span><strong>По запросу</strong></div><button className="btn primary" onClick={() => onDiscuss(`${house.name} · ${packageName}`)}>Обсудить этот дом<ArrowRight size={18} /></button><a className="btn outline" href="./EFT_client_questionnaire.html">Заполнить анкету</a><small className="sample-note">Демонстрационный проект. Визуализация, схема и состав требуют согласования.</small></div></div>
  </dialog>;
}
