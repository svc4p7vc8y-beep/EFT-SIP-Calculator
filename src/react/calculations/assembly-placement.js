// Geometric projection only; never chooses a load-bearing section or capacity.
export function projectOnSupport(support,x,y) {
  const [a,b]=[support.a,support.b],dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));
  return {x:Math.round(a[0]+t*dx),y:Math.round(a[1]+t*dy),z:Math.round(a[2]+t*(b[2]-a[2])),t};
}

// Move attached posts with their beam, keeping their longitudinal fraction.
export function changeSupportWithPosts(items,id,patch) {
  const original=items.find(item=>item.id===id);if(!original)return items;
  const changed={...original,...patch,...(original.autoLayout?{autoLocked:true}:{})};
  const geometry=Object.keys(patch).some(key=>/^[xyz][12]$/.test(key));
  const a=item=>[Number(item.x1),Number(item.y1),Number(item.z1)],b=item=>[Number(item.x2),Number(item.y2),Number(item.z2)];
  return items.map(item=>{
    if(item.id===id)return changed;
    if(!geometry||!['purlin','beam'].includes(original.type)||item.type!=='post'||item.upperSupport!==id)return item;
    const t=projectOnSupport({a:a(original),b:b(original)},Number(item.x2),Number(item.y2)).t;
    const p=a(changed).map((n,i)=>Math.round(n+t*(b(changed)[i]-n)));
    return {...item,x1:p[0],y1:p[1],x2:p[0],y2:p[1],z2:p[2],...(item.autoLayout?{autoLocked:true}:{})};
  });
}
