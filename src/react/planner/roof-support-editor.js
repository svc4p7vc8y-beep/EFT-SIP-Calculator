// All editor coordinates are millimetres. XY editing never changes roof planes or Z.
export function normalizeRoofEditor(value={}) {
 const v=value&&typeof value==='object'?value:{};
 return {autoPosts:v.autoPosts===true,snap:v.snap!==false,symmetric:v.symmetric===true,
  moveStep:[1,10,50,100].includes(Number(v.moveStep))?Number(v.moveStep):10,
  lengthStep:[10,50,100].includes(Number(v.lengthStep))?Number(v.lengthStep):50,
  pivot:['start','end'].includes(v.pivot)?v.pivot:'center',
  maxSpacing:Math.max(100,Math.min(20000,Number(v.maxSpacing)||3000)),
  postProfile:String(v.postProfile||'100×150').replace(/[xх]/g,'×'),
  copyX:Number.isFinite(Number(v.copyX))?Number(v.copyX):500,
  copyY:Number.isFinite(Number(v.copyY))?Number(v.copyY):0,copyPosts:v.copyPosts===true};
}
const finite=n=>Number.isFinite(Number(n));
const point=(m,i)=>({x:Number(m['x'+i]),y:Number(m['y'+i]),z:Number(m['z'+i])});
export const roofMemberLength=m=>Math.hypot(Number(m.x2)-Number(m.x1),Number(m.y2)-Number(m.y1),Number(m.z2)-Number(m.z1));
export const roofMemberAngle=m=>Math.atan2(Number(m.y2)-Number(m.y1),Number(m.x2)-Number(m.x1))*180/Math.PI;
export function roofEditablePlanGroups(items=[]) {
 return items.filter(m=>!m.autoWindowHeader&&['x1','y1','z1','x2','y2','z2'].every(k=>finite(m[k]))).map(m=>({id:m.id,members:[m],name:m.name||({post:'Стойка',beam:'Балка',purlin:'Прогон'}[m.type]||'Опора'),a:{x:Number(m.x1)/1000,y:Number(m.y1)/1000},b:{x:Number(m.x2)/1000,y:Number(m.y2)/1000}}));
}
export function roofSelectionIds(items,ids) {
 const selected=new Set(ids);
 // Old saved frame selections still select the original complete frame.
 const groups=ids.filter(id=>!items.some(m=>m.id===id));
 for(const m of items)if(groups.includes(m.planGroupId)||groups.includes(m.trussId)||groups.includes(m.frameGroup))selected.add(m.id);
 return selected;
}
function validate(items,changed=null){
 if(items.length>200)throw new Error('Не более 200 элементов опор. Изменение не применено.');
 for(const m of items.filter(m=>!changed||changed.has(m.id)))if(!['x1','y1','z1','x2','y2','z2'].every(k=>finite(m[k])&&Math.abs(Number(m[k]))<=100000)||roofMemberLength(m)<1)throw new Error('Проверьте координаты и положительную длину элемента (до 100 000 мм).');
 return items;
}
export function transformRoofMembers(items,ids,operation,config={}) {
 const c=normalizeRoofEditor(config),selected=roofSelectionIds(items,ids),actual=items.filter(m=>selected.has(m.id));
 if(!actual.length)return items;
 const xy=actual.flatMap(m=>[point(m,1),point(m,2)]),anchor=c.pivot==='start'?point(actual[0],1):c.pivot==='end'?point(actual[0],2):{x:(Math.min(...xy.map(p=>p.x))+Math.max(...xy.map(p=>p.x)))/2,y:(Math.min(...xy.map(p=>p.y))+Math.max(...xy.map(p=>p.y)))/2};
 const angle=Number(operation.angle)||0,r=angle*Math.PI/180;
 const result=items.map(m=>{
  if(!selected.has(m.id))return m;
  let next={...m,autoLocked:true,editorSource:m.editorSource||'manual'};
  if(operation.kind==='move')for(const i of [1,2]){next['x'+i]=Number(m['x'+i])+Number(operation.dx||0);next['y'+i]=Number(m['y'+i])+Number(operation.dy||0);}
  else if(operation.kind==='rotate'){
   for(const i of [1,2]){const p=point(m,i),x=p.x-anchor.x,y=p.y-anchor.y;next['x'+i]=anchor.x+x*Math.cos(r)-y*Math.sin(r);next['y'+i]=anchor.y+x*Math.sin(r)+y*Math.cos(r);}
   if(Array.isArray(m.normal)&&m.normal.length===3)next.normal=[m.normal[0]*Math.cos(r)-m.normal[1]*Math.sin(r),m.normal[0]*Math.sin(r)+m.normal[1]*Math.cos(r),m.normal[2]];
  }
  else if(operation.kind==='endpoint'){
   if(m.type==='post')return m;
   const i=operation.index===0?1:2,j=3-i,p=operation.point,dx=Number(p.x)-Number(m['x'+i]),dy=Number(p.y)-Number(m['y'+i]);
   next['x'+i]=Number(p.x);next['y'+i]=Number(p.y);
   if(c.symmetric){next['x'+j]=Number(m['x'+j])-dx;next['y'+j]=Number(m['y'+j])-dy;}
  }else if(operation.kind==='length'){
   const length=Number(operation.length),old=roofMemberLength(m);
   if(!(length>=1&&length<=100000))throw new Error('Длина должна быть от 1 до 100 000 мм.');
   const vertical=m.type==='post',dz=Number(m.z2)-Number(m.z1),horizontal=Math.hypot(m.x2-m.x1,m.y2-m.y1);
   if(vertical){next.z2=Number(m.z1)+Math.sign(dz||1)*length;}
   else{if(length<=Math.abs(dz)||horizontal<1)throw new Error('Длина должна превышать перепад отметок.');
    const ratio=Math.sqrt(length*length-dz*dz)/horizontal,center=c.symmetric;
    for(const k of ['x','y']){const d=(Number(m[k+'2'])-Number(m[k+'1']))*(ratio-1);next[k+'2']=Number(m[k+'2'])+d*(center?.5:1);if(center)next[k+'1']=Number(m[k+'1'])-d/2;}
   }
   if(!old)throw new Error('Нулевая исходная длина.');
  }else if(operation.kind==='patch'){
   const patch=operation.patch||{};
   for(const key of ['profile','nodeRef','startSupport','endSupport','foundationRef','name','estimateCatalogId','estimateEnabled'])if(key in patch)next[key]=patch[key];
   if(patch.profile!==undefined&&patch.profile!==m.profile&&!('estimateCatalogId' in patch))next.estimateCatalogId='';
   for(const key of ['z1','z2'])if(key in patch)next[key]=Number(patch[key]);
  }
  next.lengthMm=roofMemberLength(next);next.angleDeg=roofMemberAngle(next);
  return next;
 });
 return validate(result,selected);
}
export function copyRoofMembers(items,ids,config={},idFactory=()=>crypto.randomUUID()){
 const c=normalizeRoofEditor(config),selected=roofSelectionIds(items,ids);
 if(c.copyPosts)for(const m of items)if(m.editorAutoPost&&selected.has(m.parentPurlinId))selected.add(m.id);
 const source=items.filter(m=>selected.has(m.id)),map=new Map(source.map(m=>[m.id,`roof-copy-${idFactory()}`]));
 const copies=source.map(m=>{
  const next={...m,id:map.get(m.id),name:`${m.name||'Опора'} · копия`,autoLocked:true,editorSource:'manual',planEndpointEditable:m.type!=='post'};
  next.planGroupId=next.id;delete next.frameGroup;delete next.trussId;
  for(const key of ['parentPurlinId','upperSupport','startSupport','endSupport'])if(map.has(next[key]))next[key]=map.get(next[key]);else if(source.some(s=>s.id===m.parentPurlinId)||['startSupport','endSupport'].includes(key))next[key]='';
  if(m.editorAutoPost&&!map.has(m.parentPurlinId)){delete next.editorAutoPost;delete next.parentPurlinId;}
  for(const i of [1,2]){next['x'+i]=Number(m['x'+i])+c.copyX;next['y'+i]=Number(m['y'+i])+c.copyY;}
  return next;
 });
 return {items:validate([...items,...copies],new Set(copies.map(m=>m.id))),ids:copies.map(m=>m.id)};
}
export function deleteRoofMembers(items,ids){const selected=roofSelectionIds(items,ids);return items.filter(m=>!selected.has(m.id)).map(m=>selected.has(m.parentPurlinId)?{...m,parentPurlinId:'',upperSupport:'',editorAutoPost:false,editorSource:'manual'}:m);}
const projection=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return {x:a.x+t*dx,y:a.y+t*dy,t};};
export function snapRoofEditorPoint(p,{items=[],walls=[],axes=[],excluded=[],tolerance=120,enabled=true,grid=100}={}){
 if(!enabled)return {point:p,snap:null};
 const other=items.filter(m=>!excluded.includes(m.id)),candidates=[],add=(q,priority,label,id)=>{const distance=Math.hypot(q.x-p.x,q.y-p.y);if(distance<=tolerance)candidates.push({point:q,priority,distance,label,id});};
 for(const m of other)if(m.type==='post')add(point(m,2),0,'Стойка',m.id);
 for(const w of walls){const q=projection(p,w.a,w.b);add(q,1,'Несущая стена',w.id);}
 const lines=other.filter(m=>m.type!=='post');
 for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
  const a=point(lines[i],1),b=point(lines[i],2),c=point(lines[j],1),d=point(lines[j],2),dx=b.x-a.x,dy=b.y-a.y,ex=d.x-c.x,ey=d.y-c.y,den=dx*ey-dy*ex;
  if(Math.abs(den)<1e-8)continue;const t=((c.x-a.x)*ey-(c.y-a.y)*ex)/den,u=((c.x-a.x)*dy-(c.y-a.y)*dx)/den;
  if(t>=0&&t<=1&&u>=0&&u<=1)add({x:a.x+t*dx,y:a.y+t*dy},2,'Пересечение');
 }
 for(const m of other)for(const i of [1,2])add(point(m,i),3,'Конец элемента',m.id);
 for(const a of axes)add(projection(p,a.a,a.b),4,'Ось здания',a.id);
 if(grid>0)add({x:Math.round(p.x/grid)*grid,y:Math.round(p.y/grid)*grid},5,'Сетка');
 candidates.sort((a,b)=>a.priority-b.priority||a.distance-b.distance);
 const found=candidates[0];return found?{point:{x:found.point.x,y:found.point.y},snap:found}: {point:p,snap:null};
}
export function snapRoofAngle(angle,enabled=true){const nearest=Math.round(angle/45)*45;return enabled&&Math.abs(angle-nearest)<5?nearest:angle;}
export function roofGestureOperation(items,gesture,config={}){
 const c=normalizeRoofEditor(config),ids=gesture.ids||[gesture.id];
 if(gesture.kind==='roofEndpoint')return {kind:'endpoint',index:gesture.index,point:{x:gesture.end.x*1000,y:gesture.end.y*1000}};
 if(gesture.kind==='roofRotate'){
  const chosen=roofSelectionIds(items,ids),members=items.filter(m=>chosen.has(m.id));if(!members.length)return {kind:'move',dx:0,dy:0};
  const all=members.flatMap(m=>[point(m,1),point(m,2)]),a=c.pivot==='start'?point(members[0],1):c.pivot==='end'?point(members[0],2):{x:(Math.min(...all.map(p=>p.x))+Math.max(...all.map(p=>p.x)))/2,y:(Math.min(...all.map(p=>p.y))+Math.max(...all.map(p=>p.y)))/2};
  const pointer=p=>Math.atan2(p.y*1000-a.y,p.x*1000-a.x)*180/Math.PI;
  const old=roofMemberAngle(members[0]),angle=snapRoofAngle(old+pointer(gesture.end)-pointer(gesture.start),c.snap&&!gesture.altKey)-old;
  return {kind:'rotate',angle};
 }
 return {kind:'move',dx:(gesture.end.x-gesture.start.x)*1000,dy:(gesture.end.y-gesture.start.y)*1000};
}

