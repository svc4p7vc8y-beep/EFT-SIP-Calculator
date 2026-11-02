import {eftApi} from '../../shared/team-api.js';
import {REACT_PROJECT_VERSION} from '../state/project-model.js';
import {validateImportedProject} from '../state/project-import.js';
import {appendFolderBackups,readBackupCatalog,readFolderBackup,hasBackupRecord,libraryBackupEntries,projectBackupData} from '../storage/folder-backup.js';

// Read-only: never upload, merge or delete the team's live data from a backup.
export async function downloadMissingServerBackups(handle,api=eftApi) {
  const get=(action,options={})=>api(action,{...options,signal:globalThis.AbortSignal?.timeout?.(15_000)});
  const index=await get('backup-index');
  if(!Array.isArray(index.projects)||!Array.isArray(index.library))throw new Error('Сервер вернул некорректный список резервных версий.');
  const {root,catalog}=await readBackupCatalog(handle);
  const has=async(key,version)=>{
    const record=catalog.records.find(item=>item.key===key&&item.sourceVersion===String(version));
    return !!record && await hasBackupRecord(root,record);
  };
  let added=0;
  const save=async entries=>{const result=await appendFolderBackups(handle,entries);catalog.records=result.records;added+=result.added;};
  // The shared price is versioned independently; obtain it before the library's compact projects.
  let prices;
  if(index.priceRevision && !await has('server-price',index.priceRevision)) {
    prices=await get('price-catalog');
    if(!Array.isArray(prices.payload?.priceMat)||!Array.isArray(prices.payload?.priceLab))throw new Error('Сервер вернул неполный прайс.');
    await save([{key:'server-price',kind:'price',name:`Серверный прайс ${prices.revision}`,sourceVersion:String(prices.revision),data:{format:'eft-price-backup',appVersion:REACT_PROJECT_VERSION,revision:prices.revision,...prices.payload}}]);
  }
  if(!prices&&index.priceRevision){
    const record=catalog.records.find(item=>item.key==='server-price'&&item.sourceVersion===String(index.priceRevision));
    if(record)prices={payload:await readFolderBackup(handle,record)};
  }
  for(const item of index.projects||[]) {
    if(await has(`server-project:${item.id}`,item.revision))continue;
    const {project}=await get('project',{query:{id:item.id}});
    if(!project?.payload?.plan)throw new Error('Сервер вернул неполный проект.');
    validateImportedProject(project.payload);
    await save([{key:`server-project:${item.id}`,kind:'server',name:project.name,sourceVersion:String(project.revision),data:projectBackupData(project.payload)}]);
  }
  for(const item of index.library||[]) {
    if(await has(`server-library:${item.id}`,item.hash))continue;
    const {entry}=await get('backup-library-entry',{query:{id:item.id,hash:item.hash}});
    if(!entry?.id||String(entry.id)!==String(item.id))throw new Error('Сервер вернул неполный план библиотеки.');
    if(entry.kind!=='folder'&&!prices?.payload?.priceMat)throw new Error('Серверный прайс недоступен: план библиотеки не сохранён без своих цен.');
    const entries=libraryBackupEntries([entry],prices?.payload||{},'server-library',{[entry.id]:item.hash});
    if(entry.kind!=='folder')validateImportedProject(entries[0].data);
    await save(entries);
  }
  return {added,records:catalog.records};
}
