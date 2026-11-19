import clipping from 'polygon-clipping';
import {roomPoints} from '../planner/geometry.js';
import {atticPartitionProfile} from './attic-partition-profile.js';
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
function openRoomIntervals(plan,wall){
 const [a,b]=[wall.planStart,wall.planEnd],dx=(b[0]-a[0])/wall.width,dy=(b[1]-a[1])/wall.width,result=[];
 for(const room of plan.rooms||[]){if(room.include===false||room.extension||!['open','open-rafter'].includes(room.ceilingMode)||room.openCeilingArea===0)continue;
 const points=roomPoints(room).map(p=>[p.x*1000,p.y*1000]);for(let i=0;i<points.length;i++){const c=points[i],d=points[(i+1)%points.length],distance=p=>Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx);if(distance(c)>220||distance(d)>220)continue;const at=p=>(p[0]-a[0])*dx+(p[1]-a[1])*dy,from=Math.max(0,Math.min(at(c),at(d))),to=Math.min(wall.width,Math.max(at(c),at(d)));if(to-from>10)result.push([from,to]);}}
 return result;
}
// Add only missing closure above existing walls; base walls, roof and saved openings stay intact.
export function supplementalGables(project,calculation,assembly,surfaces){
 const model=assembly.roofModel,plans=[project.plan,...(project.upperFloors||[])],floor=assembly.floors.length,plan=plans[floor-1];
 if(!project.services.roof||!model?.faces?.length||calculation.roof.mainRoofShape!=='gable')return [];
 const faces=model.faces.filter(f=>f.group==='main');if(!faces.length)return [];const projection=clipping.union(...faces.map(f=>[f.vertices.map(p=>p.slice(0,2))])),points=projection.flat(2),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),boxArea=(Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys)),projectionArea=projection.reduce((s,p)=>s+p.reduce((v,r,i)=>v+(i?-1:1)*area(r),0),0),rectangular=Math.abs(projectionArea-boxArea)<1;
 const depth=Number(String(calculation.roof.rafterStructure?.section||project.settings.roof.rafterSection||'50x150').split(/[xх×]/)[1])||150,result=[];
 for(const wall of surfaces.filter(s=>s.floor===floor&&s.planStart&&!s.horizontal)){
  if(surfaces.some(s=>s.parentWallId===wall.id))continue;
  const internal=!wall.exterior;if(internal&&(plan.secondLightWallFit===false||plan.partitionFitTop===false||project.settings.sip.partitionTopMode==='manual')||!internal&&(Number(project.settings.roof.gableCount)<=0||!['sip','cold'].includes(calculation.roof.mainGableType)))continue;const intervals=internal?openRoomIntervals(plan,wall):[[0,wall.width]],axis=calculation.roof.ridgeAxis==='y'?1:0;
  const across=1-axis,low=across===0?assembly.bounds.x:assembly.bounds.y,high=low+(across===0?assembly.bounds.width:assembly.bounds.height),recessed=wall.planStart[across]>low+220&&wall.planStart[across]<high-220;
  if(!intervals.length||!internal&&(!rectangular||Math.abs(wall.planStart[axis]-wall.planEnd[axis])>1&&!recessed))continue;
  const adjusted={...model,faces:faces.map(f=>{const offset=internal?(f.warm?0:-depth/(2*f.normal[2])):(f.warm?Number(f.thickness||0):depth)/(2*f.normal[2]);return {...f,origin:f.origin.map((v,i)=>i===2?v+offset:v),vertices:f.vertices.map(p=>p.map((v,i)=>i===2?v+offset:v))};})};
  const profile=atticPartitionProfile(adjusted,wall.planStart,wall.planEnd,(wall.baseZMm||0)+wall.height,Infinity);if(!profile||Math.max(...profile.map(p=>p[1]))<1)continue;
  let geometry=clipping.intersection([[[0,0],...profile,[wall.width,0],[0,0]]],[[[0,0],[wall.width,0],[wall.width,30000],[0,30000]]]);
  geometry=clipping.intersection(geometry,clipping.union(...intervals.map(([a,b])=>[[[a,0],[b,0],[b,30000],[a,30000]]])));if(!geometry.length)continue;
  const frame=internal?wall.frameOnly===true:calculation.roof.mainGableType!=='sip';
  result.push({id:`ФР-${internal?'ВН':'ДОП'}-${wall.id}`,name:`${internal?'Внутренний фронтон второго света':'Участок фронтона под общей кровлей'} · ${wall.name} · ${frame?'каркас':'СИП'}`,floor,horizontal:false,staggered:false,thickness:wall.thickness,family:wall.family,geometry,grossShape:geometry,frameOnly:frame,parentWallId:wall.id,supplementalGable:true,internalGable:internal,openings:[]});
 }
 return result;
}
