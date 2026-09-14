// Offset a simple orthogonal footprint, keeping re-entrant corners (L-shaped homes).
export function roofOutline(points, dx = 0, dy = dx, edgeOffsets) {
  if (points.length < 3) return points;
  const area = points.reduce((s, a, i) => { const b = points[(i + 1) % points.length]; return s + a.x * b.y - b.x * a.y; }, 0);
  const sign = area >= 0 ? 1 : -1;
  const edges = points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    const vx = b.x - a.x, vy = b.y - a.y, length = Math.hypot(vx, vy) || 1;
    const nx = sign * vy / length, ny = -sign * vx / length;
    const distance = edgeOffsets?.[i] ?? Math.hypot(nx * dx, ny * dy);
    return { x: a.x + nx * distance, y: a.y + ny * distance, vx, vy };
  });
  return edges.map((b, i) => {
    const a = edges[(i + edges.length - 1) % edges.length];
    const cross = a.vx * b.vy - a.vy * b.vx;
    if (Math.abs(cross) < 1e-9) return { x: b.x, y: b.y };
    const t = ((b.x - a.x) * b.vy - (b.y - a.y) * b.vx) / cross;
    return { x: a.x + t * a.vx, y: a.y + t * a.vy };
  });
}
