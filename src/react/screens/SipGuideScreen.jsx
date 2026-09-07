import { useMemo, useState } from 'react';
import { BookOpenCheck, Search } from 'lucide-react';
import { ScreenHeader } from '../components/ui.jsx';
import { SIP_GUIDE_ENTRIES, SIP_GUIDE_STATUSES } from '../data/sip-guide.js';

const statusLabel = Object.fromEntries(SIP_GUIDE_STATUSES.map((item) => [item.value, item.label]));

export default function SipGuideScreen() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const entries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return SIP_GUIDE_ENTRIES.filter((entry) =>
      (status === 'all' || entry.status === status) &&
      (!needle || Object.values(entry).some((value) => String(value).toLocaleLowerCase('ru').includes(needle))),
    );
  }, [query, status]);
  return <div className="screen sip-guide-screen">
    <ScreenHeader title="Справочник SIP" description="Нормы, область применения и печатные страницы руководства Курмановых" />
    <section className="sip-guide-toolbar"><label className="search-box"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти узел или материал…"/></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Все статусы</option>{SIP_GUIDE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></section>
    <section className="sip-guide-grid">{entries.map((entry) => <article className="sip-guide-card" key={entry.id}><header><BookOpenCheck/><div><span>{entry.section} · печатная стр. {entry.pages}</span><h2>{entry.title}</h2></div></header><p>{entry.summary}</p><dl><div><dt>Единица</dt><dd>{entry.unit}</dd></div><div><dt>Применение</dt><dd>{entry.scope}</dd></div><div><dt>Текущее правило EFT</dt><dd>{entry.current}</dd></div><div><dt>Ограничения</dt><dd>{entry.limits}</dd></div></dl><strong className={`sip-guide-status ${entry.status}`}>{statusLabel[entry.status]}</strong></article>)}</section>
    {!entries.length ? <div className="empty-state"><BookOpenCheck/><strong>Записей не найдено</strong><span>Измените запрос или фильтр.</span></div> : null}
  </div>;
}
