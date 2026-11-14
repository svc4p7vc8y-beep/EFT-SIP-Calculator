import {projectToWallFace,wallFacePoint} from './placement-walls.js';
// Screen-derived tolerance is supplied by the editor; only the point being drawn moves.
export function wallAlignment(point,wall,items,routes,tolerance=.06,excludeId) {
 if(!point||!wall)return {point,guides:[]};
 const candidates=items.filter(i=>i.wallRef===wall.ref&&(!excludeId||i.id!==excludeId&&i.linkedApplianceId!==excludeId)).map(i=>({...i,z:i.height||0}));
 for(const route of routes)for(const p of route.points||[])if(projectToWallFace(wall,p)?.distance<.14)candidates.push(p);
 let station=point.station??projectToWallFace(wall,point).station,z=point.z,ds=tolerance,dz=tolerance,sg,zg;
 for(const p of candidates){const s=projectToWallFace(wall,p)?.station;if(Math.abs(s-station)<ds){ds=Math.abs(s-station);sg=s;}if(Math.abs((p.z||0)-z)<dz){dz=Math.abs((p.z||0)-z);zg=p.z||0;}}
 const guides=[];if(sg!==undefined){station=sg;guides.push({axis:'station',value:sg});}if(zg!==undefined){z=zg;guides.push({axis:'height',value:zg});}
 return {point:{...point,...wallFacePoint(wall,station),station,z},guides};
}

