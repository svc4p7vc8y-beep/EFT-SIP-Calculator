import {eftApi} from '../../shared/team-api.js';

export async function saveSharedFile(file,folderName,csrf,api=eftApi) {
  const find=result=>(result.folders||[]).find(folder=>String(folder.name).trim().toLocaleLowerCase('ru')===folderName.toLocaleLowerCase('ru'));
  let folder=find(await api('files'));
  if(!folder){
    try{folder=(await api('file-folder',{method:'POST',csrf,body:{name:folderName,parentId:''}})).folder;}
    catch(error){if(error.code!=='folder_exists')throw error;folder=find(await api('files'));if(!folder)throw error;}
  }
  if(!folder?.id)throw new Error(`Не удалось открыть папку «${folderName}».`);
  const body=new FormData();body.append('folderId',folder.id);body.append('files[]',file);
  const result=await api('file-upload',{method:'POST',csrf,body});
  if(!(result.count>0))throw new Error('Сервер не подтвердил сохранение файла.');
  globalThis.window?.dispatchEvent(new Event('eft:files-updated'));
  return {folderId:folder.id,result};
}
