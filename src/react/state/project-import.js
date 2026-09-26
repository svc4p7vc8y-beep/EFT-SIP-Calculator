function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateImportedProject(data) {
  if (!isRecord(data)) throw new Error("Файл проекта повреждён или пуст");
  if (data.format !== undefined && data.format !== "eft-project")
    throw new Error("Выбран файл другого типа");
  const hasPlan = isRecord(data.plan);
  const hasLegacyData = Array.isArray(data.estimate) || Array.isArray(data.params);
  if (!hasPlan && !hasLegacyData)
    throw new Error("В файле нет данных проекта ЭФТ");
  if (hasPlan && (!isRecord(data.plan.house) || !Array.isArray(data.plan.rooms)))
    throw new Error("План дома имеет неверную структуру");
  if (data.plan !== undefined && !hasPlan)
    throw new Error("План дома имеет неверную структуру");
  if (data.meta !== undefined && !isRecord(data.meta))
    throw new Error("Данные проекта повреждены");
  if (data.priceMat !== undefined && !Array.isArray(data.priceMat))
    throw new Error("Список материалов повреждён");
  if (data.priceLab !== undefined && !Array.isArray(data.priceLab))
    throw new Error("Список работ повреждён");
  return data;
}
