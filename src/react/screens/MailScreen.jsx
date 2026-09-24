import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Link2, Mail, Paperclip, RefreshCw, Search, Send, Sparkles, X } from "lucide-react";
import { eftApi, resolveEftApiUrl } from "../../shared/team-api.js";
import { useTeam } from "../cloud/TeamContext.jsx";

const formatDate = (value) => value ? new Date(value).toLocaleString("ru-RU") : "";
const senderName = (value) => String(value || "").replace(/<[^>]+>/g, "").replace(/["']/g, "").trim() || "клиент";

export default function MailScreen() {
  const team = useTeam();
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [compose, setCompose] = useState(null);
  const mailboxAddress = status?.address || "sale@eftsip.ru";

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setNotice("");
    try {
      const statusResult = await eftApi("mail-status");
      setStatus(statusResult.mail);
      if (statusResult.mail.configured && statusResult.mail.imapAvailable) {
        const result = await eftApi("mail-messages", { query: { limit: 60, query: search } });
        setMessages(result.messages || []);
      } else setMessages([]);
    } catch (error) { setNotice(error.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openMessage = async (message) => {
    setNotice("");
    try {
      const result = await eftApi("mail-message", { query: { uid: message.uid } });
      setSelected({ ...result.message, project: message.project });
      setMessages((items) => items.map((item) => item.uid === message.uid ? { ...item, seen: true } : item));
      team.refreshMailStatus?.().catch(() => {});
    } catch (error) { setNotice(error.message); }
  };

  const startReply = () => setCompose({
    to: selected?.fromEmail || "",
    subject: selected?.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected?.subject || ""}`,
    body: "",
  });
  const makeDraft = () => setCompose({
    to: selected?.fromEmail || "",
    subject: selected?.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected?.subject || ""}`,
    body: `Здравствуйте, ${senderName(selected?.from)}!\n\nСпасибо за обращение в ЭФТ. Мы получили ваше письмо и изучаем информацию по проекту. Уточните, пожалуйста, удобное время для связи — менеджер свяжется с вами и согласует следующие шаги.\n\nС уважением,\nЭнергоЭффективные Технологии`,
  });
  const send = async (event) => {
    event.preventDefault();
    setNotice("Отправляем письмо…");
    try {
      await eftApi("mail-send", { method: "POST", csrf: team.csrf, body: compose });
      setCompose(null);
      setNotice(`Письмо отправлено с адреса ${mailboxAddress}`);
    } catch (error) { setNotice(error.message); }
  };
  const linkProject = async (projectId) => {
    if (!selected || !projectId) return;
    try {
      await eftApi("mail-link", { method: "POST", csrf: team.csrf, body: { messageKey: selected.key, projectId } });
      const project = team.projects.find((item) => item.id === projectId);
      setSelected((message) => ({ ...message, project: { id: projectId, name: project?.name || "Проект" } }));
      setMessages((items) => items.map((item) => item.key === selected.key ? { ...item, project: { id: projectId, name: project?.name || "Проект" } } : item));
      setNotice("Письмо привязано к проекту");
    } catch (error) { setNotice(error.message); }
  };
  const attachmentBase = useMemo(() => resolveEftApiUrl(), []);

  if (!loading && status && (!status.configured || !status.imapAvailable)) return (
    <section className="screen mail-screen">
      <header className="screen-header"><div><p className="eyebrow">Командная почта</p><h1>Почта {mailboxAddress}</h1></div></header>
      <div className="mail-setup-card"><Mail /><div><h2>Подключение почти готово</h2><p>{status.configured ? "На Beget нужно включить PHP IMAP." : "Создайте пароль приложения VK WorkSpace и сохраните его в секрете EFT_SALE_MAIL_APP_PASSWORD."}</p><small>Пароль хранится только на сервере и никогда не передаётся в браузер.</small></div></div>
    </section>
  );

  return (
    <section className="screen mail-screen">
      <header className="screen-header"><div><p className="eyebrow">Командная почта</p><h1>Почта {mailboxAddress}</h1><p>Письма доступны сотрудникам внутри калькулятора.</p></div><button className="button secondary" onClick={() => load(query)}><RefreshCw />Обновить</button></header>
      {notice ? <div className="notice">{notice}</div> : null}
      <div className="mail-layout">
        <aside className="mail-list-panel">
          <form className="mail-search" onSubmit={(event) => { event.preventDefault(); load(query); }}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по письмам" /><button>Найти</button></form>
          <div className="mail-list-head"><span><Inbox />Входящие</span><b>{messages.filter((message) => !message.seen).length} новых</b></div>
          <div className="mail-message-list">
            {messages.map((message) => <button key={message.uid} className={`${selected?.uid === message.uid ? "active" : ""} ${message.seen ? "" : "unread"}`} onClick={() => openMessage(message)}>
              <span><strong>{message.from || message.fromEmail}</strong><time>{formatDate(message.date)}</time></span><b>{message.subject || "Без темы"}</b>{message.project ? <small><Link2 />{message.project.name}</small> : null}
            </button>)}
            {!loading && !messages.length ? <p className="empty-state">Писем не найдено.</p> : null}
            {loading ? <p className="empty-state">Загружаем почту…</p> : null}
          </div>
        </aside>
        <article className="mail-reader">
          {selected ? <>
            <header><div><p>{selected.from}</p><h2>{selected.subject || "Без темы"}</h2><span>{formatDate(selected.date)} · кому {selected.to}</span></div><div className="mail-reader-actions"><button className="button secondary" onClick={startReply}>Ответить</button><button className="button" onClick={makeDraft}><Sparkles />Черновик помощника</button></div></header>
            <div className="mail-project-link"><Link2 /><span>{selected.project ? `Связано: ${selected.project.name}` : "Связать письмо с проектом"}</span><select value={selected.project?.id || ""} onChange={(event) => linkProject(event.target.value)}><option value="">Выберите проект</option>{team.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
            <pre className="mail-body">{selected.body || "Пустое письмо"}</pre>
            {selected.attachments?.length ? <div className="mail-attachments"><strong><Paperclip />Вложения</strong>{selected.attachments.map((file) => <a key={file.part} href={`${attachmentBase}?action=mail-attachment&uid=${selected.uid}&part=${encodeURIComponent(file.part)}`} target="_blank" rel="noreferrer">{file.name}<small>{Math.ceil(file.size / 1024)} КБ</small></a>)}</div> : null}
          </> : <div className="mail-reader-empty"><Mail /><h2>Выберите письмо</h2><p>Здесь появятся текст, вложения и связь с проектом.</p></div>}
        </article>
      </div>
      {compose ? <div className="modal-backdrop" role="presentation" onMouseDown={() => setCompose(null)}><form className="modal mail-compose" role="dialog" aria-modal="true" onSubmit={send} onMouseDown={(event) => event.stopPropagation()}><header><div><h2>Новое письмо</h2><p>Отправитель: {mailboxAddress}</p></div><button type="button" className="icon-button" onClick={() => setCompose(null)}><X /></button></header><label>Кому<input type="email" value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} required /></label><label>Тема<input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} required /></label><label>Сообщение<textarea value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })} required /></label><footer><button type="button" className="button secondary" onClick={() => setCompose(null)}>Отмена</button><button className="button"><Send />Отправить</button></footer></form></div> : null}
    </section>
  );
}
