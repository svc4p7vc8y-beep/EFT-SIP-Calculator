import test from 'node:test';
import assert from 'node:assert/strict';

test('workspace survives localStorage quota using IndexedDB and latest owner-specific copy wins',async()=>{
  const originals={localStorage:globalThis.localStorage,indexedDB:globalThis.indexedDB};
  const stored=new Map();
  globalThis.localStorage={getItem:()=>JSON.stringify({owner:'owner',savedAt:1,tabs:[{id:'old'}]}),setItem:()=>{throw new Error('quota');}};
  globalThis.indexedDB={open:()=>{
    const request={result:{transaction:()=>{
      const tx={objectStore:()=>({put:(value,key)=>{stored.set(key,value);queueMicrotask(()=>tx.oncomplete());},get:key=>{const read={};queueMicrotask(()=>{read.result=stored.get(key);read.onsuccess();});return read;}})};
      return tx;
    }}};
    queueMicrotask(()=>request.onsuccess());return request;
  }};
  try{
    const {readWorkspace,writeWorkspace}=await import('../src/react/state/workspace-storage.js');
    const snapshot={owner:'owner',savedAt:2,activeId:'two',tabs:[{id:'one'},{id:'two'}]};
    await writeWorkspace(snapshot,'test');
    assert.deepEqual(await readWorkspace('owner','test'),snapshot);
    assert.equal(await readWorkspace('another-owner','test'),null);
  }finally{Object.assign(globalThis,originals);}
});
