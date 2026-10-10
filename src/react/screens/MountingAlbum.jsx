import { groupPanels, groupMembers, polygonBounds } from '../calculations/production-cutting.js';
import { productionMark as mark } from '../calculations/production-assembly.js';
import AssemblyCanvas from './AssemblyCanvas.jsx';
import { BindingSection, RoofPerspective, RoofSection, StructuralPlan, SupportElevation } from './RoofDrawings.jsx';
import { combinedWall, gableLinks, drawingCategory } from '../calculations/drawing-workbench.js';
import { partitionProcurement } from '../calculations/partition-procurement.js';
import { surfaceDimensions } from '../calculations/drawing-dimensions.js';
import DrawingDimensions from '../components/DrawingDimensions.jsx';
import PartitionDrawing from '../components/PartitionDrawing.jsx';
import { WallLocator, DrawingCanvas } from './DrawingCanvas.jsx';
import ConstructionNode from './ConstructionNodes.jsx';
import { boardFootprint } from '../calculations/partition-geometry.js';
import WallPanelPlan from './WallPanelPlan.jsx';
import { MARK_LEGEND } from '../calculations/production-cutting.js';

const num=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value);
const chunks=(list,n)=>Array.from({length:Math.ceil(list.length/n)},(_,i)=>list.slice(i*n,i*n+n));
const path=(shape,flip)=>shape.map(r=>r.map(([x,y],i)=>`${i?'L':'M'}${x},${flip==null?y:flip-y}`).join(' ')+'Z').join(' ');
export function DimensionChain({values,y,font}) {
  return <DrawingDimensions values={values} y={y} font={font}/>;
}
export function TechnicalDrawing({surface,parts=[],members=[],labelOverrides=surface.drawingLabels||{}}) {
  if(Object.keys(labelOverrides).length||surface.stairOpenings?.length)return <DrawingCanvas printable surface={surface} parts={parts} members={members} layers={{panels:true,frame:true,dimensions:true,labels:true}} labelOverrides={labelOverrides}/>;
  if(surface.frameOnly&&surface.id?.includes('-ПГ'))return <PartitionDrawing surface={surface} members={members}/>;
  if(!surface.geometry?.length)return <p>Нет геометрии.</p>;
  const box=polygonBounds(surface.geometry.flat()),size=Math.max(box.width,box.height),pad=size*.16,font=size*.022,flip=surface.horizontal?null:box.y*2+box.height;
  const yy=y=>flip==null?y:flip-y;
  const positions=new Map();groupMembers(members).forEach((g,i)=>g.instances.forEach(m=>positions.set(m.id,m.displayMark||i+1)));
  const dimensions=surfaceDimensions(surface,parts,members),hasOpenings=!!surface.openings?.length;
  return <svg className="technical-drawing" viewBox={`${box.x-pad} ${box.y-pad*.4} ${box.width+pad*2.5} ${box.height+pad*(hasOpenings?2.6:2.1)}`} role="img" aria-label={`Монтажная развёртка ${surface.name}`}>
    {surface.geometry.map((g,i)=><path key={i} d={path(g,flip)} fill="#fff" fillRule="evenodd" stroke="#000" vectorEffect="non-scaling-stroke"/>)}
    {parts.map(p=><g key={p.id}><path d={path(p.shape,flip)} fill="#edf3e7" fillRule="evenodd" stroke="#365c24" strokeWidth=".5" vectorEffect="non-scaling-stroke"/><text x={p.x+p.width/2} y={yy(p.y+p.height/2)} textAnchor="middle" fontSize={Math.min(font,p.width*.17)}>{mark(p).replace(`${surface.id}-`,'')}</text></g>)}
    {members.filter(m=>m.a&&!m.excluded).map(m=><g key={m.id}><polygon points={(boardFootprint(m)||[]).map(([x,y])=>`${x},${yy(y)}`).join(' ')} fill="#fcf8ee" stroke="#000" strokeWidth=".45" vectorEffect="non-scaling-stroke"/><text x={(m.a[0]+m.b[0])/2} y={yy((m.a[1]+m.b[1])/2)-font*.3} fontSize={font*.8} textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={font*.15} fill="#000">{positions.get(m.id)}</text></g>)}
    <DimensionChain values={dimensions.x} y={box.y+box.height+pad*.45} font={font*.75}/>
    {hasOpenings?<DimensionChain values={dimensions.openingX} y={box.y+box.height+pad*.95} font={font*.85}/>:null}
    <DrawingDimensions values={[box.x,box.x+box.width]} y={box.y+box.height+pad*(hasOpenings?1.5:1)} font={font} label="Габарит конструкции"/>
    <g transform="rotate(90)"><DrawingDimensions values={dimensions.openingY.map(yy)} y={-box.x-box.width-pad*.5} font={font*.8} label={hasOpenings?'Высоты проёмов':'Габарит'}/></g>
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
function Locator({assembly,surface}){const floor=assembly.floors.find(f=>f.floor===surface.floor);if(!floor||!surface.planStart)return null;return <div className="album-locator"><WallLocator report={{assembly,surfaces:[surface]}} surface={surface}/><p>Выделена {surface.id}. Стрелка — направление взгляда.</p></div>;}
export function buildMountingPages(report) {
  const pages=[];
  const add=(title,content)=>pages.push({title,content});
  const procurement=partitionProcurement(report);
  const partitionRows=[...procurement.boards.map(b=>({name:`Доска ${b.profile} мм`,profile:`${report.settings.stockLengthMm} мм · ${num(b.lengthM)} пог. м · ${num(b.volumeM3)} м³`,qty:b.count})),...procurement.screws.map(r=>({name:r.names.join('; '),profile:r.unit,qty:r.qty})),...procurement.manual.filter(r=>r.valid).map(r=>({name:r.name,profile:r.unit,qty:r.qty}))];
  add('Состав монтажного альбома',<><h1>ЭФТ · Монтажный альбом домокомплекта</h1><p>Планы, развёртки, марки деталей и производственные ведомости. Все размеры в мм. Ревизия {report.revision}.</p><p>Предварительная геометрическая деталировка. Сечения, пролёты, соединения, раскосы, врубки, стыки на опорах и несущая способность требуют рабочего проекта. Альбом не заменяет расчёт конструктора.</p><p>Резка панелей: {report.cutting.panelCuts} резов / {num(report.cutting.panelCutLengthM)} м. Торцовка пиломатериалов: {report.cutting.timberCuts} резов. Без выборок и врубок.</p><p>Последовательность: совмещённые планы → развёртки стен, перегородок и перекрытий → фронтоны → стропила по скатам → обвязка и опоры → каталог панелей.</p></>);
  add('Марки и узлы сопряжения',<><h2>Марки одинаковых деталей</h2><p>{Object.entries(MARK_LEGEND).map(([mark,label])=>`${mark} — ${label}`).join('; ')}. Цифра — номер типоразмера. Совпадающая марка означает одинаковую заготовку; на монтажном плане показано каждое место. Технические идентификаторы сохранены отдельно.</p><p>Н1 — основание и обвязка; Н2 — угол наружных стен; Н3 — угол / Т-примыкание перегородок; Н4 — опирание стропила; Н5 — доска на ребре несущей перегородки. Схемы приложены к соответствующим листам; без утверждённых врезок и крепежа.</p><p>Источники состава листов: «Мичуринец», листы 4, 5, 8, 18, 20 (одноимённые PDF-страницы); Курмановы, печатные стр. 93–94 / PDF 94–95. Числа из чужого проекта не являются нормами EFT.</p></>);
  for(const [i,list]of chunks(report.issues,12).entries())add(`Замечания перед выпуском · ${i+1}`,<ol>{list.map((r,j)=><li key={j}>{r.message}</li>)}</ol>);
  for(const floor of report.assembly.floors)add(`Монтажный план · этаж ${floor.floor}`,<AssemblyCanvas assembly={report.assembly} initialFloor={floor.floor}/>);
  const basePlan=report.assembly.floors[0];
  if(basePlan&&report.assembly.piles.length)add(`${report.assembly.foundationType==='concreteBlock'?'Бетонные блоки':'Свайное поле'} · оси и размеры`,<div className="album-columns"><StructuralPlan assembly={{...report.assembly,binding:[]}} kind="binding"/><ConstructionNode type="base" report={report}/></div>);
  if(basePlan&&report.assembly.piles.length)add('Основание · крупный план контрольных размеров',<><StructuralPlan assembly={{...report.assembly,binding:[]}} kind="binding"/><p>Н1 — сопряжение основания и обвязки на соседнем листе. Диагонали и размерные цепочки соединяют фактические точки контура и оси опор.</p></>);
  for(const f of report.assembly.floors)if(report.surfaces.some(s=>s.floor===f.floor&&/^Э\d+-С\d+$/.test(s.id)))add(`Расположение стеновых панелей · этаж ${f.floor}`,<><div className="album-columns"><WallPanelPlan report={report} floor={f.floor}/><ConstructionNode type="corner" report={report}/></div><p>С — наружная стена; ПГ — перегородка выбранного этажа. Несущие стены выделены синим. Подробные размеры — на листе крупного плана и развёртках.</p></>);
  for(const f of report.assembly.floors)if(report.surfaces.some(s=>s.floor===f.floor&&/^Э\d+-С\d+$/.test(s.id)))add(`Стеновые панели · крупный план · этаж ${f.floor}`,<><WallPanelPlan report={report} floor={f.floor}/><p>Н2 — угол стен на листе расположения панелей. П — марка одинаковой панели; высотные ряды, проёмы и детали раскрыты на развёртках.</p></>);
  if(report.assembly.binding.length)add('Н1 · сопряжение основания и обвязки',<div className="album-columns"><BindingSection assembly={report.assembly}/><ConstructionNode type="base" report={report}/></div>);
  const frameWall=report.surfaces.find(s=>s.partitionFrame);
  if(frameWall)add('Н3 / Н5 · сопряжения каркасных перегородок',<div className="album-columns"><ConstructionNode type="partition" report={report} surface={frameWall}/><ConstructionNode type="bearing" report={report} surface={report.surfaces.find(s=>s.partitionFrame&&s.bearing)||frameWall}/></div>);
  if(report.assembly.rafters.length)add('Н4 · опирание стропила и путь нагрузки',<div className="album-columns"><RoofSection assembly={report.assembly}/><ConstructionNode type="roof" report={report}/></div>);
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
    add('Разрез кровли · полный размер и отметки',<><RoofSection assembly={report.assembly}/><p>Н4 — опирание стропила, см. лист сопряжения. В этом виде профиль показан крупно; наружные грани стен, свесы, конёк и отметки связаны с текущей геометрией проекта.</p></>);
    const difference=report.assembly.roofDrawing.estimateDifference;
    if(Math.abs(difference)>1)add('Крыша · сверка геометрии раскроя и сметы',<><h2>Непрерывный уклон двускатной крыши</h2><p>Уклон определяется подъёмом конька над стеной и половиной пролёта. Свес продолжает ту же прямую: L = √((пролёт / 2)² + подъём²) × (1 + свес / (пролёт / 2)). Длина заготовки округлена вверх до мм.</p><p>Раскрой: {report.assembly.rafters[0].length} мм/стропило; прежняя сметная модель: {report.assembly.roofDrawing.estimateLength} мм. Разница {Math.round(difference)} мм/стропило, {num(difference*report.assembly.rafters.length/1000)} м на комплект.</p><p>Производственная деталировка не заменяет сметную закупку автоматически. Проверьте длины хлыстов, проект стыков, обрешётку и покрытие по уточнённому скату. Сечения и узлы опирания требуют расчёта.</p></>);
    add('Крыша · общий вид и поперечный профиль',<><div className="album-columns"><RoofPerspective assembly={report.assembly}/><div><RoofSection assembly={report.assembly}/><h3>Конструктивная схема</h3><p>Форма: {{gable:'двускатная',flat:'односкатная / плоская',tiered:'два односкатных уровня'}[report.assembly.roofShape]||report.assembly.roofShape}. Система: {{layered:'наслонная',hanging:'висячая',truss:'фермы'}[report.assembly.rafterSystem]||'по параметрам кровли'}.</p><p>Отметки относительные по геометрии скатов. Они не являются высотами опор от пола. Подкосы, затяжки, раскосы, врубки и крепёж не назначаются автоматически. Название системы не подтверждает её расчётную работоспособность.</p></div></div></>);
    const rows=report.assembly.roofDrawing.sections.map((s,i)=>({position:i+1,name:s.name,profile:`${s.profile} · уклон ${s.angle.toFixed(1)}°`,length:s.length,qty:s.qty}));
    add('План стропильной системы · марки и шаги',<><div className="album-columns"><StructuralPlan assembly={report.assembly}/><div><Schedule items={rows}/><h3>Обозначения</h3><p>СТ — типоразмер стропила (одинаковая марка повторяется в каждом месте). Короткие марки досок и бруса — в сводной ведомости кровли. КР-М / КР-КН — технические привязки мауэрлата и двух рядов коньковой доски. ОП — проектный элемент, показан пунктиром. Светло-серый контур — стены и комнаты. Сечения взяты из текущего проекта, шаги — фактические расстояния между осями на плане.</p><p>Размеры скатов со свесами — на отдельных развёртках. Длина стропила указана до проектной обработки торцов и опорных врубок.</p></div></div></>);
  }
  for(const [i,supports]of chunks(report.assembly.supports,10).entries())add(`Опоры · координаты и путь нагрузки · ${i+1}`,<table><thead><tr><th>Марка</th><th>Элемент / сечение</th><th>Начало X/Y/Z, мм</th><th>Конец X/Y/Z, мм</th><th>Длина</th><th>Опирание / узел</th></tr></thead><tbody>{supports.map(s=><tr key={s.id}><td>{s.mark}</td><td>{s.name} · {s.profile}</td><td>{s.a.join(' / ')}</td><td>{s.b.join(' / ')}</td><td>{s.length}</td><td>{s.loadPath.text}<br/>{s.nodeRef||'Узел не задан'}</td></tr>)}</tbody></table>);
  for(const [i,supports]of chunks(report.assembly.supports.filter(s=>s.type!=='foundation'),4).entries())add(`Проектные элементы · развёртки по длине · ${i+1}`,<div className="album-support-elevations">{supports.map(s=><article key={s.id}><h3>{s.mark} · {s.name}</h3><SupportElevation support={s}/><p>Начало: {s.a.join(' / ')}; конец: {s.b.join(' / ')} мм. Узел: {s.nodeRef||'не задан'}. Сечение и крепление — по проекту.</p></article>)}</div>);
  for(const original of report.surfaces){
    const s={...original,drawingLabels:report.settings.drawingLabels?.[`${drawingCategory(original)}:${original.layoutKey||''}:drawing`]||{}};
    const parts=report.parts.filter(p=>p.surfaceId===s.id),members=report.members.filter(m=>m.surfaceId===s.id&&!m.excluded);
    const rows=groupMembers(members).map((g,i)=>({position:i+1,name:`${mark(g.member)} · ${g.member.material}`,profile:g.member.profile,length:g.member.length,qty:g.qty}));
    const panels=groupPanels(parts).map(g=>({name:mark(g.part),profile:`${num(g.part.width)}×${num(g.part.height)}×${g.part.thickness}`,qty:g.qty}));
    const lists=chunks([...rows,...panels],16);if(!lists.length)lists.push([]);
    lists.forEach((list,i)=>add(`${s.name}${i?` · ведомость ${i+1}`:''}`,<><div className="album-columns"><div><TechnicalDrawing surface={s} parts={parts} members={members}/><p>{s.blocked?'РАСКЛАДКА ЗАБЛОКИРОВАНА: уточните геометрию и замечания.':s.frameOnly?`Каркас ${s.frameProfile||report.settings.gableFrameProfile} мм. Схема обрамления проёмов, перемычки и усиление — на проверку.`:'Панели и соединители по геометрии проекта.'}</p></div><div>{s.id?.includes('-ПГ')?<h3>Пиломатериалы · позиции на чертеже</h3>:null}<Schedule items={list}/>{s.frameOnly&&s.id?.includes('-ПГ')?<p>Всего: {members.length} деталей · {num(members.reduce((sum,m)=>sum+m.length,0)/1000)} пог. м. Одинаковые детали объединены, количество указано в ведомости. Номера повторяются на каждой детали группы.</p>:null}<Locator assembly={report.assembly} surface={s}/></div></div></>));
  }
  for(const name of [...new Set(report.assembly.rafters.map(r=>r.name))]){
    const rafters=report.assembly.rafters.filter(r=>r.name===name),along=report.assembly.axis==='x'?0:1,origin=Math.min(...rafters.map(r=>r.a[along])),width=Math.max(...rafters.map(r=>r.a[along]))-origin,height=Math.max(...rafters.map(r=>r.length));
    const surface={id:'СК',name,horizontal:true,geometry:[[[[0,0],[width,0],[width,height],[0,height],[0,0]]]]};
    const members=rafters.map(r=>({...r,a:[r.a[along]-origin,0],b:[r.a[along]-origin,r.length],role:'frame'}));
    add(`Стропила · ${name}`,<><TechnicalDrawing surface={surface} members={members}/><Schedule items={groupMembers(rafters.map(r=>({...r,material:'Стропило'}))).map(g=>({name:`${g.instances.map(m=>m.id).join(', ')}`,profile:g.member.profile,length:g.member.length,qty:g.qty}))}/><p>Развёрнутая длина по скату, включая свесы. Стыковка, врубки и связевые элементы по рабочим узлам.</p></>);
    const battens=(report.assembly.laths||[]).filter(r=>r.name===name).map(r=>({...r,a:[r.a[along]-origin,r.slopeY],b:[r.b[along]-origin,r.slopeY],material:'Обрешётка',role:'frame'}));
    if(battens.length){const x0=Math.min(...battens.map(r=>r.a[0])),x1=Math.max(...battens.map(r=>r.b[0]));const s={...surface,geometry:[[[[x0,0],[x1,0],[x1,height],[x0,height],[x0,0]]]]};add(`Обрешётка · ${name}`,<><TechnicalDrawing surface={s} members={battens}/><Schedule items={groupMembers(battens).map((g,i)=>({position:i+1,name:g.member.id,profile:g.member.profile,length:g.member.length,qty:g.qty}))}/><p>Доска 25×100; шаг из параметров кровли. Стыки на осях стропил. Контробрешётка, первый ряд и крепление — по выбранному покрытию и рабочим узлам.</p></>);}
  }
  for(const [i,rows]of chunks(groupMembers(report.members.filter(m=>['Обвязка','Кровля'].includes(m.surface)||m.source==='Проектная опора')),18).entries())add(`Обвязка и несущие элементы · ${i+1}`,<Schedule items={rows.map(g=>({name:`${mark(g.member)} · ${g.member.material}`,profile:g.member.profile,length:g.member.length,qty:g.qty}))}/>);
  for(const [i,groups]of chunks(report.panelGroups,6).entries())add(`Каталог одинаковых панелей · ${i+1}`,<div className="album-parts">{groups.map(({part,qty})=><article key={part.id}><h3>{mark(part)} · ×{qty}</h3><TechnicalDrawing surface={{...part,geometry:[part.shape],horizontal:true,name:part.id}} parts={[part]}/><p>{num(part.width)}×{num(part.height)}×{part.thickness} мм</p></article>)}</div>);
  for(const [i,rows]of chunks(partitionRows,16).entries())add(`Закупка перегородок · ${i+1}`,<><Schedule items={rows}/><p>Отдельный заказ перегородок, не суммировать повторно с общим заказом дома. Доски без дополнительного запаса; крепёж из сметы и явно заданных проектных количеств.</p>{procurement.unplaced.length?<p>Не размещены в досках: {procurement.unplaced.join(', ')}. Заказ неполный.</p>:null}{!procurement.screws.length&&!procurement.manual.some(r=>r.valid)?<p>Крепёж каркасных перегородок не задан — уточнить по рабочим узлам.</p>:null}</>);
  for(const [i,groups]of chunks(groupMembers(report.members.filter(m=>m.surfaceId?.includes('-ПГ')&&!m.excluded)),18).entries())add(`Сводная деталировка перегородок · ${i+1}`,<Schedule items={groups.map(g=>({name:`${g.member.material} · ${mark(g.member)+' и однотипные'}`,profile:g.member.profile,length:g.member.length,qty:g.qty}))}/>);
  const contentsCount=Math.ceil((pages.length-1)/32);
  const contents=chunks(pages.slice(1).map((p,i)=>({title:p.title,page:i+2+contentsCount})),32).map((list,i)=>({title:`Ведомость листов монтажного альбома${i?` · ${i+1}`:''}`,content:<div className="album-contents">{chunks(list,16).map((column,j)=><table key={j}><thead><tr><th>Лист</th><th>Наименование</th></tr></thead><tbody>{column.map(row=><tr key={row.page}><td>{row.page}</td><td>{row.title}</td></tr>)}</tbody></table>)}</div>}));
  pages.splice(1,0,...contents);
  return pages.map((page,i)=>({...page,id:String(i+1)}));
}
export default function MountingAlbum({project,report,pages:givenPages,selectedIds,paper='A3',preview=false}) {
  const pages=givenPages||buildMountingPages(report);
  const chosen=selectedIds?pages.filter(page=>selectedIds.includes(page.id)):pages;
  return <div className={`${preview?'drawing-preview':'production-print'} mounting-album paper-${paper}`}>
    {chosen.map(page=><section className="mounting-sheet" key={page.id}><header>{page.title}</header><div className="mounting-content">{page.content}</div><footer>{page.title} · {project.meta.projectName||project.meta.projectNum||'Проект'} · лист {page.id}/{pages.length} · размеры в мм</footer></section>)}
  </div>;
}
