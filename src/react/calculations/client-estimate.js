const ACCESSORY_ID_PARTS = [
  ":foam-",
  ":fasteners-",
  ":seam-screws-",
  ":edge-screws-",
  ":spiral-",
];

const ACCESSORY_NAME =
  /(саморез|гвозд|глухар|анкер|болт|гайк|шайб|дюбел|скоб|уголок|пластин|креп[её]ж|пеноклей|монтажн(?:ая|ой) пен|герметик)/iu;

const KIT_NAMES = {
  "Пол": "Комплект для монтажа пола",
  "Межэтажное перекрытие / пол 2 этажа":
    "Комплект для монтажа межэтажного перекрытия",
  "Потолок": "Комплект для монтажа потолка",
  "Наружные стены 1 этажа": "Комплект для монтажа наружных стен 1 этажа",
  "Наружные стены 2 этажа": "Комплект для монтажа наружных стен 2 этажа",
  "Перегородки 1 этажа": "Комплект для монтажа перегородок 1 этажа",
  "Перегородки 2 этажа": "Комплект для монтажа перегородок 2 этажа",
};

export function isEstimateAccessory(line = {}) {
  if (line.kind !== "material") return false;
  const id = String(line.id || "");
  return (
    ACCESSORY_ID_PARTS.some((part) => id.includes(part)) ||
    ACCESSORY_NAME.test(String(line.name || ""))
  );
}

const kitName = (section, group) =>
  KIT_NAMES[group] ||
  `Комплект крепежа и сопутствующих материалов · ${group || section.title}`;

export function buildClientEstimate(calculation, options = {}) {
  const includeLabor = options.includeLabor !== false;
  const includeAccessories = options.includeAccessories !== false;
  const compactAccessories = options.compactAccessories !== false;

  const sections = (calculation.sections || []).map((section) => {
    const visible = section.lines.filter(
      (line) =>
        (includeLabor || line.kind !== "labor") &&
        (includeAccessories || !isEstimateAccessory(line)),
    );
    if (!compactAccessories || !includeAccessories) {
      return { ...section, lines: visible };
    }

    const kits = new Map();
    const lines = [];
    visible.forEach((line) => {
      if (!isEstimateAccessory(line)) {
        lines.push(line);
        return;
      }
      const group = line.estimateGroup || section.title;
      const current = kits.get(group) || {
        id: `client-kit:${section.key}:${group}`,
        section: section.key,
        name: kitName(section, group),
        unit: "компл.",
        qty: 1,
        price: 0,
        kind: "material",
        source: "client-accessory-kit",
        estimateGroup: group,
        includedLineIds: [],
      };
      current.price += line.qty * line.price;
      current.includedLineIds.push(line.id);
      kits.set(group, current);
    });
    lines.push(...kits.values());
    return { ...section, lines };
  }).filter((section) => section.lines.length);

  const totals = sections.reduce(
    (sum, section) => {
      section.lines.forEach((line) => {
        const amount = line.qty * line.price;
        if (line.kind === "labor") sum.labor += amount;
        else sum.materials += amount;
      });
      return sum;
    },
    { materials: 0, labor: 0 },
  );
  totals.total = totals.materials + totals.labor;
  return { sections, totals };
}
