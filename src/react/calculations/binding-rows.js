export function bindingPlanRows(m) {
 if(m.fabricationRows)return m.fabricationRows;
 const width=Number(String(m.profile).split(/[×xх]/)[0])||50,n=Number.isInteger(m.layers)&&m.layers>0?m.layers:1;
 const dx=m.b[0]-m.a[0],dy=m.b[1]-m.a[1],L=Math.hypot(dx,dy)||1;
 return Array.from({length:n},(_,i)=>{const offset=(i-(n-1)/2)*width;return {...m,row:i,a:[m.a[0]-dy/L*offset,m.a[1]+dx/L*offset],b:[m.b[0]-dy/L*offset,m.b[1]+dx/L*offset]};});
}

// Opt-in rectangular layout: horizontal packages run through convex corners;
// vertical packages butt against their inner faces. Dimensions remain axes.
export function fitRectangularBindingRows(lines,index,contour){
 const m=lines[index],rows=bindingPlanRows(m);if(m.auto===false||contour.length!==4)return rows;
 if(contour.some((a,i)=>{const b=contour[(i+1)%4];return Math.abs(a[0]-b[0])>1&&Math.abs(a[1]-b[1])>1;}))return rows;
 const xmin=Math.min(...contour.map(p=>p[0])),xmax=Math.max(...contour.map(p=>p[0])),ymin=Math.min(...contour.map(p=>p[1])),ymax=Math.max(...contour.map(p=>p[1]));
 const width=Number(m.profile.split(/[×xх]/)[0])*(m.layers||1),dx=m.b[0]-m.a[0],dy=m.b[1]-m.a[1],L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L,horizontal=Math.abs(dy)<1,vertical=Math.abs(dx)<1;
 if(!horizontal&&!vertical||L<=width)return rows;
 const boundaryY=p=>Math.abs(p[1]-ymin)<1||Math.abs(p[1]-ymax)<1,boundaryX=p=>Math.abs(p[0]-xmin)<1||Math.abs(p[0]-xmax)<1;
 const shift=(p,start)=>{
  const inside=start?1:-1;
  if(horizontal){if(!boundaryX(p))return 0;return boundaryY(p)?-inside*width/2:inside*width/2;}
  const crossing=lines.some((other,j)=>j!==index&&Math.abs(other.a[1]-other.b[1])<1&&Math.abs(p[1]-other.a[1])<1&&p[0]>=Math.min(other.a[0],other.b[0])-1&&p[0]<=Math.max(other.a[0],other.b[0])+1);
  return crossing?inside*width/2:0;
 };
 const sa=shift(m.a,true),sb=shift(m.b,false);
 return rows.map(row=>({...row,a:[row.a[0]+ux*sa,row.a[1]+uy*sa],b:[row.b[0]+ux*sb,row.b[1]+uy*sb]}));
}
