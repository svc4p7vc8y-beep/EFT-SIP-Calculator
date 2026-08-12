import { terraceAttachmentSide } from '../../calculations/terrace-model.js';

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

function rowPoints(row) {
  const count = Math.max(2, Math.round(row.count) || 2);
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    return { x: row.x1 + (row.x2 - row.x1) * ratio, y: row.y1 + (row.y2 - row.y1) * ratio, source: row.group || 'house' };
  });
}

function perimeterRows(platform, spacing) {
  const x1 = Number(platform.x) || 0;
  const y1 = Number(platform.y) || 0;
  const x2 = x1 + (Number(platform.w) || 0);
  const y2 = y1 + (Number(platform.h) || 0);
  const count = (length) => Math.max(2, Math.ceil(length / spacing) + 1);
  return [
    { x1, y1, x2, y2: y1, count: count(x2 - x1), group: 'platform' },
    { x1: x2, y1, x2, y2, count: count(y2 - y1), group: 'platform' },
    { x1, y1: y2, x2, y2, count: count(x2 - x1), group: 'platform' },
    { x1, y1, x2: x1, y2, count: count(y2 - y1), group: 'platform' }
  ];
}

function uniquePoints(groups, tolerance = 0.12) {
  const points = [];
  groups.flat().forEach((point) => {
    const existing = points.find((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < tolerance);
    if (existing) {
      if (existing.source !== point.source) existing.source = 'shared';
    } else points.push({ ...point });
  });
  return points;
}

function platformBindingLength(platform, house) {
  if (platform.binding?.mode === 'none') return 0;
  const perimeter = 2 * ((Number(platform.w) || 0) + (Number(platform.h) || 0));
  if (platform.binding?.mode !== 'shared') return perimeter;
  const side = terraceAttachmentSide(platform, house);
  const attachment = side === 'left' || side === 'right' ? Number(platform.h) || 0 : Number(platform.w) || 0;
  return Math.max(0, perimeter - attachment);
}

export function calculateFoundation(plan, settings = {}) {
  const spacing = Math.max(0.5, Number(settings.spacing) || 2.5);
  const houseRows = (plan.pileRows || []).filter((row) => row.group !== 'platform');
  const housePoints = houseRows.flatMap(rowPoints).concat((plan.piles || []).map((pile) => ({ ...pile, source: 'house' })));
  const platforms = (plan.platforms || []).filter((platform) => platform.include !== false && platform.foundation?.mode !== 'none');
  const platformPoints = platforms.flatMap((platform) => perimeterRows(platform, spacing).flatMap(rowPoints));
  const points = uniquePoints([housePoints, platformPoints]);
  const sharedPiles = points.filter((point) => point.source === 'shared').length;
  const housePiles = points.filter((point) => point.source === 'house' || point.source === 'shared').length;
  const platformPiles = points.filter((point) => point.source === 'platform' || point.source === 'shared').length;
  const houseBindingLength = houseRows.reduce((sum, row) => sum + Math.hypot(row.x2 - row.x1, row.y2 - row.y1), 0);
  const platformBinding = (plan.platforms || []).filter((platform) => platform.include !== false).reduce((sum, platform) => sum + platformBindingLength(platform, plan.house), 0);
  const bindingLength = houseBindingLength + platformBinding;
  return {
    points,
    totalPiles: points.length,
    housePiles,
    platformPiles,
    sharedPiles,
    houseBindingLength: round(houseBindingLength),
    platformBindingLength: round(platformBinding),
    bindingLength: round(bindingLength),
    boardVolume: round(bindingLength * (Number(settings.boardVolumePerMeter) || 0.0225), 3)
  };
}
