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
  if (seam) return `${surfaceId}: шов под прогоном в ${seam[1]} мм от ${seam[2]} (минимум ${report.settings?.minPanelWidthMm??250} мм)`;
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

// One warning per message, even when several highlighted objects explain it.
export function productionViewerWarnings({report,scene,blockedPreviews=[],roofWarning='',error='',project}) {
  const rows=new Map();
  const add=(message,target='',focus=null)=>{
    if(!message)return;
    const key=String(message).trim();
    if(!rows.has(key))rows.set(key,{id:key,message:key,target,focusTargets:[]});
    const row=rows.get(key);
    if(focus&&!row.focusTargets.some(item=>item.id===focus.id))row.focusTargets.push(focus);
  };
  for(const preview of blockedPreviews){
    for(const reason of preview.reasons.length?preview.reasons:[`${preview.id}: раскрой заблокирован`])add(reason,preview.id);
  }
  for(const blocker of scene.blockers||[])add(blocker.sourceMessage||`Ошибка геометрии: ${blocker.name}`,blocker.surfaceId,{id:blocker.id,name:blocker.name});
  if(scene.missing?.length)add(`Нет пространственной привязки: ${scene.missing.join(', ')}. Нужен рабочий узел.`);
  if(roofWarning)add(`Основная крыша: ${roofWarning}`);
  const parapet=scene.parapetRequirement;
  if(parapet?.shortfall>0)add(`Парапет высотой ${parapet.provided} мм не скрывает кровлю. Для выбранного уклона и слоёв требуется не менее ${parapet.required} мм от потолка. Измените высоту в параметрах; 3D и смета не повышают её автоматически.`);
  for(const issue of report.issues||[])if(['PARTITION_ROOF_INTERSECTION','SUPPORT_ROOF_INTERSECTION','GABLE_OPENING'].includes(issue.code))add(issue.message,issue.target);
  if(error)add(error);
  if(project.services.terrace===false&&report.assembly.binding.some(m=>m.group==='platform'))add('В основании учтены сохранённые площадки, хотя раздел «Терраса» отключён. Их обвязка показана без настила; состав основания настраивается в «Сваи» → «Учитывать террасы и крыльца».');
  return [...rows.values()];
}
