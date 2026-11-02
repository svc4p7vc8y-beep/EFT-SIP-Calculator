export const BACKUP_DIRECTORY='EFT-резерв';
const MANIFEST='Каталог.json';
const directories={project:'Проекты',library:'Библиотека',folder:'Папки',price:'Прайс',server:'Серверные проекты'};
const missing=error=>error?.name==='NotFoundError';
export function stableJson(value) {
  return JSON.stringify(value,(_key,item)=>item && typeof item==='object' && !Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
}
export async function contentHash(value) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJson(value)));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function safeBackupName(name) {
  return String(name||'Проект').replace(/[<>:"/\\|?*\u0000-\u001f]/g,' ').replace(/[. ]+$/,'').trim().slice(0,65)||'Проект';
}
async function readJson(directory,name) {
  const handle=await directory.getFileHandle(name);
  return JSON.parse(await (await handle.getFile()).text());
}
async function writeJson(directory,name,value) {
  const handle=await directory.getFileHandle(name,{create:true});
  const writable=await handle.createWritable();
  try{await writable.write(JSON.stringify(value,null,2));await writable.close();}
  catch(error){try{await writable.abort();}catch{}throw error;}
}
export async function readBackupCatalog(handle) {
  const root=await handle.getDirectoryHandle(BACKUP_DIRECTORY,{create:true});
  let catalog;
  try{catalog=await readJson(root,MANIFEST);}catch(error){if(!missing(error))throw new Error('Каталог резервных копий повреждён или недоступен. Выберите другую папку; существующие файлы сохранены.');catalog={format:'eft-folder-backup',version:1,records:[]};}
  if(catalog.format!=='eft-folder-backup'||catalog.version!==1||!Array.isArray(catalog.records))throw new Error('Неизвестный формат каталога резервных копий.');
  // Separate immutable index files avoid lost manifest updates when two tabs or sites share a folder.
  try{
    const index=await root.getDirectoryHandle('Каталог');
    const merged=new Map(catalog.records.map(record=>[`${record.key}:${record.hash}:${record.sourceVersion}`,record]));
    for await(const file of index.values()){
      if(file.kind!=='file'||!file.name.endsWith('.json'))continue;
      const record=JSON.parse(await (await file.getFile()).text());
      if(!directories[record.kind]||!record.key||!record.hash||!record.filename)throw new Error('Повреждена запись каталога резервных копий.');
      merged.set(`${record.key}:${record.hash}:${record.sourceVersion}`,record);
    }
    catalog.records=[...merged.values()].sort((a,b)=>a.savedAt.localeCompare(b.savedAt));
  }catch(error){if(!missing(error))throw error;}
  return {root,catalog};
}
export async function hasBackupRecord(root,record) {
  try{
    const directory=await root.getDirectoryHandle(directories[record.kind]);
    const data=await readJson(directory,record.filename);
    return await contentHash(data)===record.hash;
  }catch(error){if(missing(error)||error instanceof SyntaxError)return false;throw error;}
}
export async function appendFolderBackups(handle,entries) {
  const {root,catalog}=await readBackupCatalog(handle);
  let added=0;
  for(const entry of entries) {
    if(!directories[entry.kind])throw new Error('Неизвестный вид резервной копии.');
    const hash=await contentHash(entry.data);
    const sourceVersion=String(entry.sourceVersion||'');
    const existing=catalog.records.find(record=>record.key===entry.key&&record.hash===hash&&record.sourceVersion===sourceVersion);
    if(existing && await hasBackupRecord(root,existing))continue;
    const directory=await root.getDirectoryHandle(directories[entry.kind],{create:true});
    let filename=`${safeBackupName(entry.name)}-${hash}.${['project','library','server'].includes(entry.kind)?'eft.json':'json'}`;
    // A different revision always gets another file. Old copies are never removed.
    let alreadyWritten=false;
    try{
      const previous=await readJson(directory,filename);
      if(await contentHash(previous)===hash)alreadyWritten=true;
      else filename=`${crypto.randomUUID()}-${filename}`;
    }catch(error){if(error instanceof SyntaxError)filename=`${crypto.randomUUID()}-${filename}`;else if(!missing(error))throw error;}
    if(!alreadyWritten)await writeJson(directory,filename,entry.data);
    const record={key:entry.key,name:entry.name,kind:entry.kind,hash,filename,sourceVersion,savedAt:new Date().toISOString()};
    const index=catalog.records.findIndex(item=>item.key===record.key&&item.hash===hash&&item.sourceVersion===sourceVersion);
    if(index>=0)catalog.records[index]=record;else catalog.records.push(record);
    // Publish this record only after its data file has closed successfully.
    const recordDirectory=await root.getDirectoryHandle('Каталог',{create:true});
    await writeJson(recordDirectory,`${await contentHash({key:record.key,hash,sourceVersion})}.json`,record);added++;
  }
  try{await root.getFileHandle(MANIFEST);}catch(error){if(!missing(error))throw error;await writeJson(root,MANIFEST,{format:'eft-folder-backup',version:1,records:[]});}
  return {added,records:catalog.records};
}
export async function readFolderBackup(handle,record) {
  if(!directories[record.kind]||!record.filename||/[\\/]/.test(record.filename))throw new Error('Некорректный путь резервной копии.');
  const {root}=await readBackupCatalog(handle);
  const data=await readJson(await root.getDirectoryHandle(directories[record.kind]),record.filename);
  if(await contentHash(data)!==record.hash)throw new Error('Файл резервной копии изменён или повреждён.');
  return data;
}
export function projectBackupData(project) {
  const {savedAt,_backup,...data}=project;
  return {...data,format:'eft-project'};
}
export function libraryBackupEntries(entries,prices,source='local-library',versions={}) {
  return entries.map(entry=>{
    const meta={...entry};delete meta.project;delete meta.plan;
    const data=entry.kind==='folder'?entry:{...projectBackupData(entry.project||{plan:entry.plan}),priceMat:entry.project?.priceMat||prices.priceMat,priceLab:entry.project?.priceLab||prices.priceLab,_backupLibrary:meta};
    return {key:`${source}:${entry.id}`,kind:entry.kind==='folder'?'folder':'library',name:entry.name,data,sourceVersion:versions[entry.id]||''};
  });
}
