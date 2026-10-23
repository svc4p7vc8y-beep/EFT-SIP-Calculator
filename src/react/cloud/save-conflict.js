export function describeProjectSaveConflict(project, error) {
  const name = project?.name || 'Без названия';
  const localRevision = Number(project?.revision);
  const serverRevision = Number(error?.currentRevision);
  const versions = Number.isFinite(localRevision) && Number.isFinite(serverRevision)
    ? `Открыта ревизия ${localRevision}, на сервере уже ревизия ${serverRevision}. `
    : 'Версия проекта на сервере изменилась после его открытия. ';
  return `Конфликт сохранения общего проекта «${name}»: ${versions}Сервер отклонил запись этой версии, чтобы не перезаписать изменения коллеги. Текущие правки остаются на экране. Сохраните их в файл .eft.json, затем откройте актуальный общий проект и сравните данные перед переносом правок.`;
}
