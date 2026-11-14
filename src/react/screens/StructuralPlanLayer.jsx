import {sectionWidths} from '../state/window-products.js';
import {useMemo,useRef,useState,useEffect} from 'react';
import {calculateProject} from '../calculations/estimate-engine.js';
import {calculateProductionCutting} from '../calculations/production-cutting.js';
import {productionScene} from '../calculations/production-scene.js';
import {useProject} from '../state/ProjectContext.jsx';
import {moveFrameSelection,structuralStuds} from '../calculations/structural-frame.js';

export default function StructuralPlanLayer({project,floor,p,onOpen,selected,onSelect,onMessage}){
  const {commit}=useProject(),drag=useRef(null),[preview,setPreview]=useState(null),skip=useRef(false);
  const report=useMemo(()=>calculateProductionCutting(project,calculateProject(project)),[project]);
  const scene=useMemo(()=>productionScene(report,project),[report,project]);
  const walls=report.surfaces.filter(s=>s.floor===floor&&s.planStart);
  const move=(choice,delta)=>{try{const next=moveFrameSelection(structuredClone(project),choice,delta,report);commit(()=>next);onMessage?.('Стойка перемещена. Проверьте рабочие узлы и примыкания.');}catch(e){onMessage?.(e.message);}};
  const choice=(kind,id,wall,member)=>({kind,id,wall,member});
  const current=selected?.kind==='member'?report.members.find(m=>m.id===selected.id):null;
  const selectedWall=walls.find(w=>w.id===selected?.wallId);
  useEffect(()=>{const key=e=>{if(!selectedWall||!selected||e.defaultPrevented||e.target?.closest?.('input,textarea,select,[role=dialog]')||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopImmediatePropagation();move(choice(selected.kind,selected.id,selectedWall,current),(e.key==='ArrowRight'?1:-1)*(e.shiftKey?100:10));};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});
  const start=(e,kind,id,w,m)=>{e.stopPropagation();if(selected?.id!==id){onSelect?.({kind,id,wallId:w.id});return;}e.preventDefault();const matrix=e.currentTarget.ownerSVGElement.getScreenCTM();if(!matrix)return;const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());drag.current={choice:choice(kind,id,w,m),matrix:matrix.inverse(),x:q.x,y:q.y};e.currentTarget.setPointerCapture(e.pointerId);};
  const moving=e=>{const v=drag.current;if(!v)return;e.stopPropagation();const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(v.matrix),w=v.choice.wall,a=p(w.planStart[0]/1000,w.planStart[1]/1000),b=p(w.planEnd[0]/1000,w.planEnd[1]/1000),delta=Math.round(((q.x-v.x)*(b.x-a.x)+(q.y-v.y)*(b.y-a.y))/Math.max(.001,(b.x-a.x)**2+(b.y-a.y)**2)*w.width/5)*5;v.delta=delta;setPreview({id:v.choice.id,dx:(b.x-a.x)*delta/w.width,dy:(b.y-a.y)*delta/w.width});};
  const end=e=>{const v=drag.current;if(!v)return;e.stopPropagation();drag.current=null;setPreview(null);if(v.delta){move(v.choice,v.delta);skip.current=true;}};
  const props=(kind,id,w,m)=>({role:'button',tabIndex:0,'aria-label':`Стойка ${id}`,onPointerDown:e=>start(e,kind,id,w,m),onPointerMove:moving,onPointerUp:end,onPointerCancel:()=>{drag.current=null;setPreview(null);},onClick:e=>{e.stopPropagation();if(skip.current){skip.current=false;return;}onSelect?.({kind,id,wallId:w.id});},transform:preview?.id===id?`translate(${preview.dx} ${preview.dy})`:undefined});
  const xy=point=>{const q=p(point[0]/1000,point[1]/1000);return `${q.x},${q.y}`;};
  const toWorld=(place,x,y)=>place.origin.map((v,i)=>v+place.u[i]*x+place.normal[i]*y);
  return <g className="structural-plan-layer" aria-label="Силовой каркас: выберите стену" onPointerDown={e=>e.stopPropagation()}>
    {walls.map(w=>{const place=scene.placements.get(w.id);if(!place)return null;const depth=Number(w.thickness)||150;
      return <g key={w.id} role="button" tabIndex={0} aria-label={`Каркас · ${w.name}`} onClick={e=>{e.stopPropagation();onOpen(w.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen(w.id);}}}>
        <line x1={p(w.planStart[0]/1000,w.planStart[1]/1000).x} y1={p(w.planStart[0]/1000,w.planStart[1]/1000).y} x2={p(w.planEnd[0]/1000,w.planEnd[1]/1000).x} y2={p(w.planEnd[0]/1000,w.planEnd[1]/1000).y} stroke="#e8d9b8" strokeWidth={Math.max(10,Math.abs(p(depth/1000,0).x-p(0,0).x))}/>
        {structuralStuds(report,w).map(m=>{const x=m.a[0],half=(Number(m.faceWidth)||Number(m.profile.split(/[×xх]/)[0])||50)/2;return <polygon key={m.id} {...props('member',m.id,w,m)} points={[[x-half,-depth/2],[x+half,-depth/2],[x+half,depth/2],[x-half,depth/2]].map(([a,b])=>xy(toWorld(place,a,b))).join(' ')} fill={selected?.id===m.id?'#5a9b3d':'#b78941'} stroke="#70572e" strokeWidth=".8"><title>{m.id} · {m.profile} мм</title></polygon>;})}
        {(w.openings||[]).filter(o=>!o.gap).map(o=>{const product=o.windowProduct;let cursor=0;return <g key={o.id}><polygon points={[[o.x,-depth/2],[o.x+o.width,-depth/2],[o.x+o.width,depth/2],[o.x,depth/2]].map(([a,b])=>xy(toWorld(place,a,b))).join(' ')} fill={o.type==='door'?'#dcc4a1':'#d9eff3'} stroke={o.type==='door'?'#9e7546':'#438895'} strokeWidth="1.5"><title>{o.type==='door'?'Дверь':'Окно'} · открыть стену</title></polygon>{product&&product.sectionAxis!=='horizontal'?sectionWidths(product).slice(0,-1).map((size,i)=>{cursor+=size;const station=o.x+cursor/(product.widthMm||o.width)*o.width,A=p(toWorld(place,station,-depth/2)[0]/1000,toWorld(place,station,-depth/2)[1]/1000),B=p(toWorld(place,station,depth/2)[0]/1000,toWorld(place,station,depth/2)[1]/1000);return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#438895" strokeWidth="1.5"/>;}):null}</g>;})}
        <title>{w.name} · открыть развёртку каркаса</title>
      </g>;
    })}
    {project.settings.productionCutting.roofSupports.filter(s=>s.type==='post'&&(s.frameFloor===floor||!s.frameFloor&&floor===report.assembly.floors.length)).map(s=>{const q=p(s.x1/1000,s.y1/1000),plan=floor===1?project.plan:project.upperFloors[floor-2],wall=walls.find(w=>w.id===(s.frameWallId||plan.facades?.find(f=>f.id===s.facadeId)?.wallId));if(!wall)return <rect key={s.id} x={q.x-5} y={q.y-5} width="10" height="10" fill="#4c873b"><title>{s.name} · опора крыши</title></rect>;return <rect key={s.id} {...props('post',s.id,wall)} x={q.x-6} y={q.y-6} width="12" height="12" fill={selected?.id===s.id?'#1472b2':'#4c873b'} stroke="white"><title>{s.name} · {s.profile} мм · выберите и переместите</title></rect>;})}
  </g>;
}
