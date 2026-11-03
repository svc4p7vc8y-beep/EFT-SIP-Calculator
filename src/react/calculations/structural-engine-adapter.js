import { boundsOf, houseContourPoints } from '../planner/geometry.js';
import { buildFirstFloorWallGeometry } from './wall-geometry-adapter.js';
import { normalizeStructuralEngine } from '../state/structural-engine.js';
import {
  ENGINE_STATUS,
  ENGINE_VERSION,
  calculateMonoRoofReactions,
  collectStructuralRequirements,
  preliminaryTimberHeader,
} from './eft-structural-engine.js';

const present = value => value !== '' && value != null && Number.isFinite(Number(value));
const issue = (code, message, target = '') => ({ code, message, target });

function rectangle(contour, bounds) {
  return contour.length === 4
    && contour.every((point, index) => {
      const next = contour[(index + 1) % contour.length];
      return (Math.abs(point.x - next.x) < 1e-8 || Math.abs(point.y - next.y) < 1e-8)
        && Math.hypot(next.x - point.x, next.y - point.y) > 1e-6;
    })
    && contour.every(point => (point.x === bounds.x || point.x === bounds.x2) && (point.y === bounds.y || point.y === bounds.y2));
}

function supportDefinition(direction, bounds) {
  const xAxis = direction === 'left' || direction === 'right';
  const highAtMin = direction === 'back' || direction === 'right';
  const axis = xAxis ? 0 : 1;
  const minimum = axis === 0 ? bounds.x * 1000 : bounds.y * 1000;
  const maximum = axis === 0 ? bounds.x2 * 1000 : bounds.y2 * 1000;
  return {
    axis,
    highValue: highAtMin ? minimum : maximum,
    lowValue: highAtMin ? maximum : minimum,
    runM: axis === 0 ? bounds.w : bounds.h,
    lengthM: axis === 0 ? bounds.h : bounds.w,
  };
}

function wallAt(model, axis, value) {
  return model.walls.find(wall => Math.abs(wall.outerStart[axis] - value) <= 2 && Math.abs(wall.outerEnd[axis] - value) <= 2);
}

function parseProfile(value) {
  const match = String(value || '').match(/(\d+)\s*[×xх*]\s*(\d+)/i);
  return match ? { thickness: Number(match[1]), depth: Number(match[2]) } : null;
}

