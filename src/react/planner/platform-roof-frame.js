import { calculateTerraceRoof, normalizeTerracePlatform } from '../../calculations/terrace-model.js';
import { resolveRoofAxes } from '../../calculations/roof-orientation.js';

// Plan-view layout only. Member sizing and purchasing remain in the estimate engine.
export function platformRoofFrame(platform, house, requestedStep = 0.6, mainRoof = {}) {
  const normalized = normalizeTerracePlatform(platform);
  const { roof } = normalized;
  if (roof.mode === 'none') return null;
  const result = calculateTerraceRoof(normalized, house);
  const horizontal = ['top', 'bottom'].includes(result.side);
  const step = Math.max(0.3, Math.min(1.2, Number(requestedStep) || 0.6));
  const x = Number(platform.x) || 0, y = Number(platform.y) || 0;
  const w = Number(platform.w) || 0, h = Number(platform.h) || 0;
  if (w <= 0 || h <= 0) return null;
  const x1 = x - (horizontal ? roof.sideOverhang : result.side === 'left' ? roof.frontOverhang : 0);
  const y1 = y - (horizontal ? result.side === 'top' ? roof.frontOverhang : 0 : roof.sideOverhang);
  const x2 = x + w + (horizontal ? roof.sideOverhang : result.side === 'right' ? roof.frontOverhang : 0);
  const y2 = y + h + (horizontal ? result.side === 'bottom' ? roof.frontOverhang : 0 : roof.sideOverhang);
  const continuation = roof.shape === 'continuation';
  const { vertical } = resolveRoofAxes({ house }, mainRoof);
  const mainGableEnd = mainRoof.shape === 'gable' &&
    (vertical ? ['top', 'bottom'].includes(result.side) : ['left', 'right'].includes(result.side));
  const mainRidge = vertical ? (Number(house.w) || 0) / 2 : (Number(house.h) || 0) / 2;
  const ridgeInside = vertical ? mainRidge > x1 && mainRidge < x2 : mainRidge > y1 && mainRidge < y2;
  const gable = roof.shape === 'gable' || (continuation && mainGableEnd && ridgeInside);
  const alongY = gable ? horizontal : !horizontal;
  const start = alongY ? y1 : x1, end = alongY ? y2 : x2;
  const count = Math.max(1, Math.ceil((end - start) / step));
  const rafters = [];
  for (let i = 0; i <= count; i++) {
    const v = start + (end - start) * i / count;
    const a = alongY ? { x: x1, y: v } : { x: v, y: y1 };
    const b = alongY ? { x: x2, y: v } : { x: v, y: y2 };
    if (gable) {
      const middle = continuation ? (vertical ? { x: mainRidge, y: v } : { x: v, y: mainRidge })
        : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      rafters.push([a, middle], [middle, b]);
    } else rafters.push([a, b]);
  }
  const ridge = !gable ? null : horizontal
    ? [{ x: continuation ? mainRidge : (x1+x2)/2, y: y1 }, { x: continuation ? mainRidge : (x1+x2)/2, y: y2 }]
    : [{ x: x1, y: continuation ? mainRidge : (y1+y2)/2 }, { x: x2, y: continuation ? mainRidge : (y1+y2)/2 }];
  return { bounds: { x1, y1, x2, y2 }, rafters, ridge, step, continuation, attachmentSide: result.side };
}
