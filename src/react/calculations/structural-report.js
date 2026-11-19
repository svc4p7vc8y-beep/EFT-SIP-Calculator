import {calculateProject} from './estimate-engine.js';
import {calculateProductionCutting} from './production-cutting.js';
const cache=new WeakMap();
export function structuralReport(project){
 if(!cache.has(project))cache.set(project,calculateProductionCutting(project,calculateProject(project)));
 return cache.get(project);
}
