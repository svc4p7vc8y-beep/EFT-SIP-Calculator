// Exact clear bays; at most the last two bays shorten. Opening/corner anchors stay fixed.
export function clearGapPositions(start,end,thickness,gap=590) {
  if(![start,end,thickness,gap].every(Number.isFinite)||end<start||thickness<=0||gap<=0)throw new Error('Проверьте просвет и сечение каркаса.');
  const step=gap+thickness,result=[start];
  for(let x=start+step;x<end-.01;x+=step)result.push(x);
  if(result.length>1&&end-result.at(-1)<thickness)result[result.length-1]=end-thickness;
  if(end-start>.01)result.push(end);
  return result;
}
