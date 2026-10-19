import { useState } from 'react';
import { Copy, Plus, Trash2, X } from 'lucide-react';
import { captureResidentialStandard, normalizeResidentialStandards, RESIDENTIAL_SERVICE_KEYS } from '../state/residential-standards.js';

const SERVICE_LABELS = {
  foundation: 'Фундамент', sipFloor: 'Пол SIP', sipSecondFloor: 'Межэтажное перекрытие',
  sipWalls: 'Наружные стены', sipCeiling: 'Потолок SIP', partitions: 'Перегородки',
  roof: 'Кровля', terrace: 'Террасы и крыльца', openings: 'Проёмы', delivery: 'Доставка',
  engineeringElectric: 'Электрика', engineeringPlumbing: 'Водоснабжение',
  engineeringSewerage: 'Канализация', engineeringVentilation: 'Вентиляция',
  engineeringHeating: 'Отопление', internalFinish: 'Внутренняя отделка',
  externalFinish: 'Наружная отделка',
};

export default function ResidentialPresetDialog({ mode = 'existing', project, onApply, onSave, onManual, onClose }) {
  const creating = mode === 'new';
  const [library, setLibrary] = useState(() => normalizeResidentialStandards(project?.settings?.residentialStandards, project));
  const [selectedId, setSelectedId] = useState(library.activeId);
  const [saved, setSaved] = useState(false);
  const [applyGeometry, setApplyGeometry] = useState(creating);
  const selected = library.profiles.find((item) => item.id === selectedId) || library.profiles[0];
  const change = (patch) => {
    setLibrary((current) => ({ ...current, profiles: current.profiles.map((item) => item.id === selectedId ? { ...item, ...patch } : item) }));
    setSaved(false);
  };
  const updateNumber = (section, field, value) => {
    const number = Number(value);
    change({ [section]: { ...selected[section], [field]: Number.isFinite(number) ? number : 0 } });
  };
  const addProfile = (fromCurrent = false) => {
    const source = fromCurrent ? captureResidentialStandard(project, 'Новый стандарт') : structuredClone(selected);
    source.id = globalThis.crypto?.randomUUID?.() || `standard-${Date.now()}`;
    source.name = fromCurrent ? 'Новый стандарт' : `${selected.name} — копия`;
    setLibrary((current) => ({ ...current, profiles: [...current.profiles, source] }));
    setSelectedId(source.id);
    setSaved(false);
  };
  const refreshProfile = () => {
    const snapshot = captureResidentialStandard(project, selected.name);
    change({ ...snapshot, id: selected.id, name: selected.name });
  };
  const removeProfile = () => {
    if (library.profiles.length < 2) return;
    const profiles = library.profiles.filter((item) => item.id !== selectedId);
    setLibrary({ profiles, activeId: profiles[0].id });
    setSelectedId(profiles[0].id);
    setSaved(false);
  };
  const prepared = () => normalizeResidentialStandards({ ...library, activeId: selectedId }, project);
  const save = () => { onSave?.(prepared()); setSaved(true); };
  const apply = () => {
    const standards = prepared();
    onApply(standards.profiles.find((item) => item.id === selectedId), standards, { applyGeometry });
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="modal residential-preset-modal" role="dialog" aria-modal="true" aria-labelledby="residential-preset-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><h2 id="residential-preset-title">{creating ? 'Создание нового проекта' : 'Сохранённые параметры жилого дома'}</h2><p>Каждый стандарт хранит настройки дома из проекта. Профили можно создавать, обновлять и переименовывать.</p></div><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X /></button></header>
      <div className="residential-profile-toolbar">
        <label>Конфигурация<select aria-label="Конфигурация жилого дома" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{library.profiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button className="button secondary" onClick={() => addProfile(true)} disabled={library.profiles.length >= 30} title="Создать стандарт из параметров текущего проекта"><Plus size={15} /> Новый из проекта</button>
        <button className="button secondary" onClick={refreshProfile} title="Обновить выбранный стандарт параметрами текущего проекта">Обновить из проекта</button>
        <button className="icon-button" onClick={() => addProfile(false)} disabled={library.profiles.length >= 30} aria-label="Создать копию стандарта" title="Создать копию"><Copy size={16} /></button>
        <button className="icon-button" onClick={removeProfile} disabled={library.profiles.length < 2} aria-label="Удалить стандарт" title="Удалить стандарт"><Trash2 size={16} /></button>
      </div>
      <div className="residential-profile-fields">
        <label className="residential-profile-name">Название<input aria-label="Название стандарта" value={selected.name} maxLength={80} onChange={(event) => change({ name: event.target.value })} /></label>
        <div className="residential-profile-snapshot"><strong>Сохранённые настройки параметров</strong><span>{selected.settings ? 'Фундамент · SIP · кровля · крепёж · инженерия · отделка · доставка' : 'Фундамент · SIP · кровля (старый формат стандарта)'}</span><small>Чтобы обновить значения выбранного стандарта, нажмите «Обновить из проекта» и сохраните его.</small></div>
        <fieldset><legend>Габариты и этажность</legend><div className="residential-profile-grid">
          {[["length", "Длина, м", 3, 100, 0.1], ["width", "Ширина, м", 3, 100, 0.1], ["wallHeight", "Высота стен, м", 1.8, 8, 0.05], ["floors", "Этажей", 1, 2, 1]].map(([key, label, min, max, step]) => <label key={key}>{label}<input type="number" min={min} max={max} step={step} value={selected.dimensions[key]} onChange={(event) => updateNumber('dimensions', key, event.target.value)} /></label>)}
        </div></fieldset>
        <fieldset><legend>Контроль проёмов</legend><div className="residential-profile-grid">
          {[["windows", "Окон"], ["doors", "Дверей"]].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" max="200" step="1" value={selected.openings[key]} onChange={(event) => updateNumber('openings', key, event.target.value)} /></label>)}
        </div><small>Количество для проверки. Применение стандарта не переносит и не создаёт проёмы.</small></fieldset>
        <fieldset><legend>Состав конструкций и работ</legend><div className="residential-profile-services">{RESIDENTIAL_SERVICE_KEYS.map((key) => <label key={key}><input type="checkbox" checked={selected.services[key]} onChange={(event) => change({ services: { ...selected.services, [key]: event.target.checked } })} />{SERVICE_LABELS[key]}</label>)}</div></fieldset>
      </div>
      {!creating ? <label className="residential-profile-geometry"><input type="checkbox" checked={applyGeometry} onChange={(event) => setApplyGeometry(event.target.checked)} /> Применить габариты, высоту и этажность к плану</label> : null}
      <p className="residential-profile-hint">Сохраняются параметры фундамента, SIP, кровли, крепежа, инженерии, отделки и доставки, а также состав разделов. Цены, ручной раскрой и настройки печати остаются в проекте. Габариты и этажность меняются только при включённом флажке выше.</p>
      <footer>{creating ? <button className="button secondary" onClick={onManual}>Без стандарта</button> : <><button className="button secondary" onClick={save}>{saved ? 'Сохранено' : 'Сохранить стандарты'}</button><button className="button secondary" onClick={onClose}>Закрыть</button></>}<button className="button primary" onClick={apply}>{creating ? 'Создать по стандарту' : 'Применить выбранный'}</button></footer>
    </section>
  </div>;
}
