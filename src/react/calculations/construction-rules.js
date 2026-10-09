import { BINDING_STRAIGHT_SUPPORT_RULE as rule } from '../data/construction-rules.js';

const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Only declared endpoints. Never invent a splice every stock-length metres.
export function declaredStraightBindingJoints(lines = []) {
  const ends = new Map(), invalidLineIds = [];
  for (const line of lines) {
    if (line.include === false) continue;
    if (!point(line.a) || !point(line.b) || !distance(line.a, line.b)) { invalidLineIds.push(line.id ?? null); continue; }
    for (const [p, other] of [[line.a, line.b], [line.b, line.a]]) {
      const key = p.join(':'), entries = ends.get(key) || [];
      entries.push({ lineId: line.id, point: p, vector: [other[0] - p[0], other[1] - p[1]] }); ends.set(key, entries);
    }
  }
  const joints = []; let outsideScopeJunctions = 0;
  for (const entries of ends.values()) {
    if (entries.length < 2) continue;
    const [a, b] = entries;
    const scale = Math.hypot(...a.vector) * Math.hypot(...b.vector);
    const cross = a.vector[0] * b.vector[1] - a.vector[1] * b.vector[0];
    const dot = a.vector[0] * b.vector[0] + a.vector[1] * b.vector[1];
    // Dimensionless floating-point collinearity test, not a mounting tolerance.
    if (entries.length !== 2 || a.lineId === b.lineId || Math.abs(cross / scale) > 1e-9 || dot >= 0) { outsideScopeJunctions++; continue; }
    joints.push({ id: `СТ${joints.length + 1}`, point: [...a.point], lineIds: [a.lineId, b.lineId] });
  }
  return { joints, invalidLineIds, outsideScopeJunctions };
}

export function evaluateBindingStraightSupport({ enabled, foundationType, bindingType, lines = [], supports = [], toleranceMm = '', units = 'mm' }) {
  const result = { ruleId: rule.id, ruleVersion: rule.version, ruleStatus: rule.status,
    status: 'not-applicable', reason: '', units: 'mm', checks: [], engineeringVerified: false,
    coverage: 'Только прямые стыки в общих концах заданных линий. Фактические места сращивания хлыстов внутри линии пока не заданы; полного подтверждения обвязки нет.' };
  if (!enabled) { result.reason = 'Обвязка основания отключена.'; return result; }
  if (bindingType !== 'timber') { result.reason = 'Пакет досок требует отдельного правила; источник описывает брус.'; return result; }
  if (!['screw', 'reinforcedConcrete'].includes(foundationType)) { result.reason = 'Источник описывает свайное основание; для блоков и готового бетона нужен отдельный узел.'; return result; }
  if (units !== 'mm') { result.status = 'needs-data'; result.reason = 'Для проверки требуются координаты в миллиметрах.'; return result; }
  const declared = declaredStraightBindingJoints(lines);
  result.invalidLineIds = declared.invalidLineIds;
  result.outsideScopeJunctions = declared.outsideScopeJunctions;
  const invalidSupports = supports.filter(p => !point(p));
  result.invalidSupportCount = invalidSupports.length;
  const validSupports = supports.map((p, i) => ({ point: p, id: `ОП${i + 1}` })).filter(p => point(p.point));
  const missingTolerance = toleranceMm == null || (typeof toleranceMm === 'string' && !toleranceMm.trim());
  const tolerance = Number(toleranceMm);
  const invalidTolerance = !missingTolerance && (!['number', 'string'].includes(typeof toleranceMm) || !Number.isFinite(tolerance) || tolerance < 0);
  result.toleranceMm = missingTolerance || invalidTolerance ? null : tolerance;
  result.parameterStatus = missingTolerance ? 'unset' : invalidTolerance ? 'invalid' : 'project-value';
  for (const joint of declared.joints) {
    const candidates = validSupports.map(p => ({ ...p, distanceMm: distance(joint.point, p.point) })).sort((a, b) => a.distanceMm - b.distanceMm);
    const nearest = candidates[0];
    let status = 'within-project-tolerance';
    if (!nearest) status = 'missing-support';
    else if (missingTolerance || invalidTolerance) status = 'needs-project-parameter';
    else if (nearest.distanceMm > tolerance) status = 'outside-project-tolerance';
    const check = { ...joint, status, nearestSupportId: nearest?.id ?? null,
      nearestSupportPoint: nearest ? [...nearest.point] : null, distanceMm: nearest?.distanceMm ?? null };
    result.checks.push(check);
  }
  if (declared.invalidLineIds.length || invalidSupports.length || invalidTolerance) result.status = 'needs-data';
  else if (!declared.joints.length) result.status = 'no-declared-joints';
  else if (result.checks.some(c => ['missing-support', 'outside-project-tolerance'].includes(c.status))) result.status = 'geometry-conflict';
  else if (missingTolerance) result.status = 'needs-project-parameter';
  else result.status = 'geometry-checked';
  result.reason = invalidTolerance ? 'Допуск должен быть конечным неотрицательным числом; значение не заменено автоматически.'
    : result.status === 'no-declared-joints' ? 'Прямые стыки не заданы. Это не означает, что обвязка проверена.'
    : 'Геометрическая проверка не подтверждает сечение, крепёж, опирание и несущую способность.';
  return result;
}
