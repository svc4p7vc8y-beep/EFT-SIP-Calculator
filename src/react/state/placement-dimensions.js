import { boundsOf } from '../planner/geometry.js';

const roundCentimetres = value => Math.round(value * 100) / 100;

function stations(values, origin, limit) {
  const unique = [...new Set(values
    .filter(value => Number.isFinite(value) && value >= origin && value <= limit)
    .map(value => roundCentimetres(value - origin)))].sort((a, b) => a - b);
  let previous = -Infinity;
  let level = 0;
  return unique.map(distance => {
    level = distance - previous < .8 ? (level + 1) % 3 : 0;
    previous = distance;
    return { distance, level };
  });
}

export function perimeterPlacementDimensions(contour, items) {
  const box = boundsOf(contour);
  if (!contour?.length || !Number.isFinite(box.x) || !Number.isFinite(box.y)) return null;
  const x = box.x, y = box.y, right = x + box.w, bottom = y + box.h;
  const points = items.map(item => ({
    x: item.surface === 'facade' && Number.isFinite(item.anchorX) ? item.anchorX : item.x,
    y: item.surface === 'facade' && Number.isFinite(item.anchorY) ? item.anchorY : item.y,
  }));
  return {
    x, y, right, bottom,
    horizontal: stations([x, right, ...points.map(point => point.x)], x, right),
    vertical: stations([y, bottom, ...points.map(point => point.y)], y, bottom),
  };
}
