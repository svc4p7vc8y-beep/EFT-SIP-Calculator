import test from 'node:test';
import assert from 'node:assert/strict';
import {offlineSession,rememberOfflineOwner,forgetOfflineOwner,readOfflineOwner,validCachedCatalog,mergeGuestWorkspace} from '../src/react/cloud/offline-session.js';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {createProjectWorkspace,projectWorkspaceReducer,serializeProjectWorkspace,restoreProjectWorkspace} from '../src/react/state/project-tabs.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),data};};
test('offline continuation keeps only the workspace owner and never authenticates a cached admin',()=>{
 const st=storage();rememberOfflineOwner({id:12,role:'admin',displayName:'QA',csrf:'secret',password:'secret'},st);
 assert.deepEqual(readOfflineOwner(st),{owner:'12',name:'QA'});const raw=JSON.stringify([...st.data.values()]);assert.ok(!raw.includes('secret')&&!raw.includes('admin'));
 const next=offlineSession({user:{id:12,role:'admin'},csrf:'old'},'Нет связи',st);assert.equal(next.user,null);assert.equal(next.csrf,'');assert.equal(next.offline,true);assert.equal(next.localOwnerId,'12');
});
test('reload can recover an owner without allowing a cached identity to access server APIs',()=>{
 const st=storage();rememberOfflineOwner({id:31,username:'qa'},st);const next=offlineSession({},'Сбой',st);assert.equal(next.localOwnerId,'31');assert.equal(next.user,null);
 forgetOfflineOwner(st);assert.equal(readOfflineOwner(st),null);assert.equal(offlineSession({},'',st).localOwnerId,'local');
});
test('blocked storage does not block local calculator entry',()=>{
 const st={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};rememberOfflineOwner({id:9},st);assert.equal(offlineSession({user:{id:9}},'',st).localOwnerId,'9');assert.equal(offlineSession({},'',st).localOwnerId,'local');
});
test('guest work is appended to the signed-in workspace and cannot overwrite a server-linked tab',()=>{
 const saved={owner:'12',activeId:'same',tabs:[{id:'same',serverId:7,serverRevision:4,project:{meta:{projectName:'Сервер'}}}]};const guest={owner:'local',activeId:'same',tabs:[{id:'same',serverId:7,serverRevision:4,project:{meta:{projectName:'Локальный'}}}]};
 const before=JSON.stringify({saved,guest}),merged=mergeGuestWorkspace(saved,guest,'12');assert.equal(merged.tabs.length,2);assert.equal(merged.tabs[0].serverId,7);assert.equal(merged.tabs[1].serverId,null);assert.equal(merged.activeId,merged.tabs[1].id);assert.equal(JSON.stringify({saved,guest}),before);
});
test('local workspace snapshots preserve edits across session expiration and reload',()=>{
 const project=createDefaultProject();let state=createProjectWorkspace(project);state=projectWorkspaceReducer(state,{type:'commit',tabId:state.activeId,update:next=>{next.meta.projectName='Офлайн';next.settings.priceAdjustments.roof.materials=-7;return next;}});
 const restored=restoreProjectWorkspace(JSON.parse(JSON.stringify(serializeProjectWorkspace(state,'12'))),project);assert.equal(restored.tabs[0].history.present.meta.projectName,'Офлайн');assert.equal(restored.tabs[0].history.present.settings.priceAdjustments.roof.materials,-7);
});
test('an incomplete cache is never treated as the last verified price catalog',()=>{
 assert.equal(validCachedCatalog({revision:0,payload:{priceMat:[],priceLab:[]}}),false);assert.equal(validCachedCatalog({revision:1,payload:{priceMat:[]}}),false);assert.equal(validCachedCatalog({revision:2,payload:{priceMat:[],priceLab:[]}}),true);
});
import {applySharedPriceCatalog,restoreLocalPrices} from '../src/react/cloud/price-catalog.js';
test('restored price backup survives migration and reconnect without modifying the shared catalog',()=>{
 const p=createDefaultProject(),data={priceMat:p.priceMat.map((row,i)=>i?row:{...row,price:700}),priceLab:p.priceLab};
 const restored=restoreLocalPrices(p,data,'Копия'),migrated=restoreProjectWorkspace(JSON.parse(JSON.stringify(serializeProjectWorkspace(createProjectWorkspace(restored),'12'))),p).tabs[0].history.present;
 assert.equal(migrated.localPriceCatalog.name,'Копия');assert.equal(applySharedPriceCatalog(migrated,{priceMat:p.priceMat,priceLab:p.priceLab},5).priceMat[0].price,700);assert.notEqual(p.priceMat[0].price,700);
 delete migrated.localPriceCatalog;assert.equal(applySharedPriceCatalog(migrated,{priceMat:p.priceMat,priceLab:p.priceLab},5).priceMat[0].price,p.priceMat[0].price);
});
test('broken backup cannot replace project prices with empty or invalid rows',()=>{
 const p=createDefaultProject();for(const data of [{priceMat:[],priceLab:[]},{priceMat:[{id:'x',price:-1}],priceLab:p.priceLab},{priceMat:[{id:'x',price:2},{id:'x',price:3}],priceLab:p.priceLab}])assert.throws(()=>restoreLocalPrices(p,data));
});

import {canSyncSession} from '../src/react/cloud/offline-session.js';
test('queued uploads pause when connection or authenticated session changes',()=>{
 const live={user:{id:12},csrf:'live'};assert.equal(canSyncSession(live,live),true);
 for(const next of [offlineSession(live),{user:null,csrf:''},{user:{id:13},csrf:'live'},{user:{id:12},csrf:'new'}])assert.equal(canSyncSession(live,next),false);
});
