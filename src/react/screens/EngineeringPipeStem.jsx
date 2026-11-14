import {INLINE_FITTING_KINDS} from '../data/pipe-components.js';
import {pipeStemDirection} from '../state/engineering-pipe-tools.js';
import {mediumColor} from '../state/engineering-scheme.js';

export default function EngineeringPipeStem({item,owner,x=0,y=0,wall=false}) {
 if(INLINE_FITTING_KINDS.has(owner?.kind))return null;
 const d=pipeStemDirection(item,owner,wall);
 return <path className="engineering-pipe-stem" d={`M${x-d.x*7} ${y-d.y*7}L${x} ${y}`} fill="none" stroke={mediumColor(item.connectionMedium)} strokeWidth="3.5" strokeLinecap="butt"/>;
}
