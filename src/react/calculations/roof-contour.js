// Accept a rectangle whose straight walls contain extra plan vertices.
// This is a derived classification; the saved contour is never simplified.
export function isAxisAlignedRectangleContour(points) {
  if (!Array.isArray(points)) return false;
  const ring = points.map(point => Array.isArray(point) ? point : [point.x, point.y]);
  if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
  if (ring.length < 4 || !ring.every(point => point.length >= 2 && point.slice(0, 2).every(Number.isFinite))) return false;
  const xs = ring.map(point => point[0]), ys = ring.map(point => point[1]);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  if (width <= 0 || height <= 0) return false;
  const tolerance = Math.max(width, height) * 1e-8;
  if (!ring.every((point, index) => {
    const next = ring[(index + 1) % ring.length];
    return Math.abs(point[0] - next[0]) <= tolerance || Math.abs(point[1] - next[1]) <= tolerance;
  })) return false;
  const area = Math.abs(ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
  return Math.abs(area - width * height) <= width * height * 1e-8;
}
