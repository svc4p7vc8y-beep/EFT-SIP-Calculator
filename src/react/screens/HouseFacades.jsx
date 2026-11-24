import {useMemo,useRef,useState} from 'react';
import {Camera,MousePointer2,Ruler,Undo2,Redo2,Trash2,Move} from 'lucide-react';
import {useProject} from '../state/ProjectContext.jsx';
import {productionScene} from '../calculations/production-scene.js';
import {FACADE_SIDES,facadeDimensionValue,projectHouseFacade} from '../calculations/house-elevations.js';
import {DrawingViewport} from './DrawingCanvas.jsx';
import './house-facades.css';

const fmt=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n);
const path=rings=>rings.map(r=>r.map(([x,z],i)=>`${i?'L':'M'}${x},${-z}`).join(' ')+'Z').join(' ');
function Dimension({d,font,onSelect,selected=false}){
 const a=[d.a[0],-d.a[1]],b=[d.b[0],-d.b[1]],offset=Number.isFinite(Number(d.distanceMm))?Number(d.distanceMm):font*2.2;
 let A,B;
 if(d.axis==='horizontal'){A=[a[0],Math.max(a[1],b[1])+offset];B=[b[0],A[1]];}
 else if(d.axis==='vertical'){A=[Math.max(a[0],b[0])+offset,a[1]];B=[A[0],b[1]];}
 else{const l=Math.hypot(b[0]-a[0],b[1]-a[1])||1,n=[-(b[1]-a[1])/l,(b[0]-a[0])/l];A=a.map((v,i)=>v+n[i]*offset);B=b.map((v,i)=>v+n[i]*offset);}
 const label=d.text?.trim()||fmt(facadeDimensionValue(d)),c=A.map((v,i)=>(v+B[i])/2);
 const color=selected?'#1864a2':d.automatic?'#384a43':'#246b98';
 return <g onClick={e=>{if(onSelect){e.stopPropagation();onSelect(d.id);}}} style={{cursor:onSelect?'pointer':undefined}} fill="none" stroke={color} strokeWidth={selected?2:1} vectorEffect="non-scaling-stroke">
  <path d={`M${a}L${A}M${b}L${B}M${A}L${B}`} vectorEffect="non-scaling-stroke"/>
  {[A,B].map((p,i)=><path key={i} d={`M${p[0]-font*.25},${p[1]+font*.25}l${font*.5},${-font*.5}`} vectorEffect="non-scaling-stroke"/>)}
  <text x={c[0]} y={c[1]-font*.25} textAnchor="middle" fill={color} stroke="white" strokeWidth={font*.18} paintOrder="stroke" fontFamily="Arial,sans-serif" fontSize={font}>{label} мм</text>
 </g>;
}

