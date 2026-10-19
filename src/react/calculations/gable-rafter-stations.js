// Gable SIP occupies the end wall thickness. A rafter on each face of that
// panel is a geometric proposal; connections and bearing remain unverified.
export function sipGableSides(project) {
  const roof = project.settings.roof;
  if (roof.shape !== 'gable' || roof.gableType === 'none') return [false, false];
  const count = Math.max(0, Math.min(2, Number(roof.gableCount) || 0));
  const defaultSip = roof.gableType === 'sip' || (roof.gableType === 'auto' && roof.type === 'sip');
  return [0, 1].map(index => index < count && (roof.type === 'combo'
    ? roof.gableSideTypes?.[index ? 'second' : 'first'] === 'sip'
      || (roof.gableSideTypes?.[index ? 'second' : 'first'] === 'auto' && defaultSip)
    : defaultSip));
}

export function withSipGableRafters(project, stations, lengthMm, boardWidthMm = 50) {
  const [first, second] = sipGableSides(project);
  if (!first && !second) return [...stations];
  const wall = Math.max(1, Number(project.settings.sip.wallThickness) || 174);
  const required = [
    ...(first ? [-boardWidthMm / 2, wall + boardWidthMm / 2] : []),
    ...(second ? [lengthMm - wall - boardWidthMm / 2, lengthMm + boardWidthMm / 2] : []),
  ];
  const clearOfGable = x =>
    (!first || x <= -boardWidthMm / 2 || x >= wall + boardWidthMm / 2)
    && (!second || x <= lengthMm - wall - boardWidthMm / 2 || x >= lengthMm + boardWidthMm / 2);
  return [...new Set([...stations.filter(x => clearOfGable(x)
    && required.every(requiredX => Math.abs(x - requiredX) >= boardWidthMm)), ...required])]
    .sort((a, b) => a - b);
}
