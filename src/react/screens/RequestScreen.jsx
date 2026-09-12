import { useDeferredValue, useMemo, useState } from 'react';
import { FileSpreadsheet, Plus, Printer, RotateCcw, Search, Send, Trash2 } from 'lucide-react';
import { useProject } from '../state/ProjectContext.jsx';
import { NumericInput, Panel, ScreenHeader, Stat } from '../components/ui.jsx';
import { createRequestWorkbook, downloadRequestWorkbook } from '../export/xlsx.js';
import {
  addCatalogItem,
  addCustomRequestItem,
  normalizeRequest,
  requestFileName,
  requestTotals,
} from '../state/request-model.js';
import { formatMoney, formatNumber } from '../utils/format.js';

const kindLabel = (kind) => kind === 'labor' ? 'Работа' : 'Материал';

function RequestItemsEditor({ request, updateRequest, catalogById }) {
  const updateItem = (id, changes) => updateRequest((draft) => {
    const item = draft.items.find((entry) => entry.id === id);
    if (item) Object.assign(item, changes);
  });
  const resetPrice = (item) => {
    const catalogItem = catalogById.get(item.catalogId);
    if (catalogItem) updateItem(item.id, { price: catalogItem.price });
  };
  if (!request.items.length) return <div className="request-empty"><strong>Заявка пока пустая</strong><span>Найдите позиции в прайс-листе и добавьте их в документ.</span></div>;
  return <div className="table-wrap request-items-wrap"><table className="data-table request-items-table"><thead><tr><th>Позиция</th><th>Вид</th><th>Ед.</th><th>Количество</th><th>Цена</th><th>Сумма</th><th /></tr></thead><tbody>{request.items.map((item) => <tr key={item.id}>
    <td><input aria-label={`Наименование: ${item.name}`} value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} /><small>{item.catalogId || item.category}</small></td>
    <td><select aria-label={`Вид: ${item.name}`} value={item.kind} onChange={(event) => updateItem(item.id, { kind: event.target.value })}><option value="material">Материал</option><option value="labor">Работа</option></select></td>
    <td><input className="request-unit-input" aria-label={`Единица: ${item.name}`} value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} /></td>
    <td><NumericInput min={0} step={0.01} value={item.qty} ariaLabel={`Количество: ${item.name}`} onChange={(qty) => updateItem(item.id, { qty })} /></td>
    <td><NumericInput min={0} step={1} showSteppers={false} value={item.price} ariaLabel={`Цена: ${item.name}`} onChange={(price) => updateItem(item.id, { price })} /></td>
    <td><strong>{formatMoney(item.qty * item.price)}</strong></td>
    <td><div className="request-row-actions">{item.catalogId ? <button title="Вернуть цену из прайс-листа" aria-label={`Вернуть цену из прайс-листа: ${item.name}`} onClick={() => resetPrice(item)}><RotateCcw /></button> : null}<button className="danger" title="Удалить" aria-label={`Удалить: ${item.name}`} onClick={() => updateRequest((draft) => { draft.items = draft.items.filter((entry) => entry.id !== item.id); })}><Trash2 /></button></div></td>
  </tr>)}</tbody></table></div>;
}

