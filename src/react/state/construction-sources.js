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
  const upperExterior = {};
  if (value?.upperExterior != null) {
    for (const [floor, roles] of Object.entries(value.upperExterior)) {
      if (floor !== '2') {invalid=true;continue;}
      const selected={};
      for (const [role,id] of Object.entries(roles||{})) {
        if (!RECTANGLE_ROLES.includes(role)||typeof id!=='string'||!id.trim()||id.length>200||used.has(id)) {invalid=true;continue;}
        selected[role]=id;used.add(id);
      }
      if(Object.keys(selected).length)upperExterior[floor]=selected;
    }
  }
  const selections = {};
  for (const [key, ref] of Object.entries(value?.selections || {})) {
    if (key.length <= 500 && ref && ['plan-wall','room-side'].includes(ref.kind) &&
      typeof ref.id === 'string' && ref.id.trim() && ref.id.length <= 200 &&
      (ref.kind === 'plan-wall' || RECTANGLE_ROLES.includes(ref.role)))
      selections[key] = {kind:ref.kind,id:ref.id,...(ref.kind==='room-side'?{role:ref.role}:{})};
    else invalid = true;
  }
  return {version:1,exterior,...(Object.keys(upperExterior).length?{upperExterior}:{}),...(Object.keys(selections).length?{selections}:{}),...(invalid?{invalid:true}:{})};
}

// Allocated once in project state, never randomly generated during calculation.
export function registerConstructionSources(saved, requests, allocate=()=>crypto.randomUUID()) {
  const next=normalizeConstructionSources(saved);
  for(const request of Array.isArray(requests)?requests:[]) {
    const floor=typeof request==='string'?1:request?.floor,role=typeof request==='string'?request:request?.role;
    if(!RECTANGLE_ROLES.includes(role)||![1,2].includes(floor))continue;
    const roles=floor===1?next.exterior:((next.upperExterior??={})[floor]??={});
    if(!roles[role])roles[role]=allocate();
  }
  return next;
}
