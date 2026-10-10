// Fabrication lengths only. Assembly geometry and structural members stay intact.
export function stockJointPieces(members,settings) {
  const pieces=[],issues=[];
  for(const member of members){
    if(member.excluded)continue;
    const value=settings.memberOverrides?.[member.key]||{},raw=value.stockBreaksMm;
    if(raw==null||raw===''){pieces.push(member);continue;}
    const stops=Array.isArray(raw)?raw:String(raw).split(/[;\s]+/).filter(Boolean).map(Number);
    const valid=stops.length&&stops.length<=100&&stops.every((n,i)=>Number.isFinite(n)&&n>0&&n<member.length&&(i===0||n>stops[i-1]));
    const crossesNotch=valid&&stops.some(stop=>(member.notches||[]).some(n=>stop>n.offsetMm&&stop<n.offsetMm+n.lengthMm));
    if(!valid||!String(value.nodeRef||'').trim()||crossesNotch){
      issues.push({code:'STOCK_JOINT',message:`${member.id}: для стыков задайте возрастающие отметки внутри длины детали и рабочий узел; стык не должен пересекать врезку.`,target:member.key});
      pieces.push(member);continue;
    }
    const points=[0,...stops,member.length],allowance=Number(settings.endAllowanceMm)||0;
    for(let i=0;i<points.length-1;i++){
      const start=points[i],length=points[i+1]-start;
      const at=distance=>member.a&&member.b?member.a.map((n,k)=>n+(member.b[k]-n)*distance/member.length):undefined;
      const notches=(member.notches||[]).filter(n=>n.offsetMm>=start&&n.offsetMm+n.lengthMm<=points[i+1]).map(n=>({...n,offsetMm:n.offsetMm-start}));
      pieces.push({...member,id:`${member.id}/Д${i+1}`,assemblyMemberId:member.id,displayMark:`${member.displayMark||member.id}·${i+1}`,length,cutLength:length+2*allowance,a:at(start),b:at(points[i+1]),notches,stockJointNode:value.nodeRef,stockStartMm:start});
    }
  }
  return {pieces,issues};
}