export function calculateStructuralEngineReport(project, calculation) {
  const settings = normalizeStructuralEngine(project.settings?.structuralEngine);
  const base = {
    engineVersion: ENGINE_VERSION,
    status: ENGINE_STATUS,
    enabled: settings.enabled,
    settings,
    compatible: false,
    issues: [],
    reaction: null,
    requirements: null,
    headerScreen: null,
    supportOpenings: [],
  };
  if (!settings.enabled) return base;
  const issues = [];
  const floorCount = Math.max(1, Number(project.meta?.floors) || 1);
  if (floorCount !== 1) issues.push(issue('FLOOR_SCOPE', 'Версия 0.1 поддерживает только одноэтажную схему.'));
  if (!project.services?.roof) issues.push(issue('ROOF_DISABLED', 'Раздел кровли отключён.'));
  if (project.settings?.roof?.shape !== 'flat') issues.push(issue('ROOF_FORM', 'Поддерживается только простая односкатная плоская кровля.'));
  const contour = houseContourPoints(project.plan);
  const bounds = boundsOf(contour);
  if (project.plan?.house?.contourDefined === false || !rectangle(contour, bounds)) {
    issues.push(issue('FOOTPRINT', 'Нужен замкнутый прямоугольный контур без Г-/П-образных участков.'));
  }
  const extraSupports = (project.settings?.productionCutting?.roofSupports || []).filter(item =>
    !item.autoWindowHeader && item.referenceOnly !== true && ['post', 'purlin', 'beam', 'truss'].includes(item.type));
  if (extraSupports.length) issues.push(issue('SUPPORT_SCHEME', 'В проекте есть дополнительные прогоны, балки, фермы или стойки: двухопорная модель неприменима.'));
  for (const [key, label, allowNegative = false] of [
    ['deadLoadKPa', 'Постоянная нагрузка'],
    ['snowLoadKPa', 'Снеговая нагрузка'],
    ['windVerticalKPa', 'Вертикальная ветровая нагрузка', true],
    ['gammaDead', 'Коэффициент постоянной нагрузки'],
    ['gammaSnow', 'Коэффициент снеговой нагрузки'],
    ['gammaWind', 'Коэффициент ветровой нагрузки'],
  ]) {
    const value = settings[key];
    if (!present(value) || (!allowNegative && Number(value) < 0)) issues.push(issue('LOAD_INPUT', `${label}: укажите конечное значение${allowNegative ? '' : ' не меньше нуля'}.`, key));
  }
  if (!settings.inputsConfirmed) issues.push(issue('INPUT_CONFIRMATION', 'Подтвердите, что нагрузки и коэффициенты введены из проверенного расчётного задания.'));
  if (issues.length) return { ...base, issues };

  const direction = project.settings.roof.flatSlopeDirection || 'back';
  const support = supportDefinition(direction, bounds);
  const riseM = ['structural', 'tapered'].includes(project.settings.roof.flatSlopeMode)
    ? support.runM * Math.max(0, Number(project.settings.roof.flatSlopePercent) || 0) / 100
    : 0;
  const wallModel = buildFirstFloorWallGeometry({
    plan: project.plan,
    sip: project.settings.sip,
    roof: project.settings.roof,
    services: project.services,
    productionSettings: project.settings.productionCutting,
    topFloor: true,
  });
  const highWall = wallAt(wallModel, support.axis, support.highValue);
  const lowWall = wallAt(wallModel, support.axis, support.lowValue);
  if (!wallModel.supported || !highWall || !lowWall) {
    return { ...base, issues: [issue('SUPPORT_MAPPING', 'Не удалось однозначно сопоставить высокую и низкую опорные стены с контуром проекта.')] };
  }
  let reaction;
  try {
    reaction = calculateMonoRoofReactions({
      runM: support.runM,
      lengthM: support.lengthM,
      riseM,
      deadLoadKPa: Number(settings.deadLoadKPa),
      snowLoadKPa: Number(settings.snowLoadKPa),
      windVerticalKPa: Number(settings.windVerticalKPa),
      gammaDead: Number(settings.gammaDead),
      gammaSnow: Number(settings.gammaSnow),
      gammaWind: Number(settings.gammaWind),
      deadLoadBasis: settings.deadLoadBasis,
      loadCase: settings.loadCaseName || 'Пользовательский расчётный случай',
      snowOn: settings.snowOn,
      windOn: settings.windOn,
    });
  } catch (error) {
    return { ...base, issues: [issue('ENGINE_INPUT', `Расчёт остановлен: ${error.message}`)] };
  }
  const supportWalls = [highWall, lowWall];
  const supportIds = new Set(supportWalls.map(wall => wall.id));
  const assignedOpenings = wallModel.openings.filter(opening => opening.status === 'assigned');
  const requirements = collectStructuralRequirements({
    walls: wallModel.walls.map(wall => ({ id: wall.id, heightMM: Math.max(wall.heightStart, wall.heightEnd) })),
    openings: assignedOpenings.map(opening => ({ id: opening.id, wallId: opening.wallId, widthMM: opening.width })),
    partitionSeams: [],
  });
  const mappedSupports = reaction.supports.map((item, index) => {
    const wall = supportWalls[index];
    const openings = assignedOpenings.filter(opening => opening.wallId === wall.id);
    return { ...item, wallId: wall.id, wallName: index === 0 ? 'Высокая опорная стена' : 'Низкая опорная стена', openings };
  });
  const supportOpenings = assignedOpenings.filter(opening => supportIds.has(opening.wallId));
  const reportIssues = supportOpenings.map(opening => issue(
    'SUPPORT_OPENING',
    `Проём ${opening.id} расположен в опорной стене ${opening.wallId}: передача реакции через перемычку не подтверждена.`,
    opening.id,
  ));
  let headerScreen = null;
  if (settings.header.enabled) {
    const opening = supportOpenings.find(item => item.id === settings.header.openingId);
    if (!opening) {
      reportIssues.push(issue('HEADER_OPENING', 'Выберите проём, находящийся в одной из двух опорных стен.'));
    } else {
      const config = project.settings.productionCutting?.windowSupportHeaders || {};
      const profile = parseProfile(config.profile || '50×150');
      const required = ['designBendingMPa', 'designShearMPa', 'elasticModulusMPa', 'deflectionLimitRatio'];
      if (!profile || required.some(key => !present(settings.header[key]) || Number(settings.header[key]) <= 0)) {
        reportIssues.push(issue('HEADER_INPUT', 'Для проверки перемычки укажите расчётные сопротивления, модуль упругости и предел прогиба.'));
      } else if (!(mappedSupports.find(item => item.wallId === opening.wallId)?.lineLoadKNperM > 0)) {
        reportIssues.push(issue('HEADER_UPLIFT', 'При нулевой или восходящей реакции эта проверка перемычки неприменима.'));
      } else {
        headerScreen = preliminaryTimberHeader({
          clearOpeningM: opening.width / 1000,
          bearingLeftM: Number(config.bearingMm || 150) / 1000,
          bearingRightM: Number(config.bearingMm || 150) / 1000,
          boardCount: Number(config.boards || 3),
          boardThicknessMM: profile.thickness,
          boardDepthMM: profile.depth,
          lineLoadKNperM: mappedSupports.find(item => item.wallId === opening.wallId).lineLoadKNperM,
          designBendingMPa: Number(settings.header.designBendingMPa),
          designShearMPa: Number(settings.header.designShearMPa),
          elasticModulusMPa: Number(settings.header.elasticModulusMPa),
          deflectionLimitRatio: Number(settings.header.deflectionLimitRatio),
        });
      }
    }
  }
  return {
    ...base,
    compatible: true,
    issues: reportIssues,
    geometry: { direction, runM: support.runM, lengthM: support.lengthM, riseM, highWallId: highWall.id, lowWallId: lowWall.id },
    reaction: { ...reaction, supports: mappedSupports },
    requirements,
    headerScreen,
    supportOpenings,
  };
}
