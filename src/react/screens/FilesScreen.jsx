import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, File, FileImage, Folder, FolderPlus, HardDrive, RefreshCw, Upload } from "lucide-react";
import { eftApi, resolveEftApiUrl } from "../../shared/team-api.js";
import { useTeam } from "../cloud/TeamContext.jsx";
import { PLAN_LIBRARY_KEY, readPlanLibrary } from "../storage/plan-library.js";

const formatSize = (value) => {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${Math.ceil(bytes / 1024)} КБ`;
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
};

const formatDate = (value) => value ? new Date(value.replace?.(" ", "T") || value).toLocaleString("ru-RU") : "";
const isImage = (mime) => String(mime || "").startsWith("image/");
const CRM_API = "https://crm.eftsip.ru/api/api.php";
const PLAN_LIBRARY_FOLDER = "plan-library";

export default function FilesScreen({ onOpenLibraryPlan }) {
  const team = useTeam();
  const inputRef = useRef(null);
  const [folderId, setFolderId] = useState("");
  const [data, setData] = useState({ folders: [], files: [], breadcrumbs: [{ id: "", name: "Файлы" }], questionnaireCount: 0 });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [crmFiles, setCrmFiles] = useState([]);
  const [crmConnected, setCrmConnected] = useState(false);
  const [libraryPlans, setLibraryPlans] = useState(readPlanLibrary);
  const inPlanLibrary = folderId === PLAN_LIBRARY_FOLDER;
  const canWrite = Boolean(team.user && team.user.role !== "viewer" && folderId !== "questionnaires" && !inPlanLibrary);
  const apiBase = useMemo(() => resolveEftApiUrl(), []);
  const loadCrm = useCallback(async () => {
    try {
      const session = await fetch(`${CRM_API}?action=session`, { credentials: "include" }).then((response) => response.json());
      if (!session.authenticated) { setCrmConnected(false); setCrmFiles([]); return; }
      const response = await fetch(`${CRM_API}?action=files.list`, { credentials: "include" });
      if (!response.ok) throw new Error("Файлы CRM недоступны");
      const result = await response.json();
      setCrmFiles((result.files || []).map((file) => ({ id: `crm:${file.id}`, original_name: file.name, mime_type: file.mime, size_bytes: file.size, created_at: file.createdAt, created_by: `CRM · ${file.siteName || file.author}`, source: "crm", href: `${CRM_API}?action=files.download&id=${encodeURIComponent(file.id)}` })));
      setCrmConnected(true);
    } catch { setCrmConnected(false); setCrmFiles([]); }
  }, []);

  const load = useCallback(async (nextFolder = folderId) => {
    setLoading(true);
    setNotice("");
    if (nextFolder === PLAN_LIBRARY_FOLDER) {
      setLibraryPlans(readPlanLibrary());
      setFolderId(nextFolder);
      setLoading(false);
      return;
    }
    if (!team.user) {
      setNotice("Файлы доступны после входа в командный режим.");
      setLoading(false);
      return;
    }
    try {
      const result = await eftApi("files", { query: nextFolder ? { folder: nextFolder } : {} });
      setData(result);
      setFolderId(nextFolder);
    } catch (error) { setNotice(error.message); }
    finally { setLoading(false); }
  }, [folderId, team.user]);

  useEffect(() => { load(""); loadCrm(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const refreshLibrary = () => setLibraryPlans(readPlanLibrary());
    const onStorage = (event) => { if (event.key === PLAN_LIBRARY_KEY) refreshLibrary(); };
    window.addEventListener("eft:plan-library-synced", refreshLibrary);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("eft:plan-library-synced", refreshLibrary); window.removeEventListener("storage", onStorage); };
  }, []);

  const createFolder = async (event) => {
    event.preventDefault();
    if (!folderName.trim()) return;
    setNotice("Создаём папку…");
    try {
      await eftApi("file-folder", { method: "POST", csrf: team.csrf, body: { name: folderName.trim(), parentId: folderId } });
      setFolderName("");
      setNewFolder(false);
      await load(folderId);
      setNotice("Папка создана");
    } catch (error) { setNotice(error.message); }
  };

  const upload = async (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length) return;
    const form = new FormData();
    form.append("folderId", folderId);
    selected.forEach((file) => form.append("files[]", file));
    setNotice(`Загружаем файлов: ${selected.length}…`);
    try {
      const result = await eftApi("file-upload", { method: "POST", csrf: team.csrf, body: form });
      await load(folderId);
      setNotice(`Загружено файлов: ${result.count}`);
    } catch (error) { setNotice(error.message); }
  };

  const visibleFolders = inPlanLibrary ? [] : data.folders?.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())) || [];
  const visibleFiles = inPlanLibrary ? [] : [...(data.files || []), ...(!folderId ? crmFiles : [])].filter((item) => item.original_name.toLowerCase().includes(query.toLowerCase()));
  const visiblePlans = inPlanLibrary ? libraryPlans.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())) : [];
  const showPlanFolder = !folderId && "Планы из библиотеки".toLowerCase().includes(query.toLowerCase());
  const breadcrumbs = inPlanLibrary ? [{ id: "", name: "Файлы" }, { id: PLAN_LIBRARY_FOLDER, name: "Планы из библиотеки" }] : data.breadcrumbs || [];
  const openFolder = (id) => load(id);
  const fileHref = (file) => file.href || `${apiBase}?action=${file.downloadAction || "file-download"}&id=${encodeURIComponent(file.id)}`;

  return (
    <section className="screen files-screen">
      <header className="screen-header">
        <div><p className="eyebrow">Общее хранилище</p><h1>Файлы</h1><p>Документы, фотографии и файлы анкет доступны всем сотрудникам после входа.</p></div>
        <div className="screen-actions">
          <button className="button secondary" onClick={() => { load(folderId); loadCrm(); }}><RefreshCw />Обновить</button>
          {canWrite ? <button className="button secondary" onClick={() => setNewFolder(true)}><FolderPlus />Новая папка</button> : null}
          {canWrite ? <button className="button" onClick={() => inputRef.current?.click()}><Upload />Загрузить</button> : null}
          <input ref={inputRef} className="visually-hidden" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip,.rar,.7z,.dwg,.dxf,.json" onChange={upload} />
        </div>
      </header>
      <div className="files-toolbar">
        <nav className="files-breadcrumbs" aria-label="Путь к папке">
          {breadcrumbs.map((part, index) => <span key={part.id || "root"}><button onClick={() => openFolder(part.id)}>{part.name}</button>{index < breadcrumbs.length - 1 ? <ChevronRight /> : null}</span>)}
        </nav>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти файл или папку" aria-label="Поиск файлов" />
      </div>
      {notice ? <div className="notice">{notice}</div> : null}
      {!folderId && !crmConnected ? <div className="files-info"><Folder /><span>Для просмотра файлов CRM войдите в CRM и обновите список.</span><a href="https://crm.eftsip.ru/" target="_blank" rel="noreferrer">Открыть CRM</a></div> : null}
      {folderId === "questionnaires" ? <div className="files-info"><HardDrive /><span><strong>Файлы из анкет</strong> сохраняются автоматически вместе с заявкой. Здесь они больше не перекрывают рабочее поле.</span></div> : null}
      <div className="file-grid" aria-busy={loading}>
        {showPlanFolder ? <button className="folder-card featured" onClick={() => openFolder(PLAN_LIBRARY_FOLDER)}><Folder /><span><strong>Планы из библиотеки</strong><small>{libraryPlans.length} планов · открыть в редакторе</small></span></button> : null}
        {!folderId && data.questionnaireCount > 0 ? <button className="folder-card featured" onClick={() => openFolder("questionnaires")}><Folder /><span><strong>Файлы из анкет</strong><small>{data.questionnaireCount} файлов</small></span></button> : null}
        {visibleFolders.map((folder) => <button key={folder.id} className="folder-card" onClick={() => openFolder(folder.id)}><Folder /><span><strong>{folder.name}</strong><small>Создал: {folder.created_by}</small></span></button>)}
      </div>
      {visibleFiles.length ? <div className="file-table-wrap"><table className="file-table"><thead><tr><th>Название</th><th>Источник / сотрудник</th><th>Дата</th><th>Размер</th><th aria-label="Действия" /></tr></thead><tbody>{visibleFiles.map((file) => <tr key={file.id}><td><span className="file-name">{isImage(file.mime_type) ? <FileImage /> : <File />}<strong>{file.original_name}</strong></span></td><td>{file.source === "questionnaire" ? `${file.public_number} · ${file.customer_name}` : file.created_by}</td><td>{formatDate(file.created_at)}</td><td>{formatSize(file.size_bytes)}</td><td><a className="icon-button" href={fileHref(file)} target="_blank" rel="noreferrer" title="Скачать"><Download /></a></td></tr>)}</tbody></table></div> : null}
      {inPlanLibrary && visiblePlans.length ? <div className="file-table-wrap"><table className="file-table"><thead><tr><th>План</th><th>Источник</th><th>Сохранён</th><th aria-label="Действия" /></tr></thead><tbody>{visiblePlans.map((entry) => <tr key={entry.id}><td><button className="file-plan-link" onClick={() => onOpenLibraryPlan?.(entry.id)}><File /><strong>{entry.name}</strong></button></td><td>Библиотека планов</td><td>{formatDate(entry.savedAt)}</td><td><button className="button secondary" onClick={() => onOpenLibraryPlan?.(entry.id)}>Открыть план</button></td></tr>)}</tbody></table></div> : null}
      {inPlanLibrary && !visiblePlans.length ? <div className="files-empty"><Folder /><h2>{query ? "Планы не найдены" : "В библиотеке пока нет планов"}</h2><p>Сохраните план в библиотеку из редактора плана.</p></div> : null}
      {!inPlanLibrary && !loading && !visibleFolders.length && !visibleFiles.length && !showPlanFolder && !(!folderId && data.questionnaireCount > 0) ? <div className="files-empty"><HardDrive /><h2>{query ? "Ничего не найдено" : "Папка пока пуста"}</h2><p>{canWrite ? "Создайте папку или загрузите файлы с компьютера." : "Здесь появятся файлы анкет."}</p></div> : null}
      {loading ? <div className="files-loading">Загружаем содержимое…</div> : null}
      {newFolder ? <div className="modal-backdrop" role="presentation" onMouseDown={() => setNewFolder(false)}><form className="modal file-folder-modal" role="dialog" aria-modal="true" onSubmit={createFolder} onMouseDown={(event) => event.stopPropagation()}><header><div><h2>Новая папка</h2><p>Она будет доступна всем сотрудникам.</p></div></header><label>Название<input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={180} required /></label><footer><button type="button" className="button secondary" onClick={() => setNewFolder(false)}>Отмена</button><button className="button"><FolderPlus />Создать</button></footer></form></div> : null}
    </section>
  );
}
