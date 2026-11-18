import {productionLevels} from './production-levels.js';
import {roofSupportOpeningAt} from './roof-facet-supports.js';

export function roofEditorBearingContext(project,report){
 const floor=report.assembly.floors.at(-1),z=productionLevels(project,report.assembly.floors.length).roofBase;
 const outer=(floor?.contour||[]).map((a,i,ring)=>({a,b:ring[(i+1)%ring.length]}));
 const walls=[...outer,...(floor?.bearing||[])].map((e,i)=>({id:`bearing-wall-${i+1}`,a:{x:e.a[0],y:e.a[1]},b:{x:e.b[0],y:e.b[1]},z}));
 // Openings need an explicitly modelled header, not an assumed wall at that point.
 return {walls,canBear:(x,y,profile)=>!roofSupportOpeningAt(project,x,y,profile)};
}
