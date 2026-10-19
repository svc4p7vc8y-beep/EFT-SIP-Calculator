import { roofMemberGeometry } from './roof-rafter-detail.js';

// Geometric scheme only. Chord joints, load path, connections and capacity require design.
export function flatRoofFrame(assembly, roofSettings, cuttingSettings) {
  const items = [], members = [], issues = [];
  const depth = Math.max(200, Math.min(1200, Number(roofSettings.flatFrameDepthMm) || 300));
  const allowance = 2 * Number(cuttingSettings.endAllowanceMm || 0);
  const stock = Number(cuttingSettings.stockLengthMm || 6000);
  const mainFaces = new Set((assembly.roofModel?.faces || []).filter(face => face.group === 'main').map(face => face.id));
  const rafters = assembly.rafters.filter(item => item.worldA && item.worldB && (!item.faceId || mainFaces.has(item.faceId)));
  const append = (rafter, id, name, a, b, kind) => {
    const length = Math.ceil(Math.hypot(...a.map((value, index) => b[index] - value)));
    if (length < 1) return;
    const profile = rafter.profile;
    const item = { id, name, material: name, roofMemberKind: kind, profile, length,
      a: a.slice(0, 2), b: b.slice(0, 2), worldA: a, worldB: b,
      normal: kind === 'flat-frame-post' ? [0, 1, 0] : [0, 0, 1], faceId: rafter.faceId,
      ...roofMemberGeometry(a, b, profile) };
    items.push(item);
    members.push({ ...item, cutLength: length + allowance, source: 'Геометрическая схема плоской кровли',
      surface: 'Кровля', panels: [], processing: 'Стыки, опоры и несущая способность по рабочему проекту' });
  };
  for (const rafter of rafters) {
    const a = rafter.worldA, b = rafter.worldB;
    const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const sectionDepth = Number(String(rafter.profile).split(/[×xх]/)[1]) || 150;
    if (run < 300 || depth - sectionDepth < 50) {
      issues.push(`${rafter.id}: высоты каркаса недостаточно для нижнего пояса и стоек.`);
      continue;
    }
    const lowerZ = Math.min(a[2], b[2]) - depth;
    const at = (distance, z) => [a[0] + (b[0] - a[0]) * distance / run,
      a[1] + (b[1] - a[1]) * distance / run, z];
    const limit = Math.max(1000, stock - allowance);
    const pieces = Math.ceil(run / limit);
    for (let index = 0; index < pieces; index++) {
      const start = run * index / pieces, end = run * (index + 1) / pieces;
      append(rafter, `${rafter.id}-НП${index + 1}`, 'Нижний пояс плоской кровли', at(start, lowerZ), at(end, lowerZ), 'flat-frame-chord');
    }
    if (pieces > 1) issues.push(`${rafter.id}: нижний пояс разделён на ${pieces} заготовки; стык и передача усилия требуют рабочего узла.`);
    const intervals = Math.ceil(run / 1000);
    for (let index = 1; index < intervals; index++) {
      const distance = run * index / intervals, topZ = a[2] + (b[2] - a[2]) * distance / run - sectionDepth / 2;
      const bottomZ = lowerZ + sectionDepth / 2;
      if (topZ <= bottomZ) continue;
      append(rafter, `${rafter.id}-СТ${index}`, 'Вертикальная стойка плоской кровли', at(distance, bottomZ), at(distance, topZ), 'flat-frame-post');
    }
  }
  if (rafters.length) issues.push('Нижние пояса и стойки плоской кровли — геометрическая схема. Опоры, устойчивость, стыки и несущая способность не подтверждены.');
  return { items, members, issues, rafterCount: rafters.length,
    chordCount: items.filter(item => item.roofMemberKind === 'flat-frame-chord').length,
    postCount: items.filter(item => item.roofMemberKind === 'flat-frame-post').length };
}
