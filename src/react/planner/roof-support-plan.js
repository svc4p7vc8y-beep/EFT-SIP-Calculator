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
export function movePlanRoofGroup(items,groupId,dx,dy,roofModel=null) {
  const group=roofSupportPlanGroups(items).find(item=>item.id===groupId);
  if(!group)throw new Error('Прогон не найден.');
  const ids=new Set(group.members.map(item=>item.id));
  const low=Math.min(...group.members.flatMap(item=>[Number(item.z1),Number(item.z2)])),mx=Math.round(dx*1000),my=Math.round(dy*1000);
  const delta=(x,y,z)=>{
    if(!roofModel||Math.abs(z-low)<1)return 0;
    const old=roofAt(roofModel,x,y),next=roofAt(roofModel,x+mx,y+my);
    return old.length&&next.length?Math.round(Math.max(...next.map(hit=>hit.z))-Math.max(...old.map(hit=>hit.z))):0;
  };
  return items.map(item=>ids.has(item.id)?{...item,x1:Number(item.x1)+mx,y1:Number(item.y1)+my,z1:Number(item.z1)+(item.type==='post'||item.type==='sleeper'||(item.frameGroup&&item.flat&&item.type==='beam')?0:delta(Number(item.x1),Number(item.y1),Number(item.z1))),x2:Number(item.x2)+mx,y2:Number(item.y2)+my,z2:Number(item.z2)+(item.type==='sleeper'||(item.frameGroup&&item.flat&&item.type==='beam')?0:delta(Number(item.x2),Number(item.y2),Number(item.z2))),autoLocked:true}:item);
}
