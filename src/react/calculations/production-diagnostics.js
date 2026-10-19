// Tie a blocked surface to the issue that stopped its fabrication. Opening
// errors target an opening key, so they must be resolved through the surface.
export function blockedSurfaceReasons(report, surfaceId) {
  const surface = report.surfaces.find(item => item.id === surfaceId);
  if (!surface?.blocked) return [];
  const openingKeys = new Set((surface.openings || []).map(item => item.key));
  const blocking = new Set(['MIN_PANEL_WIDTH','OPENING_WALL','OPENING_SIZE','OPENING_SILL','OPENING_OVERLAP','GABLE_OPENING','STAIR_BOUNDS','CEILING_OPENING','CEILING_BOUNDS','WALL_SIZE']);
  const related = report.issues.filter(issue => issue.target === surfaceId || openingKeys.has(issue.target))
    .sort((a,b)=>Number(blocking.has(b.code))-Number(blocking.has(a.code)));
  return [...new Set(related.map(issue => issue.message))];
}

export function blockedSurfaceSummary(report, surfaceId) {
  const reason = blockedSurfaceReasons(report, surfaceId)[0] || 'раскрой заблокирован';
  const seam = reason.match(/Шов под прогоном на \d+ мм расположен в (\d+) мм от края проёма ([^;]+);/);
  if (seam) return `${surfaceId}: шов под прогоном в ${seam[1]} мм от ${seam[2]} (минимум 250 мм)`;
  return `${surfaceId}: ${reason.split('.')[0]}`;
}

export function missingMainRoofReason(report, project, scene) {
  if (!project.services.roof) return '';
  const mainFaces = report.assembly.roofModel?.faces.filter(face => face.group === 'main') || [];
  const faceIds = new Set(mainFaces.map(face => face.id));
  const mainRafters = report.assembly.rafters.filter(item => !item.excluded && (!item.faceId || faceIds.has(item.faceId)));
  const mainPanels = scene.panels.filter(item => item.layer === 'roof' && faceIds.has(item.faceId));
  if (mainRafters.length || mainPanels.length) return '';
  const issue = report.issues.find(item => ['ROOF','ROOF_FORM','ROOF_FACE','ROOF_CONTOUR','ROOF_HIP_GEOMETRY'].includes(item.code));
  return issue?.message || 'Основная кровля не сформирована в 3D. Проверьте тип, геометрию скатов и сообщения раскроя.';
}
