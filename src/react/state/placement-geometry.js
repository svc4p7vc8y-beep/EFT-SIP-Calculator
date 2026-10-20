const round = value => Math.round(value * 100) / 100;

export function pointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index], b = polygon[previous];
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function snapToFacade(point, contour, offset = .28) {
  if (!point || !Array.isArray(contour) || contour.length < 3) return null;
  let nearest = null;
  for (let index = 0; index < contour.length; index++) {
    const a = contour[index], b = contour[(index + 1) % contour.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) continue;
    const fraction = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    const anchorX = a.x + fraction * dx, anchorY = a.y + fraction * dy;
    const distanceSquared = (point.x - anchorX) ** 2 + (point.y - anchorY) ** 2;
    if (!nearest || distanceSquared < nearest.distanceSquared) nearest = { anchorX, anchorY, dx, dy, distanceSquared };
  }
  if (!nearest) return null;
  const length = Math.hypot(nearest.dx, nearest.dy);
  const nx = -nearest.dy / length, ny = nearest.dx / length;
  const left = { x: nearest.anchorX + nx * offset, y: nearest.anchorY + ny * offset };
  const outside = pointInPolygon(left, contour)
    ? { x: nearest.anchorX - nx * offset, y: nearest.anchorY - ny * offset }
    : left;
  return { x: round(outside.x), y: round(outside.y), anchorX: round(nearest.anchorX), anchorY: round(nearest.anchorY), distance: Math.sqrt(nearest.distanceSquared) };
}

export function dimensionMetres(points) {
  if (!Array.isArray(points) || points.length !== 2) return 0;
  return round(Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y));
}
