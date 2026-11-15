import WindowConstruction from '../components/WindowConstruction.jsx';
import React from 'react';
import {sectionWidths,windowGeometry} from '../state/window-products.js';

const dim=value=>Math.round(Number(value)*100)/100;
const modeLabel={fixed:'Г',turn_left:'П',turn_right:'П',tilt:'О',tilt_turn_left:'ПО',tilt_turn_right:'ПО',bottom_hinged_transom:'Ф'};
export default function WindowDiagram({product,mark=product.mark,dimensions=true}) {
  const geometry=windowGeometry(product),vertices=geometry.vertices;
  const width=Number(product.widthMm||product.baseWidthMm)||1;
  const height=Math.max(Number(product.heightMm)||0,Number(product.leftHeightMm)||0,Number(product.rightHeightMm)||0,1);
  const scale=Math.min(330/width,250/height),x=52,y=35;
  const point=([px,py])=>`${x+px*scale},${y+(height-py)*scale}`;
  const widths=sectionWidths(product),boundaries=[],horizontal=product.sectionAxis==='horizontal';
  let cursor=0;
  for(const part of widths.slice(0,-1)){cursor+=part;boundaries.push(cursor);}
  return <svg className="eft-window-diagram" viewBox="0 0 440 390" role="img" aria-label={`Схема ${mark||'окна'}, вид изнутри`}>
    <text x="220" y="19" textAnchor="middle" className="window-svg-title">{mark||'Окно'} · вид изнутри</text>
    {vertices.length>=3?<>
      <g transform={`translate(${x} ${y+height*scale}) scale(${scale} ${-scale})`}><WindowConstruction product={product}/></g>
      {dimensions?<g className="window-svg-dimensions"><line x1={x} y1={y+height*scale+19} x2={x+width*scale} y2={y+height*scale+19}/><text x={x+width*scale/2} y={y+height*scale+35} textAnchor="middle">{dim(width)} мм</text><line x1={x-21} y1={y} x2={x-21} y2={y+height*scale}/><text x={x-26} y={y+height*scale/2} textAnchor="middle" transform={`rotate(-90 ${x-26} ${y+height*scale/2})`}>{product.shape==='trapezoid_sloped_top'?`${dim(product.leftHeightMm)} / ${dim(product.rightHeightMm)}`:dim(height)} мм</text>{widths.length>1?widths.map((part,i)=>horizontal?<text key={i} x={x+width*scale+13} y={y+(widths.slice(0,i).reduce((sum,value)=>sum+value,0)+part/2)*scale} textAnchor="start">{Math.round(part)}</text>:<text key={i} x={x+(widths.slice(0,i).reduce((sum,value)=>sum+value,0)+part/2)*scale} y={y+height*scale+50} textAnchor="middle">{Math.round(part)}</text>):null}</g>:null}
    </>:<text x="220" y="170" textAnchor="middle">Укажите размеры изделия</text>}
    <text x="220" y="377" textAnchor="middle" className="window-svg-foot">Схема для согласования · размеры заполнения и раскрой уточняет изготовитель</text>
  </svg>;
}
