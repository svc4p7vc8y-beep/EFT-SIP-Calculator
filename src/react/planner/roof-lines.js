// The same saved axes drive layered-frame geometry and its purchasing layout.
export function roofPlanLines(project,calculation) {
  const saved=project.settings.productionCutting.roofPlanLines;
  const axis=calculation.roof.ridgeAxis||'x',plan=calculation.metrics.floorPlans.at(-1).plan;
  const span=axis==='x'?plan.house.h:plan.house.w,length=axis==='x'?plan.house.w:plan.house.h;
  const lines=saved?.enabled?saved.lines:(calculation.roof.layeredFrame?.fractions||[]).map((f,i)=>({id:`layered-frame-${i+1}`,offset:f*span,start:0,end:length}));
  return lines.map((line,i)=>({...line,name:`Прогон / рама ${i+1}`,a:axis==='x'?{x:line.start,y:line.offset}:{x:line.offset,y:line.start},b:axis==='x'?{x:line.end,y:line.offset}:{x:line.offset,y:line.end},axis,span,length,automatic:!saved?.enabled}));
}
export function snapRoofLineOffset(offset,span,others=[],tolerance=.12) {
  const candidates=[{value:span/2,label:'Ось симметрии дома'},...others.map(value=>({value:span-value,label:'Симметрия относительно другого прогона'}))];
  const hit=candidates.filter(c=>Math.abs(c.value-offset)<=tolerance).sort((a,b)=>Math.abs(a.value-offset)-Math.abs(b.value-offset))[0];
  return {offset:Math.max(.05,Math.min(span-.05,hit?hit.value:offset)),hint:hit?.label||''};
}
export function saveRoofLines(project,calculation,lines) {
  project.settings.productionCutting.roofPlanLines={enabled:true,axis:calculation.roof.ridgeAxis||'x',lines:lines.map(({id,start,end,offset})=>({id,start,end,offset}))};
  project.settings.productionCutting.windowSupportHeaders={...project.settings.productionCutting.windowSupportHeaders,enabled:true};
  return project;
}
