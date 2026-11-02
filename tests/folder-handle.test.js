import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFolderHandle} from '../src/react/storage/folder-handle.js';

test('a browser refusing to persist a directory handle rejects without hanging or leaking the database',async()=>{
  const original=globalThis.indexedDB;let closed=false;
  const failure=Object.assign(new Error('Handle cannot be cloned'),{name:'DataCloneError'});
  globalThis.indexedDB={open(){const request={};queueMicrotask(()=>{
    const store={put(){throw failure;}};
    const transaction={objectStore(){return store;}};
    request.result={close(){closed=true;},transaction(){return transaction;}};
    request.onsuccess();
  });return request;}};
  try{await assert.rejects(storeFolderHandle({name:'Папка'}),error=>error===failure);assert.equal(closed,true);}
  finally{globalThis.indexedDB=original;}
});
