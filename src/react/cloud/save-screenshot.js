import {eftApi} from '../../shared/team-api.js';

export async function saveScreenshot(file,csrf,api=eftApi) {
  const find=result=>(result.folders||[]).find(folder=>String(folder.name).trim().toLocaleLowerCase('ru')==='скриншоты');
  let folder=find(await api('files'));
  if(!folder){
    try{folder=(await api('file-folder',{method:'POST',csrf,body:{name:'Скриншоты',parentId:''}})).folder;}
    catch(error){if(error.code!=='folder_exists')throw error;folder=find(await api('files'));if(!folder)throw error;}
  }
  if(!folder?.id)throw new Error('Не удалось открыть папку «Скриншоты».');
  const body=new FormData();body.append('folderId',folder.id);body.append('files[]',file);
  const result=await api('file-upload',{method:'POST',csrf,body});
  if(!(result.count>0))throw new Error('Сервер не подтвердил сохранение снимка.');
  globalThis.window?.dispatchEvent(new Event('eft:files-updated'));
  return {folderId:folder.id,result};
}
