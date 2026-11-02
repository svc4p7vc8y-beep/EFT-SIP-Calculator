import {createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {useProject} from '../state/ProjectContext.jsx';
import {useTeam} from '../cloud/TeamContext.jsx';
import {standaloneCalculator} from '../../shared/team-api.js';
import {readPlanLibrary} from './plan-library.js';
import {appendFolderBackups,contentHash,libraryBackupEntries,readBackupCatalog} from './folder-backup.js';
import {workspaceBackupEntries} from './backup-workspace.js';
import {loadFolderHandle,storeFolderHandle,forgetFolderHandle} from './folder-handle.js';
import {downloadMissingServerBackups} from '../cloud/backup-server.js';
import {REACT_PROJECT_VERSION} from '../state/project-model.js';

const Context=createContext(null);
export const useLocalBackup=()=>useContext(Context);
export function LocalBackupProvider({children}) {
  const {project,tabs,activeTabId,getTabProject,hydrated}=useProject(),team=useTeam();
  const supported=typeof window.showDirectoryPicker==='function';
  const [handle,setHandle]=useState(null),[permission,setPermission]=useState('prompt');
  const [records,setRecords]=useState([]),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState('Выберите папку для автоматических резервных копий.');
  const [serverMessage,setServerMessage]=useState('');
  const [pending,setPending]=useState(0);
  const [confirmed,setConfirmed]=useState(null);
  const owner=String(team.user?.id||'local');
  const workspaceEntries=useMemo(()=>workspaceBackupEntries(tabs,activeTabId,project,getTabProject,owner),[tabs,activeTabId,project,getTabProject,owner]);
  const currentKey=`workspace:${owner}:${activeTabId}`;
  const currentEntry=workspaceEntries.find(entry=>entry.key===currentKey);
  const queue=useRef(new Map()),running=useRef(false),syncing=useRef(false),latest=useRef(null);
  latest.current={handle,permission,team,hydrated,workspaceEntries,currentEntry,project,owner};
  const enqueue=entries=>{for(const entry of entries)queue.current.set(entry.key,entry);setPending(queue.current.size);};
  const runRef=useRef(null);
  const run=async(withServer=false)=>{
    const current=latest.current;
    if(!current.handle||current.permission!=='granted'||!current.hydrated||running.current)return;
    running.current=true;setBusy(true);setConfirmed(null);
    let localSaved=false;
    try{
      if(await current.handle.queryPermission({mode:'readwrite'})!=='granted'){
        setPermission('prompt');throw new Error('Подтвердите доступ к папке кнопкой «Разрешить запись».');
      }
      // Rebuild the live snapshot on every check, even after the queue was drained
      // or another destination folder was selected.
      enqueue([
        ...current.workspaceEntries,
        {key:`local-price:${current.owner}`,kind:'price',name:'Прайс на устройстве',data:{format:'eft-price-backup',appVersion:REACT_PROJECT_VERSION,priceMat:current.project.priceMat,priceLab:current.project.priceLab}},
        ...libraryBackupEntries(readPlanLibrary(),current.project,`local-library:${current.owner}`),
      ]);
      const entries=[...queue.current.values()];
      const result=await appendFolderBackups(current.handle,entries);
      for(const entry of entries)if(queue.current.get(entry.key)===entry)queue.current.delete(entry.key);
      setRecords(result.records);setPending(queue.current.size);
      localSaved=true;
      const hash=await contentHash(current.currentEntry.data);
      const record=result.records.find(item=>item.key===current.currentEntry.key&&item.hash===hash);
      setConfirmed(record?{handle:current.handle,entry:current.currentEntry,record,checkedAt:new Date().toISOString()}:null);
      setMessage(`Локальная копия проверена ${new Date().toLocaleTimeString('ru-RU')}. Новых файлов: ${result.added}.`);
    }catch(error){setConfirmed(null);setMessage(`Запись в папку не завершена: ${error.message}. Изменения остаются в очереди.`);}
    finally{running.current=false;setBusy(syncing.current);if(localSaved&&queue.current.size)setTimeout(()=>runRef.current(false),1000);}
    // A slow server must never hold the local write queue.
    if(withServer&&localSaved&&!syncing.current){
      if(!current.team.user||standaloneCalculator)setServerMessage('Локальная работа. Сверка с сервером будет доступна в основном калькуляторе после входа и восстановления Beget.');
      else{
        syncing.current=true;setBusy(true);setServerMessage('Сверяю версии с сервером…');
        try{
          const remote=await downloadMissingServerBackups(current.handle);
          setRecords((await readBackupCatalog(current.handle)).catalog.records);
          setServerMessage(`Сервер проверен ${new Date().toLocaleTimeString('ru-RU')}. Добавлено файлов: ${remote.added}.`);
        }catch(error){setServerMessage(`Серверная сверка не завершена: ${error.message}. Локальные копии сохранены; повторим через минуту.`);}
        finally{syncing.current=false;setBusy(running.current);}
      }
    }
  };
  runRef.current=run;
  useEffect(()=>{
    if(!supported)return;
    let active=true;
    loadFolderHandle().then(async saved=>{
      if(!saved||!active)return;
      const access=await saved.queryPermission({mode:'readwrite'});
      if(!active)return;
      setHandle(saved);setPermission(access);
      setMessage(access==='granted'?'Папка подключена. Готовлю резервные копии…':'Папка сохранена. Нажмите «Разрешить запись» для возобновления копирования.');
    }).catch(()=>{if(active)setMessage('Выберите папку. Браузер не смог восстановить прежнее разрешение.');});
    return()=>{active=false;};
  },[supported]);
  useEffect(()=>{
    if(!hydrated)return;
    enqueue(workspaceEntries);
    enqueue([{key:`local-price:${owner}`,kind:'price',name:'Прайс на устройстве',data:{format:'eft-price-backup',appVersion:REACT_PROJECT_VERSION,priceMat:project.priceMat,priceLab:project.priceLab}}]);
    const timer=setTimeout(()=>runRef.current(false),1500);
    return()=>clearTimeout(timer);
  },[project,workspaceEntries,hydrated,owner]);
  useEffect(()=>{
    const collect=()=>{
      if(!hydrated)return;
      enqueue(libraryBackupEntries(readPlanLibrary(),project,`local-library:${team.user?.id||'local'}`));
      runRef.current(false);
    };
    collect();window.addEventListener('eft:plan-library-synced',collect);
    const otherTab=event=>{if(event.key==='eft-react-plan-library-v103')collect();};
    window.addEventListener('storage',otherTab);
    return()=>{window.removeEventListener('eft:plan-library-synced',collect);window.removeEventListener('storage',otherTab);};
  },[hydrated,project.priceMat,project.priceLab,team.user?.id]);
  useEffect(()=>{
    if(!handle||permission!=='granted')return;
    runRef.current(true);
    const interval=setInterval(()=>runRef.current(true),60_000);
    const online=()=>runRef.current(true);
    window.addEventListener('online',online);
    return()=>{clearInterval(interval);window.removeEventListener('online',online);};
  },[handle,permission,team.user?.id,hydrated]);
  const choose=async()=>{
    try{
      const selected=await window.showDirectoryPicker({id:'eft-project-backup',mode:'readwrite'});
      const {catalog}=await readBackupCatalog(selected);
      setRecords(catalog.records);setHandle(selected);setPermission('granted');
      try{await storeFolderHandle(selected);}catch{setMessage('Папка подключена на этот сеанс. Браузер не разрешил запомнить её для следующего запуска.');}
    }catch(error){if(error.name!=='AbortError')setMessage(`Папка не подключена: ${error.message}`);}
  };
  const authorize=async()=>{
    try{const result=await handle.requestPermission({mode:'readwrite'});setPermission(result);if(result!=='granted')setMessage('Разрешение не выдано. Запись в папку приостановлена.');}
    catch(error){setMessage(error.message);}
  };
  const disconnect=async()=>{
    if(running.current||syncing.current)return;
    try{await forgetFolderHandle();setHandle(null);setRecords([]);setMessage('Копирование отключено. Файлы в папке сохранены.');}
    catch(error){setMessage(`Не удалось отключить папку: ${error.message}`);}
  };
  const currentSaved=permission==='granted'&&confirmed?.handle===handle&&confirmed?.entry===currentEntry;
  return <Context.Provider value={{supported,handle,permission,records,busy,message,serverMessage,pending,choose,authorize,disconnect,saveNow:()=>run(true),saveCurrent:()=>run(false),currentKey,currentName:currentEntry?.name||'Проект',currentSaved,currentRecord:currentSaved?confirmed.record:null,currentCheckedAt:currentSaved?confirmed.checkedAt:null}}>{children}</Context.Provider>;
}
