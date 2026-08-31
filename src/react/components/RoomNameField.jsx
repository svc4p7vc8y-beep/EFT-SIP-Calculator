import { ROOM_NAME_GROUPS } from '../data/room-names.js';

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
        {ROOM_NAME_GROUPS.map(group => <optgroup key={group.label} label={group.label}>
          {group.names.map(name => <option key={name} value={name}>{name}</option>)}
        </optgroup>)}
      </select>
    </label>
  </div>;
}
