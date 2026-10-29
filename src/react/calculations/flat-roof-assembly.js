// Project geometry and quantities for the optional flat-roof parapet.
// Coordinates are millimetres. The user's saved house contour is never changed.
export function flatRoofFootprint(contour, roof = {}) {
  const points = contour.map(point => Array.isArray(point) ? [...point] : [point.x, point.y]);
  if (roof.flatParapetMode !== 'open' || points.length < 3) return points;
  const extra = Math.max(0, Number(roof.flatOpenOverhangMm) || 0);
  const side = roof.flatOpenSide || 'back';
  const axis = side === 'left' || side === 'right' ? 0 : 1;
  const extreme = Math[side === 'left' || side === 'front' ? 'min' : 'max'](...points.map(point => point[axis]));
  const sign = side === 'left' || side === 'front' ? -1 : 1;
  return points.map(point => {
    const shifted = [...point];
    if (Math.abs(point[axis] - extreme) < 1) shifted[axis] += sign * extra;
    return shifted;
  });
}

export function flatRoofParapetRuns(contour, roof = {}) {
  if (!['flashing', 'closed', 'open'].includes(roof.flatParapetMode)) return [];
  const points = contour.map(point => Array.isArray(point) ? point : [point.x, point.y]);
  if (points.length < 3) return [];
  const side = roof.flatOpenSide || 'back';
  const axis = side === 'left' || side === 'right' ? 0 : 1;
  const extreme = Math[side === 'left' || side === 'front' ? 'min' : 'max'](...points.map(point => point[axis]));
  return points.map((a, index) => {
    const b = points[(index + 1) % points.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1 || roof.flatParapetMode === 'open' && Math.abs(a[axis] - extreme) < 1 && Math.abs(b[axis] - extreme) < 1) return null;
    return { a, b, length };
  }).filter(Boolean);
}

export function flatRoofProjectedArea(points) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - point[1] * next[0];
  }, 0)) / 2e6;
}
