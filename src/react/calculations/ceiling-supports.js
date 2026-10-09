import { houseContourPoints, partitionDepth } from '../planner/geometry.js';

export function fullSpanBearingCuts(surface){
  const points=surface.geometry.flat(2),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const margin=surface.supportOuterThickness||0;
  return (surface.bearingCuts||[]).filter(e=>Math.abs(e.a.x-e.b.x)<.001
    ?Math.min(e.a.y,e.b.y)*1000<=minY+margin+1&&Math.max(e.a.y,e.b.y)*1000>=maxY-margin-1
    :Math.abs(e.a.y-e.b.y)<.001&&Math.min(e.a.x,e.b.x)*1000<=minX+margin+1&&Math.max(e.a.x,e.b.x)*1000>=maxX-margin-1);
}

// Checks geometry only. Neither a passed endpoint nor a supplied span verifies capacity.
export function connectorSupportCheck(member,surface,plan,settings={}){
  const contour=houseContourPoints(plan),outerWidth=(Number(plan.wallThickness)||.174)*1000;
  const supports=[...contour.map((a,i)=>({a,b:contour[(i+1)%contour.length],width:outerWidth,outer:true})),...(surface.bearingCuts||[]).map(e=>({...e,width:partitionDepth(plan,e.a,e.b)*1000}))];
  const contains=(p,e)=>{const a=[e.a.x*1000,e.a.y*1000],b=[e.b.x*1000,e.b.y*1000],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(l*l||1);
    if(!l||t<0||t>1||Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))/l>e.width/(e.outer?1:2)+1)return false;
    // A door/window interrupts the support unless its header is explicitly designed.
    return !(plan.openings||[]).some(o=>o.outer===e.outer&&o.include!==false&&Math.abs((o.x*1000-a[0])*dy-(o.y*1000-a[1])*dx)/l<e.width&&Math.abs(((p[0]-o.x*1000)*dx+(p[1]-o.y*1000)*dy)/l)<Number(o.width)*500);
  };
  const ends=[member.a,member.b].map(p=>supports.some(e=>contains(p,e)));
  const max=settings.ceilingMaxSpanMm,declared=max!==''&&max!=null&&Number.isFinite(Number(max))&&Number(max)>0;
  return {memberId:member.id,surfaceId:surface.id,a:member.a,b:member.b,endSupports:ends,lengthMm:member.geometricLength??member.length,
    status:!ends.every(Boolean)?'unsupported-end':!declared?'needs-project-span':member.length>Number(max)?'span-exceeded':'geometry-checked',engineeringVerified:false};
}
