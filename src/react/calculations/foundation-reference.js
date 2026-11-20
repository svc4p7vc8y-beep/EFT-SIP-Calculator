import {bindingPlanRows} from './binding-rows.js';
import {houseContourPoints,pointInPolygon} from '../planner/geometry.js';

// The house outline is the outside face. This opt-in datum moves automatic
// foundation axes, not the house, rooms, openings or saved manual supports.
export function foundationAxisContour(plan,thicknessMm){
 const ring=houseContourPoints(plan),t=(Number(thicknessMm)||Number(plan.wallThickness)*1000||174)/2000;
 if(ring.length<3)return ring;
 const area=ring.reduce((n,p,i)=>{const b=ring[(i+1)%ring.length];return n+p.x*b.y-b.x*p.y;},0),sign=Math.sign(area)||1;
 const edges=ring.map((a,i)=>{const b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);if(L<.001||Math.abs(dx)>.001&&Math.abs(dy)>.001)throw new Error('Для наклонных стен опорные оси задайте по рабочему узлу. Автоматическое совмещение доступно для прямоугольных и Г-образных контуров.');const n={x:-dy/L*t*sign,y:dx/L*t*sign};return {a:{x:a.x+n.x,y:a.y+n.y},b:{x:b.x+n.x,y:b.y+n.y},dx,dy};});
 const result=edges.map((e,i)=>{const prev=edges[(i+edges.length-1)%edges.length],den=prev.dx*e.dy-prev.dy*e.dx;if(Math.abs(den)<1e-8)return e.a;const qx=e.a.x-prev.a.x,qy=e.a.y-prev.a.y,u=(qx*e.dy-qy*e.dx)/den;return {x:prev.a.x+prev.dx*u,y:prev.a.y+prev.dy*u};});
 if(result.some(p=>!pointInPolygon(p,ring)))throw new Error('Толщина стены не помещается в контуре. Проверьте узкие участки дома.');
 return result;
}

export function clipAxisCandidate(candidate,ring){
 const a=candidate.a,b=candidate.b,dx=b.x-a.x,dy=b.y-a.y,ts=[0,1];
 for(let i=0;i<ring.length;i++){const c=ring[i],d=ring[(i+1)%ring.length],ex=d.x-c.x,ey=d.y-c.y,den=dx*ey-dy*ex;if(Math.abs(den)<1e-10)continue;const qx=c.x-a.x,qy=c.y-a.y,t=(qx*ey-qy*ex)/den,u=(qx*dy-qy*dx)/den;if(t>=0&&t<=1&&u>=0&&u<=1)ts.push(t);}
 const stops=[...new Set(ts.map(t=>Math.round(t*1e9)/1e9))].sort((a,b)=>a-b),parts=[];
 const at=t=>({x:a.x+dx*t,y:a.y+dy*t});
 for(let i=1;i<stops.length;i++){const s=stops[i-1],e=stops[i];if(e-s<1e-7)continue;const mid=at((s+e)/2),onEdge=ring.some((p,j)=>{const q=ring[(j+1)%ring.length];return Math.abs((q.x-p.x)*(mid.y-p.y)-(q.y-p.y)*(mid.x-p.x))<1e-7&&mid.x>=Math.min(p.x,q.x)-1e-7&&mid.x<=Math.max(p.x,q.x)+1e-7&&mid.y>=Math.min(p.y,q.y)-1e-7&&mid.y<=Math.max(p.y,q.y)+1e-7;});if(pointInPolygon(mid,ring)||onEdge)parts.push({...candidate,a:at(s),b:at(e)});}
 return parts.map((p,i)=>({...p,id:parts.length===1?candidate.id:`${candidate.id}-axis-${i+1}`}));
}

export function bindingWallAlignment(assembly,wallThicknessMm=174){
 const contour=assembly.floors[0]?.contour||[],sign=Math.sign(contour.reduce((n,p,i)=>{const q=contour[(i+1)%contour.length];return n+p[0]*q[1]-p[1]*q[0];},0))||1,rows=[];
 for(let i=0;i<contour.length;i++){const a=contour[i],b=contour[(i+1)%contour.length],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);if(L<1)continue;const nx=-dy/L*sign,ny=dx/L*sign,m=[(a[0]+b[0])/2+nx*wallThicknessMm/2,(a[1]+b[1])/2+ny*wallThicknessMm/2];
  const matches=assembly.binding.filter(line=>line.group!=='platform').flatMap(line=>{const u=line.b[0]-line.a[0],v=line.b[1]-line.a[1],l=Math.hypot(u,v);if(l<1||Math.abs(dx*v-dy*u)>L*l*.001)return [];const s=((m[0]-line.a[0])*u+(m[1]-line.a[1])*v)/(l*l);if(s<-.02||s>1.02)return [];const offset=(m[0]-line.a[0])*nx+(m[1]-line.a[1])*ny,width=(Number(line.profile.split(/[×xх]/)[0])||50)*(line.layers||1),overlap=Math.max(0,Math.min(wallThicknessMm/2,width/2-offset)-Math.max(-wallThicknessMm/2,-width/2-offset));return [{lineId:line.id,offsetMm:Math.abs(offset),widthMm:width,overlapMm:overlap}];}).sort((a,b)=>a.offsetMm-b.offsetMm);
  rows.push({wall:`Стена ${i+1}`,wallThicknessMm,...(matches[0]||{offsetMm:null,overlapMm:0,widthMm:0})});
 }
 return rows;
}

export function bindingPackageWidthMm(settings={}){
 if(settings.bindingType==='timber')return 150;
 const width=Math.max(10,Number(settings.bindingBoardWidthMm)||50),height=Math.max(10,Number(settings.bindingBoardHeightMm)||150);
 const layers=Math.max(1,Math.round(Number(settings.bindingLayers)||Math.round((Number(settings.boardVolumePerMeter)||.0225)/(width*height/1e6))||3));
 return width*layers;
}
// Signed distance from the outside floor edge to the outside timber face.
// Positive = unsupported floor overhang, negative = timber beyond the floor.
export function bindingFloorAlignment(assembly){
 const ring=assembly.floors[0]?.contour||[],sign=Math.sign(ring.reduce((n,a,i)=>{const b=ring[(i+1)%ring.length];return n+a[0]*b[1]-b[0]*a[1];},0))||1;
 return ring.map((a,i)=>{const b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1,n=[-dy/L*sign,dx/L*sign],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const candidates=assembly.binding.filter(m=>m.group!=='platform').flatMap(m=>{const u=m.b[0]-m.a[0],v=m.b[1]-m.a[1],len=Math.hypot(u,v);if(len<1||Math.abs(dx*v-dy*u)>L*len*.001)return [];const t=((mid[0]-m.a[0])*u+(mid[1]-m.a[1])*v)/(len*len);if(t<-.001||t>1.001)return [];const offsets=bindingPlanRows(m).map(row=>(row.a[0]-mid[0])*n[0]+(row.a[1]-mid[1])*n[1]-(Number(row.profile.split(/[×xх]/)[0])||50)/2);return [{id:m.id,offsetMm:Math.min(...offsets),axisDistance:Math.abs((m.a[0]-mid[0])*n[0]+(m.a[1]-mid[1])*n[1])}];});
  const best=candidates.sort((a,b)=>a.axisDistance-b.axisDistance)[0];return {wall:`Грань ${i+1}`,offsetMm:best?.offsetMm??null,bindingId:best?.id||'',matches:!!best&&Math.abs(best.offsetMm)<=1};
 });
}
