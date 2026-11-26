import {suggestWindowForOpening} from './window-choice.js';
import {replaceWindowForOpening} from './window-opening-link.js';
// The opening and the automatically suggested product belong to one user action.
export function addPlanOpening(project,plan,opening) {
  plan.openings.push(opening);
  if(opening.type==='window'&&project)project.settings.lastPlacedWindowId=opening.id;
  if(opening.type==='window'&&project){const product=suggestWindowForOpening(project,opening.id);if(product)replaceWindowForOpening(project,product);}
}
