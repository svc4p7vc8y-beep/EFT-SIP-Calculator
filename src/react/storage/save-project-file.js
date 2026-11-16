// Keep the download URL alive until the browser has acquired its contents.
export function downloadProjectBlob(file, browser=window) {
  const link=browser.document.createElement('a');
  const url=browser.URL.createObjectURL(file);
  link.href=url;link.download=file.name;link.style.display='none';
  browser.document.body.appendChild(link);
  try { link.click(); } finally { browser.setTimeout(()=>{link.remove();browser.URL.revokeObjectURL(url);},60000); }
  return {mode:'download',filename:file.name};
}
export async function saveProjectFile(file,{downloadOnly=false,browser=window}={}) {
  if(downloadOnly||typeof browser.showSaveFilePicker!=='function')return downloadProjectBlob(file,browser);
  const handle=await browser.showSaveFilePicker({suggestedName:file.name,types:[{description:'Проект EFT',accept:{'application/json':['.json']}}]});
  const writable=await handle.createWritable();
  try { await writable.write(file);await writable.close(); }
  catch(error) { try { await writable.abort(); } catch {} throw error; }
  const saved=await handle.getFile();
  if(saved.size!==file.size||await saved.text()!==await file.text())throw new Error('Файл в выбранной папке не совпадает с проектом. Используйте скачивание через браузер.');
  return {mode:'file',filename:handle.name||file.name};
}
