import { uid } from '../utils/format.js';

const EDITABLE_FIELDS = new Set(['name', 'kind', 'unit', 'qty', 'price']);

export function changeEstimateLine(project, line, changes) {
  if (line.custom) {
    const custom = (project.customEstimateLines || []).find((item) => item.id === line.id);
    if (custom) Object.assign(custom, changes);
    return;
  }
  const overrides = Array.isArray(project.estimateOverrides) ? project.estimateOverrides : [];
  let override = overrides.find((item) => item.lineId === line.id);
  if (!override) {
    override = {
      lineId: line.id,
      section: line.section,
      catalogId: line.catalogId || null,
    };
    overrides.push(override);
  }
  if (override.catalogId === undefined) override.catalogId = line.catalogId || null;
  Object.entries(changes).forEach(([key, value]) => {
    if (EDITABLE_FIELDS.has(key)) override[key] = value;
  });
  project.estimateOverrides = overrides;
}

export function scopeEstimateOverrideToCurrentCatalog(project, line) {
  if (!line?.id) return;
  const override = (project.estimateOverrides || []).find(
    (item) => item.lineId === line.id,
  );
  if (override && override.catalogId === undefined) {
    override.catalogId = line.catalogId || null;
  }
}

export function releasePlanLinkedQuantityOverrides(project) {
  const linkedSections = new Set([
    "foundation",
    "sip",
    "roof",
    "terrace",
    "openings",
    "engineering",
    "internal",
    "external",
    "delivery",
  ]);
  project.estimateOverrides = (project.estimateOverrides || [])
    .map((override) => {
      if (!linkedSections.has(override.section) || override.qty === undefined)
        return override;
      const next = { ...override };
      delete next.qty;
      return next;
    })
    .filter(
      (override) =>
        override.excluded ||
        ["name", "kind", "unit", "price"].some(
          (key) => override[key] !== undefined,
        ),
    );
}

export function removeEstimateLine(project, line) {
  if (line.custom) {
    project.customEstimateLines = (project.customEstimateLines || []).filter((item) => item.id !== line.id);
    return;
  }
  const overrides = Array.isArray(project.estimateOverrides) ? project.estimateOverrides : [];
  const existing = overrides.find((item) => item.lineId === line.id);
  if (existing) existing.excluded = true;
  else overrides.push({ lineId: line.id, section: line.section, excluded: true });
  project.estimateOverrides = overrides;
}

export function resetEstimateLine(project, lineId) {
  project.estimateOverrides = (project.estimateOverrides || []).filter((item) => item.lineId !== lineId);
}

export function addEstimateLine(project, section) {
  const line = {
    id: uid(`custom-${section}`), section, name: 'Новая позиция', kind: 'material', unit: 'шт',
    qty: 1, price: 0, source: 'project-custom', custom: true
  };
  project.customEstimateLines = [...(project.customEstimateLines || []), line];
  return line;
}

export function resetEstimateSection(project, section) {
  project.estimateOverrides = (project.estimateOverrides || []).filter((item) => item.section !== section);
  project.customEstimateLines = (project.customEstimateLines || []).filter((item) => item.section !== section);
}
