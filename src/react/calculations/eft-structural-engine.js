/**
 * EFT Structural Engine v0.1 — preliminary, non-certified calculations.
 * Units: m, kN, kPa, MPa and mm. Pure functions; no project mutation.
 */
const finite = value => typeof value === 'number' && Number.isFinite(value);
function positive(value, name, allowZero = false) {
  if (!finite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(`${name} must be ${allowZero ? 'nonnegative' : 'positive'} finite number`);
  }
  return value;
}

const safeKey = value => String(value ?? '').trim();

export const ENGINE_VERSION = '0.1.0';
export const ENGINE_STATUS = 'PRELIMINARY_UNVERIFIED';

export function calculateMonoRoofReactions({
  runM,
  lengthM,
  riseM = 0,
  deadLoadKPa,
  snowLoadKPa = 0,
  windVerticalKPa = 0,
  gammaDead = 1,
  gammaSnow = 1,
  gammaWind = 1,
  deadLoadBasis = 'horizontal',
  loadCase = 'named-case',
  supportScheme = 'two-edge-simple',
  snowOn = true,
  windOn = true,
} = {}) {
  positive(runM, 'runM');
  positive(lengthM, 'lengthM');
  positive(Math.abs(riseM), 'abs(riseM)', true);
  positive(deadLoadKPa, 'deadLoadKPa', true);
  positive(snowLoadKPa, 'snowLoadKPa', true);
  if (!finite(windVerticalKPa)) throw new TypeError('windVerticalKPa must be finite');
  for (const [key, value] of Object.entries({ gammaDead, gammaSnow, gammaWind })) positive(value, key, true);
  if (!['horizontal', 'slope'].includes(deadLoadBasis)) throw new Error('Invalid deadLoadBasis');
  if (supportScheme !== 'two-edge-simple') throw new Error('Only two-edge-simple supported; otherwise engineering model required');
  const projectedAreaM2 = runM * lengthM;
  const slopedLengthM = Math.hypot(runM, riseM);
  const roofAreaM2 = slopedLengthM * lengthM;
  const deadHorizontal = deadLoadKPa * (deadLoadBasis === 'slope' ? slopedLengthM / runM : 1);
  const dead = gammaDead * deadHorizontal;
  const snow = snowOn ? gammaSnow * snowLoadKPa : 0;
  const wind = windOn ? gammaWind * windVerticalKPa : 0;
  const resultantKPa = dead + snow + wind;
  const reactionPerEdgeKN = resultantKPa * projectedAreaM2 / 2;
  const edgeLineLoadKNperM = reactionPerEdgeKN / lengthM;
  return Object.freeze({
    engineVersion: ENGINE_VERSION,
    status: ENGINE_STATUS,
    loadCase: safeKey(loadCase),
    assumptions: [
      'two simply supported parallel bearing lines',
      'uniform vertical loads on horizontal projection',
      'no diaphragm/lateral distribution analysis',
      'no wall openings or concentrated supports included',
    ],
    projectedAreaM2,
    roofAreaM2,
    slopeDegrees: Math.atan2(riseM, runM) * 180 / Math.PI,
    componentsKPa: { dead, snow, wind },
    resultantKPa,
    supports: [
      { id: 'high-wall', reactionKN: reactionPerEdgeKN, lineLoadKNperM: edgeLineLoadKNperM },
      { id: 'low-wall', reactionKN: reactionPerEdgeKN, lineLoadKNperM: edgeLineLoadKNperM },
    ],
    checks: { overallLoadKN: resultantKPa * projectedAreaM2, reactionSumKN: 2 * reactionPerEdgeKN },
    warnings: [
      ...(resultantKPa < 0 ? ['Net uplift: tie-downs, connections and foundations require separate checks'] : []),
      'Load factors, snow shape, wind pressure and regional coefficients are NOT selected automatically',
      'Apertures, roof supports/rafters and wall stiffness are not checked',
    ],
  });
}