export default function HouseFacades({project,report,settings,update,pending}){
 const {undo,redo,canUndo,canRedo}=useProject();
 const [side,setSide]=useState('front'),[tool,setTool]=useState('select'),[axis,setAxis]=useState('horizontal');
 const [start,setStart]=useState(null),[cursor,setCursor]=useState(null),[selected,setSelected]=useState(null);
 const [zoom,setZoom]=useState(1),[offset,setOffset]=useState([0,0]),[automatic,setAutomatic]=useState(true),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const svg=useRef(null),down=useRef(null);
 const scene=useMemo(()=>productionScene(report,project,{includePlatforms:true}),[report,project]);
 const drawing=useMemo(()=>projectHouseFacade(scene,side),[scene,side]);
 const {bounds,faces,snapPoints}=drawing,size=Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ,1000),font=size*.018,pad=size*.2;
 const key=`facade:${side}`,dimensions=settings.drawingDimensions[key]||[],chosen=dimensions.find(d=>d.id===selected);
 const save=list=>update({drawingDimensions:{...settings.drawingDimensions,[key]:list}});
 const patch=value=>save(dimensions.map(d=>d.id===selected?{...d,...value}:d));
 const margin=Math.max(pad,...dimensions.map(d=>Math.min(10000,Math.abs(Number(d.distanceMm)||0))+font*3));
 const viewBox=[bounds.minX-margin,-bounds.maxZ-margin,bounds.maxX-bounds.minX+margin*2,bounds.maxZ-bounds.minZ+margin*2.5];
 const locate=e=>{
  const matrix=svg.current?.getScreenCTM();if(!matrix)return null;
  const point=svg.current.createSVGPoint();point.x=e.clientX;point.y=e.clientY;
  const q=point.matrixTransform(matrix.inverse()),raw=[q.x,-q.y],tolerance=12/Math.max(.001,Math.hypot(matrix.a,matrix.b));
  let best=null,bestDistance=tolerance;
  for(const point of snapPoints){const distance=Math.hypot(point[0]-raw[0],point[1]-raw[1]);if(distance<bestDistance){bestDistance=distance;best=point;}}
  return (best||raw).map(Math.round);
 };
 const pick=e=>{
  if(tool!=='dimension'||pending||!down.current||Math.hypot(e.clientX-down.current[0],e.clientY-down.current[1])>5)return;
  const point=locate(e);if(!point)return;
  if(!start){setStart(point);setCursor(point);return;}
  const d={id:crypto.randomUUID(),a:start,b:point,axis,distanceMm:font*2.2};
  if(facadeDimensionValue(d)<1){setNotice('Выберите вторую точку на расстоянии от первой.');return;}
  save([...dimensions,d]);setSelected(d.id);setStart(null);setCursor(null);setTool('select');setNotice('Размер сохранён в проекте. Его подпись и отступ можно изменить справа.');
 };
 const screenshot=async()=>{
  setBusy(true);setNotice('');let url;
  try{
   const clone=svg.current.cloneNode(true);clone.querySelectorAll('[data-draft]').forEach(n=>n.remove());
   const scale=Math.min(2400/viewBox[2],4096/viewBox[3]),width=Math.round(viewBox[2]*scale),height=Math.round(viewBox[3]*scale);
   clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width',String(width));clone.setAttribute('height',String(height));
   url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'}));
   const image=new Image();image.src=url;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Изображение не сформировано.');
   const link=document.createElement('a'),downloadUrl=URL.createObjectURL(blob);link.href=downloadUrl;link.download=`Фасад_${side}_${String(project.meta.projectNum||'ЭФТ').replace(/[^\p{L}\p{N}_-]/gu,'_')}.png`;document.body.appendChild(link);link.click();setTimeout(()=>{link.remove();URL.revokeObjectURL(downloadUrl);},60000);
   setNotice('Снимок фасада с размерами сохранён в PNG.');
  }catch(error){setNotice(`Не удалось сохранить снимок: ${error.message}`);}finally{if(url)URL.revokeObjectURL(url);setBusy(false);}
 };
 const autoDimensions=[{id:'width',automatic:true,axis:'horizontal',a:[bounds.minX,bounds.minZ],b:[bounds.maxX,bounds.minZ],distanceMm:font*3},{id:'height',automatic:true,axis:'vertical',a:[bounds.maxX,bounds.minZ],b:[bounds.maxX,bounds.maxZ],distanceMm:font*3}];
 return <section className="house-facades" aria-label="Фасады дома">
  <div className="facade-toolbar"><nav aria-label="Сторона фасада">{FACADE_SIDES.map(([id,label])=><button key={id} aria-pressed={side===id} onClick={()=>{setSide(id);setStart(null);setCursor(null);setSelected(null);setOffset([0,0]);setZoom(1);}}>{label}</button>)}</nav><label><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/>Габаритные размеры</label><button onClick={screenshot} disabled={pending||busy||!faces.length}><Camera size={17}/>{busy?'Сохраняю…':'Скриншот PNG'}</button></div>
  <div className="facade-workspace"><aside className="facade-tools" aria-label="Инструменты фасада">{[['select','Выбор',MousePointer2],['dimension','Размер',Ruler],['pan','Сдвиг',Move]].map(([id,label,Icon])=><button key={id} aria-pressed={tool===id} onClick={()=>{setTool(id);setStart(null);setCursor(null);}}><Icon size={19}/>{label}</button>)}<button aria-label="Отменить размер" onClick={undo} disabled={!canUndo||pending}><Undo2 size={19}/></button><button aria-label="Повторить размер" onClick={redo} disabled={!canRedo||pending}><Redo2 size={19}/></button></aside>
   <DrawingViewport zoom={zoom} onZoom={setZoom} pan={tool==='pan'} offset={offset} onOffset={setOffset}>
    <svg ref={svg} viewBox={viewBox.join(' ')} className="facade-drawing" role="img" aria-label={`Фасад ${FACADE_SIDES.find(([id])=>id===side)[1]}`} style={{cursor:tool==='dimension'?'crosshair':'default'}} onPointerDown={e=>{down.current=[e.clientX,e.clientY];}} onClick={pick} onPointerMove={e=>{if(tool==='dimension')setCursor(locate(e));}}>
     <rect x={viewBox[0]} y={viewBox[1]} width={viewBox[2]} height={viewBox[3]} fill="white"/>
     <text x={(bounds.minX+bounds.maxX)/2} y={-bounds.maxZ-pad*.5} textAnchor="middle" fontSize={font*1.35} fontFamily="Arial,sans-serif" fill="#263e34">Фасад · {FACADE_SIDES.find(([id])=>id===side)[1]} · № {project.meta.projectNum||'—'}</text>
     <g stroke="#68746b" strokeWidth="0.6" strokeLinejoin="round" fillRule="evenodd">{faces.map((face,i)=><path key={`${face.id}:${i}`} d={path(face.rings)} fill={face.fill} vectorEffect="non-scaling-stroke"/>)}</g>
     {automatic?autoDimensions.map(d=><Dimension key={d.id} d={d} font={font}/>):null}
     {dimensions.map(d=><Dimension key={d.id} d={d} font={font} selected={selected===d.id} onSelect={tool==='select'?setSelected:null}/>)}
     {tool==='dimension'&&cursor?<g data-draft="true"><circle cx={cursor[0]} cy={-cursor[1]} r={font*.3} fill="#2382ae"/>{start?<Dimension d={{a:start,b:cursor,axis}} font={font}/>:null}</g>:null}
    </svg>
   </DrawingViewport>
   <aside className="facade-inspector"><h3>{chosen?'Пользовательский размер':'Размеры фасада'}</h3><p>Габарит: {fmt(bounds.maxX-bounds.minX)} × {fmt(bounds.maxZ-bounds.minZ)} мм, включая видимые свесы, основание и террасы.</p><label>Направление размера<select aria-label="Направление размера" value={chosen?.axis||axis} onChange={e=>chosen?patch({axis:e.target.value}):setAxis(e.target.value)}><option value="horizontal">Горизонтальный</option><option value="vertical">Вертикальный</option><option value="aligned">Между точками</option></select></label>
    {chosen?<><p>Измерено: {fmt(facadeDimensionValue(chosen))} мм</p><label>Своя подпись размера<input aria-label="Своя подпись размера" maxLength={100} value={chosen.text||''} placeholder={fmt(facadeDimensionValue(chosen))} onChange={e=>patch({text:e.target.value})}/></label><label>Отступ размерной линии, мм<input aria-label="Отступ размерной линии, мм" type="number" min="-10000" max="10000" step="50" value={chosen.distanceMm??font*2.2} onChange={e=>patch({distanceMm:Number(e.target.value)})}/></label><button onClick={()=>{save(dimensions.filter(d=>d.id!==chosen.id));setSelected(null);}}><Trash2 size={17}/>Удалить размер</button><p>Подпись меняет только чертёж. Размеры дома и смета сохраняются.</p></>:<p>Выберите «Размер», затем две точки на фасаде. Точки привязываются к углам модели. Колесо — масштаб, средняя кнопка или «Сдвиг» — перемещение.</p>}
    <div className="facade-dimension-list">{dimensions.map((d,i)=><button key={d.id} aria-pressed={selected===d.id} onClick={()=>{setSelected(d.id);setTool('select');}}>Размер {i+1} · {d.text||fmt(facadeDimensionValue(d))} мм</button>)}</div>
   </aside>
  </div>{notice?<p role="status">{notice}</p>:null}{pending?<p role="status">Фасады обновляются по модели…</p>:null}
 </section>;
}
