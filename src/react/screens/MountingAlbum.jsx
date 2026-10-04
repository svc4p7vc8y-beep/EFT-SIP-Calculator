import { groupPanels, groupMembers, polygonBounds } from '../calculations/production-cutting.js';
import { productionMark as mark } from '../calculations/production-assembly.js';
import AssemblyCanvas from './AssemblyCanvas.jsx';
import { BindingSection, RoofPerspective, RoofSection, StructuralPlan, SupportElevation } from './RoofDrawings.jsx';
import { combinedWall, gableLinks } from '../calculations/drawing-workbench.js';

const num=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value);
const chunks=(list,n)=>Array.from({length:Math.ceil(list.length/n)},(_,i)=>list.slice(i*n,i*n+n));
const path=(shape,flip)=>shape.map(r=>r.map(([x,y],i)=>`${i?'L':'M'}${x},${flip==null?y:flip-y}`).join(' ')+'Z').join(' ');
export function DimensionChain({values,y,font}) {
  const all=[...new Set(values.map(v=>Math.round(v)))].sort((a,b)=>a-b);
  const xs=all.filter((v,i)=>i===0||i===all.length-1||(v-all[0]>font*1.5&&all.at(-1)-v>font*1.5));
  return <g stroke="#000" strokeWidth=".6" fill="#000">{xs.slice(1).map((b,i)=>{const a=xs[i];return <g key={i}><path d={`M${a},${y-font*.4}V${y+font*.4}M${a},${y}H${b}M${b},${y-font*.4}V${y+font*.4}`} vectorEffect="non-scaling-stroke"/><text x={(a+b)/2} y={y-font*.2} textAnchor="middle" stroke="none" fontSize={font}>{b-a}</text></g>;})}</g>;
}
export function TechnicalDrawing({surface,parts=[],members=[]}) {
  if(!surface.geometry?.length)return <p>Нет геометрии.</p>;
  const box=polygonBounds(surface.geometry.flat()),size=Math.max(box.width,box.height),pad=size*.16,font=size*.022,flip=surface.horizontal?null:box.y*2+box.height;
  const yy=y=>flip==null?y:flip-y;
  const positions=new Map();groupMembers(members).forEach((g,i)=>g.instances.forEach(m=>positions.set(m.id,i+1)));
  const xDimensions=[box.x,box.x+box.width,...(parts.length?parts.flatMap(p=>[p.x,p.x+p.width]):members.filter(m=>m.a&&!m.excluded&&Math.abs(m.a[0]-m.b[0])<.1).map(m=>m.a[0]))];
  return <svg className="technical-drawing" viewBox={`${box.x-pad} ${box.y-pad*.4} ${box.width+2*pad} ${box.height+pad*2.1}`} role="img" aria-label={`Монтажная развёртка ${surface.name}`}>
    {surface.geometry.map((g,i)=><path key={i} d={path(g,flip)} fill="#fff" fillRule="evenodd" stroke="#000" vectorEffect="non-scaling-stroke"/>)}
    {parts.map(p=><g key={p.id}><path d={path(p.shape,flip)} fill="#edf3e7" fillRule="evenodd" stroke="#365c24" vectorEffect="non-scaling-stroke"/><text x={p.x+p.width/2} y={yy(p.y+p.height/2)} textAnchor="middle" fontSize={Math.min(font,p.width*.17)}>{mark(p.id).replace(`${surface.id}-`,'')}</text></g>)}
    {members.filter(m=>m.a&&!m.excluded).map(m=><g key={m.id}><line x1={m.a[0]} y1={yy(m.a[1])} x2={m.b[0]} y2={yy(m.b[1])} stroke="#805728" strokeWidth={m.role==='frame'?Math.min(60,Number(m.profile.split('×')[0])||40):15}/><text x={(m.a[0]+m.b[0])/2} y={yy((m.a[1]+m.b[1])/2)-font*.3} fontSize={font*.8} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={font*.15} fill="#000">{positions.get(m.id)}</text></g>)}
    <DimensionChain values={xDimensions} y={box.y+box.height+pad*.45} font={font*.75}/><DimensionChain values={[box.x,box.x+box.width]} y={box.y+box.height+pad} font={font}/>
    <text x={box.x-pad*.65} y={box.y+box.height/2} textAnchor="middle" fontSize={font} transform={`rotate(-90 ${box.x-pad*.65} ${box.y+box.height/2})`}>{num(box.height)} мм</text>
    {(surface.openings||[]).map(o=><text key={o.key} x={o.x+o.width/2} y={yy(Number(o.sill)+o.height/2)} fontSize={font*.8} textAnchor="middle">{o.width}×{o.height} · низ {o.sill}</text>)}
  </svg>;
}
export function RoofSlopePreview({assembly}) {
  return <div>{[...new Set(assembly.rafters.map(r=>r.name))].map(name=>{const rafters=assembly.rafters.filter(r=>r.name===name),axis=assembly.axis==='x'?0:1,origin=Math.min(...rafters.map(r=>r.a[axis])),width=Math.max(...rafters.map(r=>r.a[axis]))-origin,height=Math.max(...rafters.map(r=>r.length));
    return <details key={name}><summary>Чертёж ската: {name}</summary><TechnicalDrawing surface={{name,horizontal:true,geometry:[[[[0,0],[width,0],[width,height],[0,height],[0,0]]]]}} members={rafters.map(r=>({...r,a:[r.a[axis]-origin,0],b:[r.a[axis]-origin,r.length],role:'frame'}))}/></details>;
  })}</div>;
}
function Schedule({items}) {return <table className="album-schedule"><thead><tr><th>Поз.</th><th>Марка / элемент</th><th>Сечение / габарит, мм</th><th>Длина, мм</th><th>Кол.</th></tr></thead><tbody>{items.map((r,i)=><tr key={i}><td>{r.position||i+1}</td><td>{r.name}</td><td>{r.profile}</td><td>{r.length?num(r.length):'—'}</td><td>×{r.qty}</td></tr>)}</tbody></table>;}
function Locator({assembly,surface}){const floor=assembly.floors.find(f=>f.floor===surface.floor);if(!floor||!surface.planStart)return null;const b=assembly.bounds,pad=Math.max(b.width,b.height)*.1;return <svg className="album-locator" viewBox={`${b.x-pad} ${b.y-pad} ${b.width+pad*2} ${b.height+pad*2}`}><polygon points={floor.contour.map(p=>p.join(',')).join(' ')} fill="none" stroke="#000" strokeWidth="1" vectorEffect="non-scaling-stroke"/>{floor.rooms.map((r,i)=><polygon key={i} points={r.points.map(p=>p.join(',')).join(' ')} fill="none" stroke="#999" vectorEffect="non-scaling-stroke"/>)}<line x1={surface.planStart[0]} y1={surface.planStart[1]} x2={surface.planEnd[0]} y2={surface.planEnd[1]} stroke="#000" strokeWidth="5" vectorEffect="non-scaling-stroke"/><text x={b.x+b.width/2} y={b.y-pad*.3} fontSize={pad*.4} textAnchor="middle">Выделена {surface.id}</text></svg>;}
export function buildMountingPages(report) {
  const pages=[];
  const add=(title,content)=>pages.push({title,content});
  add('Состав монтажного альбома',<><h1>ЭФТ · Монтажный альбом домокомплекта</h1><p>Планы, развёртки, марки деталей и производственные ведомости. Все размеры в мм. Ревизия {report.revision}.</p><p>Предварительная геометрическая деталировка. Сечения, пролёты, соединения, раскосы, врубки, стыки на опорах и несущая способность требуют рабочего проекта. Альбом не заменяет расчёт конструктора.</p><p>Резка панелей: {report.cutting.panelCuts} резов / {num(report.cutting.panelCutLengthM)} м. Торцовка пиломатериалов: {report.cutting.timberCuts} резов. Без выборок и врубок.</p><p>Последовательность: совмещённые планы → развёртки стен, перегородок и перекрытий → фронтоны → стропила по скатам → обвязка и опоры → каталог панелей.</p></>);
  for(const [i,list]of chunks(report.issues,12).entries())add(`Замечания перед выпуском · ${i+1}`,<ol>{list.map((r,j)=><li key={j}>{r.message}</li>)}</ol>);
  for(const floor of report.assembly.floors)add(`Монтажный план · этаж ${floor.floor}`,<AssemblyCanvas assembly={report.assembly} initialFloor={floor.floor}/>);
  const basePlan=report.assembly.floors[0];
  if(basePlan&&report.assembly.piles.length)add('Свайное поле · оси и размеры',<StructuralPlan assembly={{...report.assembly,binding:[]}} kind="binding"/>);
  const links=gableLinks(report,report.settings.gableLinks);
  for(const wall of [...new Set(links.filter(l=>l.wall).map(l=>l.wall))]){
    const combined=combinedWall(report,wall,links);
    add(`${wall.name} с фронтоном`,<div className="album-columns"><TechnicalDrawing {...combined}/><div><Locator assembly={report.assembly} surface={wall}/><p>Совмещённый вид. Ведомости стены и фронтона на отдельных листах; детали не суммируются повторно.</p></div></div>);
  }
  for(const slope of report.roofCover?.slopes||[]){
    const parts=slope.sheets.map(s=>({...s,thickness:'',shape:[[[s.x,s.y],[s.x+s.width,s.y],[s.x+s.width,s.y+s.height],[s.x,s.y+s.height],[s.x,s.y]]]}));
    add(`Покрытие · ${slope.name}`,<><TechnicalDrawing surface={{id:'Л',name:slope.name,horizontal:true,geometry:[[[[0,0],[slope.width,0],[slope.width,slope.length],[0,slope.length],[0,0]]]]}} parts={parts}/><p>Исходный лист {slope.sheets[0].blankWidth}×{slope.sheets[0].blankLength} мм — ×{slope.sheets.length}. Рабочая ширина {report.settings.roofSheets.usefulWidth} мм, поперечный нахлёст {report.settings.roofSheets.overlap||0} мм. Без отверстий и специальных узлов примыкания.</p></>);
  }
  if(basePlan&&report.assembly.binding.length){const rows=report.assembly.binding.map((b,i)=>({position:i+1,name:b.id,profile:b.profile,length:b.length,qty:b.layers}));
    chunks(rows,14).forEach((list,i)=>add(`План обвязки · оси свай и сечение${i?` · ведомость ${i+1}`:''}`,<><div className="album-columns"><StructuralPlan assembly={report.assembly} kind="binding"/><div><Schedule items={list}/><BindingSection assembly={report.assembly}/></div></div><p>ОБ — непрерывная линия обвязки, СВ — опора из плана. Количество — число слоёв. Размерные цепочки привязаны к осям свай; положение стыков и крепёж утверждаются отдельным узлом. Длинная линия не означает цельную заготовку допустимой длины.</p></>));}
  if(report.assembly.rafters.length){
    const difference=report.assembly.roofDrawing.estimateDifference;
    if(Math.abs(difference)>1)add('Крыша · сверка геометрии раскроя и сметы',<><h2>Непрерывный уклон двускатной крыши</h2><p>Уклон определяется подъёмом конька над стеной и половиной пролёта. Свес продолжает ту же прямую: L = √((пролёт / 2)² + подъём²) × (1 + свес / (пролёт / 2)). Длина заготовки округлена вверх до мм.</p><p>Раскрой: {report.assembly.rafters[0].length} мм/стропило; прежняя сметная модель: {report.assembly.roofDrawing.estimateLength} мм. Разница {Math.round(difference)} мм/стропило, {num(difference*report.assembly.rafters.length/1000)} м на комплект.</p><p>Производственная деталировка не заменяет сметную закупку автоматически. Проверьте длины хлыстов, проект стыков, обрешётку и покрытие по уточнённому скату. Сечения и узлы опирания требуют расчёта.</p></>);
    add('Крыша · общий вид и поперечный профиль',<><div className="album-columns"><RoofPerspective assembly={report.assembly}/><div><RoofSection assembly={report.assembly}/><h3>Конструктивная схема</h3><p>Форма: {{gable:'двускатная',flat:'односкатная / плоская',tiered:'два односкатных уровня'}[report.assembly.roofShape]||report.assembly.roofShape}. Система: {{layered:'наслонная',hanging:'висячая',truss:'фермы'}[report.assembly.rafterSystem]||'по параметрам кровли'}.</p><p>Отметки относительные по геометрии скатов. Они не являются высотами опор от пола. Подкосы, затяжки, раскосы, врубки и крепёж не назначаются автоматически. Название системы не подтверждает её расчётную работоспособность.</p></div></div></>);
    const rows=report.assembly.roofDrawing.sections.map((s,i)=>({position:i+1,name:s.name,profile:`${s.profile} · уклон ${s.angle.toFixed(1)}°`,length:s.length,qty:s.qty}));
    add('План стропильной системы · марки и шаги',<><div className="album-columns"><StructuralPlan assembly={report.assembly}/><div><Schedule items={rows}/><h3>Обозначения</h3><p>Номера 1, 2… на стропилах означают КР-СТ1, КР-СТ2… в ведомости. КР-М — мауэрлат, КР-КН1/2 — два ряда коньковой доски. ОП — проектный элемент, показан пунктиром. Светло-серый контур — стены и комнаты. Сечения взяты из текущего проекта, шаги — фактические расстояния между осями на плане.</p><p>Размеры скатов со свесами — на отдельных развёртках. Длина стропила указана до проектной обработки торцов и опорных врубок.</p></div></div></>);
  }
  for(const [i,supports]of chunks(report.assembly.supports,10).entries())add(`Опоры · координаты и путь нагрузки · ${i+1}`,<table><thead><tr><th>Марка</th><th>Элемент / сечение</th><th>Начало X/Y/Z, мм</th><th>Конец X/Y/Z, мм</th><th>Длина</th><th>Опирание / узел</th></tr></thead><tbody>{supports.map(s=><tr key={s.id}><td>{s.mark}</td><td>{s.name} · {s.profile}</td><td>{s.a.join(' / ')}</td><td>{s.b.join(' / ')}</td><td>{s.length}</td><td>{s.loadPath.text}<br/>{s.nodeRef||'Узел не задан'}</td></tr>)}</tbody></table>);
  for(const [i,supports]of chunks(report.assembly.supports.filter(s=>s.type!=='foundation'),4).entries())add(`Проектные элементы · развёртки по длине · ${i+1}`,<div className="album-support-elevations">{supports.map(s=><article key={s.id}><h3>{s.mark} · {s.name}</h3><SupportElevation support={s}/><p>Начало: {s.a.join(' / ')}; конец: {s.b.join(' / ')} мм. Узел: {s.nodeRef||'не задан'}. Сечение и крепление — по проекту.</p></article>)}</div>);
  for(const s of report.surfaces){
    const parts=report.parts.filter(p=>p.surfaceId===s.id),members=report.members.filter(m=>m.surfaceId===s.id&&!m.excluded);
    const rows=groupMembers(members).map((g,i)=>({position:i+1,name:`${mark(g.member.id)} · ${g.member.material}`,profile:g.member.profile,length:g.member.length,qty:g.qty}));
    const panels=groupPanels(parts).map(g=>({name:mark(g.part.id),profile:`${num(g.part.width)}×${num(g.part.height)}×${g.part.thickness}`,qty:g.qty}));
    const lists=chunks([...rows,...panels],16);if(!lists.length)lists.push([]);
    lists.forEach((list,i)=>add(`${s.name}${i?` · ведомость ${i+1}`:''}`,<><div className="album-columns"><div><TechnicalDrawing surface={s} parts={parts} members={members}/><p>{s.blocked?'РАСКЛАДКА ЗАБЛОКИРОВАНА: уточните геометрию и замечания.':s.frameOnly?`Каркас ${s.frameProfile||report.settings.gableFrameProfile} мм. Схема обрамления проёмов, перемычки и усиление — на проверку.`:'Панели и соединители по геометрии проекта.'}</p></div><div><Schedule items={list}/><Locator assembly={report.assembly} surface={s}/></div></div></>));
  }
  for(const name of [...new Set(report.assembly.rafters.map(r=>r.name))]){
    const rafters=report.assembly.rafters.filter(r=>r.name===name),along=report.assembly.axis==='x'?0:1,origin=Math.min(...rafters.map(r=>r.a[along])),width=Math.max(...rafters.map(r=>r.a[along]))-origin,height=Math.max(...rafters.map(r=>r.length));
    const surface={id:'СК',name,horizontal:true,geometry:[[[[0,0],[width,0],[width,height],[0,height],[0,0]]]]};
    const members=rafters.map(r=>({...r,a:[r.a[along]-origin,0],b:[r.a[along]-origin,r.length],role:'frame'}));
    add(`Стропила · ${name}`,<><TechnicalDrawing surface={surface} members={members}/><Schedule items={groupMembers(rafters.map(r=>({...r,material:'Стропило'}))).map(g=>({name:`${g.instances.map(m=>m.id).join(', ')}`,profile:g.member.profile,length:g.member.length,qty:g.qty}))}/><p>Развёрнутая длина по скату, включая свесы. Стыковка, врубки и связевые элементы по рабочим узлам.</p></>);
    const battens=(report.assembly.laths||[]).filter(r=>r.name===name).map(r=>({...r,a:[r.a[along]-origin,r.slopeY],b:[r.b[along]-origin,r.slopeY],material:'Обрешётка',role:'frame'}));
    if(battens.length){const x0=Math.min(...battens.map(r=>r.a[0])),x1=Math.max(...battens.map(r=>r.b[0]));const s={...surface,geometry:[[[[x0,0],[x1,0],[x1,height],[x0,height],[x0,0]]]]};add(`Обрешётка · ${name}`,<><TechnicalDrawing surface={s} members={battens}/><Schedule items={groupMembers(battens).map((g,i)=>({position:i+1,name:g.member.id,profile:g.member.profile,length:g.member.length,qty:g.qty}))}/><p>Доска 25×100; шаг из параметров кровли. Стыки на осях стропил. Контробрешётка, первый ряд и крепление — по выбранному покрытию и рабочим узлам.</p></>);}
  }
  for(const [i,rows]of chunks(groupMembers(report.members.filter(m=>['Обвязка','Кровля'].includes(m.surface)||m.source==='Проектная опора')),18).entries())add(`Обвязка и несущие элементы · ${i+1}`,<Schedule items={rows.map(g=>({name:`${mark(g.member.id)} · ${g.member.material}`,profile:g.member.profile,length:g.member.length,qty:g.qty}))}/>);
  for(const [i,groups]of chunks(report.panelGroups,6).entries())add(`Каталог одинаковых панелей · ${i+1}`,<div className="album-parts">{groups.map(({part,qty})=><article key={part.id}><h3>{mark(part.id)} · ×{qty}</h3><TechnicalDrawing surface={{...part,geometry:[part.shape],horizontal:true,name:part.id}} parts={[part]}/><p>{num(part.width)}×{num(part.height)}×{part.thickness} мм</p></article>)}</div>);
  const contentsCount=Math.ceil((pages.length-1)/32);
  const contents=chunks(pages.slice(1).map((p,i)=>({title:p.title,page:i+2+contentsCount})),32).map((list,i)=>({title:`Ведомость листов монтажного альбома${i?` · ${i+1}`:''}`,content:<div className="album-contents">{chunks(list,16).map((column,j)=><table key={j}><thead><tr><th>Лист</th><th>Наименование</th></tr></thead><tbody>{column.map(row=><tr key={row.page}><td>{row.page}</td><td>{row.title}</td></tr>)}</tbody></table>)}</div>}));
  pages.splice(1,0,...contents);
  return pages.map((page,i)=>({...page,id:String(i+1)}));
}
export default function MountingAlbum({project,report,pages:givenPages,selectedIds,paper='A3',preview=false}) {
  const pages=givenPages||buildMountingPages(report);
  const chosen=selectedIds?pages.filter(page=>selectedIds.includes(page.id)):pages;
  return <div className={`${preview?'drawing-preview':'production-print'} mounting-album paper-${paper}`}>
    {chosen.map(page=><section className="mounting-sheet" key={page.id}><header>{page.title}</header><div className="mounting-content">{page.content}</div><footer><b>ЭФТ</b><span>{project.meta.projectName||project.meta.projectNum||'Проект'} · {project.meta.customer||''}<br/>{page.title}</span><span>{report.revision}<br/>Размеры: мм</span><span>Лист {page.id} / {pages.length}<br/>{paper} · без масштаба</span></footer></section>)}
  </div>;
}
