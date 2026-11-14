import {INLINE_FITTING_KINDS} from '../data/pipe-components.js';
import {pipeStemDirection} from '../state/engineering-pipe-tools.js';
import {mediumColor} from '../state/engineering-scheme.js';

export default function EngineeringPipeStem({item,owner,x=0,y=0,wall=false}) {
 if(INLINE_FITTING_KINDS.has(owner?.kind))return null;
 const d=pipeStemDirection(item,owner,wall);
 const angle=wall?0:(Number(item.rotation)||0)*Math.PI/180,dx=d.x*Math.cos(angle)+d.y*Math.sin(angle),dy=-d.x*Math.sin(angle)+d.y*Math.cos(angle);
 return <path className="engineering-pipe-stem" d={`M${x-dx*2.5} ${y-dy*2.5}L${x} ${y}`} fill="none" stroke={mediumColor(item.connectionMedium)} strokeWidth="1.6" strokeLinecap="butt"/>;
}
