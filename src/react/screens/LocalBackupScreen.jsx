import {useState} from 'react';
import {FolderOpen,RefreshCw,HardDriveDownload} from 'lucide-react';
import {useLocalBackup} from '../storage/LocalBackupContext.jsx';
import {readFolderBackup} from '../storage/folder-backup.js';
import {orderedBackupRecords} from '../storage/backup-workspace.js';
import {useProject} from '../state/ProjectContext.jsx';
import {migrateProject} from '../state/project-model.js';
import {validateImportedProject} from '../state/project-import.js';
import {ScreenHeader} from '../components/ui.jsx';
import {restoreLocalPrices} from '../cloud/price-catalog.js';
import {isPriceEditorUnlocked} from '../security/price-access.js';
import './local-backup.css';

const kinds={project:'Рабочий проект',server:'Серверный проект',library:'План библиотеки',folder:'Папка библиотеки',price:'Прайс'};
export default function LocalBackupScreen(){
  const backup=useLocalBackup(),{openTab,hydrated,commit}=useProject();
  const [error,setError]=useState(''),[opening,setOpening]=useState(false);
  const open=async record=>{
    setOpening(true);setError('');
    try{const data=await readFolderBackup(backup.handle,record);validateImportedProject(data);const restored=migrateProject(data);openTab(data.priceMat?.length&&data.priceLab?.length?restoreLocalPrices(restored,restored,record.name):restored);setError('Проект открыт в новой вкладке. Перейдите в «План дома».');}
    catch(failure){setError(failure.message);}finally{setOpening(false);}
  };
  const restorePrice=async record=>{
    if(!isPriceEditorUnlocked()){setError('Сначала разблокируйте редактор в разделе «Прайс-лист», затем вернитесь сюда. Прайс будет применён только к открытому проекту.');return;}
    setOpening(true);setError('');
    try{const data=await readFolderBackup(backup.handle,record);const prices=restoreLocalPrices({},data,record.name);commit(next=>migrateProject({...next,...prices}));setError('Резервный прайс применён к текущему проекту. Общий серверный прайс не изменён.');}
    catch(failure){setError(failure.message);}finally{setOpening(false);}
  };
  const records=orderedBackupRecords(backup.records,backup.currentKey);
  return <div className="screen local-backup-screen"><ScreenHeader title="Резервные копии" description="Проекты и прайс в папке на вашем компьютере"/>
    <section className={`panel local-backup-panel current-project-backup ${backup.currentSaved?'is-saved':''}`} aria-label="Резерв текущего проекта">
      <h2>Текущий проект: {backup.currentName}</h2>
      <p role="status">{backup.currentSaved?`Текущая версия сохранена в папку на устройстве. Файл проверен ${new Date(backup.currentCheckedAt).toLocaleTimeString('ru-RU')}.`:!backup.handle?'Для файловой резервной копии выберите папку ниже. Рабочая вкладка сохраняется отдельно в браузере.':backup.permission!=='granted'?'Разрешите запись в папку для сохранения этого проекта.':'Текущая версия ещё не подтверждена в папке. Выполняется автоматическое сохранение; можно сохранить сейчас.'}</p>
      {backup.currentRecord?<p className="local-backup-path"><strong>Файл:</strong> {backup.handle.name} / EFT-резерв / Проекты / {backup.currentRecord.filename}</p>:null}
      <button type="button" className="button primary" onClick={backup.saveCurrent} disabled={!hydrated||!backup.handle||backup.permission!=='granted'||backup.busy}><HardDriveDownload/>Сохранить текущий проект на устройство</button>
    </section>
    <section className="panel local-backup-panel">
      <h2><HardDriveDownload/>Автосохранение в папку</h2>
      <p>После выбора папки калькулятор сохраняет изменения открытых проектов, библиотеку планов и прайс. Новая версия получает отдельный файл; предыдущие копии остаются.</p>
      {!backup.supported?<p className="notice">Выбор папки доступен в Chrome и Edge на компьютере по HTTPS или localhost. В этом браузере используйте «Сохранить проект» для скачивания .eft.json.</p>:<div className="local-backup-actions">
        <button className="button primary" onClick={backup.choose} disabled={backup.busy}><FolderOpen/>{backup.handle?'Выбрать другую папку':'Выбрать папку'}</button>
        {backup.handle&&backup.permission!=='granted'?<button className="button" onClick={backup.authorize}>Разрешить запись</button>:null}
        <button className="button secondary" onClick={backup.saveNow} disabled={!backup.handle||backup.permission!=='granted'||backup.busy}><RefreshCw/>{backup.busy?'Сохраняю…':'Сохранить и сверить сейчас'}</button>
        {backup.handle?<button className="button secondary" onClick={backup.disconnect} disabled={backup.busy}>Отключить папку</button>:null}
      </div>}
      {backup.handle?<p><strong>Папка:</strong> {backup.handle.name} / EFT-резерв · Файлов в каталоге: {backup.records.length} · В очереди проверки: {backup.pending}</p>:null}
      <p role="status">{backup.message}</p>{backup.serverMessage?<p role="status">{backup.serverMessage}</p>:null}
      <p className="muted">Автосохранение работает, пока калькулятор открыт и разрешена запись. При наличии входа в основной калькулятор сервер проверяется раз в минуту: скачиваются только недостающие версии. Удаления с сервера не удаляют резерв. Подключение к папке на другом сайте нужно разрешить отдельно.</p>
    </section>
    {error?<p className="notice" role="status">{error}</p>:null}
    <section className="panel local-backup-panel"><h2>Сохранённые версии</h2><p>Проекты можно открыть здесь или через «Открыть план» → файл .eft.json из резервной папки. Проекты и прайсы открываются без сервера. Прайсы сохраняются отдельно и внутри рабочих проектов; для восстановления прайса разблокируйте редактор в разделе «Прайс-лист». Файлы изображений и PDF на сервере в этот резерв не входят.</p>
      <div className="local-backup-list">{records.slice(0,60).map(record=><div className="local-backup-row" key={`${record.key}:${record.hash}:${record.sourceVersion}`}><div><strong>{record.name}</strong><small>{record.key===backup.currentKey?'Текущий проект · ':''}{kinds[record.kind]} · {new Date(record.savedAt).toLocaleString('ru-RU')}</small></div>{['project','library','server'].includes(record.kind)?<button className="button secondary" onClick={()=>open(record)} disabled={opening||!hydrated||backup.permission!=='granted'}>Открыть проект</button>:record.kind==='price'?<button className="button secondary" onClick={()=>restorePrice(record)} disabled={opening||!hydrated||backup.permission!=='granted'}>Применить прайс к проекту</button>:null}</div>)}</div>
      {!records.length?<p>После подключения папки здесь появятся резервные копии.</p>:null}{records.length>60?<p>Показаны последние 60 файлов. Остальные версии находятся в выбранной папке.</p>:null}
    </section>
  </div>;
}
