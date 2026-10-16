// A mid-height collar is a geometric proposal, not a verified rafter tie or a
// substitute for a designed thrust restraint at the wall supports.
export const RIEGEL_PROFILE = '25×150';

export function hangingRiegelRatio(roof = {}) {
  const value = Number(roof.hangingRiegelHeightPercent);
  return Number.isFinite(value) && value >= 10 && value <= 90 ? value / 100 : 0.5;
}

export function hangingRiegelEnabled(roof = {}, calculation = {}) {
  return roof.hangingRiegelEnabled !== false
    && calculation.mainRoofShape === 'gable'
    && calculation.rafterStructure?.system === 'hanging'
    && calculation.coldSlopeArea > 0;
}

const atHeight = (rafter, height) => {
  const a = rafter.worldA, b = rafter.worldB;
  if (!a || !b || Math.abs(b[2] - a[2]) < 1) return null;
  const t = (height - a[2]) / (b[2] - a[2]);
  return t >= 0 && t <= 1 ? a.map((value, index) => value + (b[index] - value) * t) : null;
};

export function hangingRiegelMembers(assembly, roof, settings) {
  const ratio = hangingRiegelRatio(roof);
  const height = assembly.roofModel.roofBase + Number(roof.ridgeHeight) * 1000 * ratio;
  const along = assembly.axis === 'x' ? 0 : 1;
  const across = 1 - along;
  const middle = assembly.bounds[across === 0 ? 'x' : 'y'] + assembly.bounds[across === 0 ? 'width' : 'height'] / 2;
  const first = new Map(), second = new Map();
  for (const rafter of assembly.rafters) {
    if (rafter.excluded) continue;
    const point = atHeight(rafter, height);
    if (!point) continue;
    const side = point[across] < middle ? first : second;
    const key = Math.round(point[along]);
    // Competing rafters at one station indicate a nonstandard face layout.
    if (side.has(key)) side.set(key, null);
    else side.set(key, { rafter, point });
  }
  const items = [], members = [], issues = [];
  for (const [key, left] of first) {
    const right = second.get(key);
    if (!left || !right) continue;
    const a = left.point, b = right.point;
    if (Math.abs(a[along] - b[along]) > 1 || b[across] <= a[across]) continue;
    const length = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
    const id = `КР-РГ${items.length + 1}`;
    const item = { id, name: 'Ригель', roofMemberKind: 'hanging-riegel', profile: RIEGEL_PROFILE,
      a: a.slice(0, 2), b: b.slice(0, 2), worldA: a, worldB: b, normal: [0, 0, 1],
      length, heightPercent: ratio * 100, rafterIds: [left.rafter.id, right.rafter.id],
      structuralStatus: 'unverified' };
    items.push(item);
    members.push({ ...item, material: 'Ригель висячей пары', source: 'Геометрия висячих стропил',
      surface: 'Кровля', panels: [], cutLength: length + 2 * Number(settings.endAllowanceMm || 0),
      processing: 'Торцы и соединения с обоими стропилами по рабочему узлу; распор и несущая способность не подтверждены' });
  }
  const long = items.filter(item => item.length + 2 * Number(settings.endAllowanceMm || 0) > Number(settings.stockLengthMm));
  if (long.length) issues.push(`Ригели: ${long.length} шт длиннее заготовки ${settings.stockLengthMm} мм (например, ${long[0].id} — ${long[0].length} мм); нужна цельная заготовка или рассчитанный узел соединения.`);
  if (items.length !== assembly.rafters.length / 2)
    issues.push(`Ригели: найдено ${items.length} пар для ${assembly.rafters.length} стропил. Проверьте геометрию скатов и расположение стропил.`);
  if (items.length) issues.push('Ригели: 25×150 мм на заданной высоте показаны геометрически. Узлы, распор, сечение и несущая способность требуют расчёта конструктора.');
  return { items, members, issues };
}
