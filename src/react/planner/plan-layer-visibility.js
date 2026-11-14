export const PLAN_LAYER_FIELDS={piles:'showPiles',binding:'showBinding',plan:'showPlan',roof:'showRoof',frame:'showStructuralFrame'};
export function planLayerVisibility(plan){
 return Object.fromEntries(Object.entries(PLAN_LAYER_FIELDS).map(([id,field])=>[id,['roof','frame'].includes(id)?plan[field]===true:plan[field]!==false]));
}
// View preferences only: never rebuild rooms or release quantity overrides.
export function setAllPlanLayers(project,floor,visible){
 const plan=floor===1?project.plan:project.upperFloors?.[floor-2];
 if(plan)for(const field of Object.values(PLAN_LAYER_FIELDS))plan[field]=Boolean(visible);
 return project;
}
export function toggleLayerGroup(hidden,keys,visible){
 return visible?hidden.filter(key=>!keys.includes(key)):[...new Set([...hidden,...keys])];
}
