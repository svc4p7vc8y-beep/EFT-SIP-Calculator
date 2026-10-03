const round = (value, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;
const nonnegative = (value, fallback = 0) => Number.isFinite(Number(value)) && value != null
  ? Math.max(0, Number(value)) : fallback;

export const DEFAULT_TIERED_ROOF = Object.freeze({
  upperShare: 50,
  upperRise: 1.8,
  lowerRise: 0.9,
  stepHeight: 0.7,
  jointOverhang: 0.2,
  upperSide: 'first',
  upperSlopeDirection: 'towardJunction',
  lowerSlopeDirection: 'awayJunction',
  warmLevel: 'upper',
  gableTypes: {
    upperFirst: 'auto', upperSecond: 'auto',
    lowerFirst: 'auto', lowerSecond: 'none', inner: 'auto',
  },
  gableAreas: {},
});

export const TIERED_GABLE_LABELS = Object.freeze({
  upperFirst: 'Верхний фронтон 1',
  upperSecond: 'Верхний фронтон 2',
  lowerFirst: 'Третий фронтон · нижний скат',
  lowerSecond: 'Четвёртый фронтон · нижний скат',
  inner: 'Внутренний фронтон · перепад уровней',
});

export function normalizeTieredRoof(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    ...DEFAULT_TIERED_ROOF,
    ...raw,
    upperShare: Math.min(90, Math.max(10, nonnegative(raw.upperShare, 50))),
    upperRise: nonnegative(raw.upperRise, 1.8),
    lowerRise: nonnegative(raw.lowerRise, 0.9),
    stepHeight: nonnegative(raw.stepHeight, 0.7),
    jointOverhang: nonnegative(raw.jointOverhang, 0.2),
    upperSide: raw.upperSide === 'second' ? 'second' : 'first',
    upperSlopeDirection: raw.upperSlopeDirection === 'awayJunction' ? 'awayJunction' : 'towardJunction',
    lowerSlopeDirection: raw.lowerSlopeDirection === 'towardJunction' ? 'towardJunction' : 'awayJunction',
    warmLevel: ['upper', 'lower', 'both'].includes(raw.warmLevel) ? raw.warmLevel : 'upper',
    gableTypes: { ...DEFAULT_TIERED_ROOF.gableTypes, ...(raw.gableTypes || {}) },
    gableAreas: { ...(raw.gableAreas || {}) },
  };
}

export function calculateTieredRoofGeometry({ span, ridgeLength, eaveOverhang = 0, gableOverhang = 0, tiered = {} }) {
  const settings = normalizeTieredRoof(tiered);
  const wallSpan = nonnegative(span);
  const roofLength = nonnegative(ridgeLength) + 2 * nonnegative(gableOverhang);
  const eave = nonnegative(eaveOverhang);
  const upperSpan = wallSpan * settings.upperShare / 100;
  const lowerSpan = wallSpan - upperSpan;
  const upperRun = upperSpan + eave + settings.jointOverhang;
  const lowerRun = lowerSpan + eave;
  const upperLength = upperSpan ? Math.hypot(upperRun, settings.upperRise * upperRun / upperSpan) : 0;
  const lowerLength = lowerSpan ? Math.hypot(lowerRun, settings.lowerRise * lowerRun / lowerSpan) : 0;
  const upperArea = roofLength * upperLength;
  const lowerArea = roofLength * lowerLength;
  const totalSlopeArea = upperArea + lowerArea;
  return {
    shape: 'tiered',
    roofLength: round(roofLength),
    roofSpan: round(wallSpan + eave * 2),
    upperSpan: round(upperSpan), lowerSpan: round(lowerSpan),
    upperRun: round(upperRun), lowerRun: round(lowerRun),
    upperRise: settings.upperRise, lowerRise: settings.lowerRise,
    stepHeight: settings.stepHeight, jointOverhang: settings.jointOverhang,
    upperSlopeLength: round(upperLength), lowerSlopeLength: round(lowerLength),
    upperArea: round(upperArea, 2), lowerArea: round(lowerArea, 2),
    slopeLength: round((upperLength + lowerLength) / 2),
    wallSlopeLength: round(Math.max(Math.hypot(upperSpan, settings.upperRise), Math.hypot(lowerSpan, settings.lowerRise))),
    slopeArea: round(totalSlopeArea / 2, 2),
    totalSlopeArea: round(totalSlopeArea, 2),
    slopeCoefficient: round(wallSpan ? (upperLength + lowerLength) / wallSpan : 1),
    gableArea: round(upperSpan * settings.upperRise + lowerSpan * settings.lowerRise + roofLength * settings.stepHeight, 2),
    junctionLength: round(roofLength),
    eaveOverhang: round(eave), gableOverhang: round(nonnegative(gableOverhang)),
  };
}

export function resolveTieredGables(roof, geometry) {
  const settings = normalizeTieredRoof(roof.tiered);
  const rawAreas = {
    upperFirst: geometry.upperSpan * geometry.upperRise / 2,
    upperSecond: geometry.upperSpan * geometry.upperRise / 2,
    lowerFirst: geometry.lowerSpan * geometry.lowerRise / 2,
    lowerSecond: geometry.lowerSpan * geometry.lowerRise / 2,
    inner: geometry.junctionLength * geometry.stepHeight,
  };
  const zones = Object.entries(TIERED_GABLE_LABELS).map(([key, label]) => {
    const selected = settings.gableTypes[key];
    const type = selected === 'none' ? 'none' : selected === 'sip' ? 'sip'
      : selected === 'frame' ? 'cold' : roof.type === 'sip' ? 'sip' : 'cold';
    const area = type === 'none' ? 0 : nonnegative(settings.gableAreas[key], rawAreas[key]);
    return { key, label, type, area: round(area, 2), calculatedArea: round(rawAreas[key], 2), internal: key === 'inner' };
  });
  return {
    zones,
    totalArea: round(zones.reduce((sum, zone) => sum + zone.area, 0), 2),
    coldArea: round(zones.filter(zone => zone.type === 'cold').reduce((sum, zone) => sum + zone.area, 0), 2),
    warmArea: round(zones.filter(zone => zone.type === 'sip').reduce((sum, zone) => sum + zone.area, 0), 2),
    exteriorArea: round(zones.filter(zone => !zone.internal).reduce((sum, zone) => sum + zone.area, 0), 2),
    internalArea: round(zones.filter(zone => zone.internal).reduce((sum, zone) => sum + zone.area, 0), 2),
  };
}
