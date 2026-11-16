// Coordinates describe semantic top/bottom, so the same convention works in
// Y-up elevations and Y-down gallery icons. Triangle apex faces the handle.
export function openingSymbolPolylines(mode,{left,right,bottom,top}){
 const middle=(bottom+top)/2,center=(left+right)/2,paths=[];
 if(mode.endsWith('_left'))paths.push([[left,bottom],[right,middle],[left,top]]);
 if(mode.endsWith('_right'))paths.push([[right,bottom],[left,middle],[right,top]]);
 if(['tilt','bottom_hinged_transom'].includes(mode)||mode.startsWith('tilt_turn'))paths.push([[left,bottom],[center,top],[right,bottom]]);
 return paths;
}

export function openingSymbolPaths(mode,bounds){return openingSymbolPolylines(mode,bounds).map(points=>points.map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join(''));}
