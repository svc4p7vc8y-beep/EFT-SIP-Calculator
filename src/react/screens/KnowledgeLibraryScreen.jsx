import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Download, FileText, ImagePlus, Pencil, Plus, Printer, RotateCcw,
  Search, Trash2, Upload, X,
} from 'lucide-react';
import { ScreenHeader } from '../components/ui.jsx';
import {
  BUILTIN_KNOWLEDGE_ARTICLES, KNOWLEDGE_CATEGORIES, categoryLabel,
} from '../data/knowledge-library.js';
import {
  deleteKnowledgeArticle, downloadKnowledgeTransfer, getHiddenKnowledgeIds,
  listKnowledgeArticles, parseKnowledgeTransfer, resizeKnowledgeImage,
  saveKnowledgeArticle, setHiddenKnowledgeIds,
} from '../storage/knowledge-library.js';

const EDITOR_CATEGORIES = KNOWLEDGE_CATEGORIES.filter(item => !['all', 'custom'].includes(item.value));
const EMPTY_TABLE = { headers: ['Параметр', 'Значение', 'Примечание'], rows: [] };

function KnowledgeTable({ table }) {
  if (!table?.rows?.length) return null;
  return <div className="knowledge-table-wrap"><table className="knowledge-table"><thead><tr>{table.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{table.headers.map((_, cellIndex) => <td key={cellIndex}>{row[cellIndex] || '—'}</td>)}</tr>)}</tbody></table></div>;
}

