import test from 'node:test';
import assert from 'node:assert/strict';
import {saveSharedFile} from '../src/react/cloud/save-shared-file.js';

test('estimate PDF is saved unchanged in the shared Estimates folder',async()=>{
  const file=new File(['%PDF-1.7\nselected estimate'],'Смета — Пристройка.pdf',{type:'application/pdf'}),calls=[];
  const saved=await saveSharedFile(file,'Сметы','csrf',async(action,options)=>{
    calls.push({action,options});
    if(action==='files')return {folders:[]};
    if(action==='file-folder')return {folder:{id:'estimates'}};
    return {count:1,ids:['pdf']};
  });
  assert.equal(saved.folderId,'estimates');
  assert.deepEqual(calls[1].options.body,{name:'Сметы',parentId:''});
  assert.equal(calls[2].options.csrf,'csrf');
  const upload=calls[2].options.body.get('files[]');
  assert.equal(upload.type,'application/pdf');assert.equal(upload.name,file.name);
  assert.equal(await upload.text(),await file.text());
});

test('saving never reports success for rejected folder creation or upload',async()=>{
  const file=new File(['pdf'],'estimate.pdf');
  await assert.rejects(saveSharedFile(file,'Сметы','',async action=>{
    if(action==='files')return {folders:[]};throw new Error('Нет прав');
  }),/Нет прав/);
  await assert.rejects(saveSharedFile(file,'Сметы','',async action=>action==='files'?{folders:[{id:'pdfs',name:'СМЕТЫ'}]}:{count:0}),/не подтвердил/);
});
