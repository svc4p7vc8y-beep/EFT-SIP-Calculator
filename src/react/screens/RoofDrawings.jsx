import { roofAxonometricLines } from '../calculations/roof-drawings.js';
import { structuralDimensions, bearingPlanWidth, checkDiagonals } from '../calculations/drawing-dimensions.js';
import { productionMark } from '../calculations/production-assembly.js';
import Dimensions from '../components/DrawingDimensions.jsx';

const round=n=>Math.round(n);
const pts=list=>list.map(p=>p.join(',')).join(' ');
function Member({a,b,profile,label,font,dashed=false,width}) {
  const depth=width??(Number(String(profile).split(/[×xх]/)[0])||50);
  return <g><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={dashed?'#333':'#b58b52'} strokeWidth={dashed?2:depth} strokeDasharray={dashed?'7 4':undefined} vectorEffect={dashed?'non-scaling-stroke':undefined}/>{!dashed?<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#000" strokeWidth=".6" vectorEffect="non-scaling-stroke"/>:null}{label?<text x={(a[0]+b[0])/2} y={(a[1]+b[1])/2-font*.5} fontSize={font} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={font*.18}>{label}</text>:null}</g>;
}

export function StructuralPlan({assembly,kind='roof',selected=[],onSelect,layers={}}) {
  const binding=kind==='binding',floor=binding?assembly.floors[0]:assembly.floors.at(-1);
  const items=binding?assembly.binding:assembly.rafters;
  const all=[...floor.contour,...(!binding?assembly.roofOutline:[]),...items.flatMap(s=>[s.a,s.b]),...(binding?assembly.piles:assembly.supports.flatMap(s=>[s.a,s.b]))];
  const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,size=Math.max(w,h,1000),pad=size*.17,font=size*.021;
  const dimensions=structuralDimensions(assembly,binding),house=dimensions.house,roof=dimensions.roof;
  const bearings=floor.bearing||[],diagonals=binding?checkDiagonals(assembly):[];
  const profiles=new Map();bearings.forEach((s,i)=>{const key=s.profile||'сечение по проекту';profiles.set(key,[...(profiles.get(key)||[]),i+1]);});
  const ranges=indices=>{const values=[];for(let i=0;i<indices.length;i++){const first=indices[i];let last=first;while(indices[i+1]===last+1)last=indices[++i];values.push(first===last?`НС${first}`:`НС${first}–НС${last}`);}return values.join(', ');};
  const legend=[...(binding?['Несущие стены показаны фоном; их сечения — на листах перегородок.']:Array.from(profiles,([profile,indices])=>`${ranges(indices)}: ${profile}`)),...diagonals.map((d,i)=>`Д${i+1}: ${Math.round(d.length)} мм · ${d.kind}`)];
  const legendRows=[];for(const entry of legend){const words=entry.split(' ');let row='';for(const word of words){if(row.length+word.length>85){legendRows.push(row);row='';}row+=(row?' ':'')+word;}if(row)legendRows.push(row);}
  return <svg className="roof-document-drawing" viewBox={`${x-pad*1.25} ${y-pad*.3} ${w+pad*2.5} ${h+pad*(2.25+legendRows.length*.19)}`} role="img" aria-label={binding?'Чертёж обвязки с осями опор':'План стропильной системы с привязками'}>
    {!binding?<polygon points={pts(assembly.roofOutline)} fill="#fafafa" stroke="#000" strokeDasharray="6 4" vectorEffect="non-scaling-stroke"/>:null}
    <polygon points={pts(floor.contour)} fill="none" stroke="#777" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
    {floor.rooms.map((r,i)=><polygon key={i} points={pts(r.points)} fill="none" stroke="#ccc" strokeWidth=".5" vectorEffect="non-scaling-stroke"/>)}
    {bearings.map((s,i)=><g key={i}><Member {...s} width={bearingPlanWidth(s.profile)??50} label={binding||layers.labels===false?'':`НС${i+1}`} font={font*.65}/><title>НС{i+1} · Несущая · {s.profile||'сечение не задано'}</title></g>)}
    {layers.frame!==false?items.map(s=><g key={s.id} role={onSelect?'button':undefined} tabIndex={onSelect?0:undefined} aria-label={`Выбрать ${s.id}`} onClick={()=>onSelect?.(s.id)} onKeyDown={e=>{if(e.key==='Enter')onSelect?.(s.id);}}><Member {...s} label={layers.labels===false?'':binding?s.id:productionMark(s)} font={font}/><line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={selected.includes(s.id)?'#10734c':'transparent'} strokeWidth={selected.includes(s.id)?4:14} vectorEffect="non-scaling-stroke"/></g>):null}
    {!binding?(assembly.roofTimbers||[]).filter(s=>s.id!=='КР-КН2').map(s=><Member key={s.id} {...s} label={productionMark(s)} font={font}/>):null}
    {binding?assembly.piles.map((p,i)=>{const block=assembly.foundationType==='concreteBlock',width=block&&Number(assembly.blockDimensions?.widthMm)>0?Number(assembly.blockDimensions.widthMm):font*.7,length=block&&Number(assembly.blockDimensions?.lengthMm)>0?Number(assembly.blockDimensions.lengthMm):font*.7;return <g key={i}><rect x={p[0]-width/2} y={p[1]-length/2} width={width} height={length} fill="white" stroke="#000" strokeWidth=".6" vectorEffect="non-scaling-stroke"/><text x={p[0]+width/2+font*.3} y={p[1]+font} fontSize={font*.75}>{block?'БЛ':'СВ'}{i+1}</text></g>;}):assembly.supports.map(s=><Member key={s.id} {...s} label={s.mark} font={font} dashed/>)}
    {binding&&layers.dimensions!==false?diagonals.map(({a,b,length},i)=>{const t=.3+i*.2;return <g key={i}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#555" strokeWidth=".5" strokeDasharray="5 3" vectorEffect="non-scaling-stroke"/><text x={a[0]+(b[0]-a[0])*t} y={a[1]+(b[1]-a[1])*t-font*.4} fontSize={font*.65} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={font*.2}>Д{i+1}</text><title>Д{i+1}: {Math.round(length)} мм</title></g>;}):null}
    {(()=>{const p=binding?assembly.piles[0]:assembly.rafters[0]?.a;if(!p)return null;return <g><circle cx={p[0]+font*2} cy={p[1]+font*2} r={font} fill="#fff" stroke="#000" strokeWidth=".6" vectorEffect="non-scaling-stroke"/><line x1={p[0]} y1={p[1]} x2={p[0]+font} y2={p[1]+font} stroke="#000" strokeWidth=".5" vectorEffect="non-scaling-stroke"/><text x={p[0]+font*2} y={p[1]+font*2.3} fontSize={font*.8} textAnchor="middle">{binding?'Н1':'Н4'}</text></g>;})()}
    {layers.dimensions!==false?<><Dimensions values={dimensions.x} y={y+h+pad*.45} font={font}/><Dimensions values={[house.x,house.x+house.width]} y={y+h+pad*.95} font={font*1.2} label="Габарит дома"/>
    {!binding?<Dimensions values={[roof.x,roof.x+roof.width]} y={y+h+pad*1.45} font={font} label="Габарит кровли со свесами"/>:null}
    <g transform="rotate(90)"><Dimensions values={dimensions.y} y={-x+pad*.45} font={font}/><Dimensions values={[house.y,house.y+house.height]} y={-x+pad*.9} font={font*1.2}/>{!binding?<Dimensions values={[roof.y,roof.y+roof.height]} y={-x+pad*1.15} font={font}/>:null}</g></>:null}
    {layers.labels!==false?legendRows.map((row,i)=><text key={i} x={x} y={y+h+pad*(1.8+i*.19)} fontSize={font*.6}>{row}</text>):null}
  </svg>;
}

export function RoofSection({assembly}) {
  const d=assembly.roofDrawing;if(!d?.sections.length)return <p>Автоматический разрез для этой формы не сформирован. Добавьте индивидуальные элементы по проекту.</p>;
  const points=d.sections.flatMap(s=>[s.a,s.b]);const x=Math.min(0,...points.map(p=>p[0])),right=Math.max(d.span,...points.map(p=>p[0])),low=Math.min(0,...points.map(p=>p[1])),high=Math.max(0,...points.map(p=>p[1]));
  const size=Math.max(right-x,high-low,1000),pad=size*.18,font=size*.025;
  return <svg className="roof-document-drawing roof-section" viewBox={`${x-pad} ${-high-pad*.7} ${right-x+pad*2} ${high-low+pad*2.5}`} role="img" aria-label="Поперечный профиль крыши">
    <line x1={0} y1={0} x2={d.span} y2={0} stroke="#777" strokeDasharray="8 4" vectorEffect="non-scaling-stroke"/>
    {d.sections.map(s=>{let angle=Math.atan2(s.a[1]-s.b[1],s.b[0]-s.a[0])*180/Math.PI;if(angle>90)angle-=180;if(angle<-90)angle+=180;return <g key={s.name}><Member a={[s.a[0],-s.a[1]]} b={[s.b[0],-s.b[1]]} profile={s.profile} font={font}/><g transform={`translate(${(s.a[0]+s.b[0])/2} ${-(s.a[1]+s.b[1])/2}) rotate(${angle})`}><text y={-font*1.5} fontSize={font} textAnchor="middle">{s.name} · {s.angle.toFixed(1)}°</text><text y={-font*.45} fontSize={font*.8} textAnchor="middle">{s.profile} · L={s.length}</text></g>{[s.a,s.b].map((p,i)=><text key={i} x={p[0]} y={-p[1]+font*1.8} textAnchor="middle" fontSize={font*.8}>отм. {round(p[1])}</text>)}</g>;})}
    {[0,d.span].map(v=><line key={v} x1={v} y1={-high-pad*.25} x2={v} y2={-low+pad*.6} stroke="#777" strokeDasharray="5 4" vectorEffect="non-scaling-stroke"/>)}
    <Dimensions values={[x,0,d.span,right,...points.map(p=>p[0])]} y={-low+pad*.85} font={font*.8}/>
    <text x={d.span/2} y={-low+pad*1.45} textAnchor="middle" fontSize={font*.65}>0 и {d.span} — наружные грани стен. Отметки условные, не высота от пола.</text>
  </svg>;
}

export function RoofPerspective({assembly,yaw=0}) {
  const lines=roofAxonometricLines(assembly);if(!lines.length)return null;
  const angle=yaw*Math.PI/180;
  const project=p=>{const x=p[0]*Math.cos(angle)-p[1]*Math.sin(angle),y=p[0]*Math.sin(angle)+p[1]*Math.cos(angle);return [(x-y)*.866,(x+y)*.5-p[2]];};
  const faces=[];
  for(const l of lines){
    const d=l.b.map((v,i)=>v-l.a[i]),run=Math.hypot(d[0],d[1])||1,length=Math.hypot(...d)||1;
    const [width=50,depth=150]=l.profile.split(/[×xх]/).map(Number),side=[-d[1]/run,d[0]/run,0],normal=[-d[2]*d[0]/run/length,-d[2]*d[1]/run/length,run/length];
    const vertices=[l.a,l.b].flatMap(p=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>p.map((c,i)=>c+side[i]*u*width/2+normal[i]*v*depth/2)));
    for(const [i,indices]of [[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].entries()){
      const coords=indices.map(k=>vertices[k]);faces.push({key:l.id+'-'+i,points:coords.map(project),depth:coords.reduce((s,p)=>s+p[0]+p[1]+p[2],0)/4,fill:['#c39a60','#c39a60','#bb8b4d','#d1ac74','#f1d9b2','#dfbd88'][i]});
    }
  }
  faces.sort((a,b)=>a.depth-b.depth);
  const all=faces.flatMap(f=>f.points),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,pad=Math.max(w,h)*.06;
  return <svg className="roof-document-drawing" viewBox={`${x-pad} ${y-pad} ${w+2*pad} ${h+2*pad}`} role="img" aria-label="Аксонометрия стропильной системы">{faces.map(f=><polygon key={f.key} points={pts(f.points)} fill={f.fill} stroke="#62451e" strokeWidth=".5" vectorEffect="non-scaling-stroke"/>)}<text x={x+w/2} y={y+h+pad*.8} textAnchor="middle" fontSize={pad*.3}>Объёмная схема стропил · без проектных врубок и скрытых соединений</text></svg>;
}

export function BindingSection({assembly}) {
  const b=assembly.binding[0];if(!b)return null;
  const [w,h]=b.profile.split('×').map(Number),total=w*b.layers,pad=70;
  return <svg className="binding-section" viewBox={`${-pad} -45 ${total+2*pad} ${h+110}`} role="img" aria-label="Поперечное сечение обвязки">{Array.from({length:b.layers},(_,i)=><rect key={i} x={i*w} y={0} width={w} height={h} fill="#eee2cb" stroke="#000" strokeWidth="1"/>)}<Dimensions values={[0,total]} y={h+30} font={12}/><text x={total/2} y={-18} fontSize={12} textAnchor="middle">{b.layers===1?'Брус':`Пакет: ${b.layers} доски`} · {b.profile}</text><text x={-20} y={h/2} fontSize={12} textAnchor="middle">{h}</text></svg>;
}

export function SupportElevation({support:s}) {
  const run=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]),low=Math.min(s.a[2],s.b[2]),high=Math.max(s.a[2],s.b[2]),size=Math.max(run,high-low,1000),pad=size*.2,font=size*.035;
  return <svg className="roof-document-drawing support-elevation" viewBox={`${-pad} ${-high-pad} ${run+pad*2} ${high-low+pad*2.5}`} role="img" aria-label={`Развёртка ${s.mark}`}>
    <Member a={[0,-s.a[2]]} b={[run,-s.b[2]]} profile={s.profile} font={font}/>
    <text x={run/2} y={-high-pad*.55} fontSize={font} textAnchor="middle">{s.mark} · {s.profile} · L={s.length} мм</text>
    {[s.a,s.b].map((p,i)=><text key={i} x={i?run:0} y={-p[2]+font*1.7} fontSize={font*.8} textAnchor="middle">Z {p[2]}</text>)}
    <Dimensions values={[0,run]} y={-low+pad*.65} font={font*.8}/>
  </svg>;
}

export function RoofDrawingPreview({assembly}) {
  return <div className="roof-drawing-preview"><h3>Чертежи конструкций</h3><details open><summary>План стропил и проектных опор</summary><StructuralPlan assembly={assembly}/></details><details><summary>Поперечный профиль и уклоны крыши</summary><RoofSection assembly={assembly}/><p>Геометрия по длинам текущего расчёта. Отметки относительные; не связывают автоматически крышу с введёнными Z опор. Врубки и расчётные сечения не назначаются.</p></details><details><summary>Объёмный вид стропил</summary><RoofPerspective assembly={assembly}/></details><details><summary>Чертёж обвязки и поперечное сечение</summary>{assembly.binding.length?<><StructuralPlan assembly={assembly} kind="binding"/><BindingSection assembly={assembly}/></>:<p>Нет линий свайной обвязки. Задайте их в плане. Обвязка по готовому бетону требует отдельного монтажного плана.</p>}</details></div>;
}
