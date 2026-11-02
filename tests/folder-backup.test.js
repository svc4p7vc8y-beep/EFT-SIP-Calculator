import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFolderBackups,readFolderBackup,readBackupCatalog,contentHash,projectBackupData,libraryBackupEntries,BACKUP_DIRECTORY} from '../src/react/storage/folder-backup.js';
import {downloadMissingServerBackups} from '../src/react/cloud/backup-server.js';
import {createDefaultProject} from '../src/react/state/project-model.js';
import {validateImportedProject} from '../src/react/state/project-import.js';
import {workspaceBackupEntries,orderedBackupRecords} from '../src/react/storage/backup-workspace.js';

class Directory {
  constructor(name='backup'){this.name=name;this.dirs=new Map();this.files=new Map();this.writes=[];this.fail=false;}
  async getDirectoryHandle(name,{create=false}={}){
    if(!this.dirs.has(name)){if(!create)throw Object.assign(new Error('not found'),{name:'NotFoundError'});this.dirs.set(name,new Directory(name));}
    return this.dirs.get(name);
  }
  async getFileHandle(name,{create=false}={}){
    if(!this.files.has(name)){if(!create)throw Object.assign(new Error('not found'),{name:'NotFoundError'});this.files.set(name,'');}
    const directory=this;
    return {getFile:async()=>new Blob([directory.files.get(name)]),createWritable:async()=>{
      let data;
      return {write:async value=>{data=value;if(directory.fail)throw new Error('disk full');},close:async()=>{directory.files.set(name,data);directory.writes.push(name);},abort:async()=>{}};
    }};
  }
  async *values(){for(const [name,data] of this.files)yield {kind:'file',name,getFile:async()=>new Blob([data])};}
}
const project=createDefaultProject();
const entry={key:'local:1',name:'Дом / тест',kind:'project',data:projectBackupData(project)};

test('folder backup deduplicates content and retains previous versions and deleted projects',async()=>{
  const directory=new Directory();
  const first=await appendFolderBackups(directory,[entry]);
  assert.equal(first.added,1);validateImportedProject(await readFolderBackup(directory,first.records[0]));
  assert.equal((await appendFolderBackups(directory,[entry])).added,0);
  const updated={...entry,data:{...entry.data,meta:{...project.meta,projectName:'Изменённый'}}};
  assert.equal((await appendFolderBackups(directory,[updated])).records.length,2);
  const afterDelete=await appendFolderBackups(directory,[]);
  assert.equal(afterDelete.records.length,2);
  assert.deepEqual(await readFolderBackup(directory,first.records[0]),JSON.parse(JSON.stringify(entry.data)));
});

test('savedAt-only changes do not create copies and library snapshots retain project prices and folder metadata',async()=>{
  assert.equal(await contentHash(projectBackupData({...project,savedAt:'yesterday'})),await contentHash(projectBackupData({...project,savedAt:'today'})));
  const compact={...project};delete compact.priceMat;delete compact.priceLab;
  const [backup]=libraryBackupEntries([{id:'p',name:'План',folderId:'f',project:compact}],project);
  validateImportedProject(backup.data);assert.equal(backup.data._backupLibrary.folderId,'f');
  assert.deepEqual(backup.data.priceMat,project.priceMat);
});

test('failed writes do not publish successful records, and damaged files never overwrite the original',async()=>{
  const directory=new Directory();const root=await directory.getDirectoryHandle(BACKUP_DIRECTORY,{create:true});
  const projects=await root.getDirectoryHandle('Проекты',{create:true});projects.fail=true;
  await assert.rejects(appendFolderBackups(directory,[entry]),/disk full/);
  assert.equal((await readBackupCatalog(directory)).catalog.records.length,0);
  projects.fail=false;
  const saved=await appendFolderBackups(directory,[entry]),filename=saved.records[0].filename;
  projects.files.set(filename,'modified manually');
  await assert.rejects(readFolderBackup(directory,saved.records[0]));
  const repaired=await appendFolderBackups(directory,[entry]);
  assert.notEqual(repaired.records[0].filename,filename);assert.equal(projects.files.get(filename),'modified manually');
  root.files.set('Каталог.json','broken');
  await assert.rejects(appendFolderBackups(directory,[entry]),/Каталог.*повреждён/);
});

