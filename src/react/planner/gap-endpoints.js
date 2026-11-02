export function gapEndpoints(gap) {
  const half=Number(gap.width)/2;
  return gap.orientation==='v'
    ?[{x:Number(gap.x),y:Number(gap.y)-half},{x:Number(gap.x),y:Number(gap.y)+half}]
    :[{x:Number(gap.x)-half,y:Number(gap.y)},{x:Number(gap.x)+half,y:Number(gap.y)}];
}
