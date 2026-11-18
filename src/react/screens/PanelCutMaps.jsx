import {useId} from 'react';
import {panelCutMapPages,compactStockIds} from '../calculations/panel-cut-maps.js';
import {productionFamily} from '../calculations/production-assembly.js';
import './panel-cut-maps.css';
const num=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n),area=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(n);
const colors=['#edd5e8','#f5e7b5','#d8edf5','#e4edb9','#dce0f4','#d6ebe2'];
const color=mark=>colors[[...String(mark)].reduce((s,c)=>s+c.charCodeAt(0),0)%colors.length];
export function PanelCutMap({map,onSelect,selected=[]}){
 const uid=useId().replace(/:/g,''),{sheet}=map,W=sheet.height,H=sheet.width,scale=Math.min(310/W,150/H),X=60,Y=75;
 const point=([x,y])=>[X+y*scale,Y+(sheet.width-x)*scale];
 const path=shape=>shape.map(r=>r.map((p,i)=>`${i?'L':'M'}${point(p).join(',')}`).join(' ')+'Z').join(' ');
 const dimension=(a,b,offset,vertical=false,key='')=>{
  const [x1,y1]=a,[x2,y2]=b,dx=vertical?offset:0,dy=vertical?0:offset;
  const length=Math.hypot(x2-x1,y2-y1)/scale;
  return <g key={key} className="cut-map-dim"><path d={`M${x1},${y1}L${x1+dx},${y1+dy}M${x2},${y2}L${x2+dx},${y2+dy}M${x1+dx},${y1+dy}L${x2+dx},${y2+dy}`}/>{[[x1+dx,y1+dy],[x2+dx,y2+dy]].map(([x,y],i)=><path key={i} d={`M${x-3},${y+3}l6,-6`}/>)}{length>=80?<text x={(x1+x2)/2+dx+(vertical?-6:0)} y={(y1+y2)/2+dy+(vertical?0:-5)} textAnchor="middle" transform={vertical?`rotate(-90 ${(x1+x2)/2+dx-6} ${(y1+y2)/2+dy})`:undefined}>{num(length)}</text>:null}</g>;
 };
 const cuts=[...new Set([0,sheet.width,...sheet.parts.flatMap(p=>[p.x,p.x+p.width])])].sort((a,b)=>a-b);
 return <article className="panel-cut-map"><header><strong>Карта {map.id}</strong><b>{map.qty} шт.</b></header><p className="cut-map-sheet-ids">Заготовки: {compactStockIds(map.ids)}</p>
  <svg viewBox="0 0 420 290" role="img" aria-label={`Карта ${map.id}: ${sheet.height} на ${sheet.width} мм, ${map.qty} заготовок`}>
   <defs><pattern id={`waste-${uid}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="5" height="5" fill="#f0f3f5"/><line x1="0" y1="0" x2="0" y2="5" stroke="#b8c5ce" strokeWidth="1"/></pattern></defs>
   <rect x={X} y={Y} width={W*scale} height={H*scale} fill={`url(#waste-${uid})`} stroke="#264453"/>
   {sheet.parts.map((p,i)=>{const label=point([p.x+p.width/2,p.y+p.height/2]),small=p.width*scale<24,font=Math.max(7,Math.min(13,p.width*scale*.32));return <g key={p.id} role={onSelect?'button':undefined} tabIndex={onSelect?0:undefined} aria-label={`Деталь ${p.displayMark} в карте ${map.id}`} onClick={()=>onSelect?.(p.id)} onKeyDown={e=>{if(onSelect&&['Enter',' '].includes(e.key)){e.preventDefault();onSelect(p.id);}}}>
    <path d={path(p.shape)} fill={selected.includes(p.id)?'#abd18b':color(p.displayMark)} fillRule="evenodd" stroke="#264453" strokeWidth=".8"/>
    <text x={label[0]} y={label[1]-(small?0:4)} textAnchor="middle" fontSize={font} fill="#243d4c"><tspan fontWeight="700">{p.displayMark}</tspan>{small?<tspan> · {num(p.height)}×{num(p.width)}</tspan>:<tspan x={label[0]} dy="15" fontSize={Math.min(11,font)}>{num(p.height)}×{num(p.width)}{p.rotated?' · ↻':''}</tspan>}</text>
   </g>;})}
   {dimension([X,Y],[X+W*scale,Y],-38)}{dimension([X,Y],[X,Y+H*scale],-38,true)}
   {cuts.length>2?cuts.slice(1).map((end,i)=>{const a=point([cuts[i],0]),b=point([end,0]);return dimension(a,b,-16,true,`cut-${i}`);}):null}
   {sheet.parts.filter(p=>p.height<sheet.height-.5).map((p,i)=>{const a=point([p.x+p.width,p.y]),b=point([p.x+p.width,p.y+p.height]);return dimension(a,b,-15,false,`length-${i}`);})}
  </svg><footer>{map.wasteM2<.0005?'Без остатка':`Остаток с одной: ${area(map.wasteM2)} м²`}</footer>
 </article>;
}
export function PanelCutMapPage({page,report,projectName=''}){const s=page.format;return <div className="panel-cut-map-page"><header className="panel-cut-page-heading"><div><h2>Раскрой СИП-панелей {num(s.height)}×{num(s.width)} мм</h2><p>{projectName?`${projectName} · `:''}{report.revision} · {productionFamily(s.family)} · {page.mapCount} уникальных карт · остаток {area(page.wasteM2)} м²</p></div><div><strong>{page.qty} заготовок / {page.parts} деталей</strong><p>Толщина СИП-панелей — {s.thickness} мм</p></div></header><div className="panel-cut-page-grid">{page.maps.map(map=><PanelCutMap key={map.id} map={map}/>)}</div><footer className="panel-cut-page-footer"><span>Размеры в мм, округлены до 1 мм. Пропил {report.settings.kerfMm||0} мм. Штриховка — остаток.<br/>Фигурные кромки показаны по геометрии деталей. Порядок резов не назначен.</span><span>Лист {page.page} из {page.pageCount}</span></footer></div>;}
export default function PanelCutMaps({report,onSelect,selected=[]}){const pages=panelCutMapPages(report);return pages.length?<div className="panel-cut-screen">{pages.map((page,i)=><div key={i}><h3>{productionFamily(page.format.family)} · {page.format.thickness} мм · {page.format.height}×{page.format.width} мм</h3><div className="panel-cut-screen-grid">{page.maps.map(map=><PanelCutMap key={map.id} map={map} onSelect={onSelect} selected={selected}/>)}</div></div>)}</div>:<p>Нет размещённых заготовок панелей.</p>;}