test('server comparison downloads only missing revisions and never posts or deletes',async()=>{
  const directory=new Directory(),calls=[];
  let revision=1;
  const api=async(action,options)=>{
    calls.push({action,options});assert.ok(!options?.method||options.method==='GET');
    if(action==='backup-index')return {priceRevision:1,projects:[{id:'s1',revision}],library:[{id:'l1',hash:'hash1'}]};
    if(action==='price-catalog')return {revision:1,payload:{priceMat:project.priceMat,priceLab:project.priceLab}};
    if(action==='project')return {project:{name:'Серверный',revision,payload:{...project,meta:{...project.meta,projectName:`v${revision}`}}}};
    if(action==='backup-library-entry')return {entry:{id:'l1',name:'Библиотечный',project:{...project,priceMat:undefined,priceLab:undefined}}};
    throw new Error(action);
  };
  const first=await downloadMissingServerBackups(directory,api);assert.equal(first.added,3);
  const lib=await readFolderBackup(directory,first.records.find(record=>record.kind==='library'));
  assert.deepEqual(lib.priceMat,project.priceMat);validateImportedProject(lib);
  calls.length=0;assert.equal((await downloadMissingServerBackups(directory,api)).added,0);
  assert.deepEqual(calls.map(call=>call.action),['backup-index']);
  revision=2;calls.length=0;
  const next=await downloadMissingServerBackups(directory,api);
  assert.equal(next.added,1);assert.equal(next.records.length,4);assert.deepEqual(calls.map(call=>call.action),['backup-index','project']);
  await assert.rejects(downloadMissingServerBackups(directory,async()=>{throw new Error('Beget offline');}),/offline/);
  assert.equal((await readBackupCatalog(directory)).catalog.records.length,4);
});

test('parallel writers preserve both catalogue entries and unchanged content can record a new server revision',async()=>{
  const directory=new Directory();
  await Promise.all([
    appendFolderBackups(directory,[{...entry,key:'tab-one'}]),
    appendFolderBackups(directory,[{...entry,key:'tab-two',data:{...entry.data,meta:{...project.meta,projectName:'Second'}}}]),
  ]);
  assert.equal((await readBackupCatalog(directory)).catalog.records.length,2);
  await appendFolderBackups(directory,[{...entry,key:'server-project:p',sourceVersion:'1'}]);
  await appendFolderBackups(directory,[{...entry,key:'server-project:p',sourceVersion:'2'}]);
  const records=(await readBackupCatalog(directory)).catalog.records.filter(item=>item.key==='server-project:p');
  assert.deepEqual(records.map(item=>item.sourceVersion).sort(),['1','2']);
  assert.equal(records[0].filename,records[1].filename);
});

test('malformed server responses are not marked as valid backups',async()=>{
  const directory=new Directory();
  await assert.rejects(downloadMissingServerBackups(directory,async()=>({ok:true})),/некорректный список/);
  await assert.rejects(downloadMissingServerBackups(directory,async action=>action==='backup-index'?{projects:[],library:[],priceRevision:1}:{revision:1,payload:{}}),/неполный прайс/);
  assert.equal((await readBackupCatalog(directory)).catalog.records.length,0);
});

test('Anton is backed up from the live open tab into every newly selected folder',async()=>{
  const anton={...project,meta:{...project.meta,projectName:'Антон',projectNum:'96775'}};
  const old={...anton,meta:{...anton.meta,projectName:'Старая копия'}};
  const tabs=[{id:'anton',meta:anton.meta}];
  const collect=()=>workspaceBackupEntries(tabs,'anton',anton,()=>old);
  const first=new Directory('first'),second=new Directory('second');
  await appendFolderBackups(first,collect());
  // The old destination has already drained the queue. The live tab must still be collected anew.
  const saved=await appendFolderBackups(second,collect());
  assert.equal(saved.records[0].name,'96775 Антон');
  assert.equal((await readFolderBackup(second,saved.records[0])).meta.projectName,'Антон');
  assert.equal((await appendFolderBackups(second,collect())).added,0);
  const manyLibraryPlans=Array.from({length:70},(_,i)=>({key:`library:${i}`,savedAt:'2026-11-02T12:00:00Z'}));
  const ordered=orderedBackupRecords([...saved.records,...manyLibraryPlans],collect()[0].key);
  assert.equal(ordered[0].name,'96775 Антон');
});
