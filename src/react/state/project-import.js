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
  if (hasPlan && (data.plan.house.w === undefined || data.plan.house.h === undefined))
    throw new Error("План дома: отсутствуют размеры контура");
  if (hasPlan && (![data.plan.house.w, data.plan.house.h].every((size) => (typeof size === 'number' || typeof size === 'string' && size.trim() !== '') && Number.isFinite(Number(size)) && Number(size) >= 0) ||
    (Number(data.plan.house.w) === 0) !== (Number(data.plan.house.h) === 0)))
    throw new Error("План дома: проверьте ширину и длину контура");
  const validEstimateNumber = (value) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) && Number(value) >= 0;
  for (const line of [...(Array.isArray(data.customEstimateLines) ? data.customEstimateLines : []),
    ...(Array.isArray(data.estimateOverrides) ? data.estimateOverrides : [])]) {
    if (!isRecord(line) || ['qty', 'price'].some((key) => line[key] !== undefined && !validEstimateNumber(line[key])))
      throw new Error("Смета содержит недопустимое количество или цену");
  }
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
