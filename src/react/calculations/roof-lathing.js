// Board centres measured along a slope. Three touching 100 mm boards protect
// each edge; intermediate rows never exceed the selected maximum pitch.
export function roofLathRows(lengthMm, stepMm, boardWidthMm = 100) {
  const length = Number(lengthMm), step = Number(stepMm);
  if (!(length > 0) || !(step > 0) || !(boardWidthMm > 0)) return [];
  const first = boardWidthMm / 2, last = length - first;
  if (last <= first) return [length / 2];
  const edge = [...new Set([
    first, first + boardWidthMm, first + 2 * boardWidthMm,
    last - 2 * boardWidthMm, last - boardWidthMm, last,
  ].filter(x => x >= first && x <= last))].sort((a, b) => a - b);
  const rows = [edge[0]];
  for (let i = 1; i < edge.length; i++) {
    const gap = edge[i] - edge[i - 1], intervals = Math.max(1, Math.ceil(gap / step));
    for (let j = 1; j <= intervals; j++) rows.push(edge[i - 1] + gap * j / intervals);
  }
  return rows;
}