function RequestDocument({ project, request, totals }) {
  const commercial = request.documentType === 'commercial';
  return <section className="request-document" aria-label={commercial ? 'Коммерческое предложение' : 'Внутренняя заявка'}>
    <header className="request-document-head"><div className="print-brand"><img src="./icons/eft-logo.png" alt="ЭФТ" /><div><strong>ЭнергоЭффективные Технологии</strong><span>Проектирование и комплектация SIP-домов</span></div></div><div><span>{commercial ? 'Для клиента' : 'Для внутреннего использования'}</span><h1>{commercial ? 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ' : 'ВНУТРЕННЯЯ ЗАЯВКА'}</h1><strong>№ {request.number || '—'} от {request.date || '—'}</strong></div></header>
    <div className="request-document-meta"><dl><div><dt>{commercial ? 'Заказчик' : 'Объект / заказчик'}</dt><dd>{request.customer || project.meta.customer || 'Не указан'}</dd></div><div><dt>Адрес объекта</dt><dd>{request.address || project.meta.address || 'Не указан'}</dd></div>{request.recipient ? <div><dt>{commercial ? 'Получатель' : 'Подразделение / ответственный'}</dt><dd>{request.recipient}</dd></div> : null}</dl><dl><div><dt>Проект</dt><dd>№ {project.meta.projectNum || '—'} · {project.meta.buildingType || 'Объект ЭФТ'}</dd></div><div><dt>Подготовил</dt><dd>{request.manager || project.meta.author || 'ЭФТ'}</dd></div><div><dt>Тип документа</dt><dd>{commercial ? 'Предложение клиенту' : 'Внутренняя комплектация'}</dd></div></dl></div>
    {!request.items.length ? <div className="request-empty"><strong>Нет выбранных позиций</strong><span>Добавьте материалы или работы из прайс-листа.</span></div> : <div className="table-wrap"><table className="data-table request-print-table"><thead><tr><th>№</th><th>Номенклатура</th><th>Вид</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>{request.items.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td>{item.name}</td><td>{kindLabel(item.kind)}</td><td>{item.unit}</td><td>{formatNumber(item.qty, item.qty % 1 ? 2 : 0)}</td><td>{formatMoney(item.price)}</td><td>{formatMoney(item.qty * item.price)}</td></tr>)}</tbody></table></div>}
    <div className="request-document-totals"><div><span>Материалы</span><strong>{formatMoney(totals.materials)}</strong></div><div><span>Работы</span><strong>{formatMoney(totals.labor)}</strong></div><div className="grand"><span>Итого</span><strong>{formatMoney(totals.total)}</strong></div></div>
    {commercial ? <div className="request-terms"><div><strong>Срок действия предложения</strong><span>{request.validDays ? `${request.validDays} календарных дней` : 'Не ограничен'}</span></div><div><strong>Условия оплаты</strong><span>{request.paymentTerms || 'По согласованию'}</span></div><div><strong>Поставка</strong><span>{request.deliveryTerms || 'По согласованию'}</span></div></div> : null}
    {request.note ? <div className="request-note"><strong>Примечание</strong><p>{request.note}</p></div> : null}
    <footer><span>Документ сформирован в EFT SIP Calculator. Количество и цены требуют проверки ответственным специалистом перед подтверждением заказа.</span><strong>ЭФТ · ЭнергоЭффективные Технологии</strong></footer>
  </section>;
}

