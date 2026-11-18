const n=value=>Math.round(Number(value)*1000)/1000;
export function compactStockIds(ids){
 const result=[];let start=null,last=null;
 const flush=()=>{if(start!==null)result.push(start===last?start:`${start}–${last}`);};
 for(const id of ids){const previous=String(last||'').match(/^(.*?)(\d+)$/),current=String(id).match(/^(.*?)(\d+)$/);
  if(previous&&current&&previous[1]===current[1]&&Number(current[2])===Number(previous[2])+1){last=id;continue;}
  flush();start=last=id;
 }
 flush();return result.join(', ');
}
const outline=(source,placed)=>{
 if(!source?.shape?.length)return [[[placed.x,placed.y],[placed.x+placed.width,placed.y],[placed.x+placed.width,placed.y+placed.height],[placed.x,placed.y+placed.height],[placed.x,placed.y]]];
 const xs=source.shape.flat().map(p=>p[0]),ys=source.shape.flat().map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
 const baseTurn=Math.abs(Number(source.blankWidth)-h)<1.01&&Math.abs(Number(source.blankHeight)-w)<1.01&&Math.abs(w-h)>1.01;
 let shape=source.shape.map(r=>r.map(p=>[p[0]-x,p[1]-y])),width=w,height=h;
 for(let i=0;i<Number(baseTurn)+Number(placed.rotated===true);i++){
  shape=shape.map(r=>r.map(([a,b])=>[height-b,a]));[width,height]=[height,width];
 }
 return shape.map(r=>r.map(([a,b])=>[n(a+placed.x),n(b+placed.y)]));
};
export function panelCutMaps(report){
 const sources=new Map((report.parts||[]).map(p=>[p.id,p])),groups=new Map();
 for(const sheet of report.panelStock?.sheets||[]){
  const parts=sheet.parts.map(p=>({...p,displayMark:p.displayMark||sources.get(p.id)?.displayMark||p.id,shape:outline(sources.get(p.id),p)}));
  const key=JSON.stringify([sheet.family,sheet.thickness,sheet.width,sheet.height,parts.map(p=>[p.displayMark,p.x,p.y,p.width,p.height,p.rotated,p.shape.map(r=>r.map(([x,y])=>[n(x-p.x),n(y-p.y)]))])]);
  if(!groups.has(key))groups.set(key,{sheet:{...sheet,parts},qty:0,ids:[],area:0});
  const g=groups.get(key);g.qty++;g.ids.push(sheet.id);
  g.area=sheet.parts.reduce((sum,p)=>sum+(sources.get(p.id)?.area??p.width*p.height),0);
 }
 const counts=new Map();
 return [...groups.values()].map(g=>{
  const format=`${g.sheet.family}/${g.sheet.thickness}/${g.sheet.width}/${g.sheet.height}`,index=(counts.get(format)||0)+1;counts.set(format,index);
  return {...g,id:`${g.sheet.height}-${String(index).padStart(2,'0')}`,wasteM2:Math.max(0,(g.sheet.width*g.sheet.height-g.area)/1e6)};
 });
}
export function panelCutMapPages(report){
 const formats=new Map();for(const map of panelCutMaps(report)){const s=map.sheet,key=JSON.stringify([s.family,s.thickness,s.width,s.height]);if(!formats.has(key))formats.set(key,[]);formats.get(key).push(map);}
 return [...formats.values()].flatMap(maps=>Array.from({length:Math.ceil(maps.length/6)},(_,i)=>({maps:maps.slice(i*6,i*6+6),format:maps[0].sheet,qty:maps.reduce((s,g)=>s+g.qty,0),parts:maps.reduce((s,g)=>s+g.qty*g.sheet.parts.length,0),wasteM2:maps.reduce((s,g)=>s+g.qty*g.wasteM2,0),mapCount:maps.length,page:i+1,pageCount:Math.ceil(maps.length/6)})));
}
