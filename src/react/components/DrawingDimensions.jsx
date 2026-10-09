import { dimensionValues } from '../calculations/drawing-dimensions.js';
export default function DrawingDimensions({values,y,font,label,textRotation=0}) {
  const xs=dimensionValues(values);
  return <g fill="#000" stroke="#000" strokeWidth=".6">{xs.slice(1).map((b,i)=>{
    const a=xs[i],narrow=b-a<font*3,textY=y-font*(narrow?(i%2?1.4:2.7):.3);
    return <g key={`${a}:${b}`}><path d={`M${a},${y-font*.4}V${y+font*.4}M${a},${y}H${b}M${b},${y-font*.4}V${y+font*.4}`} vectorEffect="non-scaling-stroke"/>
      {narrow?<path d={`M${(a+b)/2},${y}V${textY+font*.2}`} vectorEffect="non-scaling-stroke"/>:null}
      <text x={(a+b)/2} y={textY} transform={textRotation?`rotate(${textRotation} ${(a+b)/2} ${textY})`:undefined} fontSize={font} stroke="#fff" strokeWidth={font*.15} paintOrder="stroke" textAnchor="middle">{b-a}</text></g>;
  })}{label&&xs.length>1?<text x={(xs[0]+xs.at(-1))/2} y={y+font*1.5} fontSize={font*.8} stroke="none" textAnchor="middle">{label}</text>:null}</g>;
}
