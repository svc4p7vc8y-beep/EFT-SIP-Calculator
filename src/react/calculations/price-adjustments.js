export const PRICE_ADJUSTMENT_GROUPS = [
  { key: "foundation", label: "Свайный фундамент и обвязка" },
  { key: "sip", label: "СИП-конструкции и перегородки" },
  { key: "roof", label: "Кровля и фронтоны" },
  { key: "terrace", label: "Терраса и крыльцо" },
  { key: "openings", label: "Окна и двери" },
  { key: "engineering", label: "Инженерные системы" },
  { key: "internal", label: "Внутренняя отделка" },
  { key: "external", label: "Наружная отделка" },
  { key: "delivery", label: "Доставка и логистика" },
];

const normalizePercent = (value) =>
  Math.max(-100, Math.min(500, Number(value) || 0));

export function createDefaultPriceAdjustments() {
  return Object.fromEntries(
    [{ key: "general" }, ...PRICE_ADJUSTMENT_GROUPS].map(({ key }) => [
      key,
      { materials: 0, labor: 0, common: 0 },
    ]),
  );
}

export function normalizePriceAdjustments(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    [{ key: "general" }, ...PRICE_ADJUSTMENT_GROUPS].map(({ key }) => [
      key,
      {
        common: normalizePercent(source[key]?.common),
        materials: normalizePercent(source[key]?.materials),
        labor: normalizePercent(source[key]?.labor),
      },
    ]),
  );
}

// The shared input assigns both percentages; later individual edits remain independent.
export function setCommonPriceAdjustment(value, section, percent) {
  const settings = normalizePriceAdjustments(value);
  if (settings[section]) settings[section] = { common: normalizePercent(percent), materials: normalizePercent(percent), labor: normalizePercent(percent) };
  return settings;
}

// Apply the project-wide percentage after the section percentage.
export function effectivePriceAdjustment(settings, sectionKey, kind) {
  return (1 + (settings[sectionKey]?.[kind] || 0) / 100)
    * (1 + (settings.general?.[kind] || 0) / 100);
}

export function calculateAdjustedPrice(project, calculation) {
  const settings = normalizePriceAdjustments(
    project.settings?.priceAdjustments,
  );
  let delta = 0;
  const groups = calculation.sections.map((section) => {
    const base = section.lines.reduce(
      (totals, line) => {
        const amount = line.qty * line.price;
        if (line.kind === "labor") totals.labor += amount;
        else totals.materials += amount;
        return totals;
      },
      { materials: 0, labor: 0, common: 0 },
    );
    const rule = settings[section.key] || { materials: 0, labor: 0 };
    const adjusted = {
      materials: base.materials * effectivePriceAdjustment(settings, section.key, 'materials'),
      labor: base.labor * effectivePriceAdjustment(settings, section.key, 'labor'),
    };
    const change = (adjusted.materials - base.materials) + (adjusted.labor - base.labor);
    delta += change;
    return { key: section.key, base, adjusted, rule, change };
  });
  return {
    baseTotal: calculation.totals.total,
    general: settings.general,
    delta,
    total: calculation.totals.total + delta,
    groups,
  };
}

// Keep the commercial rows and the header's adjusted total on one price basis.
// This derives a view for print/export and never changes the project's catalog.
export function adjustedEstimateCalculation(project, calculation) {
  const settings = normalizePriceAdjustments(project.settings?.priceAdjustments);
  const sections = calculation.sections.map(section => {
    return {
      ...section,
      lines: section.lines.map(line => {
        const factor = effectivePriceAdjustment(settings, section.key, line.kind === 'labor' ? 'labor' : 'materials');
        return factor !== 1 ? { ...line, price: Number(line.price) * factor } : line;
      }),
    };
  });
  return { ...calculation, sections, lines: sections.flatMap(section => section.lines) };
}
