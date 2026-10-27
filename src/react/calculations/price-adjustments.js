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
    PRICE_ADJUSTMENT_GROUPS.map(({ key }) => [
      key,
      { materials: 0, labor: 0 },
    ]),
  );
}

export function normalizePriceAdjustments(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    PRICE_ADJUSTMENT_GROUPS.map(({ key }) => [
      key,
      {
        materials: normalizePercent(source[key]?.materials),
        labor: normalizePercent(source[key]?.labor),
      },
    ]),
  );
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
      { materials: 0, labor: 0 },
    );
    const rule = settings[section.key] || { materials: 0, labor: 0 };
    const change =
      (base.materials * rule.materials) / 100 +
      (base.labor * rule.labor) / 100;
    delta += change;
    return { key: section.key, base, rule, change };
  });
  return {
    baseTotal: calculation.totals.total,
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
    const rule = settings[section.key] || { materials: 0, labor: 0 };
    return {
      ...section,
      lines: section.lines.map(line => {
        const percent = line.kind === 'labor' ? rule.labor : rule.materials;
        return percent ? { ...line, price: Number(line.price) * (1 + percent / 100) } : line;
      }),
    };
  });
  return { ...calculation, sections, lines: sections.flatMap(section => section.lines) };
}