export function preliminaryTimberHeader({
  clearOpeningM,
  bearingLeftM,
  bearingRightM,
  boardCount = 3,
  boardThicknessMM = 45,
  boardDepthMM = 195,
  lineLoadKNperM,
  designBendingMPa,
  designShearMPa,
  elasticModulusMPa,
  deflectionLimitRatio = 300,
  pointLoadKN = 0,
} = {}) {
  for (const [key, value] of Object.entries({
    clearOpeningM,
    bearingLeftM,
    bearingRightM,
    boardCount,
    boardThicknessMM,
    boardDepthMM,
    lineLoadKNperM,
    designBendingMPa,
    designShearMPa,
    elasticModulusMPa,
    deflectionLimitRatio,
  })) positive(value, key, key === 'lineLoadKNperM');
  if (!Number.isInteger(boardCount)) throw new TypeError('boardCount must be integer');
  if (!finite(pointLoadKN) || pointLoadKN !== 0) throw new Error('Point loads not supported: use full analysis');
  const spanM = clearOpeningM + (bearingLeftM + bearingRightM) / 2;
  const spanMM = spanM * 1000;
  const width = boardCount * boardThicknessMM;
  const depth = boardDepthMM;
  const sectionModulusMM3 = width * depth * depth / 6;
  const inertiaMM4 = width * depth * depth * depth / 12;
  const areaMM2 = width * depth;
  const momentKNm = lineLoadKNperM * spanM * spanM / 8;
  const shearKN = lineLoadKNperM * spanM / 2;
  const bendingStressMPa = momentKNm * 1e6 / sectionModulusMM3;
  const shearStressMPa = 1.5 * shearKN * 1000 / areaMM2;
  const deflectionMM = 5 * lineLoadKNperM * spanMM ** 4 / (384 * elasticModulusMPa * inertiaMM4);
  const allowedDeflectionMM = spanMM / deflectionLimitRatio;
  const ratios = {
    bending: bendingStressMPa / designBendingMPa,
    shear: shearStressMPa / designShearMPa,
    deflection: deflectionMM / allowedDeflectionMM,
  };
  return {
    engineVersion: ENGINE_VERSION,
    status: ENGINE_STATUS,
    spanM,
    boardCount,
    sectionMM: { width, depth },
    demand: { momentKNm, shearKN, bendingStressMPa, shearStressMPa, deflectionMM },
    userProvidedLimits: { designBendingMPa, designShearMPa, elasticModulusMPa, allowedDeflectionMM },
    ratios,
    preliminarySectionScreen: Math.max(...Object.values(ratios)) <= 1 ? 'WITHIN_INPUT_LIMITS' : 'EXCEEDS_INPUT_LIMITS',
    structuralVerified: false,
    missingChecks: [
      'bearing compression perpendicular to grain',
      'connection design and lamination compatibility',
      'lateral torsional stability',
      'local loads',
      'load duration/service class',
      'bearing post and foundation',
      'wood grade/quality confirmation',
      'actual support geometry',
    ],
    warning: 'Section screening only. NOT an approved header or structure; equal load sharing not verified.',
  };
}

export function collectStructuralRequirements({ walls = [], openings = [], partitionSeams = [] } = {}) {
  if (!Array.isArray(walls) || !Array.isArray(openings) || !Array.isArray(partitionSeams)) throw new TypeError('Input arrays required');
  const issues = [];
  const requirements = [];
  for (const wall of walls) {
    if (!wall?.id) { issues.push({ code: 'MISSING_WALL_ID' }); continue; }
    if (!finite(wall.heightMM) || wall.heightMM <= 0) { issues.push({ code: 'INVALID_WALL_HEIGHT', wallId: wall.id }); continue; }
    requirements.push({ kind: 'bottom-start-board', wallId: wall.id }, { kind: 'top-cap', wallId: wall.id });
    if (wall.heightMM > 2800) issues.push({ code: 'TALL_WALL_REQUIRES_REVIEW', wallId: wall.id, heightMM: wall.heightMM, structuralVerified: false });
  }
  const wallIds = new Set(walls.map(item => item.id));
  for (const seam of partitionSeams) {
    if (!wallIds.has(seam.wallId) || !finite(seam.positionMM) || seam.positionMM < 0) { issues.push({ code: 'BAD_PARTITION_SEAM', wallId: seam.wallId }); continue; }
    requirements.push({ kind: 'mandatory-partition-spline', wallId: seam.wallId, positionMM: seam.positionMM, locked: true });
  }
  for (const opening of openings) {
    if (!wallIds.has(opening.wallId) || !finite(opening.widthMM) || opening.widthMM <= 0) { issues.push({ code: 'BAD_OPENING', wallId: opening.wallId }); continue; }
    requirements.push({ kind: 'opening-header-check', wallId: opening.wallId, openingId: opening.id ?? null, widthMM: opening.widthMM, structuralVerified: false });
    issues.push({ code: 'OPENING_LOAD_PATH_UNVERIFIED', wallId: opening.wallId, openingId: opening.id ?? null });
  }
  return { engineVersion: ENGINE_VERSION, status: ENGINE_STATUS, requirements, issues };
}
