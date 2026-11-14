// Visibility never grants editing permission to an inactive layer.
export function planObjectLayer(type){
 if(['pile','pileRow','derivedPile'].includes(type))return 'piles';
 if(type==='bindingLine')return 'binding';
 if(['roofAxis','roofSupport'].includes(type))return 'roof';
 return 'plan';
}
export function canEditPlanObject(active,type){return planObjectLayer(type)===active;}
export function planLayerTools(layer){
 const shared=['select','guide','delete'];
 if(layer==='roof')return [...shared,'roofAxis','roofAuto'];
 if(layer==='frame')return ['select','structuralFrame','framePost','frameWindow','frameDoor'];
 if(layer==='piles')return [...shared,'pile','pileRow'];
 if(layer==='binding')return [...shared,'bindingLine'];
 return ['select','room','extension','polygon','houseContour','existingContour','attachedContour','wall','bearingWall','gap','window','door','stairOpening','dimension','guide','annotation','terrace','porch','delete'];
}
export function editRoofLine(line,dx,dy,endpoint){
 const along=line.axis==='x'?dx:dy,across=line.axis==='x'?dy:dx;
 if(endpoint===0)return {...line,start:Math.max(0,Math.min(line.end-.1,line.start+along))};
 if(endpoint===1)return {...line,end:Math.max(line.start+.1,Math.min(line.length,line.end+along))};
 const shift=Math.max(-line.start,Math.min(line.length-line.end,along));return {...line,start:line.start+shift,end:line.end+shift,offset:Math.max(.05,Math.min(line.span-.05,line.offset+across))};
}
