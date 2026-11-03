export const DEFAULT_STRUCTURAL_ENGINE = Object.freeze({
  enabled: false,
  inputsConfirmed: false,
  loadCaseName: '',
  deadLoadKPa: '',
  snowLoadKPa: '',
  windVerticalKPa: '',
  gammaDead: 1,
  gammaSnow: 1,
  gammaWind: 1,
  deadLoadBasis: 'horizontal',
  snowOn: true,
  windOn: true,
  header: Object.freeze({
    enabled: false,
    openingId: '',
    designBendingMPa: '',
    designShearMPa: '',
    elasticModulusMPa: '',
    deflectionLimitRatio: 300,
  }),
});

const scalar = value => value === '' || value == null ? '' : Number.isFinite(Number(value)) ? Number(value) : '';

export function normalizeStructuralEngine(raw = {}) {
  return {
    ...DEFAULT_STRUCTURAL_ENGINE,
    enabled: raw.enabled === true,
    inputsConfirmed: raw.inputsConfirmed === true,
    loadCaseName: String(raw.loadCaseName || '').slice(0, 120),
    deadLoadKPa: scalar(raw.deadLoadKPa),
    snowLoadKPa: scalar(raw.snowLoadKPa),
    windVerticalKPa: scalar(raw.windVerticalKPa),
    gammaDead: scalar(raw.gammaDead) === '' ? 1 : scalar(raw.gammaDead),
    gammaSnow: scalar(raw.gammaSnow) === '' ? 1 : scalar(raw.gammaSnow),
    gammaWind: scalar(raw.gammaWind) === '' ? 1 : scalar(raw.gammaWind),
    deadLoadBasis: raw.deadLoadBasis === 'slope' ? 'slope' : 'horizontal',
    snowOn: raw.snowOn !== false,
    windOn: raw.windOn !== false,
    header: {
      ...DEFAULT_STRUCTURAL_ENGINE.header,
      ...(raw.header || {}),
      enabled: raw.header?.enabled === true,
      openingId: String(raw.header?.openingId || '').slice(0, 160),
      designBendingMPa: scalar(raw.header?.designBendingMPa),
      designShearMPa: scalar(raw.header?.designShearMPa),
      elasticModulusMPa: scalar(raw.header?.elasticModulusMPa),
      deflectionLimitRatio: scalar(raw.header?.deflectionLimitRatio) === '' ? 300 : scalar(raw.header?.deflectionLimitRatio),
    },
  };
}
