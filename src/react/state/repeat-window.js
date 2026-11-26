import {suggestWindowForOpening} from './window-choice.js';
import {replaceWindowForOpening} from './window-opening-link.js';
export function lastPlacedWindow(project,plan=project?.plan){
 if(!project)return null;
 const plans=[project.plan,...(project.upperFloors||[])],id=project.settings?.lastPlacedWindowId;
 const candidates=plans.flatMap(p=>p.openings||[]),opening=candidates.find(o=>o.id===id&&o.type==='window')||[...(plan?.openings||[]),...candidates].reverse().find(o=>o.type==='window'&&!o.facadeId);
 if(!opening)return null;
 const product=project.windowProducts?.find(p=>p.openingId===opening.id);
 return {opening,product};
}
export function repeatedWindowOpening(project,plan,placement){
 const source=lastPlacedWindow(project,plan);if(!source)throw new Error('Сначала добавьте окно, которое нужно повторить.');
 const keys=['width','height','sillHeight','windowType','hinge','swing','include','includeInEstimate','subtractFromSip','outline','displayOutline','productShape'];
 return {...Object.fromEntries(keys.filter(k=>source.opening[k]!==undefined).map(k=>[k,structuredClone(source.opening[k])])),...placement,type:'window'};
}
export function addRepeatedWindow(project,plan,opening){
 const source=lastPlacedWindow(project,plan);if(!source)throw new Error('Сначала добавьте окно, которое нужно повторить.');
 plan.openings.push(opening);
 if(source.product){const product=structuredClone(source.product);product.id=crypto.randomUUID();product.openingId=opening.id;product.quantity=1;for(const k of ['facadeId','facadeWindowKey'])delete product[k];replaceWindowForOpening(project,product);}else{const product=suggestWindowForOpening(project,opening.id);if(product)replaceWindowForOpening(project,product);}
 project.settings.lastPlacedWindowId=opening.id;
 return opening;
}
