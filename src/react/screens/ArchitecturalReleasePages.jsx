import BuildingDrawing from '../components/BuildingDrawing.jsx';
export function architecturalReleasePages(release){
 if(!release.building||!release.views)return [];
 const {building,views}=release,pages=[];
const add=(id,title,list)=>pages.push({id,group:'АР',title,scale:'масштабы отдельных видов подписаны под изображениями',units:'мм',direction:list.map(v=>v.title).join('; '),axes:building.settings.axes.map(a=>`${a.name}=${a.coordinateMm} ${a.direction.toUpperCase()}`).join('; ')||'не назначены',surfaceIds:[...new Set(list.flatMap(v=>v.faces.map(f=>f.hostId).filter(Boolean)))],content:<div className={list.length===1?"architectural-sheet-grid single-view":"architectural-sheet-grid"}>{list.map((v,i)=><BuildingDrawing key={i} view={v} model={building} print wide={list.length===1}/>)}</div>});
 add('АР-Ф1','Фасады · верх и низ плана',views.elevations.slice(0,2));
 add('АР-Ф2','Фасады · лево и право плана',views.elevations.slice(2,4));
 for(const [i,v]of views.plans.entries())add(`АР-П${i+1}`,`Этаж ${building.floorLevels[i].floor} · конструктивный план с осями`,[v]);
 for(let i=0;i<views.sections.length;i+=2)add(`АР-Р${i/2+1}`,'Общие разрезы · '+views.sections.slice(i,i+2).map(v=>v.title).join(', '),views.sections.slice(i,i+2));
 return pages;
}
