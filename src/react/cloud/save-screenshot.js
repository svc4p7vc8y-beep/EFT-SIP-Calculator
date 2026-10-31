import {saveSharedFile} from './save-shared-file.js';

export async function saveScreenshot(file,csrf,api) {
  return saveSharedFile(file,'Скриншоты',csrf,api);
}
