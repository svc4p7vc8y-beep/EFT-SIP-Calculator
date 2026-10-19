import { useEffect, useState } from 'react';
import { ChevronRight, File, FileImage, Folder, X } from 'lucide-react';
import { eftApi } from '../../shared/team-api.js';
import { useTeam } from '../cloud/TeamContext.jsx';

const isImage = file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.mime_type);

export default function EstimateFilePicker({ onSelect, onClose, selectedFiles = [] }) {
  const team = useTeam();
  const [folder, setFolder] = useState('');
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [crmFiles, setCrmFiles] = useState([]);
  useEffect(() => {
    if (!team.user) return;
    let active = true;
    setLoading(true);
    setError('');
    eftApi('files', { query: folder ? { folder } : {} })
      .then(result => { if (active) setData(result); })
      .catch(reason => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [folder, team.user]);
  useEffect(() => {
    if (!team.user) return;
    let active = true;
    const base = 'https://crm.eftsip.ru/api/api.php';
    fetch(`${base}?action=session`, { credentials: 'include' }).then(response => response.json()).then(session => {
      if (!session.authenticated) return null;
      return fetch(`${base}?action=files.list`, { credentials: 'include' }).then(response => response.ok ? response.json() : null);
    }).then(result => { if (active) setCrmFiles((result?.files || []).map(file => ({ id: String(file.id), original_name: file.name, mime_type: file.mime, source: 'crm' }))); }).catch(() => {});
    return () => { active = false; };
  }, [team.user]);
  const files = [...(data?.files || []), ...(!folder ? crmFiles : [])].filter(file => file.original_name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
  const folders = (data?.folders || []).filter(item => item.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
  const select = async file => {
    setBusyId(file.id);
    setError('');
    try { await onSelect(file); }
    catch (reason) { setError(reason.message); }
    finally { setBusyId(''); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="modal estimate-file-picker" role="dialog" aria-modal="true" aria-labelledby="estimate-file-picker-title" onMouseDown={event => event.stopPropagation()}>
      <header><div><h2 id="estimate-file-picker-title">Файлы из внутреннего хранилища</h2><p>Изображения попадут в печатную смету. Документы добавляются как ссылки для сотрудников.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть"><X /></button></header>
      {!team.user ? <p role="status">Войдите в командный режим, чтобы выбрать внутренний файл.</p> : <>
        <nav className="files-breadcrumbs" aria-label="Путь к папке">{(data?.breadcrumbs || [{ id: '', name: 'Файлы' }]).map((item, index, all) => <span key={item.id || 'root'}><button type="button" onClick={() => { setFolder(item.id); setQuery(''); }}>{item.name}</button>{index < all.length - 1 ? <ChevronRight /> : null}</span>)}</nav>
        <input type="search" aria-label="Поиск внутренних файлов" placeholder="Найти файл или папку" value={query} onChange={event => setQuery(event.target.value)} />
        {error ? <p role="alert" className="estimate-image-error">{error}</p> : null}
        {loading ? <p role="status">Загружаю файлы…</p> : <div className="estimate-file-picker-list">
          {!folder && data?.questionnaireCount > 0 ? <button type="button" onClick={() => { setFolder('questionnaires'); setQuery(''); }}><Folder /> Файлы из анкет</button> : null}
          {folders.map(item => <button type="button" key={item.id} onClick={() => { setFolder(item.id); setQuery(''); }}><Folder /> {item.name}</button>)}
          {files.map(file => {
            const added = selectedFiles.some(item => item.source === file.source && item.sourceId === file.id);
            return <button type="button" key={`${file.source}:${file.id}`} disabled={busyId !== '' || added} onClick={() => select(file)}>{isImage(file) ? <FileImage /> : <File />}<span>{file.original_name}<small>{file.source === 'crm' ? 'CRM · ' : ''}{isImage(file) ? 'Изображение в смету' : 'Ссылка на документ'}</small></span><strong>{added ? 'Добавлено' : busyId === file.id ? 'Добавляю…' : 'Добавить'}</strong></button>;
          })}
          {!folders.length && !files.length && !(data?.questionnaireCount && !folder) ? <p>В этой папке файлов нет.</p> : null}
        </div>}
      </>}
      <footer><button type="button" className="button secondary" onClick={onClose}>Готово</button></footer>
    </section>
  </div>;
}
