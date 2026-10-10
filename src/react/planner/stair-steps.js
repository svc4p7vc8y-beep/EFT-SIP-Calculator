export const STAIR_DIRECTIONS = ["right", "left", "down", "up"];

export function normalizeStairDirection(value) {
  return STAIR_DIRECTIONS.includes(value) ? value : "right";
}

export function stairStepGeometry({ x, y, width, height }, direction, count = 12) {
  const axis = normalizeStairDirection(direction);
  const horizontal = axis === "right" || axis === "left";
  const steps=Math.max(1,Math.min(60,Math.round(Number(count)||12)));
  const treads = Array.from({ length: steps }, (_, index) => {
    const fraction = (index + 1) / (steps + 1);
    return horizontal
      ? { x1: x + width * fraction, y1: y, x2: x + width * fraction, y2: y + height }
      : { x1: x, y1: y + height * fraction, x2: x + width, y2: y + height * fraction };
  });
  const arrow = horizontal
    ? { x1: x + width * (axis === "right" ? .18 : .82), y1: y + height * .78,
        x2: x + width * (axis === "right" ? .82 : .18), y2: y + height * .78 }
    : { x1: x + width * .78, y1: y + height * (axis === "down" ? .18 : .82),
        x2: x + width * .78, y2: y + height * (axis === "down" ? .82 : .18) };
  const dx = arrow.x2 - arrow.x1;
  const dy = arrow.y2 - arrow.y1;
  const size = Math.min(width, height) * .08;
  const magnitude = Math.hypot(dx, dy) || 1;
  const ux = dx / magnitude;
  const uy = dy / magnitude;
  const baseX = arrow.x2 - ux * size;
  const baseY = arrow.y2 - uy * size;
  const head = [
    [arrow.x2, arrow.y2],
    [baseX - uy * size * .5, baseY + ux * size * .5],
    [baseX + uy * size * .5, baseY - ux * size * .5],
  ];
  return { treads, arrow, head: head.map(([px, py]) => `${px},${py}`).join(" ") };
}
