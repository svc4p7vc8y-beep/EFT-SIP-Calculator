import { dimensionValues } from '../calculations/drawing-dimensions.js';
import DrawingAnnotation from './DrawingAnnotation.jsx';
export default function DrawingDimensions({values,y,font,label,textRotation=0,spreadLabels=false,annotationId='',offsets={},onAnnotationMove}) {
  const xs=dimensionValues(values);
  const labels=xs.slice(1).map((b,i)=>(xs[i]+b)/2),gap=font*1.25;
  if(spreadLabels&&labels.length){for(let i=1;i<labels.length;i++)labels[i]=Math.max(labels[i],labels[i-1]+gap);const overflow=Math.max(0,labels.at(-1)-xs.at(-1)+gap/2);for(let i=0;i<labels.length;i++)labels[i]-=overflow;}
  return <g fill="#000" stroke="#000" strokeWidth=".6">{xs.slice(1).map((b,i)=>{
    const a=xs[i],narrow=b-a<font*3,textY=spreadLabels?y-font*.7:y-font*(narrow?(i%2?1.4:2.7):.3),textX=spreadLabels?labels[i]:(a+b)/2;
    return <g key={`${a}:${b}`}><path d={`M${a},${y-font*.4}V${y+font*.4}M${a},${y}H${b}M${b},${y-font*.4}V${y+font*.4}`} vectorEffect="non-scaling-stroke"/>
      {narrow||spreadLabels?<path d={`M${(a+b)/2},${y}L${textX},${textY+font*.2}`} vectorEffect="non-scaling-stroke"/>:null}
      <DrawingAnnotation id={`${annotationId}:${i}`} offset={offsets[`${annotationId}:${i}`]} onMove={onAnnotationMove} x={textX} y={textY} transform={textRotation?`rotate(${textRotation} ${textX} ${textY})`:undefined} fontSize={font} stroke="#fff" strokeWidth={font*.15} paintOrder="stroke" textAnchor="middle">{b-a}</DrawingAnnotation></g>;
  })}{label&&xs.length>1?<text x={(xs[0]+xs.at(-1))/2} y={y+font*1.5} fontSize={font*.8} stroke="none" textAnchor="middle">{label}</text>:null}</g>;
}
