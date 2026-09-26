import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, File, FileEdit, Inbox, Link2, Mail, Paperclip, RefreshCw, Search, Send, Sparkles, Trash2, X } from "lucide-react";
import { eftApi, resolveEftApiUrl } from "../../shared/team-api.js";
import { useTeam } from "../cloud/TeamContext.jsx";

const formatDate = (value) => value ? new Date(value).toLocaleString("ru-RU") : "";
const senderName = (value) => String(value || "").replace(/<[^>]+>/g, "").replace(/["']/g, "").trim() || "клиент";

export default function MailScreen() {
  const team = useTeam();
  const [status, setStatus] = useState(null);
  const [folders, setFolders] = useState([]);
  const [folderKey, setFolderKey] = useState("inbox");
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [compose, setCompose] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState("");
  const mailboxAddress = status?.address || "sale@eftsip.ru";

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setNotice("");
    try {
      const statusResult = await eftApi("mail-status");
      setStatus(statusResult.mail);
      if (statusResult.mail.configured && statusResult.mail.imapAvailable) {
        const folderResult = await eftApi("mail-folders");
        const result = await eftApi("mail-messages", { query: { limit: 60, query: search, folder: folderKey } });
        setFolders(folderResult.folders || []);
        setMessages(result.messages || []);
      } else setMessages([]);
    } catch (error) { setNotice(error.message); }
    finally { setLoading(false); }
  }, [folderKey]);

  useEffect(() => { load(); }, [load]);

  const openMessage = async (message) => {
    setNotice("");
    try {
      const result = await eftApi("mail-message", { query: { uid: message.uid, folder: message.folder || folderKey } });
      setSelected({ ...result.message, project: message.project });
      setMessages((items) => items.map((item) => item.uid === message.uid ? { ...item, seen: true } : item));
      team.refreshMailStatus?.().catch(() => {});
    } catch (error) { setNotice(error.message); }
  };

  const openComposer = (body = "") => {
    setAttachments([]);
    setComposeError("");
    setCompose({
      to: selected?.fromEmail || "",
      subject: selected?.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected?.subject || ""}`,
      body,
    });
  };
  const startNewMessage = () => {
    setAttachments([]);
    setComposeError("");
    setCompose({ to: "", subject: "", body: "" });
  };
  const startReply = () => openComposer();
  const makeDraft = () => openComposer(`Здравствуйте, ${senderName(selected?.from)}!\n\nСпасибо за обращение в ЭФТ. Мы получили ваше письмо и изучаем информацию по проекту. Уточните, пожалуйста, удобное время для связи — менеджер свяжется с вами и согласует следующие шаги.\n\nС уважением,\nЭнергоЭффективные Технологии`);
  const chooseAttachments = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";
    const next = [...attachments, ...selectedFiles].slice(0, 8);
    const total = next.reduce((sum, file) => sum + file.size, 0);
    if (next.some((file) => file.size > 8 * 1024 * 1024) || total > 20 * 1024 * 1024) {
      setNotice("Один файл — до 8 МБ, все вложения — до 20 МБ.");
      return;
    }
    setAttachments(next);
  };
  const makeMailForm = () => {
    const form = new FormData();
    form.append("to", compose.to);
    form.append("subject", compose.subject);
    form.append("body", compose.body);
    attachments.forEach((file) => form.append("attachments[]", file));
    return form;
  };
  const submitMessage = async (action) => {
    const isDraft = action === "mail-draft";
    setComposeError("");
    setNotice(isDraft ? "Сохраняем черновик…" : "Отправляем письмо…");
    setSending(true);
    try {
      await eftApi(action, { method: "POST", csrf: team.csrf, body: makeMailForm() });
      setCompose(null);
      setAttachments([]);
      await load(query);
      setNotice(isDraft ? "Черновик сохранён на почтовом сервере" : `Письмо отправлено с адреса ${mailboxAddress}${attachments.length ? ` · вложений: ${attachments.length}` : ""}`);
    } catch (error) {
      setComposeError(error.message);
      setNotice("");
    }
    finally { setSending(false); }
  };
  const send = async (event) => { event.preventDefault(); await submitMessage("mail-send"); };
  const saveDraft = async () => { await submitMessage("mail-draft"); };
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
  const activeFolder = folders.find((folder) => folder.key === folderKey) || folders.find((folder) => folder.kind === "inbox");
  const folderIcon = (kind) => kind === "inbox" ? <Inbox /> : kind === "sent" ? <Send /> : kind === "drafts" ? <FileEdit /> : kind === "trash" ? <Trash2 /> : <Archive />;

  if (!loading && status && (!status.configured || !status.imapAvailable)) return (
    <section className="screen mail-screen">
      <header className="screen-header"><div><p className="eyebrow">Командная почта</p><h1>Почта {mailboxAddress}</h1></div></header>
      <div className="mail-setup-card"><Mail /><div><h2>Подключение почти готово</h2><p>{status.configured ? "На Beget нужно включить PHP IMAP." : "Создайте пароль приложения VK WorkSpace и сохраните его в секрете EFT_SALE_MAIL_APP_PASSWORD."}</p><small>Пароль хранится только на сервере и никогда не передаётся в браузер.</small></div></div>
    </section>
  );

  return (
    <section className="screen mail-screen">
      <header className="screen-header"><div><p className="eyebrow">Командная почта</p><h1>Почта {mailboxAddress}</h1><p>Письма и папки синхронизируются с почтовым сервером.</p></div><div className="screen-actions"><button className="button secondary" onClick={() => load(query)}><RefreshCw />Обновить</button><button className="button" onClick={startNewMessage}><FileEdit />Новое письмо</button></div></header>
      {notice ? <div className="notice">{notice}</div> : null}
      <div className="mail-layout">
        <aside className="mail-list-panel">
          <nav className="mail-folders" aria-label="Папки почты">{folders.map((folder) => <button key={folder.key} className={folder.key === activeFolder?.key ? "active" : ""} onClick={() => { setSelected(null); setFolderKey(folder.key); }}>{folderIcon(folder.kind)}<span>{folder.name}</span>{folder.unread > 0 ? <b>{folder.unread}</b> : <small>{folder.total}</small>}</button>)}</nav>
          <form className="mail-search" onSubmit={(event) => { event.preventDefault(); load(query); }}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по письмам" /><button>Найти</button></form>
          <div className="mail-list-head"><span>{folderIcon(activeFolder?.kind)}{activeFolder?.name || "Входящие"}</span><b>{activeFolder?.unread || 0} новых</b></div>
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
            {selected.attachments?.length ? <div className="mail-attachments"><strong><Paperclip />Вложения</strong>{selected.attachments.map((file) => <a key={file.part} href={`${attachmentBase}?action=mail-attachment&uid=${selected.uid}&part=${encodeURIComponent(file.part)}&folder=${encodeURIComponent(selected.folder || folderKey)}`} target="_blank" rel="noreferrer">{file.name}<small>{Math.ceil(file.size / 1024)} КБ</small></a>)}</div> : null}
          </> : <div className="mail-reader-empty"><Mail /><h2>Выберите письмо</h2><p>Здесь появятся текст, вложения и связь с проектом.</p></div>}
        </article>
      </div>
      {compose ? <div className="modal-backdrop" role="presentation" onMouseDown={() => !sending && setCompose(null)}><form className="modal mail-compose" role="dialog" aria-modal="true" onSubmit={send} onMouseDown={(event) => event.stopPropagation()}><header><div><h2>Новое письмо</h2><p>Отправитель: {mailboxAddress}</p></div><button type="button" className="icon-button" disabled={sending} onClick={() => setCompose(null)}><X /></button></header>{composeError ? <div className="mail-compose-error" role="alert">{composeError}</div> : null}<label>Кому<input type="email" value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} required /></label><label>Тема<input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} required /></label><label>Сообщение<textarea value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })} required /></label><div className="mail-compose-attachments"><label className="button secondary"><Paperclip />Прикрепить файлы<input className="visually-hidden" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip,.rar,.7z,.dwg,.dxf,.json" onChange={chooseAttachments} /></label><small>До 8 файлов, один файл до 8 МБ, всего до 20 МБ.</small>{attachments.length ? <div>{attachments.map((file, index) => <span key={`${file.name}-${file.lastModified}`}><File />{file.name}<button type="button" onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Убрать ${file.name}`}><X /></button></span>)}</div> : null}</div><footer><button type="button" className="button secondary" onClick={saveDraft} disabled={sending}><FileEdit />Сохранить черновик</button><button type="button" className="button secondary" onClick={() => setCompose(null)} disabled={sending}>Отмена</button><button className="button" disabled={sending}><Send />{sending ? "Отправляем…" : "Отправить"}</button></footer></form></div> : null}
    </section>
  );
}
