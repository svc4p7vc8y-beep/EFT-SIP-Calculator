import { ROOM_NAMES_ALPHABETICAL } from '../data/room-names.js';

export function RoomNameField({ value, onChange }) {
  return <div className="room-name-field">
    <label className="field">
      <span>Название комнаты</span>
      <input aria-label="Название комнаты" value={value || ''} placeholder="Введите своё название" onChange={event => onChange(event.target.value)} />
    </label>
    <label className="field">
      <span>Типовое название</span>
      <select aria-label="Выбрать название комнаты" value="" onChange={event => { if (event.target.value) onChange(event.target.value); }}>
        <option value="" disabled>Выбрать из списка…</option>
        {ROOM_NAMES_ALPHABETICAL.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
  </div>;
}
