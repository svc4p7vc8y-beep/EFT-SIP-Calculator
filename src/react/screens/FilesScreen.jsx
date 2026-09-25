import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, File, FileImage, Folder, FolderPlus, HardDrive, RefreshCw, Upload } from "lucide-react";
import { eftApi, resolveEftApiUrl } from "../../shared/team-api.js";
import { useTeam } from "../cloud/TeamContext.jsx";

const formatSize = (value) => {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${Math.ceil(bytes / 1024)} КБ`;
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
};

const formatDate = (value) => value ? new Date(value.replace?.(" ", "T") || value).toLocaleString("ru-RU") : "";
const isImage = (mime) => String(mime || "").startsWith("image/");

export default function FilesScreen() {
  const team = useTeam();
  const inputRef = useRef(null);
  const [folderId, setFolderId] = useState("");
  const [data, setData] = useState({ folders: [], files: [], breadcrumbs: [{ id: "", name: "Файлы" }], questionnaireCount: 0 });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const canWrite = team.user?.role !== "viewer" && folderId !== "questionnaires";
  const apiBase = useMemo(() => resolveEftApiUrl(), []);

  const load = useCallback(async (nextFolder = folderId) => {
    setLoading(true);
    setNotice("");
    try {
      const result = await eftApi("files", { query: nextFolder ? { folder: nextFolder } : {} });
      setData(result);
      setFolderId(nextFolder);
    } catch (error) { setNotice(error.message); }
    finally { setLoading(false); }
  }, [folderId]);

  useEffect(() => { load(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const visibleFolders = data.folders?.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())) || [];
  const visibleFiles = data.files?.filter((item) => item.original_name.toLowerCase().includes(query.toLowerCase())) || [];
  const openFolder = (id) => load(id);
  const fileHref = (file) => `${apiBase}?action=${file.downloadAction || "file-download"}&id=${encodeURIComponent(file.id)}`;

  return (
    <section className="screen files-screen">
      <header className="screen-header">
        <div><p className="eyebrow">Общее хранилище</p><h1>Файлы</h1><p>Документы, фотографии и файлы анкет доступны всем сотрудникам после входа.</p></div>
        <div className="screen-actions">
          <button className="button secondary" onClick={() => load(folderId)}><RefreshCw />Обновить</button>
          {canWrite ? <button className="button secondary" onClick={() => setNewFolder(true)}><FolderPlus />Новая папка</button> : null}
          {canWrite ? <button className="button" onClick={() => inputRef.current?.click()}><Upload />Загрузить</button> : null}
          <input ref={inputRef} className="visually-hidden" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip,.rar,.7z,.dwg,.dxf,.json" onChange={upload} />
        </div>
      </header>
      <div className="files-toolbar">
        <nav className="files-breadcrumbs" aria-label="Путь к папке">
          {(data.breadcrumbs || []).map((part, index) => <span key={part.id || "root"}><button onClick={() => openFolder(part.id)}>{part.name}</button>{index < data.breadcrumbs.length - 1 ? <ChevronRight /> : null}</span>)}
        </nav>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти файл или папку" aria-label="Поиск файлов" />
      </div>
      {notice ? <div className="notice">{notice}</div> : null}
      {folderId === "questionnaires" ? <div className="files-info"><HardDrive /><span><strong>Файлы из анкет</strong> сохраняются автоматически вместе с заявкой. Здесь они больше не перекрывают рабочее поле.</span></div> : null}
      <div className="file-grid" aria-busy={loading}>
        {!folderId && data.questionnaireCount > 0 ? <button className="folder-card featured" onClick={() => openFolder("questionnaires")}><Folder /><span><strong>Файлы из анкет</strong><small>{data.questionnaireCount} файлов</small></span></button> : null}
        {visibleFolders.map((folder) => <button key={folder.id} className="folder-card" onClick={() => openFolder(folder.id)}><Folder /><span><strong>{folder.name}</strong><small>Создал: {folder.created_by}</small></span></button>)}
      </div>
      {visibleFiles.length ? <div className="file-table-wrap"><table className="file-table"><thead><tr><th>Название</th><th>Источник / сотрудник</th><th>Дата</th><th>Размер</th><th aria-label="Действия" /></tr></thead><tbody>{visibleFiles.map((file) => <tr key={file.id}><td><span className="file-name">{isImage(file.mime_type) ? <FileImage /> : <File />}<strong>{file.original_name}</strong></span></td><td>{file.source === "questionnaire" ? `${file.public_number} · ${file.customer_name}` : file.created_by}</td><td>{formatDate(file.created_at)}</td><td>{formatSize(file.size_bytes)}</td><td><a className="icon-button" href={fileHref(file)} target="_blank" rel="noreferrer" title="Скачать"><Download /></a></td></tr>)}</tbody></table></div> : null}
      {!loading && !visibleFolders.length && !visibleFiles.length && !(!folderId && data.questionnaireCount > 0) ? <div className="files-empty"><HardDrive /><h2>{query ? "Ничего не найдено" : "Папка пока пуста"}</h2><p>{canWrite ? "Создайте папку или загрузите файлы с компьютера." : "Здесь появятся файлы анкет."}</p></div> : null}
      {loading ? <div className="files-loading">Загружаем содержимое…</div> : null}
      {newFolder ? <div className="modal-backdrop" role="presentation" onMouseDown={() => setNewFolder(false)}><form className="modal file-folder-modal" role="dialog" aria-modal="true" onSubmit={createFolder} onMouseDown={(event) => event.stopPropagation()}><header><div><h2>Новая папка</h2><p>Она будет доступна всем сотрудникам.</p></div></header><label>Название<input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={180} required /></label><footer><button type="button" className="button secondary" onClick={() => setNewFolder(false)}>Отмена</button><button className="button"><FolderPlus />Создать</button></footer></form></div> : null}
    </section>
  );
}
