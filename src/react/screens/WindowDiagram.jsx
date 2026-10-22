import React from 'react';
import {sectionWidths,windowGeometry} from '../state/window-products.js';

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
      <polygon points={vertices.map(point).join(' ')} fill="#a9edeb" stroke="#244d57" strokeWidth="7" strokeLinejoin="round"/>
      <polygon points={vertices.map(point).join(' ')} fill="none" stroke="#f8fbf9" strokeWidth="3" strokeLinejoin="round" transform={`translate(0 0)`}/>
      {boundaries.map((b,i)=>horizontal?<line key={i} x1={x} x2={x+width*scale} y1={y+b*scale} y2={y+b*scale} stroke="#244d57" strokeWidth="6"/>:<line key={i} x1={x+b*scale} x2={x+b*scale} y1={y} y2={y+height*scale} stroke="#244d57" strokeWidth="6"/>)}
      {product.shape==='rectangle'?product.sections.map((section,i)=>{
        const start=widths.slice(0,i).reduce((a,b)=>a+b,0),part=widths[i],left=horizontal?x:x+start*scale,right=horizontal?x+width*scale:x+(start+part)*scale,top=horizontal?y+start*scale:y,bottom=horizontal?y+(start+part)*scale:y+height*scale;
        const mode=section.openingMode||'fixed';
        const diagonal=mode==='fixed'?null:mode==='tilt'||mode==='bottom_hinged_transom'?<path d={`M ${left+7} ${top+7} L ${(left+right)/2} ${bottom-7} L ${right-7} ${top+7}`} />:mode.endsWith('_left')?<path d={`M ${right-7} ${top+7} L ${left+7} ${(top+bottom)/2} L ${right-7} ${bottom-7}`}/>:<path d={`M ${left+7} ${top+7} L ${right-7} ${(top+bottom)/2} L ${left+7} ${bottom-7}`}/>;
        return <g key={section.id||i} className="window-opening-mark">{diagonal}<text x={(left+right)/2} y={bottom-15} textAnchor="middle">{modeLabel[mode]||''}</text>{mode!=='fixed'?<circle cx={section.handleSide==='right'?right-13:left+13} cy={(top+bottom)/2} r="3"/>:null}</g>;
      }):<text x={x+width*scale/2} y={y+height*scale*.72} textAnchor="middle" className="window-svg-check">Нестандартная форма · проверить изготовителя</text>}
      {dimensions?<g className="window-svg-dimensions"><line x1={x} y1={y+height*scale+19} x2={x+width*scale} y2={y+height*scale+19}/><text x={x+width*scale/2} y={y+height*scale+35} textAnchor="middle">{width} мм</text><line x1={x-21} y1={y} x2={x-21} y2={y+height*scale}/><text x={x-26} y={y+height*scale/2} textAnchor="middle" transform={`rotate(-90 ${x-26} ${y+height*scale/2})`}>{product.shape==='trapezoid_sloped_top'?`${product.leftHeightMm} / ${product.rightHeightMm}`:height} мм</text>{widths.length>1?widths.map((part,i)=>horizontal?<text key={i} x={x+width*scale+13} y={y+(widths.slice(0,i).reduce((sum,value)=>sum+value,0)+part/2)*scale} textAnchor="start">{Math.round(part)}</text>:<text key={i} x={x+(widths.slice(0,i).reduce((sum,value)=>sum+value,0)+part/2)*scale} y={y+height*scale+50} textAnchor="middle">{Math.round(part)}</text>):null}</g>:null}
    </>:<text x="220" y="170" textAnchor="middle">Укажите размеры изделия</text>}
    <text x="220" y="377" textAnchor="middle" className="window-svg-foot">Схема для согласования · размеры заполнения и раскрой уточняет изготовитель</text>
  </svg>;
}
