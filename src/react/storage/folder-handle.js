function withStore(mode,run) {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('eft-folder-backup',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('settings');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result;
      try{
        const tx=db.transaction('settings',mode),operation=run(tx.objectStore('settings'));
        tx.oncomplete=()=>{const result=operation?.result;db.close();resolve(result);};
        tx.onerror=tx.onabort=()=>{db.close();reject(tx.error);};
      }catch(error){db.close();reject(error);}
    };
  });
}
export const loadFolderHandle=()=>withStore('readonly',store=>store.get('directory'));
export const storeFolderHandle=handle=>withStore('readwrite',store=>store.put(handle,'directory'));
export const forgetFolderHandle=()=>withStore('readwrite',store=>store.delete('directory'));
