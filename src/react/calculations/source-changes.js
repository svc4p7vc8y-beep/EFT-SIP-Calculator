import {normalizeSourceBaseline} from '../state/source-baseline.js';

const samePoint=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6;
const sameSegment=(a,b)=>(samePoint(a.a,b.a)&&samePoint(a.b,b.b))||(samePoint(a.a,b.b)&&samePoint(a.b,b.a));
function ringKey(ring){
  const points=ring.map(p=>[...p]);if(points.length>1&&samePoint(points[0],points.at(-1)))points.pop();
  const options=[];for(const sequence of [points,[...points].reverse()])for(let i=0;i<sequence.length;i++)options.push(JSON.stringify([...sequence.slice(i),...sequence.slice(0,i)]));
  return options.sort()[0]||'[]';
}
export function sourceComparisonItems(surfaces){
  return surfaces.filter(s=>s.sourceIdentityStatus&&s.planStart&&s.planEnd).map(s=>({
    key:s.id,name:s.name,floor:s.floor,type:s.id.includes('-ПГ')?'partition':'exterior',a:[...s.planStart],b:[...s.planEnd],sourceId:s.constructionSourceId||'',
    sources:[...new Set((s.sourceContributors||[]).map(r=>JSON.stringify([r.kind,r.id||'',r.role||''])))].sort(),
    signature:JSON.stringify([s.width,s.height,s.heightStart,s.heightEnd,s.thickness,s.family,!!s.frameOnly,s.frameProfile||'',!!s.bearing,
      (s.geometry||[]).map(poly=>[ringKey(poly[0]||[]),poly.slice(1).map(ringKey).sort()]).map(JSON.stringify).sort()]),
  }));
}
export function captureSourceBaseline(surfaces,capturedAt=new Date().toISOString()){
  return normalizeSourceBaseline({version:1,capturedAt,items:sourceComparisonItems(surfaces)});
}
function interval(base,other){
  const dx=base.b[0]-base.a[0],dy=base.b[1]-base.a[1],length=Math.hypot(dx,dy);
  if(!length||[other.a,other.b].some(p=>Math.abs(dx*(p[1]-base.a[1])-dy*(p[0]-base.a[0]))/length>1e-6))return null;
  const values=[other.a,other.b].map(p=>((p[0]-base.a[0])*dx+(p[1]-base.a[1])*dy)/length).sort((a,b)=>a-b);
  return {start:values[0],end:values[1],length};
}
function overlaps(a,b){const span=interval(a,b);return span&&Math.min(span.length,span.end)-Math.max(0,span.start)>1e-6;}
function covers(base,rows){
  const spans=rows.map(r=>interval(base,r));if(spans.some(s=>!s||s.start < -1e-6||s.end>s.length+1e-6))return false;
  spans.sort((a,b)=>a.start-b.start);let end=0;
  for(const span of spans){if(Math.abs(span.start-end)>1e-6)return false;end=span.end;}
  return Math.abs(end-spans[0].length)<1e-6;
}
const labels={unchanged:'Схема привязок без изменений',modified:'Изменены геометрия или конструкция',sourceChanged:'Изменён источник',added:'Новый участок',removed:'Прежний участок отсутствует',split:'Возможное разделение',merged:'Возможное объединение',ambiguous:'Неоднозначное сопоставление'};
export function compareSourceBaseline(value,surfaces){
  const baseline=normalizeSourceBaseline(value);
  if(!baseline)return {status:'no-baseline',events:[]};
  if(baseline.invalid)return {status:'invalid-baseline',events:[]};
  const old=baseline.items,current=sourceComparisonItems(surfaces),nodes=[...old,...current],offset=old.length,adj=nodes.map(()=>[]);
  const counts=rows=>{const map=new Map();for(const r of rows)if(r.sourceId)map.set(r.sourceId,(map.get(r.sourceId)||0)+1);return map;};
  const oldCounts=counts(old),newCounts=counts(current);
  old.forEach((a,i)=>current.forEach((b,j)=>{
    if(a.floor!==b.floor||a.type!==b.type)return;
    const sameSource=a.sourceId&&a.sourceId===b.sourceId&&oldCounts.get(a.sourceId)===1&&newCounts.get(b.sourceId)===1;
    // Geometry is only evidence for a candidate relation, never a transfer of overrides.
    if(sameSource||overlaps(a,b)){adj[i].push(j+offset);adj[j+offset].push(i);}
  }));
  const seen=new Set(),events=[];
  nodes.forEach((_,index)=>{
    if(seen.has(index))return;
    const stack=[index],before=[],after=[];
    while(stack.length){const i=stack.pop();if(seen.has(i))continue;seen.add(i);(i<offset?before:after).push(nodes[i]);stack.push(...adj[i]);}
    for(const rows of [before,after])rows.sort((a,b)=>a.key.localeCompare(b.key,'ru',{numeric:true}));
    const sourceChanged=before.length===1&&after.length===1&&(before[0].sourceId!==after[0].sourceId||JSON.stringify(before[0].sources)!==JSON.stringify(after[0].sources));
    let kind;
    if(!before.length)kind='added';else if(!after.length)kind='removed';
    else if(before.length===1&&after.length===1){
      const a=before[0],b=after[0];kind=!sameSegment(a,b)||a.signature!==b.signature?'modified':a.sourceId!==b.sourceId||JSON.stringify(a.sources)!==JSON.stringify(b.sources)?'sourceChanged':'unchanged';
    }else if(before.length===1&&covers(before[0],after))kind='split';
    else if(after.length===1&&covers(after[0],before))kind='merged';else kind='ambiguous';
    events.push({kind,label:labels[kind],floor:(after[0]||before[0]).floor,before,after,sourceChanged,requiresReview:kind!=='unchanged'});
  });
  return {status:'compared',capturedAt:baseline.capturedAt,events,changed:events.filter(e=>e.requiresReview).length};
}
