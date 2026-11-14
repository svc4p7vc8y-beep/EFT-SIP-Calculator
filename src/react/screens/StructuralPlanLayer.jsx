import {useMemo} from 'react';
import {calculateProject} from '../calculations/estimate-engine.js';
import {calculateProductionCutting} from '../calculations/production-cutting.js';
import {productionScene} from '../calculations/production-scene.js';
import {structuralStuds} from '../calculations/structural-frame.js';

export default function StructuralPlanLayer({project,floor,p,onOpen}){
  const report=useMemo(()=>calculateProductionCutting(project,calculateProject(project)),[project]);
  const scene=useMemo(()=>productionScene(report,project),[report,project]);
  const walls=report.surfaces.filter(s=>s.floor===floor&&s.planStart);
  const xy=point=>{const q=p(point[0]/1000,point[1]/1000);return `${q.x},${q.y}`;};
  const toWorld=(place,x,y)=>place.origin.map((v,i)=>v+place.u[i]*x+place.normal[i]*y);
  return <g className="structural-plan-layer" aria-label="Силовой каркас: выберите стену" onPointerDown={e=>e.stopPropagation()}>
    {walls.map(w=>{const place=scene.placements.get(w.id);if(!place)return null;const depth=Number(w.thickness)||150;
      return <g key={w.id} role="button" tabIndex={0} aria-label={`Каркас · ${w.name}`} onClick={e=>{e.stopPropagation();onOpen(w.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen(w.id);}}}>
        <line x1={p(w.planStart[0]/1000,w.planStart[1]/1000).x} y1={p(w.planStart[0]/1000,w.planStart[1]/1000).y} x2={p(w.planEnd[0]/1000,w.planEnd[1]/1000).x} y2={p(w.planEnd[0]/1000,w.planEnd[1]/1000).y} stroke="#e8d9b8" strokeWidth={Math.max(10,Math.abs(p(depth/1000,0).x-p(0,0).x))}/>
        {structuralStuds(report,w).map(m=>{const x=m.a[0],half=(Number(m.faceWidth)||Number(m.profile.split(/[×xх]/)[0])||50)/2;return <polygon key={m.id} points={[[x-half,-depth/2],[x+half,-depth/2],[x+half,depth/2],[x-half,depth/2]].map(([a,b])=>xy(toWorld(place,a,b))).join(' ')} fill="#b78941" stroke="#70572e" strokeWidth=".8"><title>{m.id} · {m.profile} мм</title></polygon>;})}
        {(w.openings||[]).filter(o=>!o.gap).map(o=><polygon key={o.id} points={[[o.x,-depth/2],[o.x+o.width,-depth/2],[o.x+o.width,depth/2],[o.x,depth/2]].map(([a,b])=>xy(toWorld(place,a,b))).join(' ')} fill={o.type==='door'?'#dcc4a1':'#d9eff3'} stroke={o.type==='door'?'#9e7546':'#438895'} strokeWidth="1.5"><title>{o.type==='door'?'Дверь':'Окно'} · открыть стену</title></polygon>)}
        <title>{w.name} · открыть развёртку каркаса</title>
      </g>;
    })}
    {project.settings.productionCutting.roofSupports.filter(s=>s.type==='post'&&(s.frameFloor===floor||!s.frameFloor&&floor===report.assembly.floors.length)).map(s=>{const q=p(s.x1/1000,s.y1/1000);return <rect key={s.id} x={q.x-5} y={q.y-5} width="10" height="10" fill="#4c873b" stroke="white" role="button" tabIndex={0} aria-label={s.name} onClick={()=>onOpen(s.frameWallId||walls.find(w=>w.id===s.facadeId)?.id||walls[0]?.id)}><title>{s.name} · {s.profile} мм · опора крыши</title></rect>;})}
  </g>;
}
