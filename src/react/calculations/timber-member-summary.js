export function timberMaterialSummary(members){
  const groups=new Map();
  for(const member of members.filter(m=>!m.excluded)){
    const dimensions=String(member.profile||'').split(/[×xх]/).map(Number);
    if(dimensions.length!==2||dimensions.some(n=>!Number.isFinite(n)||n<=0)||!(member.length>0))continue;
    const key=`${member.material}:${member.profile}`,row=groups.get(key)||{id:key,name:member.material,profile:member.profile,qty:0,lengthM:0,volumeM3:0};
    row.qty++;row.lengthM+=member.length/1000;row.volumeM3+=member.length*dimensions[0]*dimensions[1]/1e9;groups.set(key,row);
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru')||a.profile.localeCompare(b.profile));
}
