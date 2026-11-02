import {projectBackupData} from './folder-backup.js';

export function workspaceBackupEntries(tabs,activeTabId,project,getTabProject,owner='local') {
  return tabs.map(tab=>({
    key:`workspace:${owner}:${tab.id}`,
    kind:'project',
    name:`${tab.meta?.projectNum||''} ${tab.meta?.projectName||'Проект'}`.trim(),
    data:projectBackupData(tab.id===activeTabId?project:getTabProject(tab.id)),
  }));
}

export function orderedBackupRecords(records,currentKey) {
  return [...records].sort((a,b)=>Number(b.key===currentKey)-Number(a.key===currentKey)||String(b.savedAt).localeCompare(String(a.savedAt)));
}
