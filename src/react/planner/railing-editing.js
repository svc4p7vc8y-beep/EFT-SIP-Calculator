const rounded=n=>Math.round(n*1000)/1000;
export function railingSelection(plan,id){const [platformId,runId]=String(id).split('|'),platform=(plan.platforms||[]).find(p=>p.id===platformId);return {platform,run:platform?.railings?.find(r=>r.id===runId)};}
export function removeRailing(plan,id){const {platform,run}=railingSelection(plan,id);if(run)platform.railings=platform.railings.filter(r=>r.id!==run.id);return plan;}
export function moveRailing(plan,id,dx,dy,index,end){const {platform,run}=railingSelection(plan,id);if(!run)return plan;if(index!=null&&end)run[index?'b':'a']=[rounded(end.x-platform.x),rounded(end.y-platform.y)];else for(const key of ['a','b'])run[key]=[rounded(run[key][0]+dx),rounded(run[key][1]+dy)];return plan;}
export function addRailing(plan,a,b,preferredId,newId=crypto.randomUUID()){
 const candidates=(plan.platforms||[]).filter(p=>p.include!==false),distance=p=>Math.hypot(Math.max(p.x-a.x,0,a.x-p.x-p.w),Math.max(p.y-a.y,0,a.y-p.y-p.h));
 const platform=candidates.find(p=>p.id===preferredId)||candidates.sort((p,q)=>distance(p)-distance(q))[0];if(!platform||distance(platform)>Math.max(.3,Number(platform.steps||0)*Number(platform.tread||.3)+.1))return null;
 const local=q=>[rounded(q.x-platform.x),rounded(q.y-platform.y)],la=local(a),lb=local(b);if(Math.hypot(la[0]-lb[0],la[1]-lb[1])<.1)return null;
 const existing=(platform.railings||[]).find(r=>Math.hypot(r.a[0]-la[0],r.a[1]-la[1],r.b[0]-lb[0],r.b[1]-lb[1])<.01||Math.hypot(r.a[0]-lb[0],r.a[1]-lb[1],r.b[0]-la[0],r.b[1]-la[1])<.01);if(existing)return `${platform.id}|${existing.id}`;
 const run={id:newId,a:la,b:lb,enabled:true};platform.railings=[...(platform.railings||[]),run];return `${platform.id}|${run.id}`;
}
export function addStairRailing(plan,platformId,sideIndex){
 const p=plan.platforms.find(p=>p.id===platformId);if(!p||!(p.steps>0))return null;
 const width=Math.min(Number(p.stairWidth)||1.2,['top','bottom'].includes(p.stairSide)?p.w:p.h),depth=p.steps*(Number(p.tread)||.3),side=p.stairSide||'bottom',sign=sideIndex?1:-1;
 const a=side==='left'?{x:p.x,y:p.y+p.h/2+sign*width/2}:side==='right'?{x:p.x+p.w,y:p.y+p.h/2+sign*width/2}:side==='top'?{x:p.x+p.w/2+sign*width/2,y:p.y}:{x:p.x+p.w/2+sign*width/2,y:p.y+p.h};
 return addRailing(plan,a,{x:a.x+(side==='left'?-depth:side==='right'?depth:0),y:a.y+(side==='top'?-depth:side==='bottom'?depth:0)},p.id);
}
