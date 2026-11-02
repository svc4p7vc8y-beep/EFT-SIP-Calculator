import {houseContourPoints} from '../planner/geometry.js';
import {productionLevels} from './production-levels.js';

export const DEFAULT_WINDOW_SUPPORT_HEADER={enabled:true,bearingMm:150,profile:'50×150',boards:3};
export function windowSupportHeaders(project,items=project.settings.productionCutting.roofSupports) {
  const config={...DEFAULT_WINDOW_SUPPORT_HEADER,...project.settings.productionCutting.windowSupportHeaders};
  const kept=items.filter(item=>!item.autoWindowHeader||item.autoLocked);
  if(!config.enabled)return {items:kept,headers:[],issues:[]};
  const floor=Math.max(1,Number(project.meta.floors)||1),plan=floor>1?project.upperFloors?.[floor-2]:project.plan;
  if(!plan)return {items:kept,headers:[],issues:[]};
  const contour=houseContourPoints(plan),base=productionLevels(project,floor).bases[floor-1]||0;
  const material=project.priceMat.find(row=>{const dims=row.name.match(/(\d+)\s*[×xх*]\s*(\d+)/)?.slice(1).map(Number);return ['м3','м³'].includes(row.unit)&&dims&&((dims[0]===50&&dims[1]===150)||(dims[0]===150&&dims[1]===50));});
  const headers=[],issues=[];
  for(const opening of plan.openings||[]){
    if(opening.type!=='window'||opening.include===false||opening.outer===false)continue;
    if(kept.some(item=>item.autoWindowHeader&&item.headerOpeningId===opening.id&&Number(item.headerFloor)===floor))continue;
    const vertical=opening.orientation==='v',center=[Number(opening.x)*1000,Number(opening.y)*1000],width=Number(opening.width)*1000;
    const axis=vertical?1:0,fixed=1-axis,axisKey=axis?'y':'x',fixedKey=fixed?'y':'x';
    const boundary=contour.map((p,i)=>[p,contour[(i+1)%contour.length]]).find(([p,q])=>Math.abs(p[fixedKey]-q[fixedKey])<.001&&Math.abs(p[fixedKey]*1000-center[fixed])<=Number(plan.wallThickness)*1000+20&&center[axis]>=Math.min(p[axisKey],q[axisKey])*1000&&center[axis]<=Math.max(p[axisKey],q[axisKey])*1000);
    if(!boundary&&opening.outer!==true)continue;
    const owners=kept.filter(item=>!item.autoWindowHeader&&(item.type==='purlin'||item.type==='beam'||item.trussRole==='lowerChord')).filter(item=>[[item.x1,item.y1],[item.x2,item.y2]].some(point=>Math.abs(point[fixed]-center[fixed])<=Number(plan.wallThickness)*1000+15&&Math.abs(point[axis]-center[axis])<=width/2+25));
    if(!owners.length)continue;
    const bearing=Number(config.bearingMm);
    if(!Number.isFinite(bearing)||bearing<=0){issues.push({openingId:opening.id,message:'Укажите длину опирания усиления над окном.'});continue;}
    const length=width+2*bearing,sill=Number(project.settings.productionCutting.openingSills?.[`${floor}:${opening.id}`]??(opening.sillHeight!=null?Number(opening.sillHeight)*1000:project.settings.productionCutting.windowSillMm??850)),height=Number(opening.height)*1000;
    if(!(length>0&&height>0))continue;
    let wallCenter=center[fixed];
    if(boundary){const [p,q]=boundary,sign=contour.reduce((sum,p,i)=>{const q=contour[(i+1)%contour.length];return sum+p.x*q.y-q.x*p.y;},0)<0?-1:1;const dx=q.x-p.x,dy=q.y-p.y,L=Math.hypot(dx,dy);const inward=[-dy/L*sign,dx/L*sign];wallCenter=(fixed===0?p.x:p.y)*1000+inward[fixed]*Number(plan.wallThickness)*500;}
    for(let board=0;board<3;board++){
      const a=[...center],b=[...center];a[axis]-=length/2;b[axis]+=length/2;a[fixed]=wallCenter+(board-1)*50;b[fixed]=wallCenter+(board-1)*50;
      headers.push({id:`window-support-header:${floor}:${opening.id}:${board+1}`,type:'beam',name:`Усиление окна ${opening.name||opening.id} · доска ${board+1}/3`,profile:'50×150',x1:a[0],y1:a[1],z1:base+sill+height+75,x2:b[0],y2:b[1],z2:base+sill+height+75,autoWindowHeader:true,headerFloor:floor,headerOpeningId:opening.id,headerBearingMm:bearing,headerOwners:owners.map(item=>item.id),nodeRef:`Пакет 3 × 50×150; опирание по ${bearing} мм — данные EFT; прочность и соединения проверить по рабочему проекту`,estimateEnabled:!!material,estimateCatalogId:material?.id||'',startSupport:'',endSupport:'',foundationRef:''});
    }
    if(!material)issues.push({openingId:opening.id,message:'Для усиления 3 × 50×150 не найдена доска соответствующего сечения в прайсе.'});
    if(Number(plan.wallThickness)*1000<150)issues.push({openingId:opening.id,message:'Пакет усиления имеет толщину 150 мм: согласуйте его размещение в более тонкой стене.'});
  }
  if(kept.length+headers.length>200)issues.push({message:'Превышен лимит 200 деталей опор. Удалите лишние опоры и обновите усиления.'});
  return {items:[...kept,...headers],headers,issues};
}
