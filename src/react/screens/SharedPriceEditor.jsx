import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Download, History, LockKeyhole, LockOpen, Plus, RefreshCw, Search, Upload } from 'lucide-react';
import { Panel, PasswordInput, ScreenHeader } from '../components/ui.jsx';
import { useTeam } from '../cloud/TeamContext.jsx';
import { catalogChanges } from '../cloud/price-catalog.js';
import { createDefaultPriceLists } from '../state/project-model.js';
import { formatMoney, uid } from '../utils/format.js';
import { liningCatalogVariants } from '../data/shared-price-variants.js';
import '../styles/shared-price.css';

function PriceRow({ row, catalogKey, canEdit, saving, save, showHistory }) {
  const [draft, setDraft] = useState(String(row.price));
  const [resetDraft, setResetDraft] = useState(0);
  const original = useRef(row);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(String(row.price)); }, [row, resetDraft]);
  const submit = async () => {
    focused.current = false;
    const price = Number(draft.replace(',', '.'));
    if (!draft.trim() || !Number.isFinite(price) || price < 0) { setDraft(String(row.price)); return; }
    if (price === Number(original.current.price)) return;
    try { await save([{ key: catalogKey, id: row.id, before: original.current, after: { ...original.current, price } }]); }
    catch { setResetDraft(value => value + 1); }
  };
  return <tr><td><code>{row.id}</code></td><td>{row.cat}</td><td>{row.name}</td><td>{row.unit}</td><td><input className="shared-price-input" type="text" inputMode="decimal" aria-label={`Цена: ${row.name}`} disabled={!canEdit || saving} value={draft} onFocus={() => { focused.current = true; original.current = row; }} onChange={event => { if (/^\d*(?:[.,]\d{0,2})?$/.test(event.target.value)) setDraft(event.target.value); }} onBlur={submit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></td>{canEdit ? <td><button className="icon-button" aria-label={`История: ${row.name}`} title="История этой позиции" onClick={() => showHistory(row.id)}><History /></button></td> : null}</tr>;
}

