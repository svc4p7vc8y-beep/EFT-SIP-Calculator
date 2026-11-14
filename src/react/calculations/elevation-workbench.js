import {wallPoint,wallStation} from './structural-frame.js';
import {combinedWall,gableLinks} from './drawing-workbench.js';
import {applyFacade,facadeEnvelope,removeFacade} from './facade-design.js';
import {updateLinkedWindowDimensions} from '../state/window-opening-link.js';
import {elevationWallKey} from './elevation-guides.js';

export function wallFacade(project,wall){const plan=wall.floor===1?project.plan:project.upperFloors[wall.floor-2];return plan.facades?.find(f=>f.wallId===wall.id);}
export function elevationOpenings(project,wall){
 const plan=wall.floor===1?project.plan:project.upperFloors[wall.floor-2],facade=wallFacade(project,wall),result=(wall.openings||[]).filter(o=>!o.gap&&!o.facadeId);
 for(const o of plan.openings.filter(o=>o.facadeId&&o.facadeId===facade?.id))result.push({...o,x:o.facadeXMm,sill:o.sillHeight*1000,width:o.width*1000,height:o.height*1000});
 return result;
}
export function elevationFrame(project,report,wall){
 const facade=wallFacade(project,wall),combined=combinedWall(report,wall,gableLinks(report,report.settings.gableLinks)),base=Number(wall.baseZMm)||0;
 const supports=project.settings.productionCutting.roofSupports.filter(s=>s.type!=='foundation'&&(s.frameWallId===wall.id&&s.frameFloor===wall.floor||facade&&s.facadeId===facade.id));
 return [...combined.members.filter(m=>!m.excluded).map(m=>({...m,kind:'member'})),...supports.map(s=>({...s,kind:'support',a:[wallStation(wall,[s.x1,s.y1]),s.z1-base],b:[wallStation(wall,[s.x2,s.y2]),s.z2-base],faceWidth:s.type==='post'?Number(s.profile.split(/[×xх]/)[0]):Number(s.profile.split(/[×xх]/)[1])}))];
}
export function editElevationOpening(project,wall,opening,{x=opening.x,z=Number(opening.sill),width=opening.width,height=opening.height}){
 const plan=wall.floor===1?project.plan:project.upperFloors[wall.floor-2],raw=plan.openings.find(o=>o.id===opening.id);if(!raw)return project;
 const point=wallPoint(wall,x+width/2),previous=wallPoint(wall,opening.x+opening.width/2);raw.x+=(point[0]-previous[0])/1000;raw.y+=(point[1]-previous[1])/1000;raw.sillHeight=Math.max(0,z)/1000;raw.angle=Math.atan2(wall.planEnd[1]-wall.planStart[1],wall.planEnd[0]-wall.planStart[0])*180/Math.PI;
 raw.width=width/1000;raw.height=height/1000;updateLinkedWindowDimensions(project,raw,width,height);
 if(raw.facadeId){raw.facadeXMm=x;const facade=plan.facades.find(f=>f.id===raw.facadeId),gap=Number(facade.clearanceMm)||0;facade.windowOverrides={...facade.windowOverrides,[raw.facadeWindowKey]:{...facade.windowOverrides?.[raw.facadeWindowKey],xMm:x+gap,sillMm:z+gap,widthMm:width-2*gap,heightMm:height-2*gap}};}
 return project;
}
export function moveElevationMember(project,report,wall,member,dx,dz=0){
 if(member.kind==='support'){
  const s=project.settings.productionCutting.roofSupports.find(s=>s.id===member.id);if(!s)return project;
  if(s.facadeId){const config=wallFacade(project,wall),index=config.postRefs?.indexOf(s.facadeMemberKey);if(!(index>=0))throw new Error('Балки витража перемещаются настройками перемычки в панорамном фасаде.');
    const next={...config,posts:config.posts.map((x,i)=>i===index?x+dx:x),memberOverrides:{...config.memberOverrides,[s.facadeMemberKey]:{...config.memberOverrides?.[s.facadeMemberKey],...(dz?{z1:s.z1+dz,z2:s.z2+dz}:{})}}};return applyFacade(project,next,facadeEnvelope(report,wall.id));}
  const delta=wallPoint(wall,dx),origin=wallPoint(wall,0),vx=delta[0]-origin[0],vy=delta[1]-origin[1];
  for(const item of project.settings.productionCutting.roofSupports.filter(i=>i.id===s.id||i.id===s.id+'-foundation')){item.x1+=vx;item.x2+=vx;item.y1+=vy;item.y2+=vy;item.z1+=dz;item.z2+=dz;}return project;
 }
 const value=project.settings.productionCutting.memberOverrides[member.key]||{};
 project.settings.productionCutting.memberOverrides[member.key]={...value,frameOffsetMm:(Number(value.frameOffsetMm)||0)+dx,frameVerticalOffsetMm:(Number(value.frameVerticalOffsetMm)||0)+dz};return project;
}
export function editElevationSupport(project,report,wall,member,patch){
 const support=project.settings.productionCutting.roofSupports.find(s=>s.id===member.id);if(!support)return project;
 if(!support.facadeId){Object.assign(support,patch);return project;}
 const config=wallFacade(project,wall),key=support.facadeMemberKey;
 return applyFacade(project,{...config,memberOverrides:{...config.memberOverrides,[key]:{...config.memberOverrides?.[key],...patch}}},facadeEnvelope(report,wall.id));
}
export function removeElevationSupport(project,report,wall,member){
 const support=project.settings.productionCutting.roofSupports.find(s=>s.id===member.id);if(!support)return project;
 if(support.facadeId){const config=wallFacade(project,wall),index=config.postRefs?.indexOf(support.facadeMemberKey);
  if(index>=0){if(config.posts.length<=2)throw new Error('Сохраните минимум две крайние стойки фасада.');return applyFacade(project,{...config,posts:config.posts.filter((_,i)=>i!==index),postRefs:config.postRefs.filter((_,i)=>i!==index)},facadeEnvelope(report,wall.id));}
  return editElevationSupport(project,report,wall,member,{exclude:true});
 }
 project.settings.productionCutting.roofSupports=project.settings.productionCutting.roofSupports.filter(s=>s.id!==member.id&&s.id!==member.id+'-foundation');return project;
}
export function clearElevationWall(project,wall,openings){
 const config=wallFacade(project,wall);if(config)project=removeFacade(project,config.id,wall.floor);
 const plan=wall.floor===1?project.plan:project.upperFloors[wall.floor-2],ids=new Set(openings.map(o=>o.id));
 plan.openings=plan.openings.filter(o=>!ids.has(o.id));project.windowProducts=(project.windowProducts||[]).filter(p=>!ids.has(p.openingId));
 const owned=project.settings.productionCutting.roofSupports.filter(s=>s.frameWallId===wall.id&&s.frameFloor===wall.floor).map(s=>s.id);
 project.settings.productionCutting.roofSupports=project.settings.productionCutting.roofSupports.filter(s=>!owned.some(id=>s.id===id||s.id===id+'-foundation'));
 project.settings.productionCutting.structuralWallLayouts={...project.settings.productionCutting.structuralWallLayouts,[elevationWallKey(wall)]:{mode:'manual',wallId:wall.id}};
 return project;
}
export function roofElevationGuides(project,wall){
 const ux=(wall.planEnd[0]-wall.planStart[0])/wall.width,uy=(wall.planEnd[1]-wall.planStart[1])/wall.width,result=[];
 for(const s of project.settings.productionCutting.roofSupports.filter(s=>!s.referenceOnly&&['post','purlin','beam','tie','sleeper'].includes(s.type))){const close=(x,y)=>Math.abs((x-wall.planStart[0])*uy-(y-wall.planStart[1])*ux)<Math.max(250,Number(wall.thickness)||0);if(!close(s.x1,s.y1)&&!close(s.x2,s.y2))continue;
  const a=[wallStation(wall,[s.x1,s.y1]),s.z1-(wall.baseZMm||0)],b=[wallStation(wall,[s.x2,s.y2]),s.z2-(wall.baseZMm||0)];result.push({id:s.id,a,b,label:s.name||'Опора кровли'});}
 return result;
}
