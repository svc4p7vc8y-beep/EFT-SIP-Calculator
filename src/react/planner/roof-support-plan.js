import {roofAt} from '../calculations/roof-project.js';

export function roofSupportPlanGroups(items=[]) {
  const byId=new Map(items.map(item=>[item.id,item])),groups=new Map();
  const key=(item,seen=new Set())=>{
    if(seen.has(item.id))return item.id;seen.add(item.id);
    return item.planGroupId||item.trussId||item.frameGroup||(item.type==='post'&&byId.has(item.upperSupport)?key(byId.get(item.upperSupport),seen):item.id);
  };
  for(const item of items){
    if(item.autoWindowHeader)continue;
    const id=key(item);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(item);
  }
  return [...groups].flatMap(([id,members])=>{
    if(!members.some(item=>item.type==='purlin'||item.trussTemplate||item.frameGroup))return [];
    const points=members.flatMap(item=>[[Number(item.x1)/1000,Number(item.y1)/1000],[Number(item.x2)/1000,Number(item.y2)/1000]]).filter(p=>p.every(Number.isFinite));
    let pair,distance=0;for(const a of points)for(const b of points){const d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(d>distance){distance=d;pair=[a,b];}}
    return pair?[{id,members,name:members[0].planName||members[0].name||'Прогон',a:{x:pair[0][0],y:pair[0][1]},b:{x:pair[1][0],y:pair[1][1]}}]:[];
  });
}
export function copyPlanRoofGroup(members,id) {
  const ids=new Map(members.map((item,index)=>[item.id,`${id}-${index+1}`]));
  return members.map(item=>{
    const next={...item,id:ids.get(item.id),planGroupId:id,planName:item.trussTemplate?'Ферма':item.frameGroup?'Опорный каркас':'Прогон',autoLocked:true};
    for(const key of ['startSupport','endSupport','upperSupport'])if(ids.has(next[key]))next[key]=ids.get(next[key]);
    if(item.frameGroup)next.frameGroup=id;if(item.trussId)next.trussId=id;
    return next;
  });
}
export function removePlanRoofGroup(items,groupId) {
  const group=roofSupportPlanGroups(items).find(item=>item.id===groupId);
  const ids=new Set(group?.members.map(item=>item.id)||[]);
  return items.filter(item=>!ids.has(item.id));
}
export function movePlanRoofGroup(items,groupId,dx,dy,roofModel=null) {
  const group=roofSupportPlanGroups(items).find(item=>item.id===groupId);
  if(!group)throw new Error('Прогон не найден.');
  const ids=new Set(group.members.map(item=>item.id));
  const low=Math.min(...group.members.flatMap(item=>[Number(item.z1),Number(item.z2)])),mx=Math.round(dx*1000),my=Math.round(dy*1000);
  const delta=(x,y,z,follow=false)=>{
    if(!roofModel||!follow&&Math.abs(z-low)<1)return 0;
    const old=roofAt(roofModel,x,y),next=roofAt(roofModel,x+mx,y+my);
    if(follow&&!next.length)throw new Error('Прогон должен оставаться под кровлей.');
    return old.length&&next.length?Math.round(Math.max(...next.map(hit=>hit.z))-Math.max(...old.map(hit=>hit.z))):0;
  };
  return items.map(item=>ids.has(item.id)?{...item,x1:Number(item.x1)+mx,y1:Number(item.y1)+my,z1:Number(item.z1)+(item.type==='post'||item.type==='sleeper'||(item.frameGroup&&item.flat&&item.type==='beam')?0:delta(Number(item.x1),Number(item.y1),Number(item.z1),item.planEndpointEditable===true)),x2:Number(item.x2)+mx,y2:Number(item.y2)+my,z2:Number(item.z2)+(item.type==='sleeper'||(item.frameGroup&&item.flat&&item.type==='beam')?0:delta(Number(item.x2),Number(item.y2),Number(item.z2),item.planEndpointEditable===true)),autoLocked:true}:item);
}
// A manually drawn purlin uses the existing roof planes and purchasing rules.
export function drawPlanRoofPurlin(project,roofModel,a,b){
 const mm=p=>[Math.round(p.x*1000),Math.round(p.y*1000)],A=mm(a),B=mm(b);
 if(Math.hypot(A[0]-B[0],A[1]-B[1])<300)throw new Error('Минимальная длина прогона — 300 мм.');
 const z=p=>{const hits=roofAt(roofModel,...p);if(!hits.length)throw new Error('Конец прогона должен находиться под кровлей.');return Math.round(Math.max(...hits.map(h=>h.z)));};
 const config=project.settings.productionCutting.autoRoofSupports,id=`manual-purlin-${crypto.randomUUID()}`;
 if(project.settings.productionCutting.roofSupports.length>=200)throw new Error('Достигнут лимит 200 опор.');
 return {id,planGroupId:id,planEndpointEditable:true,planName:'Прогон',name:'Ручной прогон',type:'purlin',profile:config.purlinProfile,x1:A[0],y1:A[1],z1:z(A),x2:B[0],y2:B[1],z2:z(B),nodeRef:config.nodeRef||'',startSupport:'',endSupport:'',estimateEnabled:true,estimateCatalogId:config.purlinCatalogId||'',autoLocked:true};
}
export function resizePlanRoofPurlin(items,id,index,point,roofModel){
 const group=roofSupportPlanGroups(items).find(g=>g.id===id),member=group?.members[0];
 if(group?.members.length!==1||!member.planEndpointEditable)throw new Error('Концы опорной рамы редактируются в её развёртке.');
 const suffix=index===0?'1':'2',other=index===0?'2':'1',x=Math.round(point.x*1000),y=Math.round(point.y*1000);
 if(Math.hypot(x-member['x'+other],y-member['y'+other])<300)throw new Error('Минимальная длина прогона — 300 мм.');
 const hits=roofAt(roofModel,x,y);if(!hits.length)throw new Error('Конец прогона должен находиться под кровлей.');
 return items.map(i=>i.id===member.id?{...i,['x'+suffix]:x,['y'+suffix]:y,['z'+suffix]:Math.round(Math.max(...hits.map(h=>h.z)))}:i);
}
