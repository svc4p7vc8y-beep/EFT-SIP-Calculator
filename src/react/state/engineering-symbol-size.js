// Wall artwork uses 100 SVG units per metre. Position height is the connection datum.
export function engineeringSymbolSize(item){
 const width=Math.max(.025,Number(item.width)||.1);
 const kind=String(item.kind||'');
 const bodyHeight=/boiler|water-heater/.test(kind)?.75:/radiator/.test(kind)?.6:/tank|expansion/.test(kind)?.5:Number(item.bodyHeightM)||Number(item.depth)||width;
 return {width:width*100,height:Math.max(.025,bodyHeight)*100};
}
