export function bindingPlanRows(m) {
 const width=Number(String(m.profile).split(/[×xх]/)[0])||50,n=Number.isInteger(m.layers)&&m.layers>0?m.layers:1;
 const dx=m.b[0]-m.a[0],dy=m.b[1]-m.a[1],L=Math.hypot(dx,dy)||1;
 return Array.from({length:n},(_,i)=>{const offset=(i-(n-1)/2)*width;return {...m,row:i,a:[m.a[0]-dy/L*offset,m.a[1]+dx/L*offset],b:[m.b[0]-dy/L*offset,m.b[1]+dx/L*offset]};});
}
