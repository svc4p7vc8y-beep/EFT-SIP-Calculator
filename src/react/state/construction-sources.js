export const RECTANGLE_ROLES = ['top', 'bottom', 'left', 'right'];
export const ROLE_LABELS = {top:'Верх',bottom:'Низ',left:'Лево',right:'Право'};
export function normalizeConstructionSources(value) {
  const exterior = {}, used = new Set();
  let invalid = value?.invalid === true || (value?.version != null && value.version !== 1);
  for (const role of RECTANGLE_ROLES) {
    const id = value?.exterior?.[role];
    if (id == null) continue;
    if (typeof id !== 'string' || !id.trim() || id.length > 200 || used.has(id)) {invalid=true;continue;}
    exterior[role]=id;used.add(id);
  }
  const selections = {};
  for (const [key, ref] of Object.entries(value?.selections || {})) {
    if (key.length <= 500 && ref && ['plan-wall','room-side'].includes(ref.kind) &&
      typeof ref.id === 'string' && ref.id.trim() && ref.id.length <= 200 &&
      (ref.kind === 'plan-wall' || RECTANGLE_ROLES.includes(ref.role)))
      selections[key] = {kind:ref.kind,id:ref.id,...(ref.kind==='room-side'?{role:ref.role}:{})};
    else invalid = true;
  }
  return {version:1,exterior,...(Object.keys(selections).length?{selections}:{}),...(invalid?{invalid:true}:{})};
}

// Allocated once in project state, never randomly generated during calculation.
export function registerConstructionSources(saved, requests, allocate=()=>crypto.randomUUID()) {
  const next=normalizeConstructionSources(saved);
  for(const role of Array.isArray(requests)?requests:[]) {
    if(RECTANGLE_ROLES.includes(role)&&!next.exterior[role])next.exterior[role]=allocate();
  }
  return next;
}
