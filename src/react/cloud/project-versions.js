import { validateImportedProject } from "../state/project-import.js";

export async function getSavedProjectVersion(api, projectId, versionId) {
  const result = await api("version", { query: { id: versionId } });
  if (result.version?.project_id !== projectId)
    throw new Error("Версия не принадлежит выбранному проекту");
  validateImportedProject(result.version.payload);
  return result.version;
}

export async function restoreSavedProjectVersion(api, projectId, versionId, csrf) {
  const version = await getSavedProjectVersion(api, projectId, versionId);
  const latest = (await api("project", { query: { id: projectId } })).project;
  validateImportedProject(latest.payload);
  const backup = await api("project", {
    method: "PUT", csrf,
    body: { id: projectId, revision: Number(latest.revision), payload: latest.payload, checkpoint: true },
  });
  await api("project", {
    method: "PUT", csrf,
    body: { id: projectId, revision: Number(backup.revision), payload: version.payload, checkpoint: true },
  });
}
