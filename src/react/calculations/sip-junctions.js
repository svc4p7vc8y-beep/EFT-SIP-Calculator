import clipping from 'polygon-clipping';
import { boardFootprint } from './partition-geometry.js';
const epsilon=.01;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const vector=m=>{const l=distance(m.a,m.b);return [(m.b[0]-m.a[0])/l,(m.b[1]-m.a[1])/l];};
// T hosts continue on BOTH sides; no lap, notch depth or splice is inferred.
function throughAt(p,host,candidates) {
  const u=vector(host);let low=0,high=0,width=0;
  for(const m of candidates){
    const values=[m.a,m.b].map(q=>({t:(q[0]-p[0])*u[0]+(q[1]-p[1])*u[1],off:Math.abs((q[0]-p[0])*u[1]-(q[1]-p[1])*u[0])}));
    if(values.some(q=>q.off>epsilon))continue;
    const a=Math.min(...values.map(q=>q.t)),b=Math.max(...values.map(q=>q.t));
    if(a>epsilon||b<-epsilon)continue;
    low=Math.min(low,a);high=Math.max(high,b);width=Math.max(width,Number(m.faceWidth)||0);
  }
  return low<-epsilon&&high>epsilon?width:0;
}
export function fitSipTJunctions(members,settings,surfaces=[]) {
  const seams=members.filter(m=>(m.seam||m.role==='jamb')&&!m.excluded&&m.normalDepthMm&&m.a&&m.b&&distance(m.a,m.b)>epsilon),edits=[];
  const surfaceMap=new Map(surfaces.map(s=>[s.id,s]));
  const bySurface=new Map();for(const m of seams){if(!bySurface.has(m.surfaceId))bySurface.set(m.surfaceId,[]);bySurface.get(m.surfaceId).push(m);}
  for(const m of seams){
    if(!m.seam)continue;
    const override=settings.memberOverrides?.[m.key];
    if(override?.length!=null&&override.length!=='')continue;
    const all=bySurface.get(m.surfaceId),candidates=all.filter(h=>h!==m),u=vector(m),surface=surfaceMap.get(m.surfaceId);
    // Standing wall posts pass through; deck longitudinal joints follow the
    // saved panel direction. Unknown/diagonal cross-joints remain diagnostic.
    const axis=surface?(surface.horizontal&&(surface.automaticDirection||surface.layout?.direction)==='y'?0:1):null;
    const trim=[m.a,m.b].map((p,end)=>{const ownThrough=throughAt(p,m,all),inward=u.map(n=>end?-n:n);return candidates.reduce((max,h)=>{
      const v=vector(h),sin=Math.abs(u[0]*v[1]-u[1]*v[0]);
      if(sin<.1)return max;
      if(ownThrough&&h.role!=='jamb'&&(axis==null||Math.abs(v[axis])<.999||Math.abs(u[axis])>.001))return max;
      const k=((h.a[0]-p[0])*v[1]-(h.a[1]-p[1])*v[0])/(inward[0]*v[1]-inward[1]*v[0]);
      const half=Number(h.faceWidth)/(2*sin);if(Math.abs(k)>half+epsilon)return max;
      const projected=p.map((n,i)=>n+inward[i]*k),width=throughAt(projected,h,candidates);
      return width?Math.max(max,k+width/(2*sin)):max;
    },0);});
    if(trim.some(t=>t>epsilon)&&trim[0]+trim[1]<distance(m.a,m.b)-epsilon)edits.push({m,u,trim});
  }
  // Compute contacts before modifying members, independent of enumeration order.
  for(const {m,u,trim} of edits){
    m.a=m.a.map((n,i)=>n+u[i]*trim[0]);m.b=m.b.map((n,i)=>n-u[i]*trim[1]);
    m.geometricLength=m.length=Math.ceil(distance(m.a,m.b)-.001);
    m.cutLength=m.length+2*Number(settings.endAllowanceMm||0);m.junctionTrimMm=trim;
  }
}
export function sipMemberIntersections(members) {
  const groups=new Map(),result=[];
  for(const m of members){
    if(m.excluded||!m.normalDepthMm)continue;const footprint=boardFootprint(m);if(!footprint)continue;
    // Diagnostic precision only: never modify fabrication coordinates or lengths.
    const ring=footprint.map(p=>p.map(n=>Math.round(n*10000)/10000));
    const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),entry={m,ring,minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
    if(!groups.has(m.surfaceId))groups.set(m.surfaceId,[]);groups.get(m.surfaceId).push(entry);
  }
  for(const items of groups.values()){
    items.sort((a,b)=>a.minX-b.minX);
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length&&items[j].minX<items[i].maxX-epsilon;j++){
      const a=items[i],b=items[j];if(b.minY>=a.maxY-epsilon||b.maxY<=a.minY+epsilon)continue;
      let shapes;
      try { shapes=clipping.intersection([[...a.ring,a.ring[0]]],[[...b.ring,b.ring[0]]]); }
      catch { result.push({surfaceId:a.m.surfaceId,memberIds:[a.m.id,b.m.id],geometryError:true});continue; }
      const area=shapes.reduce((sum,poly)=>sum+poly.reduce((value,ring,index)=>value+(index?-1:1)*Math.abs(ring.reduce((v,p,k)=>{const q=ring[(k+1)%ring.length];return v+p[0]*q[1]-p[1]*q[0];},0))/2,0),0);
      if(area>1)result.push({surfaceId:a.m.surfaceId,memberIds:[a.m.id,b.m.id],areaMm2:area});
    }
  }
  return result;
}