// Only explicit bearing geometry can provide a bottom support. A ceiling plane is not proof.
export function syncRoofEditorPosts(project,items,ids,config,context={}){
 const c=normalizeRoofEditor(config);if(!c.autoPosts)return {items,warnings:[]};
 const selected=roofSelectionIds(items,ids),parents=items.filter(m=>selected.has(m.id)&&['purlin','beam'].includes(m.type)),warnings=[];
 if(parents.length&&(!/^\d+×\d+$/.test(c.postProfile)||c.postProfile.split('×').some(n=>!(Number(n)>0&&Number(n)<=10000))))throw new Error('Укажите положительное сечение стоек, например 100×150 мм.');
 let result=items.map(m=>({...m}));
 for(const parent of parents){
  const length=Math.hypot(parent.x2-parent.x1,parent.y2-parent.y1),count=Math.max(1,Math.ceil(length/c.maxSpacing)),linked=result.filter(m=>m.editorAutoPost&&m.parentPurlinId===parent.id);
  if(count>100)throw new Error('Слишком много стоек: увеличьте максимальный шаг.');
  const used=new Set(),posts=[];
  for(let n=0;n<=count;n++){
   const t=n/count,x=Number(parent.x1)+(parent.x2-parent.x1)*t,y=Number(parent.y1)+(parent.y2-parent.y1)*t,top=Number(parent.z1)+(parent.z2-parent.z1)*t-Number(String(parent.profile).split('×')[1]||0)/2;
   const reused=result.find(m=>m.type==='post'&&!linked.includes(m)&&Math.hypot(m.x2-x,m.y2-y)<1&&Math.abs(m.z2-top)<2);
   if(reused){posts.push(reused.id);if(!reused.startSupport&&!reused.foundationRef)warnings.push(`${reused.name||'Стойка'}: нижнее опирание существующей стойки не задано.`);continue;}
   const bearings=context.canBear?.(x,y,c.postProfile)===false?[]:(context.walls||[]).filter(w=>Math.hypot(projection({x,y},w.a,w.b).x-x,projection({x,y},w.a,w.b).y-y)<1&&Number(w.z)<top);
   for(const beam of result.filter(m=>['beam','sleeper','foundation'].includes(m.type)&&m.id!==parent.id&&!selected.has(m.id))){const q=projection({x,y},point(beam,1),point(beam,2)),z=Number(beam.z1)+(beam.z2-beam.z1)*q.t+Number(String(beam.profile).split('×')[1]||0)/2;if(Math.hypot(q.x-x,q.y-y)<1&&z<top)bearings.push({id:beam.id,z});}
   const bearing=bearings.sort((a,b)=>b.z-a.z)[0];
   if(!bearing){warnings.push(`${parent.name||'Прогон'}: нет нижней опоры в точке ${Math.round(x)}, ${Math.round(y)} мм.`);continue;}
   const prior=linked.find(p=>p.editorStation===n&&!used.has(p.id))||linked.find(p=>!used.has(p.id));
   if(prior)used.add(prior.id);
   const material=(project.priceMat||[]).find(row=>['м3','м³'].includes(row.unit)&&row.name.match(/(\d+)\s*[×xх*]\s*(\d+)/)?.slice(1).join('×')===c.postProfile);
   const post={...prior,id:prior?.id||`roof-post-${crypto.randomUUID()}`,type:'post',name:'Связанная стойка',profile:c.postProfile,
    x1:x,y1:y,z1:bearing.z,x2:x,y2:y,z2:top,parentPurlinId:parent.id,upperSupport:parent.id,startSupport:bearing.id,endSupport:'',foundationRef:bearing.id,
    editorAutoPost:true,editorSource:'auto',editorStation:n,upperBearing:'underside',autoLocked:true,estimateEnabled:true,estimateCatalogId:material?.id||'',nodeRef:prior?.nodeRef||''};
   post.planGroupId=post.id;post.lengthMm=roofMemberLength(post);post.angleDeg=roofMemberAngle(post);result=result.filter(m=>m.id!==post.id);result.push(post);posts.push(post.id);
  }
  // Disabled mode never reaches this branch. Manual supports are never removed.
  result=result.filter(m=>!linked.some(p=>p.id===m.id)||used.has(m.id));
  const updated=result.find(m=>m.id===parent.id);updated.startSupport=posts[0]||'';updated.endSupport=posts.at(-1)||'';
 }
 return {items:validate(result,new Set([...parents.map(m=>m.id),...result.filter(m=>m.editorAutoPost&&selected.has(m.parentPurlinId)).map(m=>m.id)])),warnings:[...new Set(warnings)]};
}
