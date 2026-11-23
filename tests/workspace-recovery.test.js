import test from 'node:test';
import assert from 'node:assert/strict';

test('automatic project recovery survives reload, closed tabs, broken workspace and storage quota',async()=>{
  const originals={localStorage:globalThis.localStorage,indexedDB:globalThis.indexedDB};
  const local=new Map(),records=new Map();let quota=false;
  globalThis.localStorage={getItem:key=>local.get(key)||null,setItem:(key,value)=>{if(quota)throw Error('quota');local.set(key,value);}};
  globalThis.indexedDB={open:()=>{
    const request={result:{transaction:()=>{
      const tx={objectStore:()=>({
        put:(value,key)=>{records.set(key,structuredClone(value));queueMicrotask(()=>tx.oncomplete?.());},
        get:key=>{const read={};queueMicrotask(()=>{read.result=records.get(key);read.onsuccess();});return read;},
        getAll:()=>{const read={};queueMicrotask(()=>{read.result=[...records.values()];read.onsuccess();});return read;},
      })};return tx;
    }}};queueMicrotask(()=>request.onsuccess());return request;
  }};
  try{
    const {writeWorkspace,readWorkspace,readRecoveryProjects,LOCAL_RECOVERY_KEY}=await import('../src/react/state/workspace-storage.js');
    const project={meta:{projectNum:'22'},plan:{rooms:[{id:'room',width:4}]}};
    const first={owner:'employee',activeId:'a',savedAt:1000,tabs:[{id:'a',serverId:'shared-22',serverRevision:7,project},{id:'b',project:{...project,meta:{projectNum:'23'}}}]};
    await writeWorkspace(first,'workspace');
    assert.equal(JSON.parse(local.get(LOCAL_RECOVERY_KEY)).length,2);
    assert.deepEqual(await readWorkspace('employee','workspace'),first);
    quota=true;
    const changed={...first,savedAt:2000,tabs:[{...first.tabs[0],project:{...project,plan:{rooms:[{id:'room',width:5}]}}}]};
    await writeWorkspace(changed,'workspace');
    assert.deepEqual(await readWorkspace('employee','workspace'),changed);
    const copies=await readRecoveryProjects();
    assert.equal(copies.length,2,'closed tab retains a rescue copy');
    assert.equal(copies[0].plan.rooms[0].width,5,'newest saved version wins over stale local mirror');
    records.delete('employee');local.set('workspace','broken json');
    const recovered=await readWorkspace('employee','workspace');
    assert.equal(recovered.tabs.length,2);
    assert.equal(recovered.tabs[0].project.plan.rooms[0].width,5);
    assert.equal(recovered.tabs[0].serverId,'shared-22');
    assert.equal(recovered.tabs[0].serverRevision,7);
    assert.equal(await readWorkspace('other-employee','workspace'),null,'never auto-restore another owner workspace');
  }finally{Object.assign(globalThis,originals);}
});

test('history merges automatic mirrors without duplicates and preserves manual snapshots',async()=>{
  const {mergeRecoveryProjects}=await import('../src/react/state/workspace-storage.js');
  const project={meta:{projectNum:'22'},plan:{rooms:[]},backupId:'auto',savedAt:'2026-11-23T10:00:00Z'};
  const latest={...project,savedAt:'2026-11-23T11:00:00Z'};
  const manual={...project,backupId:'manual'};
  assert.deepEqual(mergeRecoveryProjects([project],[latest],[manual]),[latest,manual]);
  assert.deepEqual(mergeRecoveryProjects({},[null,{backupId:'invalid'}]),[]);
});
