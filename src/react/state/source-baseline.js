// An explicit comparison checkpoint, never an automatically inferred construction history.
export function normalizeSourceBaseline(value) {
  if(value==null)return null;
  const invalid=()=>({version:1,invalid:true,capturedAt:'',items:[]});
  if(value.version!==1||value.invalid||typeof value.capturedAt!=='string'||!Number.isFinite(Date.parse(value.capturedAt))||!Array.isArray(value.items)||value.items.length>2000)return invalid();
  const keys=new Set(),items=[];
  for(const row of value.items){
    if(!row||typeof row.key!=='string'||!row.key||row.key.length>200||keys.has(row.key)||
      ![1,2].includes(row.floor)||!['exterior','partition'].includes(row.type)||
      ![row.a,row.b].every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1000000))||
      Math.hypot(row.a[0]-row.b[0],row.a[1]-row.b[1])===0||
      typeof row.signature!=='string'||row.signature.length>100000||
      typeof row.sourceId!=='string'||row.sourceId.length>2000||
      !Array.isArray(row.sources)||row.sources.length>200||row.sources.some(s=>typeof s!=='string'||s.length>1000))return invalid();
    keys.add(row.key);items.push({key:row.key,name:String(row.name||row.key).slice(0,200),floor:row.floor,type:row.type,
      a:[...row.a],b:[...row.b],signature:row.signature,sourceId:row.sourceId,sources:[...new Set(row.sources)].sort()});
  }
  return {version:1,capturedAt:value.capturedAt,items};
}
