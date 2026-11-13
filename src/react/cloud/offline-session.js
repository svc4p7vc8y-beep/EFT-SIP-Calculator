import { readWorkspace, writeWorkspace } from '../state/workspace-storage.js';
const key='eft-offline-owner-v1';
export function readOfflineOwner(storage=globalThis.localStorage){try{const value=JSON.parse(storage.getItem(key)||'null');return value?.owner&&!value.signedOut?{owner:String(value.owner),name:String(value.name||'')}:null;}catch{return null;}}
export function rememberOfflineOwner(user,storage=globalThis.localStorage){if(!user?.id)return;try{storage.setItem(key,JSON.stringify({owner:String(user.id),name:String(user.displayName||user.username||''),savedAt:Date.now()}));}catch{}}
export function forgetOfflineOwner(storage=globalThis.localStorage){try{storage.setItem(key,JSON.stringify({signedOut:true}));}catch{}}
export function offlineSession(previous={},error='',storage=globalThis.localStorage){const saved=readOfflineOwner(storage);return {ready:true,user:null,csrf:'',offline:true,localOwnerId:String(previous.user?.id||previous.localOwnerId||saved?.owner||'local'),error:error||'Сервер недоступен. Работа сохраняется на этом устройстве.'};}
export function validCachedCatalog(value){return !!value&&Number(value.revision)>0&&Array.isArray(value.payload?.priceMat)&&Array.isArray(value.payload?.priceLab);}
export async function readCachedCatalog(owner){if(!owner)return null;const value=await readWorkspace('price:'+owner,'eft-offline-price-v1:'+owner);return validCachedCatalog(value)?value:null;}
export function cacheCatalog(owner,result){if(!owner||!validCachedCatalog(result))return Promise.resolve();return writeWorkspace({owner:'price:'+owner,payload:result.payload,revision:result.revision,savedAt:Date.now()},'eft-offline-price-v1:'+owner).catch(()=>{});}

// Guest edits become additional local tabs on explicit sign-in; they never overwrite server projects.
export function mergeGuestWorkspace(saved,guest,owner){
 const tabs=[...(saved?.tabs||[])],ids=new Set(tabs.map(t=>t.id));let activeId=saved?.activeId;
 for(const tab of guest.tabs||[]){let id=tab.id;while(ids.has(id))id+='-local';ids.add(id);tabs.push({...tab,id,serverId:null,serverRevision:0,serverName:''});if(tab.id===guest.activeId)activeId=id;}
 return {owner,tabs,activeId,savedAt:Date.now()};
}

export const readCachedRules=owner=>owner?readWorkspace('rules:'+owner,'eft-offline-rules-v1:'+owner):Promise.resolve(null);
export const cacheRules=(owner,payload)=>writeWorkspace({owner:'rules:'+owner,payload,savedAt:Date.now()},'eft-offline-rules-v1:'+owner).catch(()=>{});

export function canSyncSession(captured,current){return !!captured.user?.id&&!!current.user?.id&&!current.offline&&captured.user.id===current.user.id&&!!captured.csrf&&captured.csrf===current.csrf;}
