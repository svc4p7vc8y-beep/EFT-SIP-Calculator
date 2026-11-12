import { engineeringSettings } from '../state/engineering-settings.js';
import { useRef, useState } from 'react';
import { NETWORK_SYSTEMS } from '../state/placement-networks.js';
import { EngineeringSchemeArtwork } from './EngineeringSchemeArtwork.jsx';


export default function EngineeringSchemeEditor({ system, floor, items, routes, walls, activePreset, selectedId, selectedWallRef, defaults, locked, linesLocked, onSelect, onSelectRoute, onConnect, onDiagram, onArrange, onAdd, onBasic, onWall }) {
  const svgRef = useRef(null), drag = useRef(null), skipClick = useRef(false);
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState('');
  const [options, setOptions] = useState(() => engineeringSettings(defaults));
  const [draft, setDraft] = useState(null);
  const [zoom, setZoom] = useState(100);
  const wallRef = selectedWallRef || options.wallRef || walls.find(w => w.type === 'outer')?.ref || '';
  const coords = event => { const m = svgRef.current?.getScreenCTM(); return m ? new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse()) : null; };
  const selectPort = (id, medium) => {
    if (linesLocked) { setNotice('Разблокируйте линии для соединения элементов.'); return; }
    if (locked) return;
    if (!pending) { setPending({ id, medium }); setNotice('Выберите точку подключения с той же буквой. Escape — отмена.'); return; }
    if (pending.id === id) { setPending(null); return; }
    if (pending.medium !== medium) { setNotice('Соедините точки одной линии: Х с Х, Г с Г, подачу с подачей, обратку с обраткой.'); return; }
    onConnect(pending.id, id, medium); setPending(null); setNotice('Связь добавлена. Фактическая длина определяется на плане и стенах.');
  };
  const displayed = draft ? items.map(i => i.id === draft.id ? { ...i, networkDiagram: draft.position } : i) : items;
  return <section className="engineering-scheme-editor" onKeyDown={e => { if (e.key === 'Escape') { setPending(null); setNotice('Соединение отменено.'); } }}>
    <header><strong>{NETWORK_SYSTEMS[system].label} · схема обвязки · этаж {floor}</strong><div className="engineering-scheme-tools"><button type="button" aria-label="Уменьшить схему" onClick={() => setZoom(z => Math.max(60, z - 20))}>−</button><button type="button" onClick={() => setZoom(100)}>{zoom}%</button><button type="button" aria-label="Увеличить схему" onClick={() => setZoom(z => Math.min(240, z + 20))}>+</button><button type="button" onClick={onArrange} disabled={locked}>Упорядочить схему</button></div></header>
    <details className="engineering-basic-settings"><summary>Базовая автоматическая схема</summary>
      <p>{floor > 1 && 'На верхнем этаже ввод и выпуск представлены стояками; соединение между этажами уточняется по проекту. '}Только основные узлы и подключения существующих приборов. Высоты, диаметры и уклоны требуют уточнения. Повторное добавление сохраняет существующие элементы и линии. Ненужные ранее созданные узлы удаляются вручную.</p>
      <label>Стена ввода / оборудования<select value={wallRef} onChange={e => onWall(e.target.value)}>{walls.map(w => <option key={w.ref} value={w.ref}>{w.label}</option>)}</select></label>
      {system !== 'sewer' && <label>Разводка<select value={options.distribution} onChange={e => setOptions({ ...options, distribution: e.target.value })}><option value="tee">Тройниковая</option><option value="collector">Коллекторная</option></select></label>}
      {system === 'heating' && <fieldset><legend>Уже встроено в источник тепла</legend>{[['builtInPump', 'Насос'], ['builtInExpansion', 'Расширительный бак'], ['builtInSafety', 'Группа безопасности']].map(([key, label]) => <label key={key}><input type="checkbox" checked={options[key]} onChange={e => setOptions({ ...options, [key]: e.target.checked })}/>{label}</label>)}</fieldset>}
      <p>{system === 'plumbing' ? 'Ввод В → кран → фильтр → потребители. Водонагреватель добавляется при наличии точек ГВС.' : system === 'sewer' ? 'Приборы → ревизия → выпуск канализации из дома. Отметки и уклон задаются по проекту.' : 'Источник тепла, отключение, фильтр, подпитка и слив; внешние насос, бак и защита — если они не встроены.'}</p>
      <button type="button" disabled={locked || linesLocked || !wallRef} onClick={() => { const result = onBasic({ ...options, wallRef }); setNotice(result || 'Базовая схема дополнена.'); }}>Дополнить базовую схему</button>
    </details>
    <p className="engineering-scheme-notice" role="status">{notice || (activePreset ? `Нажмите на схему, чтобы добавить: ${activePreset.label}. Фактическая стена выбирается выше.` : 'Перетаскивайте карточки. Для трубы нажмите букву подключения на двух элементах. Положение на схеме не меняет размеры на плане.')}{pending && <button type="button" onClick={() => { setPending(null); setNotice(''); }}>Отмена соединения</button>}</p>
    {!items.length && <p>Добавьте базовую схему или выберите элемент из библиотеки слева.</p>}
    <div className="engineering-scheme-scroll"><div style={{ width: `${zoom}%`, minWidth: 650 }}><EngineeringSchemeArtwork svgRef={svgRef} system={system} items={displayed} routes={routes} selectedId={selectedId} onSelect={onSelect} onRoute={onSelectRoute} onPort={selectPort}
      onBackground={event => { if (skipClick.current) { skipClick.current = false; return; } const p = coords(event); if (!locked && activePreset && p) onAdd(activePreset, { x: Math.max(70, p.x), y: Math.max(60, p.y) }, wallRef); }}
      onDrag={(event, item, position) => { if (locked || activePreset || pending || event.button !== 0) return; const p = coords(event); if (!p) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: item.id, start: p, position, pointerId: event.pointerId }; onSelect(item.id); }}
      onMove={event => { const d = drag.current; if (!d || d.pointerId !== event.pointerId) return; const p = coords(event); if (p) { const position = { x: Math.max(70, Math.min(9500, Math.round(d.position.x + p.x - d.start.x))), y: Math.max(60, Math.min(9500, Math.round(d.position.y + p.y - d.start.y))) }; d.last = position; setDraft({ id: d.id, position }); } }}
      onEnd={event => { const d = drag.current; if (!d || d.pointerId !== event.pointerId) return; if (d.last && (Math.abs(d.last.x - d.position.x) + Math.abs(d.last.y - d.position.y) > 2)) { onDiagram(d.id, d.last); skipClick.current = true; } drag.current = null; setDraft(null); }}/></div></div>
  </section>;
}