function KnowledgeReader({ article, onClose, onEdit, onDelete }) {
  if (!article) return null;
  return <div className="knowledge-reader-backdrop" role="presentation" onMouseDown={onClose}>
    <article className="knowledge-reader" role="dialog" aria-modal="true" aria-labelledby="knowledge-reader-title" onMouseDown={event => event.stopPropagation()}>
      <header className="knowledge-reader-toolbar no-print"><span>{categoryLabel(article.category)}</span><div><button className="button secondary" onClick={() => window.print()}><Printer />Печать / PDF</button><button className="icon-button" onClick={onEdit} aria-label="Редактировать материал"><Pencil /></button><button className="icon-button danger" onClick={onDelete} aria-label="Удалить материал"><Trash2 /></button><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X /></button></div></header>
      <div className="knowledge-reader-body">
        <div className="knowledge-print-brand"><img src="./icons/eft-logo.png" alt="ЭФТ"/><span>ЭнергоЭффективные Технологии</span></div>
        <p className="knowledge-reader-category">{categoryLabel(article.category)}{article.builtIn ? ' · справочник ЭФТ' : ' · пользовательский материал'}</p>
        <h1 id="knowledge-reader-title">{article.title}</h1>
        {article.summary ? <p className="knowledge-reader-lead">{article.summary}</p> : null}
        {article.image ? <img className="knowledge-reader-image" src={article.image} alt={article.title}/> : null}
        <div className="knowledge-copy">{article.content.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        <KnowledgeTable table={article.table}/>
        {article.tags?.length ? <div className="knowledge-tags">{article.tags.map(tag => <span key={tag}>{tag}</span>)}</div> : null}
        <footer className="knowledge-print-footer">Материал носит справочный характер. Конструктивные решения и инженерные параметры подтверждаются проектом.</footer>
      </div>
    </article>
  </div>;
}

function KnowledgeEditor({ initial, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => ({
    ...initial,
    contentText: (initial.content || []).join('\n\n'),
    tagsText: (initial.tags || []).join(', '),
    table: initial.table ? { headers: [...initial.table.headers], rows: initial.table.rows.map(row => [...row]) } : { ...EMPTY_TABLE, headers: [...EMPTY_TABLE.headers], rows: [] },
  }));
  const [error, setError] = useState('');
  const imageRef = useRef(null);
  const set = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const setHeader = (index, value) => setDraft(current => ({ ...current, table: { ...current.table, headers: current.table.headers.map((item, itemIndex) => itemIndex === index ? value : item) } }));
  const setCell = (rowIndex, cellIndex, value) => setDraft(current => ({ ...current, table: { ...current.table, rows: current.table.rows.map((row, index) => index === rowIndex ? row.map((cell, indexCell) => indexCell === cellIndex ? value : cell) : row) } }));
  const addRow = () => setDraft(current => ({ ...current, table: { ...current.table, rows: [...current.table.rows, current.table.headers.map(() => '')] } }));
  const removeRow = rowIndex => setDraft(current => ({ ...current, table: { ...current.table, rows: current.table.rows.filter((_, index) => index !== rowIndex) } }));
  const uploadImage = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { set('image', await resizeKnowledgeImage(file)); setError(''); } catch (uploadError) { setError(uploadError.message); }
    event.target.value = '';
  };
  const submit = event => {
    event.preventDefault();
    if (!draft.title.trim()) return setError('Введите название материала');
    onSave({
      ...draft,
      content: draft.contentText.split(/\r?\n\s*\r?\n/).map(item => item.trim()).filter(Boolean),
      tags: draft.tagsText.split(',').map(item => item.trim()).filter(Boolean),
    });
  };
  return <div className="modal-backdrop knowledge-editor-backdrop" role="presentation" onMouseDown={onCancel}><form className="modal knowledge-editor-modal" role="dialog" aria-modal="true" aria-labelledby="knowledge-editor-title" onSubmit={submit} onMouseDown={event => event.stopPropagation()}>
    <header><div><h2 id="knowledge-editor-title">{draft.id ? 'Редактирование материала' : 'Новый материал'}</h2><p>Текст, изображение и вспомогательная таблица</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Закрыть"><X /></button></header>
    <div className="knowledge-editor-scroll">
      <div className="form-grid"><label className="field"><span>Название</span><input value={draft.title} onChange={event => set('title', event.target.value)}/></label><label className="field"><span>Категория</span><select value={draft.category} onChange={event => set('category', event.target.value)}>{EDITOR_CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
      <label className="field"><span>Краткое описание</span><textarea rows="2" value={draft.summary} onChange={event => set('summary', event.target.value)}/></label>
      <label className="field"><span>Основной текст</span><textarea rows="7" value={draft.contentText} onChange={event => set('contentText', event.target.value)} placeholder="Разделяйте абзацы пустой строкой"/></label>
      <div className="knowledge-image-editor"><div>{draft.image ? <img src={draft.image} alt="Предпросмотр"/> : <ImagePlus />}</div><span><strong>Иллюстрация</strong><small>JPG, PNG или WEBP до 12 МБ. При загрузке изображение уменьшается.</small><button type="button" className="button secondary" onClick={() => imageRef.current?.click()}><Upload />Загрузить картинку</button>{draft.image ? <button type="button" className="button ghost" onClick={() => set('image', '')}>Убрать</button> : null}</span><input ref={imageRef} className="visually-hidden" type="file" accept="image/*" onChange={uploadImage}/></div>
      <section className="knowledge-table-editor"><header><div><strong>Вспомогательная таблица</strong><small>Три колонки, до 100 строк</small></div><button type="button" className="button secondary" onClick={addRow}><Plus />Строка</button></header><div className="knowledge-table-edit-grid headers">{draft.table.headers.map((header, index) => <input key={index} aria-label={`Заголовок колонки ${index + 1}`} value={header} onChange={event => setHeader(index, event.target.value)}/>)}</div>{draft.table.rows.map((row, rowIndex) => <div className="knowledge-table-edit-row" key={rowIndex}><div className="knowledge-table-edit-grid">{draft.table.headers.map((_, cellIndex) => <input key={cellIndex} aria-label={`Строка ${rowIndex + 1}, колонка ${cellIndex + 1}`} value={row[cellIndex] || ''} onChange={event => setCell(rowIndex, cellIndex, event.target.value)}/>)}</div><button type="button" className="icon-button danger" onClick={() => removeRow(rowIndex)} aria-label={`Удалить строку ${rowIndex + 1}`}><Trash2 /></button></div>)}</section>
      <label className="field"><span>Метки через запятую</span><input value={draft.tagsText} onChange={event => set('tagsText', event.target.value)} placeholder="для клиента, монтаж, памятка"/></label>
      {error ? <p className="knowledge-error">{error}</p> : null}
    </div>
    <footer><button type="button" className="button secondary" onClick={onCancel}>Отмена</button><button className="button" type="submit">Сохранить материал</button></footer>
  </form></div>;
}

export default function KnowledgeLibraryScreen() {
  const [customArticles, setCustomArticles] = useState([]);
  const [hiddenIds, setHiddenIds] = useState(() => getHiddenKnowledgeIds());
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase('ru-RU'));
  const [selectedId, setSelectedId] = useState('');
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState('');
  const importRef = useRef(null);

  useEffect(() => { listKnowledgeArticles().then(setCustomArticles); }, []);
  const allArticles = useMemo(() => [
    ...BUILTIN_KNOWLEDGE_ARTICLES.filter(article => !hiddenIds.includes(article.id)),
    ...customArticles,
  ], [customArticles, hiddenIds]);
  const filtered = useMemo(() => allArticles.filter(article => {
    const categoryMatches = category === 'all' || (category === 'custom' ? !article.builtIn : article.category === category);
    if (!categoryMatches) return false;
    if (!deferredQuery) return true;
    return [article.title, article.summary, ...(article.tags || []), ...(article.content || [])].join(' ').toLocaleLowerCase('ru-RU').includes(deferredQuery);
  }), [allArticles, category, deferredQuery]);
  const selected = allArticles.find(article => article.id === selectedId) || null;

  const save = async article => {
    const saved = await saveKnowledgeArticle({ ...article, builtIn: false, id: article.builtIn ? '' : article.id });
    setCustomArticles(current => [saved, ...current.filter(item => item.id !== saved.id)]);
    setEditor(null); setSelectedId(saved.id); setNotice('Материал сохранён');
  };
  const remove = async article => {
    if (!window.confirm(`Удалить «${article.title}»?`)) return;
    if (article.builtIn) {
      const next = [...hiddenIds, article.id]; setHiddenIds(next); setHiddenKnowledgeIds(next);
    } else {
      await deleteKnowledgeArticle(article.id); setCustomArticles(current => current.filter(item => item.id !== article.id));
    }
    setSelectedId(''); setNotice(article.builtIn ? 'Встроенный материал скрыт' : 'Материал удалён');
  };
  const restoreBuiltIns = () => { setHiddenIds([]); setHiddenKnowledgeIds([]); setNotice('Встроенные материалы восстановлены'); };
  const importFile = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const articles = parseKnowledgeTransfer(JSON.parse(await file.text()));
      const saved = await Promise.all(articles.map(saveKnowledgeArticle));
      setCustomArticles(current => [...saved, ...current.filter(item => !saved.some(incoming => incoming.id === item.id))]);
      setNotice(`Загружено материалов: ${saved.length}`);
    } catch (error) { setNotice(error.message); }
    event.target.value = '';
  };

  return <div className="screen knowledge-screen">
    <ScreenHeader title="Библиотека знаний" description="Справочники, инструкции и материалы, которые можно показать клиенту" actions={<><button className="button secondary" onClick={() => importRef.current?.click()}><Upload />Загрузить</button><button className="button secondary" onClick={() => downloadKnowledgeTransfer(allArticles)}><Download />Скачать библиотеку</button><button className="button" onClick={() => setEditor({ id: '', category: 'checklists', title: '', summary: '', content: [], image: '', table: EMPTY_TABLE, tags: [] })}><Plus />Новый материал</button><input ref={importRef} className="visually-hidden" type="file" accept=".eft-knowledge.json,application/json" onChange={importFile}/></>} />
    <section className="knowledge-hero"><div><BookOpen/><span><strong>{allArticles.length} материалов</strong><small>Встроенные справочники и ваши собственные инструкции</small></span></div><p>Откройте карточку, распечатайте её в PDF или выгрузите всю библиотеку для коллеги.</p></section>
    <div className="knowledge-controls"><label className="knowledge-search"><Search/><input aria-label="Поиск по библиотеке" value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск: вентиляция, крепёж, колодец…"/></label><div className="knowledge-categories">{KNOWLEDGE_CATEGORIES.map(item => <button key={item.value} className={category === item.value ? 'active' : ''} onClick={() => setCategory(item.value)}>{item.label}</button>)}</div></div>
    {notice ? <div className="knowledge-notice"><FileText/>{notice}<button onClick={() => setNotice('')} aria-label="Закрыть уведомление"><X/></button></div> : null}
    {hiddenIds.length ? <div className="knowledge-restore"><span>Скрыто встроенных материалов: {hiddenIds.length}</span><button className="button ghost" onClick={restoreBuiltIns}><RotateCcw/>Восстановить</button></div> : null}
    {filtered.length ? <section className="knowledge-grid">{filtered.map(article => <article className="knowledge-card" key={article.id} onClick={() => setSelectedId(article.id)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter') setSelectedId(article.id); }}><div className={`knowledge-card-image ${article.image ? '' : 'placeholder'}`}>{article.image ? <img src={article.image} alt="" loading="lazy"/> : <BookOpen/>}<span>{categoryLabel(article.category)}</span></div><div className="knowledge-card-body"><div className="knowledge-card-meta"><span>{article.builtIn ? 'Справочник ЭФТ' : 'Мой материал'}</span><div><button onClick={event => { event.stopPropagation(); setEditor(article.builtIn ? { ...article, id: '', builtIn: false, title: `${article.title} — копия` } : article); }} aria-label={`Редактировать ${article.title}`}><Pencil/></button><button onClick={event => { event.stopPropagation(); remove(article); }} aria-label={`Удалить ${article.title}`}><Trash2/></button></div></div><h2>{article.title}</h2><p>{article.summary}</p><div className="knowledge-tags compact">{article.tags?.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div></div></article>)}</section> : <div className="empty-state knowledge-empty"><BookOpen/><strong>Ничего не найдено</strong><span>Измените запрос или создайте собственный материал.</span></div>}
    <KnowledgeReader article={selected} onClose={() => setSelectedId('')} onEdit={() => setEditor(selected?.builtIn ? { ...selected, id: '', builtIn: false, title: `${selected.title} — копия` } : selected)} onDelete={() => remove(selected)}/>
    {editor ? <KnowledgeEditor initial={editor} onCancel={() => setEditor(null)} onSave={save}/> : null}
  </div>;
}
