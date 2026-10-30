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
  return [local,stored].filter(item=>item?.owner===owner).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0))[0]||null;
}
export function writeWorkspace(snapshot,key) {
  let localSaved=false;
  try{localStorage.setItem(key,JSON.stringify(snapshot));localSaved=true;}catch{}
  return openDatabase().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('workspaces','readwrite');tx.objectStore('workspaces').put(snapshot,snapshot.owner);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  })).catch(error=>{if(!localSaved)throw error;});
}
