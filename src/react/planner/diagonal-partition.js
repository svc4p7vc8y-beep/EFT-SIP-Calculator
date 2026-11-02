export const MAX_DIAGONAL_PARTITION_M=3;

export function limitDiagonalPartition(start,end) {
  const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
  if(Math.abs(dx)<.001||Math.abs(dy)<.001||length<=MAX_DIAGONAL_PARTITION_M)return {...end};
  const scale=MAX_DIAGONAL_PARTITION_M/length;
  // Round towards the anchor so the saved millimetres cannot exceed 3000 mm.
  return {x:Math.round((start.x+Math.trunc(dx*scale*1000)/1000)*1000)/1000,y:Math.round((start.y+Math.trunc(dy*scale*1000)/1000)*1000)/1000};
}
