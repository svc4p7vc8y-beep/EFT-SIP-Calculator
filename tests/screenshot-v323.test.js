import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotBounds,snapshotFilename} from '../src/react/export/square-3d-snapshot.js';
import {saveScreenshot} from '../src/react/cloud/save-screenshot.js';

test('square capture finds the full visible model, ignoring white background',()=>{
  const pixels=new Uint8ClampedArray(8*6*4).fill(255);
  pixels[(1*8+2)*4]=0;pixels[(4*8+6)*4+1]=0;
  assert.deepEqual(snapshotBounds(pixels,8,6),{x:2,y:1,width:5,height:4});
  assert.equal(snapshotBounds(new Uint8ClampedArray(4*4*4).fill(255),4,4),null);
  const name=snapshotFilename({projectNum:'7',projectName:'Дом / тест: PNG'},new Date('2026-10-31T10:20:30Z'));
  assert.ok(name.includes('7_Дом   тест  PNG_2026-10-31-13-20-30.png'));
  assert.ok(!/[<>:"/\\|?*]/.test(name));
});

test('a screenshot goes to the existing shared screenshots folder with its PNG filename',async()=>{
  const calls=[],file=new File(['png'],'project.png',{type:'image/png'});
  const result=await saveScreenshot(file,'csrf',async(action,options)=>{
    calls.push({action,options});
    return action==='files'?{folders:[{id:'shots',name:'Скриншоты'}]}:{count:1};
  });
  assert.equal(result.folderId,'shots');assert.deepEqual(calls.map(call=>call.action),['files','file-upload']);
  const upload=calls[1].options;assert.equal(upload.csrf,'csrf');assert.equal(upload.body.get('folderId'),'shots');assert.equal(upload.body.get('files[]').name,'project.png');
});

test('folder creation handles another participant creating it concurrently and upload errors remain errors',async()=>{
  let reads=0;
  await saveScreenshot(new File(['png'],'p.png'),'',async action=>{
    if(action==='files')return {folders:++reads===1?[]:[{id:'new',name:'Скриншоты'}]};
    if(action==='file-folder')throw Object.assign(new Error('duplicate'),{code:'folder_exists'});
    return {count:1};
  });
  assert.equal(reads,2);
  await assert.rejects(saveScreenshot(new File(['png'],'p.png'),'',async action=>action==='files'?{folders:[{id:'shots',name:'Скриншоты'}]}:{count:0}),/не подтвердил/);
});
