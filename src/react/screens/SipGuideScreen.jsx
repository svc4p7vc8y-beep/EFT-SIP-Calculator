import { useMemo, useState } from 'react';
import { BookOpenCheck, Search } from 'lucide-react';
import { ScreenHeader } from '../components/ui.jsx';
import { SIP_GUIDE_ENTRIES, SIP_GUIDE_STATUSES } from '../data/sip-guide.js';
import { EFT_BOOK_INDEX } from '../data/eft-book-index.js';
import { SIP_REFERENCE_SCHEMES, SIP_REFERENCE_SOURCES, referenceSchemeMatches } from '../data/sip-reference-schemes.js';
import SipReferenceScheme from '../components/SipReferenceScheme.jsx';

const statusLabel = Object.fromEntries(SIP_GUIDE_STATUSES.map((item) => [item.value, item.label]));

export default function SipGuideScreen() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [tab, setTab] = useState('schemes');
  const schemes = useMemo(() => SIP_REFERENCE_SCHEMES.filter(entry => referenceSchemeMatches(entry, query, status)), [query, status]);
  const entries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return SIP_GUIDE_ENTRIES.filter((entry) =>
      (status === 'all' || entry.status === status) &&
      (!needle || Object.values(entry).some((value) => String(value).toLocaleLowerCase('ru').includes(needle))),
    );
  }, [query, status]);
  const bookSections = Object.values(EFT_BOOK_INDEX);
  const indexedSections = bookSections.filter((item) => item.status === 'indexed');
  const pendingSections = bookSections.filter((item) => item.status !== 'indexed');
  return <div className="screen sip-guide-screen">
    <ScreenHeader title="Справочник SIP" description="Схемы узлов, источники и действующие правила EFT" />
    <div className="sip-guide-tabs" role="group" aria-label="Раздел справочника"><button aria-pressed={tab==='schemes'} onClick={()=>setTab('schemes')}>Схемы из документов</button><button aria-pressed={tab==='rules'} onClick={()=>setTab('rules')}>Правила и нормы EFT</button></div>
    {tab==='rules'?<>
    <section className="sip-guide-index" aria-label="Статус индексации книги">
      <strong>Карта книги: {indexedSections.length} из {bookSections.length} разделов проиндексированы</strong>
      <span>Требуют привязки к печатным страницам: {pendingSections.map((item) => item.label).join(', ')}.</span>
    </section>
    </>:<section className="sip-guide-index"><strong>АВАДО · Мичуринец АС2 · Раскрой</strong><span>Справочные схемы с номерами листов. Параметры примеров не меняют проект или смету. Исходные PDF не опубликованы.</span></section>}
    <section className="sip-guide-toolbar"><label className="search-box"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти узел или материал…"/></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Все статусы</option>{SIP_GUIDE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></section>
    {tab==='rules'?<section className="sip-guide-grid">{entries.map((entry) => <article className="sip-guide-card" key={entry.id}><header><BookOpenCheck/><div><span>{entry.section} · {entry.id==='opening-products-by-area'?'источник':'печатная стр.'} {entry.pages}</span><h2>{entry.title}</h2></div></header><p>{entry.summary}</p><dl><div><dt>Единица</dt><dd>{entry.unit}</dd></div><div><dt>Применение</dt><dd>{entry.scope}</dd></div><div><dt>Текущее правило EFT</dt><dd>{entry.current}</dd></div><div><dt>Ограничения</dt><dd>{entry.limits}</dd></div></dl><strong className={`sip-guide-status ${entry.status}`}>{statusLabel[entry.status]}</strong></article>)}</section>:<section className="sip-guide-grid">{schemes.map(entry=><article className="sip-guide-card" key={entry.id}><header><BookOpenCheck/><div><span>{SIP_REFERENCE_SOURCES[entry.source].title} · {SIP_REFERENCE_SOURCES[entry.source].pageLabel} {entry.pages.join(', ')}</span><h2>{entry.title}</h2></div></header><SipReferenceScheme entry={entry}/><p>{entry.summary}</p><dl><div><dt>В EFT</dt><dd>{entry.current}</dd></div><div><dt>Ограничения</dt><dd>{entry.limits}</dd></div></dl><strong className="sip-guide-status reference">{statusLabel.reference}</strong></article>)}</section>}
    {!(tab==='rules'?entries:schemes).length ? <div className="empty-state"><BookOpenCheck/><strong>Записей не найдено</strong><span>Измените запрос или фильтр.</span></div> : null}
  </div>;
}
