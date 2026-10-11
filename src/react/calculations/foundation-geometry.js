import {assemblyPlatformView} from './platform-assembly.js';
// Missing dimensions remain axis markers, not invented manufactured piles.
export function foundationGeometry(report,project,includePlatforms=true){
 const assembly=assemblyPlatformView(report.assembly,includePlatforms),saved=project.documentation?.building?.foundation||{},d=assembly.blockDimensions||{};
 const block=assembly.foundationType==='concreteBlock',valid=v=>v!==''&&v!=null&&Number.isFinite(Number(v));
 const automaticTop=-Number(project.settings.sip.floorThickness)-Math.max(0,...assembly.binding.map(m=>Number(String(m.profile).split(/[×xх]/)[1])||150));
 const top=valid(saved.topMm)?Number(saved.topMm):automaticTop,width=valid(saved.widthMm)?Number(saved.widthMm):block?Number(d.widthMm):NaN,depth=valid(saved.depthMm)?Number(saved.depthMm):block?Number(d.lengthMm):width;
 const bottom=valid(saved.bottomMm)?Number(saved.bottomMm):block&&Number(d.heightMm)>0?top-Number(d.heightMm):NaN,height=top-bottom;
 return assembly.piles.map((p,i)=>{
  const id=(block?'БЛ':'СВ')+(i+1),known=width>0&&depth>0&&height>0&&[width,depth,top,bottom].every(Number.isFinite);
  const square=block||assembly.foundationType==='concrete';
  const ring=square?[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2],[-width/2,-depth/2]]:Array.from({length:25},(_,j)=>[width/2*Math.cos(j*Math.PI/12),depth/2*Math.sin(j*Math.PI/12)]);
  return {id,layer:'foundation',mark:id,referenceOnly:!known,known,axis:[...p,top],shape:known?[ring]:[],thickness:height,placement:{origin:[...p,(top+bottom)/2],u:[1,0,0],v:[0,1,0],normal:[0,0,1],layer:'foundation'}};
 });
}
