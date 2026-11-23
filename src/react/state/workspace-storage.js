import { REACT_BACKUPS_KEY } from './project-model.js';

export const LOCAL_RECOVERY_KEY = 'eft-project-recovery-v1';
const database = 'eft-project-workspaces';
let opening;
function openDatabase() {
  return opening ||= new Promise((resolve,reject)=>{
    const request=indexedDB.open(database,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('workspaces');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{opening=null;reject(request.error);};
  });
}
export async function readWorkspace(owner,key) {
  let local=null,stored=null;
  try{local=JSON.parse(localStorage.getItem(key)||'null');}catch{}
  try{const db=await openDatabase();stored=await new Promise((resolve,reject)=>{const request=db.transaction('workspaces').objectStore('workspaces').get(owner);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}catch{}
  const candidates=[local,stored].filter(item=>item?.owner===owner && item.tabs?.length);
  if(candidates.length)return candidates.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0))[0];
  const copies=(await readRecoveryProjects()).filter(item=>item.recoveryOwner===owner);
  return copies.length?{owner,activeId:copies[0].recoveryTabId,savedAt:Date.parse(copies[0].savedAt),tabs:copies.map(copy=>({id:copy.recoveryTabId,project:copy,serverId:copy.recoveryServerId||null,serverRevision:copy.recoveryServerRevision||0,serverName:copy.recoveryServerName||'',libraryId:copy.recoveryLibraryId||null}))}:null;
}
export function writeWorkspace(snapshot,key) {
  let localSaved=false;
  try{localStorage.setItem(key,JSON.stringify(snapshot));localSaved=true;}catch{}
  const copies=recoveryRecords(snapshot);
  try{
    const existing=JSON.parse(localStorage.getItem(LOCAL_RECOVERY_KEY)||'[]');
    const ids=new Set(copies.map(copy=>copy.backupId));
    const all=[...copies,...(Array.isArray(existing)?existing:[]).filter(copy=>!ids.has(copy.backupId))].slice(0,30);
    // A full history must never prevent the current project's rescue copy.
    for(let retained=all.length;retained>=copies.length;retained--){
      try{localStorage.setItem(LOCAL_RECOVERY_KEY,JSON.stringify(all.slice(0,retained)));break;}catch{}
    }
  }catch{}
  return openDatabase().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('workspaces','readwrite');const store=tx.objectStore('workspaces');store.put(snapshot,snapshot.owner);
    for(const copy of copies)store.put(copy,copy.backupId);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  })).catch(error=>{if(!localSaved)throw error;});
}


export function recoveryRecords(snapshot) {
  return (snapshot.tabs||[]).filter(tab=>tab?.project).map(tab=>({
    ...tab.project,
    backupId:`recovery:${snapshot.owner}:${tab.id}`,
    recoveryOwner:snapshot.owner,recoveryTabId:tab.id,recoveryServerId:tab.serverId||null,
    recoveryServerRevision:tab.serverRevision||0,recoveryServerName:tab.serverName||'',recoveryLibraryId:tab.libraryId||null,
    automaticRecovery:true,savedAt:new Date(snapshot.savedAt||Date.now()).toISOString(),
  }));
}

export async function readRecoveryProjects({includeManual=false}={}) {
  let local=[],stored=[],manual=[];
  try{local=JSON.parse(localStorage.getItem(LOCAL_RECOVERY_KEY)||'[]');}catch{}
  if(includeManual)try{manual=JSON.parse(localStorage.getItem(REACT_BACKUPS_KEY)||'[]');}catch{}
  try{
    const db=await openDatabase();
    stored=await new Promise((resolve,reject)=>{
      const request=db.transaction('workspaces').objectStore('workspaces').getAll();
      request.onsuccess=()=>resolve(request.result.filter(item=>item?.automaticRecovery));
      request.onerror=()=>reject(request.error);
    });
  }catch{}
  return mergeRecoveryProjects(local,stored,manual);
}

export function mergeRecoveryProjects(...sources) {
  const records=new Map();
  for(const source of sources)for(const item of Array.isArray(source)?source:[]){
    if(!item?.plan||!item?.meta)continue;
    const id=item.backupId||item.savedAt;
    if(!records.has(id)||Date.parse(item.savedAt)>Date.parse(records.get(id).savedAt))records.set(id,item);
  }
  return [...records.values()].sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt));
}
