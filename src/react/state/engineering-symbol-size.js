// Wall artwork uses 100 SVG units per metre. Position height is the connection datum.
export function engineeringSymbolSize(item){
 const width=Math.max(.025,Number(item.width)||.1);
 const kind=String(item.kind||'');
 const bodyHeight=Number(item.bodyHeightM)>0?Number(item.bodyHeightM):/boiler|water-heater/.test(kind)?.75:/radiator/.test(kind)?(Number(item.radiatorHeightMm)||600)/1000:/tank|expansion/.test(kind)?.5:/washer|dishwasher/.test(kind)?.85:/bathtub/.test(kind)?.6:/toilet/.test(kind)?.75:/sink|basin|vanity/.test(kind)?.3:/shower/.test(kind)?2:Number(item.depth)||width;
 return {width:width*100,height:Math.max(.025,bodyHeight)*100};
}

export function engineeringElevationCenter(item){
 const floorStanding=/bathtub|washer|dishwasher|toilet|hydro-tank|shower/.test(item.kind||'');
 const bottom=floorStanding&&(item.heightDatum==='bottom'||!item.heightKnown||!(Number(item.height)>0));
 return (Number(item.height)||0)+(bottom?engineeringSymbolSize(item).height/200:0);
}
