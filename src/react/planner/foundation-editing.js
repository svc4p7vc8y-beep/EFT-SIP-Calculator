import {boundsOf,houseContourPoints,pointInPolygon} from './geometry.js';
import {pileRowPoints,calculateFoundation} from '../calculations/foundation-model.js';
const rounded=n=>Math.round(n*1000)/1000;
export function foundationGrid(plan,value=plan.foundationGrid||{}){
 const bounds=boundsOf(houseContourPoints(plan)),finite=(n,f)=>Number.isFinite(Number(n))?Number(n):f;
 return {enabled:value.enabled===true,x:finite(value.x,bounds.x),y:finite(value.y,bounds.y),width:Math.max(.1,finite(value.width,bounds.w)),height:Math.max(.1,finite(value.height,bounds.h)),columns:Math.max(1,Math.min(30,Math.round(finite(value.columns,4)))),rows:Math.max(1,Math.min(30,Math.round(finite(value.rows,3))))};
}
function inside(plan,p){const ring=houseContourPoints(plan);return pointInPolygon(p,ring)||ring.some((a,i)=>{const b=ring[(i+1)%ring.length],L=Math.hypot(b.x-a.x,b.y-a.y);return L&&Math.abs((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))/L<.002&&p.x>=Math.min(a.x,b.x)-.002&&p.x<=Math.max(a.x,b.x)+.002&&p.y>=Math.min(a.y,b.y)-.002&&p.y<=Math.max(a.y,b.y)+.002;});}
export function createFoundationGrid(plan,kind='piles',replace=false){
 const grid=foundationGrid(plan),key=kind==='binding'?'bindingLines':'pileRows',newRows=[],extras=[];
 const point=(i,j)=>({x:rounded(grid.x+i*grid.width/grid.columns),y:rounded(grid.y+j*grid.height/grid.rows)});
 const push=points=>{if(points.length<2){if(points.length&&kind==='piles')extras.push({...points[0],id:crypto.randomUUID(),source:'manual'});return;}newRows.push({id:`grid-${crypto.randomUUID()}`,name:`Сетка · ряд ${newRows.length+1}`,x1:points[0].x,y1:points[0].y,x2:points.at(-1).x,y2:points.at(-1).y,count:points.length,group:'house',include:true,auto:false});};
 for(const vertical of kind==='binding'?[false,true]:[false])for(let j=0;j<=(vertical?grid.columns:grid.rows);j++){
  let run=[];for(let i=0;i<=(vertical?grid.rows:grid.columns);i++){const p=vertical?point(j,i):point(i,j);if(inside(plan,p)&&(run.length===0||inside(plan,{x:(p.x+run.at(-1).x)/2,y:(p.y+run.at(-1).y)/2}))){run.push(p);}else{push(run);run=inside(plan,p)?[p]:[];}}push(run);
 }
 const same=(a,b)=>Math.hypot(a.x1-b.x1,a.y1-b.y1,a.x2-b.x2,a.y2-b.y2)<.003;
 const retained=replace?[]:plan[key]||[];plan[key]=[...retained,...newRows.filter(r=>!retained.some(old=>same(r,old)))];
 plan.piles=[...(plan.piles||[]),...extras.filter(p=>!(plan.piles||[]).some(q=>Math.hypot(p.x-q.x,p.y-q.y)<.01))];
 plan.foundationGrid={...grid,enabled:true};return plan;
}
export function moveFoundationRow(plan,id,dx,dy,key='pileRows'){
 const row=(plan[key]||[]).find(r=>r.id===id);if(!row||![dx,dy].every(Number.isFinite))return plan;
 for(const p of [row,...(key==='pileRows'?(plan.bindingLines||[]).filter(l=>l.id===`binding-${id}`&&l.auto):[])])for(const i of [1,2]){p[`x${i}`]=rounded(p[`x${i}`]+dx);p[`y${i}`]=rounded(p[`y${i}`]+dy);}
 for(const p of [...(plan.piles||[]),...(plan.excludedPiles||[])].filter(p=>p.detachedFromRowId===id)){p.x=rounded(p.x+dx);p.y=rounded(p.y+dy);}return plan;
}
export function moveFoundationPile(plan,from,to,settings={}){
 if(Math.hypot(to.x-from.x,to.y-from.y)<.005)return null;
 const points=calculateFoundation(plan,settings).points;if(points.some(p=>Math.hypot(p.x-from.x,p.y-from.y)>.02&&Math.hypot(p.x-to.x,p.y-to.y)<.1))return null;
 const origin=points.find(p=>Math.hypot(p.x-from.x,p.y-from.y)<.02),row=(plan.pileRows||[]).find(r=>pileRowPoints(r).some(p=>Math.hypot(p.x-from.x,p.y-from.y)<.02));
 const id=`moved-pile-${rounded(from.x)}:${rounded(from.y)}`;
 plan.excludedPiles=[...(plan.excludedPiles||[]),{...from,...(row?{detachedFromRowId:row.id}:{})}];
 plan.piles=[...(plan.piles||[]),{id,x:rounded(to.x),y:rounded(to.y),source:'manual',foundationSource:origin?.source==='platform'?'platform':'house',...(row?{detachedFromRowId:row.id}:{})}];return id;
}