export default function RequestScreen() {
  const { project, commit } = useProject();
  const [kind, setKind] = useState('material');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [notice, setNotice] = useState('Изменения сохраняются вместе с проектом');
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase('ru'));
  const request = useMemo(() => normalizeRequest(project.request, project.meta), [project.request, project.meta]);
  const catalog = kind === 'material' ? project.priceMat : project.priceLab;
  const catalogById = useMemo(() => new Map([...project.priceMat, ...project.priceLab].map((item) => [item.id, item])), [project.priceMat, project.priceLab]);
  const categories = useMemo(() => [...new Set(catalog.map((item) => item.cat).filter(Boolean))].sort(), [catalog]);
  const visibleCatalog = useMemo(() => catalog.filter((item) => (category === 'all' || item.cat === category) && (!deferredSearch || `${item.id} ${item.name} ${item.cat}`.toLocaleLowerCase('ru').includes(deferredSearch))), [catalog, category, deferredSearch]);
  const totals = useMemo(() => requestTotals(request), [request]);
  const updateRequest = (mutate) => commit((next) => {
    next.request = normalizeRequest(next.request, next.meta);
    mutate(next.request);
    return next;
  });
  const setField = (field, value) => updateRequest((draft) => { draft[field] = value; });
  const addItem = (item) => {
    updateRequest((draft) => addCatalogItem(draft, item));
    setNotice(`Добавлено: ${item.name}`);
  };
  const print = () => {
    if (!request.items.length) return window.alert('Добавьте хотя бы одну позицию в заявку.');
    window.print();
  };
  const share = async () => {
    if (!request.items.length) return window.alert('Добавьте хотя бы одну позицию в заявку.');
    const blob = createRequestWorkbook(project, request);
    const file = typeof File === 'function'
      ? new File([blob], `${requestFileName(request)}.xlsx`, { type: blob.type })
      : null;
    if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: `${request.documentType === 'internal' ? 'Внутренняя заявка' : 'Коммерческое предложение'} ЭФТ № ${request.number}`, text: `Состав и цены по проекту № ${project.meta.projectNum || '—'}`, files: [file] });
        setNotice('Документ передан в системное меню отправки');
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    downloadRequestWorkbook(project, request);
    setNotice('Excel-файл скачан — его можно приложить к письму или сообщению');
  };
  return <div className="screen request-screen"><ScreenHeader title="Заявка" description="Соберите отдельный документ из позиций прайс-листа, не меняя смету проекта" actions={<><button className="button secondary no-print" onClick={() => downloadRequestWorkbook(project, request)} disabled={!request.items.length}><FileSpreadsheet />Excel</button><button className="button secondary no-print" onClick={share} disabled={!request.items.length}><Send />Отправить</button><button className="button primary no-print" onClick={print} disabled={!request.items.length}><Printer />Печать / PDF</button></>} />
    <div className="request-mode-bar no-print"><div><strong>Тип документа</strong><span>{notice}</span></div><div className="segmented"><button className={request.documentType === 'commercial' ? 'active' : ''} onClick={() => setField('documentType', 'commercial')}>Коммерческое предложение</button><button className={request.documentType === 'internal' ? 'active' : ''} onClick={() => setField('documentType', 'internal')}>Внутренняя заявка</button></div></div>
    <div className="stats-row no-print"><Stat label="Позиций" value={`${request.items.length}`} /><Stat label="Материалы" value={formatMoney(totals.materials)} /><Stat label="Работы" value={formatMoney(totals.labor)} /><Stat label="Итого заявки" value={formatMoney(totals.total)} tone="accent" /></div>
    <div className="request-editor-grid no-print"><Panel title="Реквизиты документа" description="Эти данные относятся только к текущей заявке"><div className="form-grid"><label className="field"><span>Номер</span><input value={request.number} onChange={(event) => setField('number', event.target.value)} /></label><label className="field"><span>Дата</span><input type="date" value={request.date} onChange={(event) => setField('date', event.target.value)} /></label><label className="field"><span>Заказчик / объект</span><input value={request.customer} onChange={(event) => setField('customer', event.target.value)} placeholder={project.meta.customer || 'Название или ФИО'} /></label><label className="field"><span>Получатель / ответственный</span><input value={request.recipient} onChange={(event) => setField('recipient', event.target.value)} placeholder="Контакт или подразделение" /></label><label className="field span-2"><span>Адрес объекта</span><input value={request.address} onChange={(event) => setField('address', event.target.value)} placeholder={project.meta.address || 'Адрес'} /></label><label className="field"><span>Подготовил</span><input value={request.manager} onChange={(event) => setField('manager', event.target.value)} /></label>{request.documentType === 'commercial' ? <label className="field"><span>Предложение действует</span><NumericInput min={0} step={1} suffix="дней" value={request.validDays} ariaLabel="Срок действия предложения" onChange={(value) => setField('validDays', value)} /></label> : null}<label className="field span-2"><span>Примечание</span><textarea rows="3" value={request.note} onChange={(event) => setField('note', event.target.value)} placeholder="Комментарий к комплектации, срокам или согласованию" /></label>{request.documentType === 'commercial' ? <><label className="field"><span>Условия оплаты</span><textarea rows="2" value={request.paymentTerms} onChange={(event) => setField('paymentTerms', event.target.value)} /></label><label className="field"><span>Условия поставки</span><textarea rows="2" value={request.deliveryTerms} onChange={(event) => setField('deliveryTerms', event.target.value)} /></label></> : null}</div></Panel>
      <Panel title="Выбор из прайс-листа" description="Повторное добавление увеличивает количество на единицу"><div className="request-catalog-toolbar"><div className="segmented"><button className={kind === 'material' ? 'active' : ''} onClick={() => { setKind('material'); setCategory('all'); }}>Материалы</button><button className={kind === 'labor' ? 'active' : ''} onClick={() => { setKind('labor'); setCategory('all'); }}>Работы</button></div><label className="search-box"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти позицию…" /></label><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Все категории</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div><div className="request-catalog-list">{visibleCatalog.length ? visibleCatalog.map((item) => <article key={item.id}><div><small>{item.id} · {item.cat}</small><strong>{item.name}</strong><span>{item.unit} · {formatMoney(item.price)}</span></div><button className="button secondary compact-button" onClick={() => addItem(item)}><Plus />Добавить</button></article>) : <div className="empty-state">Ничего не найдено</div>}</div></Panel></div>
    <Panel className="request-selected-panel no-print" title="Состав заявки" description="Количество, цена, название и единица меняются только в этом документе"><div className="request-selected-actions"><button className="button secondary compact-button" onClick={() => updateRequest(addCustomRequestItem)}><Plus />Своя позиция</button>{request.items.length ? <button className="button ghost compact-button" onClick={() => { if (window.confirm('Удалить все позиции из текущей заявки?')) updateRequest((draft) => { draft.items = []; }); }}><Trash2 />Очистить заявку</button> : null}</div><RequestItemsEditor request={request} updateRequest={updateRequest} catalogById={catalogById} /></Panel>
    <RequestDocument project={project} request={request} totals={totals} />
  </div>;
}
