import {productionScene} from './production-scene.js';

export function resolvePlan3DSelection(report,project,id){
 if(!id)return null;
 const panel=report.parts.find(p=>p.id===id),member=report.members.find(m=>m.id===id||m.displayMark===id),surface=report.surfaces.find(s=>s.id===(panel?.surfaceId||member?.surfaceId||id));
 const platform=(report.assembly.platforms||[]).find(p=>id.startsWith(`platform:${p.id}:`));
 const support=report.assembly.supports.find(s=>s.id===id||s.mark===id);
 const binding=report.assembly.binding.find(m=>id===m.id||id.startsWith(m.id+':'));
 const item=member||panel||support||binding;
 // Some visual objects (deck, glass, foundation) are adapters of saved data.
 const scene=productionScene(report,project),visual=[...scene.beams,...scene.panels,...scene.foundation].find(m=>m.id===id);
 const profile=item?.profile||visual?.profile||'',dims=profile.split(/[×xх]/).map(Number);
 const a=item?.worldA||item?.a||visual?.a||visual?.axis,b=item?.worldB||item?.b||visual?.b;
 const coords=visual?.shape?.flat()||[],shapeWidth=coords.length?Math.max(...coords.map(p=>p[0]))-Math.min(...coords.map(p=>p[0])):0,shapeHeight=coords.length?Math.max(...coords.map(p=>p[1]))-Math.min(...coords.map(p=>p[1])):0;
 const length=item?.length||(visual?.layer==='foundation'?visual.thickness:0)||(a&&b?Math.hypot(...a.map((n,k)=>b[k]-n)):0);
 const width=panel?.width||surface?.width||shapeWidth||(dims[0]||0)*(binding?.layers||1),height=panel?.height||surface?.height||shapeHeight||dims[1]||0,thickness=panel?.thickness||surface?.thickness||visual?.thickness||0;
 const name=platform&&(id.endsWith(':deck')||id.includes(':frame:')||id.includes(':post:'))?id.endsWith(':deck')?'Настил террасы':item?.name||item?.material||visual?.name||'Каркас террасы':item?.name||item?.material||surface?.name||visual?.name||({binding:'Обвязка',foundation:'Опора фундамента',windows:'Окно'}[visual?.layer])||'Элемент 3D';
 return {id,name,mark:item?.displayMark||item?.mark||'',profile,length,width,height,thickness,a,b,material:panel?.family||item?.material||'',surfaceName:surface?.name||platform?.name||item?.surface||'',member,platformId:platform?.id,floor:surface?.floor||1,bundleLayers:binding?.layers||0,referenceOnly:visual?.referenceOnly||item?.referenceOnly||false};
}
