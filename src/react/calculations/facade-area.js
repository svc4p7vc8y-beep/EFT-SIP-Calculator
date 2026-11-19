import clipping from 'polygon-clipping';
import {openingPolygon,shapeArea} from '../../calculations/opening-shape.js';
import {facadeReservedShape} from './facade-design.js';

// One union for glazing and timber pockets prevents double subtraction.
export function facadeExclusionShape(plan,wallId,envelope){
  const ids=new Set((plan.facades||[]).filter(f=>f.wallId===wallId).map(f=>f.id));
  if(!ids.size)return [];
  const shapes=(plan.openings||[]).filter(o=>ids.has(o.facadeId)&&o.include!==false&&o.subtractFromSip!==false).map(o=>openingPolygon(o,1000,Number(o.facadeXMm)||0,(Number(o.sillHeight)||0)*1000));
  const reserved=facadeReservedShape(plan,wallId);
  if(reserved.length)shapes.push(reserved);
  return shapes.length?clipping.intersection(clipping.union(...shapes),envelope):[];
}
export function facadeExclusionArea(plan,wallId,envelope){return shapeArea(facadeExclusionShape(plan,wallId,envelope))/1e6;}