export default function SharedPriceEditor() {
  const team = useTeam();
  const { priceCatalog: catalog, savePriceCatalog, refreshPriceCatalog, setPriceAccess, loadPriceHistory } = team;
  const [kind, setKind] = useState('priceMat');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [notice, setNotice] = useState('');
  const [password, setPassword] = useState('');
  const [accessBusy, setAccessBusy] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');
  const [history, setHistory] = useState({ entries: [], nextCursor: null });
  const [historyError, setHistoryError] = useState('');
  const [historyBusy, setHistoryBusy] = useState(false);
  const [newRow, setNewRow] = useState(null);
  const historyRef = useRef(null);
  const fileRef = useRef(null);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase('ru'));
  const items = catalog.payload?.[kind] || [];
  const categories = useMemo(() => [...new Set(items.map(row => row.cat))].sort(), [items]);
  const visible = useMemo(() => items.filter(row => (category === 'all' || row.cat === category) && (!deferredSearch || `${row.id} ${row.cat} ${row.name}`.toLocaleLowerCase('ru').includes(deferredSearch))), [items, category, deferredSearch]);
  useEffect(() => {
    if (!catalog.canEdit) { setHistory({ entries: [], nextCursor: null }); setHistoryError(''); return undefined; }
    let active = true;
    setHistoryBusy(true);
    loadPriceHistory({ catalogId: historyFilter }).then(result => { if (active) { setHistory(result); setHistoryError(''); } }).catch(error => { if (active) setHistoryError(error.message); }).finally(() => { if (active) setHistoryBusy(false); });
    return () => { active = false; };
  }, [catalog.canEdit, catalog.revision, historyFilter, loadPriceHistory]);
  const save = async changes => {
    if (!changes.length) { setNotice('Цены уже совпадают с общим прайсом'); return; }
    setNotice('Сохраняем изменение на сервере…');
    try {
      const result = await savePriceCatalog(changes);
      setNotice(`Сохранено для всех сотрудников · версия прайса ${result.revision}`);
      return result;
    } catch (error) { setNotice(error.message); throw error; }
  };
  const access = async lock => {
    setAccessBusy(true);
    try { await setPriceAccess(lock, password); setPassword(''); setNotice(lock ? 'Редактор и история заблокированы' : 'Общий редактор разблокирован'); }
    catch (error) { setNotice(error.message); }
    finally { setAccessBusy(false); }
  };
  const showHistory = id => { setHistoryFilter(id); if (historyRef.current) { historyRef.current.open = true; historyRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
  const moreHistory = async () => {
    setHistoryBusy(true);
    try { const result = await loadPriceHistory({ catalogId: historyFilter, before: history.nextCursor }); setHistory(previous => ({ ...result, entries: [...previous.entries, ...result.entries] })); }
    catch (error) { setHistoryError(error.message); }
    finally { setHistoryBusy(false); }
  };
  const download = () => {
    const blob = new Blob([JSON.stringify({ format: 'eft-price-catalog', ...catalog.payload, revision: catalog.revision }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `Прайс_ЭФТ_v${catalog.revision}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0);
  };
  const importCatalog = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.priceMat) || !Array.isArray(data.priceLab)) throw new Error('Нужен JSON-прайс с материалами и работами');
      const changes = catalogChanges(catalog.payload, data);
      if (!changes.length) { setNotice('Загруженные цены совпадают с серверными'); return; }
      if (window.confirm(`Загрузить ${changes.length} изменений в общий прайс? Сметы всех сотрудников будут пересчитаны. Предыдущие значения останутся в истории.`)) await save(changes);
    } catch (error) { setNotice(error.message); }
  };
  const reset = async () => {
    const defaults = createDefaultPriceLists();
    defaults.priceMat.push(...liningCatalogVariants());
    const changes = ['priceMat','priceLab'].flatMap(key => catalog.payload[key].flatMap(row => { const base = defaults[key].find(item => item.id === row.id); return base && Number(row.price) !== Number(base.price) ? [{ key, id: row.id, before: row, after: { ...row, price: base.price } }] : []; }));
    if (!changes.length) { setNotice('Базовые цены уже совпадают'); return; }
    if (window.confirm(`Вернуть ${changes.length} базовых цен для всех сотрудников? Добавленные позиции сохранятся; изменения попадут в историю.`)) await save(changes).catch(() => {});
  };
  const add = async event => {
    event.preventDefault();
    try { await save([{ key: kind, id: newRow.id, before: null, after: { ...newRow, kind: kind === 'priceMat' ? 'material' : 'labor', price: Number(newRow.price) } }]); setNewRow(null); }
    catch { /* The notice contains the server validation message. */ }
  };
  return <div className="screen price-screen shared-price-screen"><ScreenHeader title="Общий прайс-лист" description="Серверные цены материалов и работ для всех проектов сотрудников" actions={<><button className="button secondary" onClick={() => refreshPriceCatalog().catch(error => setNotice(error.message))}><RefreshCw />Обновить</button><button className="button secondary" onClick={download} disabled={!catalog.payload}><Download />Скачать</button><button className="button secondary" disabled={!catalog.canEdit || catalog.saving} onClick={() => fileRef.current?.click()}><Upload />Загрузить</button><input hidden ref={fileRef} type="file" accept=".json" onChange={importCatalog} /><button className="button ghost" disabled={!catalog.canEdit || catalog.saving} onClick={reset}>Базовые цены</button></>} />
    <Panel title={catalog.canEdit ? 'Редактор общего прайса разблокирован' : 'Общий прайс · просмотр'} description={`Версия ${catalog.revision} · ${catalog.updatedBy || 'ЭФТ'}${catalog.checkedAt ? ` · проверен ${new Date(catalog.checkedAt).toLocaleTimeString('ru-RU')}` : ''}`}>
      <p>Нажмите цену, введите новое значение и нажмите Tab или Enter. После подтверждения сервера сметы всех сотрудников пересчитаются; общие цены проверяются каждые 15 секунд. Старые файлы проектов также используют актуальный прайс.</p>
      {catalog.canEdit ? <button className="button secondary" disabled={accessBusy || catalog.saving} onClick={() => access(true)}><LockKeyhole />Заблокировать редактор и историю</button> : team.user.role === 'viewer' ? <p>У вашей учётной записи доступ только для просмотра.</p> : <form className="shared-price-unlock" onSubmit={event => { event.preventDefault(); access(false); }}>{team.user.role !== 'admin' ? <label>Пароль вашей учётной записи<PasswordInput value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label> : null}<button className="button primary" disabled={accessBusy} type="submit"><LockOpen />Разблокировать</button></form>}
    </Panel>
    {notice ? <div className="notice" role="status">{notice}</div> : null}
    {catalog.error ? <div className="notice" role="alert">Не удалось подтвердить актуальность прайса: {catalog.error}</div> : null}
    <Panel title="Цены материалов и работ" description="Цена изменяется на сервере. Количества и наценки остаются настройками проекта.">
      <div className="price-toolbar"><div className="segmented"><button className={kind === 'priceMat' ? 'active' : ''} onClick={() => { setKind('priceMat'); setCategory('all'); setNewRow(null); }}>Материалы</button><button className={kind === 'priceLab' ? 'active' : ''} onClick={() => { setKind('priceLab'); setCategory('all'); setNewRow(null); }}>Работы</button></div><label className="search-box"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Найти позицию…" /></label><select aria-label="Категория прайса" value={category} onChange={event => setCategory(event.target.value)}><option value="all">Все категории</option>{categories.map(cat => <option key={cat}>{cat}</option>)}</select>{catalog.canEdit ? <button className="button primary" disabled={catalog.saving} onClick={() => setNewRow({ id: uid(kind === 'priceMat' ? 'MAT' : 'LAB').toUpperCase(), name: '', cat: category === 'all' ? 'Дополнительные позиции' : category, unit: 'шт', price: '' })}><Plus />Добавить</button> : null}</div>
      {newRow ? <form className="shared-price-new" onSubmit={add}>{['name','cat','unit','price'].map((field,index) => <label key={field}>{['Название','Категория','Единица','Цена'][index]}<input required value={newRow[field]} onChange={event => setNewRow({ ...newRow, [field]: event.target.value })} inputMode={field === 'price' ? 'decimal' : undefined} /></label>)}<button className="button primary" disabled={catalog.saving}>Сохранить позицию</button><button type="button" className="button secondary" onClick={() => setNewRow(null)}>Отмена</button></form> : null}
      <div className="table-wrap price-table-wrap"><table className="data-table shared-price-table"><thead><tr><th>Код</th><th>Категория</th><th>Номенклатура</th><th>Ед.</th><th>Цена, ₽</th>{catalog.canEdit ? <th>История</th> : null}</tr></thead><tbody>{visible.map(row => <PriceRow key={row.id} row={row} catalogKey={kind} canEdit={catalog.canEdit} saving={catalog.saving} save={save} showHistory={showHistory} />)}</tbody></table></div>
    </Panel>
    {catalog.canEdit ? <Panel title="История изменений цен" description="Предыдущие и новые значения, автор, время и версия общего прайса"><details ref={historyRef}><summary>Показать историю{historyFilter ? ` · ${historyFilter}` : ''}</summary>{historyFilter ? <button className="button secondary" onClick={() => setHistoryFilter('')}>Все позиции</button> : null}{historyError ? <p role="alert">{historyError}</p> : null}<div className="table-wrap"><table className="data-table shared-price-history"><thead><tr><th>Когда / версия</th><th>Кто</th><th>Позиция</th><th>Было</th><th>Стало</th></tr></thead><tbody>{history.entries.map(entry => <tr key={entry.id}><td>{new Date(String(entry.changed_at).replace(' ', 'T') + 'Z').toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' МСК'}<small>v{entry.revision}</small></td><td>{entry.author}<small>{entry.username}</small></td><td>{entry.after.name}<small>{entry.catalog_id}{entry.before && entry.before.name !== entry.after.name ? ` · прежнее название: ${entry.before.name}` : ''}</small></td><td>{entry.before ? formatMoney(entry.before.price) : 'Новая позиция'}</td><td>{formatMoney(entry.after.price)}</td></tr>)}</tbody></table></div>{!history.entries.length && !historyBusy ? <p>Изменений цен пока нет.</p> : null}{historyBusy ? <p>Загружаем историю…</p> : null}{history.nextCursor ? <button className="button secondary" disabled={historyBusy} onClick={moreHistory}>Показать ещё</button> : null}</details></Panel> : null}
  </div>;
}
