import {houseContourPoints} from '../planner/geometry.js';
import {isAxisAlignedRectangleContour} from './roof-contour.js';

export function cornerRafterPoints(project) {
 const plan=project.upperFloors?.at(-1)||project.plan,points=houseContourPoints(plan);
 if(isAxisAlignedRectangleContour(points.map(p=>[p.x*1000,p.y*1000]))&&!plan.platforms?.some(p=>p.include!==false&&p.roof?.mode==='shared'))return [];
 return points.map(p=>[p.x*1000,p.y*1000]);
}
export function withCornerStations(stations,required,width=50) {
 const unique=[...new Set(required.map(v=>Math.round(v*1000)/1000))];
 return [...stations.filter(v=>unique.every(r=>Math.abs(v-r)>=width)),...unique].sort((a,b)=>a-b);
}
export function cornerPlanStations(project,stations,length,axis='x') {
 const points=cornerRafterPoints(project);if(!points.length)return stations;
 const index=axis==='y'?1:0,min=Math.min(...points.map(p=>p[index]));
 return withCornerStations(stations,points.map(p=>p[index]-min).filter(v=>v>=0&&v<=length));
}
