import { normalizeTerracePlatform } from '../../calculations/terrace-model.js';

export const PLATFORM_FRAME_PROFILE = '50×150';
export const PLATFORM_FRAME_BOARD_WIDTH_MM = 50;
export const PLATFORM_FRAME_BOARD_DEPTH_MM = 150;
export const PLATFORM_DECK_THICKNESS_MM = 45;
export const PLATFORM_FRAME_RESERVE = 1.1;

// Geometric takeoff only. Foundation bearing, connections and board splices
// still need a structural detail; the frame is not marked as approved.
export function platformDeckFrame(raw, deckThicknessMm = PLATFORM_DECK_THICKNESS_MM) {
  const platform = normalizeTerracePlatform(raw);
  const x = Number(platform.x) * 1000, y = Number(platform.y) * 1000;
  const w = Number(platform.w) * 1000, h = Number(platform.h) * 1000;
  if (![x, y, w, h].every(Number.isFinite) || w <= 2 * PLATFORM_FRAME_BOARD_WIDTH_MM || h <= 2 * PLATFORM_FRAME_BOARD_WIDTH_MM)
    return { members: [], stringers: [], joistSpacingMm: platform.joistSpacingMm, frameLengthMm: 0, stringerLengthMm: 0, issues: ['Каркас настила: недостаточный или неверный размер площадки.'] };
  const deckZ = platform.deckHeightMm !== '' && platform.deckHeightMm != null && Number.isFinite(Number(platform.deckHeightMm))
    ? Number(platform.deckHeightMm) : 0;
  const topZ = deckZ - deckThicknessMm;
  const centerZ = topZ - PLATFORM_FRAME_BOARD_DEPTH_MM / 2;
  const width = PLATFORM_FRAME_BOARD_WIDTH_MM;
  const spacing = platform.joistSpacingMm;
  const members = [];
  const add = (kind, a, b) => members.push({ id: `platform:${platform.id}:frame:${kind}:${members.length + 1}`, kind,
    a: [...a, centerZ], b: [...b, centerZ], profile: PLATFORM_FRAME_PROFILE,
    length: Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])), layer: 'platforms',
    structuralStatus: 'unverified', name: kind === 'joist' ? 'Лага настила' : 'Замкнутый периметр настила' });
  if (w >= h) {
    add('rim', [x, y + width / 2], [x + w, y + width / 2]);
    add('rim', [x, y + h - width / 2], [x + w, y + h - width / 2]);
    add('rim', [x + width / 2, y + width], [x + width / 2, y + h - width]);
    add('rim', [x + w - width / 2, y + width], [x + w - width / 2, y + h - width]);
    const bays = Math.max(1, Math.ceil((w - 2 * width) / spacing));
    for (let i = 1; i < bays; i++) {
      const station = x + width + (w - 2 * width) * i / bays;
      add('joist', [station, y + width], [station, y + h - width]);
    }
  } else {
    add('rim', [x + width / 2, y], [x + width / 2, y + h]);
    add('rim', [x + w - width / 2, y], [x + w - width / 2, y + h]);
    add('rim', [x + width, y + width / 2], [x + w - width, y + width / 2]);
    add('rim', [x + width, y + h - width / 2], [x + w - width, y + h - width / 2]);
    const bays = Math.max(1, Math.ceil((h - 2 * width) / spacing));
    for (let i = 1; i < bays; i++) {
      const station = y + width + (h - 2 * width) * i / bays;
      add('joist', [x + width, station], [x + w - width, station]);
    }
  }
  const count = Math.max(0, Math.min(200, Math.round(Number(platform.steps) || 0)));
  const tread = (Number(platform.tread) || .3) * 1000;
  const riser = (Number(platform.riser) || .18) * 1000;
  const stairWidth = Math.min((Number(platform.stairWidth) || 1.2) * 1000, ['left', 'right'].includes(platform.stairSide) ? h : w);
  const side = platform.stairSide || 'bottom';
  const stringers = count ? [-1, 1].map((sign, index) => {
    const transverse = sign * (stairWidth - width) / 2;
    const a = side === 'left' ? [x, y + h / 2 + transverse, topZ]
      : side === 'right' ? [x + w, y + h / 2 + transverse, topZ]
        : side === 'top' ? [x + w / 2 + transverse, y, topZ]
          : [x + w / 2 + transverse, y + h, topZ];
    const b = side === 'left' ? [x - count * tread, a[1], topZ - count * riser]
      : side === 'right' ? [x + w + count * tread, a[1], topZ - count * riser]
        : side === 'top' ? [a[0], y - count * tread, topZ - count * riser]
          : [a[0], y + h + count * tread, topZ - count * riser];
    return { id: `platform:${platform.id}:stringer:${index + 1}`, a, b,
      profile: PLATFORM_FRAME_PROFILE, length: Math.ceil(Math.hypot(...a.map((v, i) => b[i] - v))),
      layer: 'platforms', structuralStatus: 'unverified', name: 'Тетива ступеней' };
  }) : [];
  return { members, stringers, joistSpacingMm: spacing,
    frameLengthMm: members.reduce((sum, member) => sum + member.length, 0),
    stringerLengthMm: stringers.reduce((sum, member) => sum + member.length, 0),
    issues: ['Каркас настила и тетивы: шаг задан геометрически; пролёты, стыки досок, опирание и крепёж не проверены расчётом.'] };
}
